// Shared by the eval harnesses (live-session.mjs: the real page and ElevenLabs; stand-in.mjs: a local actor): the
// sandbox server, the backend API, the simulated student, and the record of a run (timeline, checks, judge, files).
// A run is a list of events { at, kind, … }: student, plato, tool, tool-done, agenda, server, sent (a context line or
// message Plato was sent), board, lesson.
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..'), SANDBOX_PORT = 5199;
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const short = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

/** A scenario by name (evals/scenarios/<name>.json) or path: { slug, title, examId, persona, lines }. */
export async function loadScenario(name) {
  const file = name.endsWith('.json') ? path.resolve(name) : path.join(HERE, 'scenarios', `${name}.json`);
  return { slug: path.basename(file, '.json'), ...JSON.parse(await readFile(file, 'utf8')) };
}

/** The backend's HTTP API at `base`, as the local principal. */
export const apiAt = base => async (method, route, body) => {
  const { token } = await (await fetch(`${base}/v1/local/principal`, { method: 'POST' })).json();
  const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(`${method} ${route}: ${json.error?.message || response.status}`), { status: response.status, code: json.error?.code });
  return json;
};

// ---------- the sandbox: a second server on a snapshot of data/ (the real data is only read) ----------
/** Snapshot data/ (backend.db by VACUUM INTO, which reads through the WAL; blobs; the local principal), optionally reset
 *  the intro in the copy, and start a server on it. Returns { dir, server, base }. */
/** Free bytes on the volume that holds `dir` (the system temp folder by default). */
export async function freeBytes(dir = os.tmpdir()) { const { statfs } = await import('node:fs/promises'); const s = await statfs(dir); return s.bavail * s.bsize; }
const GB = 2 ** 30;

export async function startSandbox({ examId, intro = false, port = SANDBOX_PORT, env = {}, source = null, reuse = null }) {
  const { DatabaseSync } = await import('node:sqlite');
  const started = Date.now(), base = `http://127.0.0.1:${port}`;
  // `reuse`: restart a server on an existing sandbox dir as it is (no snapshot, no resets), e.g. to test that a session resumes.
  if (reuse) return serve(reuse, { port, env, started, base, intro: false });
  // The disk contract: no new sandbox copy (~75–100 MB) below 3 GB free; the caller records it as an error, never a result.
  const free = await freeBytes();
  if (free < 3 * GB) throw Error(`only ${(free / GB).toFixed(1)} GB free on the disk: no sandbox is started below 3 GB`);
  // `source`: another data dir to snapshot instead of data/ (evals/understanding's cached sandbox, with its Studies).
  const dir = await mkdtemp(path.join(os.tmpdir(), 'plato-eval-')), data = source ? path.resolve(source) : path.join(ROOT, 'data');
  const real = new DatabaseSync(path.join(data, 'backend.db'), { readOnly: true });
  try { real.exec(`VACUUM INTO '${path.join(dir, 'backend.db').replaceAll("'", "''")}'`); } finally { real.close(); }
  await cp(path.join(data, 'blobs'), path.join(dir, 'blobs'), { recursive: true });
  await copyFile(path.join(data, 'local-principal.json'), path.join(dir, 'local-principal.json'));
  await cp(path.join(data, 'study-guides'), path.join(dir, 'study-guides'), { recursive: true }).catch(() => {}); // each exam's study guide (backend/lessons/study.mjs), if any
  const copy = new DatabaseSync(path.join(dir, 'backend.db'));
  try {
    // The real server's background work in flight at the snapshot (exam questions, refills, module builds) is not the run's:
    // cancelled in the copy, so the sandbox's workers serve the run (its planner turns would otherwise queue behind them).
    copy.prepare("UPDATE jobs SET state = 'cancelled', data = json_set(data, '$.state', 'cancelled') WHERE state IN ('queued', 'running', 'retry_wait')").run();
    if (intro) {
      // A fresh intro, in the copy only: the exam's intro not done (v11: on the exam record), and no earlier intro whose finished goals carry over.
      copy.prepare("UPDATE exams SET data = json_remove(data, '$.introDoneAt', '$.lectureFrom', '$.walkAt', '$.studyAt') WHERE id = ?").run(examId); // a fresh student: where they are is asked again
      try { copy.prepare('DELETE FROM focus_sections WHERE exam_id = ?').run(examId); } catch { /* no focus table */ } // nor a topic they chose earlier
      // A copy taken before migration 048 still has the plan's table, which that migration reads the intro's state from.
      try { copy.prepare("UPDATE study_plans SET data = json_set(data, '$.introDoneAt', NULL) WHERE exam_id = ?").run(examId); } catch { /* table gone (048 applied) */ }
      copy.prepare("UPDATE sessions SET data = json_set(data, '$.agenda.intro', json('false')) WHERE exam_id = ? AND json_extract(data, '$.agenda.intro') = 1").run(examId);
    }
  } finally { copy.close(); }
  // A server that never came up leaves no sandbox behind (the caller never gets its dir to delete).
  return serve(dir, { port, env, started, base, intro }).catch(async error => { const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true }).catch(() => {}); throw error; });
}
async function serve(dir, { port, env, started, base, intro }) {
  // A port already answering is another server: never mistake it for this one (it would serve another run's sandbox).
  if (await fetch(`${base}/v1/local/principal`, { method: 'POST' }).then(() => true, () => false)) throw Error(`port ${port} is already in use by another server`);
  const out = openSync(path.join(dir, 'server.log'), 'a');
  const server = spawn(process.execPath, ['--no-warnings', '--env-file-if-exists=.env', 'server/index.mjs'],
    { cwd: ROOT, env: { ...process.env, PORT: String(port), LUNA_DATA_DIR: dir, LUNA_WORKERS: '3', ...env }, stdio: ['ignore', out, out] });
  for (const end = Date.now() + 60_000; Date.now() < end; await sleep(500)) {
    if (server.exitCode !== null) break;
    if (await fetch(`${base}/v1/local/principal`, { method: 'POST' }).then(r => r.ok, () => false)) {
      console.log(`sandbox: ${dir} on port ${port}${intro ? ', intro reset' : ''}, ready in ${Math.round((Date.now() - started) / 1000)} s`);
      return { dir, server, base };
    }
  }
  server.kill('SIGTERM');
  throw Error(`The sandbox server didn't start (port ${port} busy?): ${(await readFile(path.join(dir, 'server.log'), 'utf8')).slice(-600)}`);
}
export async function stopSandbox(server) {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  if (!await Promise.race([exited.then(() => true), sleep(10_000).then(() => false)])) { server.kill('SIGKILL'); await exited; }
}

/** The course's lecture and topic titles (for the grounding checks), and the current goal's lesson at the end. */
export async function courseFacts(api, examId, sessionId) {
  const [status, topics] = await Promise.all([api('GET', `/v1/exams/${examId}/status`), api('GET', `/v1/exams/${examId}/topics`)]);
  const lesson = sessionId ? await api('GET', `/v1/sessions/${sessionId}/lesson`).then(r => r.lesson ?? null, () => null) : null;
  return { course: { lectures: (status.files || []).map(f => f.filename.replace(/\.[^.]+$/, '').replace(/^\d+\s+/, '')), topics: (topics.topics || []).map(t => t.title) }, lesson };
}

// ---------- the simulated student ----------
const STUDENT = `You play a student typing to an AI tutor called Plato in a study app, to test the tutor. Stay in character.
Write only the student's next message: one short line, typed the way a real student types (lowercase is fine). Sometimes terse,
sometimes a question back, sometimes a tangent or a pushback; when the tutor asks you something or puts a check on the page,
answer it in character (wrong answers are fine when they fit). Never write the tutor's part, labels, quotes or stage directions.`;
/** The student's next line, from the persona and the conversation so far (with what Plato put on his page). */
export async function studentLine(runtime, persona, dialogue) {
  const { text } = await runtime.ask({ role: 'light', instructions: STUDENT, timeoutMs: 60_000, input: `Persona: ${persona}\n\nThe conversation so far, with what Plato put on his page:\n${dialogue}\n\nThe student's next message:` });
  return text.split('\n').map(s => s.trim()).find(Boolean)?.replace(/^(student|me)\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').slice(0, 300) || null;
}

// ---------- the record ----------
export const agendaLine = agenda => (agenda?.goals || []).map(g => `${g.id === agenda.currentGoalId ? '▶ ' : ''}${g.state}: ${g.title}`).join(' · ');
const boardShown = e => e.kind === 'board' && (e.titles.length || e.text);
/** The run in time order: for the transcript, or (student) what the student and the judge see. */
export function timeline(events, t0, { student = false } = {}) {
  const out = [];
  let agenda = '';
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const t = `${((e.at - t0) / 1000).toFixed(1)}s`;
    if (e.kind === 'student') out.push(student ? `Student: ${e.text}` : `**Student** · ${t}\n${e.text}`);
    else if (e.kind === 'plato' || e.kind === 'plato-corrected') out.push(student ? `Plato: ${e.text}` : `**Plato** · ${t}${e.kind === 'plato-corrected' ? ' (cut off, corrected)' : ''}\n${e.text}`);
    else if (boardShown(e)) out.push(student ? `[Plato's page: ${e.titles.map(x => `"${x}"`).join(', ')} ${short(e.text, 3000)}]` : `> **board** · ${t}: ${e.titles.map(x => `"${x}"`).join(', ') || '(untitled)'} — ${short(e.text, 300)}`);
    else if (student) continue;
    else if (e.kind === 'tool') out.push(`> tool · ${t}: \`${e.name}\` ${short(JSON.stringify(e.params), 300)}`);
    else if (e.kind === 'tool-done') out.push(`> tool · ${t}: \`${e.name}\` → ${e.error ? `error: ${e.error}` : short(typeof e.result === 'string' ? e.result : JSON.stringify(e.result), 300)}`);
    else if (e.kind === 'agenda') { const line = agendaLine(e.agenda); if (line !== agenda) out.push(`> agenda · ${t}: ${line}`); agenda = line; }
    else if (e.kind === 'sent' && e.type === 'contextual_update') out.push(`> context · ${t} (${e.text.length} chars): ${short(e.text, 400)}`);
    else if (e.kind === 'server' && e.type === 'card.issued') out.push(`> card · ${t}: ${short(e.payload?.text || JSON.stringify(e.payload?.card), 400)}`);
    else if (e.kind === 'status' && e.text) out.push(`> page says · ${t}: ${e.text}`);
    else if (e.kind === 'connected') out.push(`> conversation ${e.conversationId} connected · ${t}`);
    else if (e.kind === 'net') out.push(`> net · ${t}: ${e.text}`);
    else if (e.kind === 'actor') out.push(`> actor · ${t}: ${e.ms} ms${e.round > 1 ? ` (round ${e.round})` : ''}`);
  }
  return out.join('\n\n');
}

const STOP = new Set('the and that this with from your have what will into they them then than there their about which when where would could should just like does been were are for you can how its not but out get got let lets now see say said use also more most very here only well okay sure want next thing know right yeah good great each other some same make take look first then because'.split(' '));
const words = text => String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
const content = text => new Set(words(text).filter(w => w.length >= 4 && !STOP.has(w)));
const jaccard = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)), both = [...A].filter(w => B.has(w)).length; return both / ((A.size + B.size - both) || 1); };
const shared = (a, b) => [...a].filter(w => b.has(w)).length;
const median = list => { const s = list.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };

/** Every lesson the session used (received by the page or the stand-in, lesson.ready, or the one at the end), the latest per goal. */
export function seenLessons(events, last) {
  const byGoal = new Map();
  // Where the page's bridge finds them (keepLessons): { goalId, step, lesson } wrappers, lesson.ready, and the agenda's goals.
  const found = x => [x, x?.lesson, x?.lesson?.lesson, ...(x?.agenda?.goals || []).map(g => g.lesson && { ...g.lesson, goalId: g.lesson.goalId || g.id })];
  for (const e of events) for (const l of found(e.kind === 'lesson' ? { lesson: e.lesson } : e.kind === 'server' || e.kind === 'agenda' ? (e.kind === 'agenda' ? { agenda: e.agenda } : e.payload) : null)) if (l?.keyPoints) byGoal.set(l.goalId ?? l.title, l);
  for (const l of found({ lesson: last })) if (l?.keyPoints) byGoal.set(l.goalId ?? l.title, l);
  return [...byGoal.values()];
}

export function checks({ events, turns, t0, lesson, course, director = null }) {
  const replies = events.filter(e => e.kind === 'plato'), students = events.filter(e => e.kind === 'student');
  // Repeats: near-duplicate consecutive replies, and the same question asked again.
  const duplicates = replies.slice(1).map((r, i) => ({ a: replies[i].text, b: r.text, similarity: +jaccard(replies[i].text, r.text).toFixed(2) }))
    .filter(d => d.similarity >= 0.75 && words(d.a).length >= 5);
  const questions = replies.flatMap((r, i) => (r.text.match(/[^.?!]*\?/g) || []).map(q => ({ q: q.trim(), i }))).filter(x => words(x.q).length >= 4);
  const repeatedQuestions = questions.flatMap((x, k) => questions.slice(k + 1).filter(y => y.i !== x.i && jaccard(x.q, y.q) >= 0.5).map(y => ({ first: x.q, again: y.q })));
  // The agenda: a done or skipped goal active (or pending) again, and how far the goals moved.
  const agendas = events.filter(e => e.kind === 'agenda' && e.agenda?.goals), seen = new Map(), flipFlops = [];
  for (const { at, agenda } of agendas) for (const g of agenda.goals) {
    const was = seen.get(g.id);
    if (['done', 'skipped'].includes(was) && !['done', 'skipped'].includes(g.state)) flipFlops.push({ goal: g.title, from: was, to: g.state, atS: +((at - t0) / 1000).toFixed(1) });
    seen.set(g.id, g.state);
  }
  const first = agendas[0]?.agenda, last = agendas.at(-1)?.agenda, title = (a, id) => a?.goals.find(g => g.id === id)?.title ?? null;
  const goals = { changes: agendas.length - 1, start: agendaLine(first), end: agendaLine(last), currentAtStart: title(first, first?.currentGoalId), currentAtEnd: title(last, last?.currentGoalId),
    finished: (last?.goals || []).filter(g => ['done', 'skipped'].includes(g.state) && first?.goals.find(f => f.id === g.id)?.state !== g.state).map(g => `${g.state}: ${g.title}`),
    added: (last?.goals || []).filter(g => !first?.goals.some(f => f.id === g.id)).map(g => g.title) };
  goals.completed = goals.finished.filter(f => f.startsWith('done')).length;
  // Who moved the agenda: Plato's update_agenda (a call just before), or the backend on evidence (planner, director, time).
  const agendaCalls = events.filter(e => e.kind === 'tool' && e.name === 'update_agenda').map(e => e.at);
  goals.moves = agendas.slice(1).map(a => (agendaCalls.some(at => at <= a.at && a.at - at < 3000) ? 'actor' : 'evidence'));
  goals.evidenceMoves = goals.moves.filter(m => m === 'evidence').length;
  // The goal (and lesson step) each plan brief told Plato, in runs: a brief stuck on one goal while the talk moved on shows here.
  const briefTexts = events.filter(e => e.kind === 'sent' && e.type === 'contextual_update' && /PLAN UPDATE/.test(e.text));
  goals.briefs = briefTexts.map(e => {
    const goal = e.text.match(/goal (\d+) of (\d+):? "([^"]+)"/i), step = e.text.match(/lesson step (\d+) of (\d+)/i);
    return `${goal ? `${goal[1]}/${goal[2]} ${goal[3]}` : '(no goal named)'}${step ? ` · step ${step[1]}/${step[2]}` : ''}`;
  }).reduce((runs, b) => { if (runs.at(-1)?.goal === b) runs.at(-1).briefs++; else runs.push({ goal: b, briefs: 1 }); return runs; }, []);
  // update_agenda: what Plato asked for, and what the backend held back ("Not yet: …", "The agenda just moved: …", …).
  const REFUSED = /^(Not yet:|The agenda just moved:|That's part of|"[^"]*" is already)/;
  const calls = events.filter(e => e.kind === 'tool-done' && e.name === 'update_agenda').map(d => {
    const { action, about } = events.find(e => e.kind === 'tool' && e.id === d.id)?.params || {};
    return { action, about, refused: REFUSED.test(String(d.result ?? '')), say: short(d.result, 160) };
  });
  goals.calls = Object.fromEntries(['add', 'done', 'skip', 'focus'].map(a => [a, { applied: calls.filter(c => c.action === a && !c.refused).length, refused: calls.filter(c => c.action === a && c.refused).length }]));
  goals.refusals = calls.filter(c => c.refused).map(c => `${c.action}${c.about ? ` "${c.about}"` : ''} → ${c.say}`);
  // Lesson steps per goal: from the plan briefs, show_lesson_board, the agenda's own step, and cards.
  const steps = new Map(), entry = goal => steps.get(goal) || steps.set(goal, { goal, of: null, briefed: [], boards: [], reached: [] }).get(goal);
  const reach = (goal, n, of) => { if (!goal || !Number.isFinite(n)) return; const s = entry(goal); if (of) s.of = of; if (!s.reached.includes(n)) s.reached.push(n); };
  for (const e of briefTexts) {
    const goal = e.text.match(/goal \d+ of \d+:? "([^"]+)"/i)?.[1], step = e.text.match(/lesson step (\d+) of (\d+)/i);
    if (goal && step) { entry(goal).briefed.includes(+step[1]) || entry(goal).briefed.push(+step[1]); reach(goal, +step[1], +step[2]); }
  }
  const goalAt = at => { const a = agendas.findLast(x => x.at <= at)?.agenda; return a?.goals.find(g => g.id === a.currentGoalId) ?? null; };
  for (const c of events.filter(e => e.kind === 'tool' && e.name === 'show_lesson_board')) {
    const goal = goalAt(c.at)?.title, n = Number(String(c.params?.step ?? '').match(/\d+/)?.[0]);
    if (goal && Number.isFinite(n)) { entry(goal).boards.push(n); reach(goal, n); }
  }
  for (const { agenda } of agendas) for (const g of agenda.goals) if (g.step) reach(g.title, Number(g.step));
  // A card's lessonAt.step counts the lesson's asking steps from 0.
  for (const e of events.filter(e => e.kind === 'server' && e.type === 'card.issued')) { const c = e.payload?.card; if (Number.isFinite(c?.lessonAt?.step)) reach(c.goalTitle, Number(c.lessonAt.step) + 1); }
  goals.lessonSteps = [...steps.values()].map(s => ({ ...s, max: Math.max(0, ...s.reached) }));
  const stepsReached = goals.lessonSteps.reduce((n, s) => n + s.reached.length, 0);
  // Boards: each one shown should be taught from, in Plato's words in its turn or his next reply.
  const turnStart = at => students.findLast(s => s.at <= at)?.at ?? t0, nextStudent = at => students.find(s => s.at > at)?.at ?? Infinity;
  const boards = events.filter(boardShown).map(b => {
    const end = nextStudent(b.at), after = replies.find(r => r.at > end);
    const said = replies.filter(r => r.at >= turnStart(b.at) && r.at < end).concat(after ? [after] : []);
    const on = content(`${b.titles.join(' ')} ${b.text}`), best = Math.max(0, ...said.map(r => shared(content(r.text), on)));
    return { titles: b.titles, atS: +((b.at - t0) / 1000).toFixed(1), taught: best >= 2, sharedWords: best };
  });
  // Grounding: the course's lectures, topics and the lessons' key points in what Plato says.
  // A one-word name ("State", "Arrays") counts only as the course writes it; a longer one in any case.
  const named = list => list.filter(x => { const re = new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, /\s/.test(x) ? 'i' : ''); return replies.some(r => re.test(r.text)); });
  const lessonsUsed = seenLessons(events, lesson), lessons = lessonsUsed.map(l => {
    const points = l.keyPoints.map(k => ({ text: k.text, lecture: k.lecture, covered: Math.max(0, ...replies.map(r => shared(content(k.text), content(r.text)) / (content(k.text).size || 1))) >= 0.5 }));
    return { title: l.title, source: l.source, steps: l.steps?.length ?? 0, covered: points.filter(k => k.covered).length, of: points.length, points };
  });
  const toolCalls = events.filter(e => e.kind === 'tool').reduce((n, e) => ({ ...n, [e.name]: (n[e.name] || 0) + 1 }), {});
  const lectureRe = course.lectures.map(x => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, /\s/.test(x) ? 'i' : ''));
  const grounding = {
    lecturesNamed: named(course.lectures), repliesCitingNotes: replies.filter(r => /\b(your|the)\s+(\S+\s+){0,4}?(notes|lectures?|readings?|slides)\b|\blecture \d+/i.test(r.text)).length,
    // A grounded claim: a reply that names a lecture or carries a [src:…] ref.
    groundedReplies: replies.filter(r => /\[src:[^\]]+\]/.test(r.text) || lectureRe.some(re => re.test(r.text))).length,
    topicsNamed: named(course.topics.filter(t => t.length >= 5)), lessons,
    courseTools: Object.fromEntries(['show_lesson_board', 'show_from_notes', 'read_source', 'open_module', 'think'].map(t => [t, toolCalls[t] || 0])),
  };
  // Drift: a reply that shares no content word with its goal (title, done-when, lesson summary, key points, step aims) or card.
  const goalWords = g => { const l = lessonsUsed.find(x => x.goalId === g?.id); return content([g?.title, g?.doneWhen, l?.summary, ...(l?.keyPoints || []).map(k => k.text), ...(l?.steps || []).map(s => s.aim)].filter(Boolean).join(' ')); };
  const cardAt = at => events.findLast(e => e.kind === 'server' && e.type === 'card.issued' && e.at <= at)?.payload?.card;
  const drifted = replies.filter(r => { const g = goalAt(r.at); if (!g) return false; const on = goalWords(g); for (const w of content(JSON.stringify(cardAt(r.at) || ''))) on.add(w); return on.size && !shared(content(r.text), on); });
  // Cards mode: cards issued, the time from the student's answer to the next card, think calls and their latency.
  // Each card once (card 1 comes both in the start result and as card.issued).
  const cards = events.filter((e, i, all) => e.kind === 'server' && e.type === 'card.issued' && all.findIndex(x => x.kind === 'server' && x.type === 'card.issued' && x.payload?.card?.id === e.payload?.card?.id) === i);
  const thinks = events.filter(e => e.kind === 'tool' && e.name === 'think').map(t => { const done = events.find(e => e.kind === 'server' && e.type === 'thought.ready' && e.at >= t.at); return done ? done.at - t.at : null; });
  const sent = events.filter(e => e.kind === 'sent' && e.type === 'contextual_update');
  return {
    turns: turns.length, replies: replies.length, timeouts: turns.filter(t => t.timedOut).length,
    medianFirstReplyMs: median(turns.map(t => t.firstReplyMs)), stepsPer10Turns: turns.length ? +(stepsReached * 10 / turns.length).toFixed(1) : 0,
    repeats: { duplicates, repeatedQuestions }, agenda: { flipFlops, ...goals }, boards: { shown: boards.length, untaught: boards.filter(b => !b.taught), all: boards },
    drift: { replies: drifted.length, examples: drifted.slice(0, 3).map(r => short(r.text, 140)) },
    cards: cards.length ? { issued: cards.length, medianNextCardMs: median(students.map(s => { const c = cards.find(x => x.at >= s.at); return c ? c.at - s.at : null; })), think: { calls: thinks.length, medianMs: median(thinks) }, ...matched(events, director) } : null,
    // His words: bracketed tags (never array indexing such as a[i]), and pointer code that lost its asterisks.
    words: {
      tags: replies.filter(r => /(^|[\s(])\[[A-Za-z][A-Za-z ]{1,30}\]/.test(r.text)).map(r => short(r.text.match(/(^|[\s(])\[[A-Za-z][A-Za-z ]{1,30}\]/)[0], 40)),
      withAsterisk: replies.filter(r => r.text.includes('*')).length,
      asteriskInWords: replies.filter(r => /\b(star|asterisk|dereferenc\w*|pointer to)\b/i.test(r.text)).length,
      strippedAsterisk: replies.filter(r => /\b(?:int|char|long|short|float|double|void|unsigned)\s+(?:p|q|ptr|\w+_ptr)\s*(?:=|;|,|\))|\b(?:int|char|long|short|float|double|void|unsigned)\s+\w+\s*=\s*&/.test(r.text)).map(r => short(r.text, 160)),
    },
    // The centered views: in the briefs he was sent, and from open_module.
    centered: {
      briefs: sent.flatMap(e => [...e.text.matchAll(/CENTERED ON:\s*([^\n]+)/g)].map(m => m[1].trim())).filter((x, i, all) => x !== all[i - 1]),
      opened: events.filter(e => e.kind === 'tool-done' && e.name === 'open_module').map(e => String(e.result ?? '').match(/CENTERED ON:\s*([^\n]+)/)?.[1]?.trim() || `(${short(e.result, 60)})`),
    },
    topicChanges: events.filter(e => e.kind === 'tool-done' && e.name === 'change_topic').map(e => short(e.result, 160)),
    grounding, toolCalls, context: { lines: sent.length, chars: sent.reduce((n, e) => n + e.text.length, 0), longest: Math.max(0, ...sent.map(e => e.text.length)) },
  };
}

// Cards mode: what the director made of each answer (stand-in 'director' events) and its student model's misconceptions.
function matched(events, director) {
  const matches = events.filter(e => e.kind === 'director').map(e => e.match), concepts = Object.values(director?.model || {});
  // Each answer with what it was matched against: the card's own ask, and what Plato actually asked just before it.
  const cardsById = new Map(events.filter(e => e.kind === 'server' && e.type === 'card.issued').map(e => [e.payload?.card?.id, e.payload?.card]));
  const asked = answer => { const s = events.find(e => e.kind === 'student' && answer && e.text.startsWith(answer.slice(0, 40))); return s ? events.findLast(e => e.kind === 'plato' && e.at < s.at)?.text ?? null : null; };
  const list = matches.map(m => ({ answer: m.answer, kind: m.kind, how: m.how, asWritten: m.asWritten ?? null, cardAsk: cardsById.get(m.cardId)?.ask ?? null, platoSaid: short(asked(m.answer), 400) }));
  const count = key => matches.reduce((n, m) => ({ ...n, [m[key]]: (n[m[key]] || 0) + 1 }), {});
  return { answers: matches.length, branchMatchRate: matches.length ? +(matches.filter(m => m.branchId).length / matches.length).toFixed(2) : null, byKind: count('kind'), byHow: count('how'),
    medianMatchMs: median(matches.map(m => m.ms)), list, misconceptions: { caught: [...new Set(concepts.flatMap(c => c.seen || []))], repaired: [...new Set(concepts.flatMap(c => c.cleared || []))] } };
}

const JUDGE = `You review a tutoring session between an AI tutor (Plato) and a student, for the tutor's developers. Judge only the tutor.
Question: did the tutor lead a coherent lesson from the course material? Score 1 to 5: 5 = a clear thread toward a goal, taught from the
course's own lectures and key points, boards explained and checked; 1 = lost, repetitive or generic, things thrown on the board untaught.
Give 2 to 5 short, concrete reasons that quote or point at specific moments.`;
export async function judge(runtime, { events, t0, course, lesson, goalsAtStart }) {
  const schema = { type: 'object', additionalProperties: false, required: ['score', 'reasons'], properties: { score: { type: 'integer', enum: [1, 2, 3, 4, 5] }, reasons: { type: 'array', items: { type: 'string' } } } };
  const { json } = await runtime.ask({ role: 'heavy', effort: 'medium', timeoutMs: 180_000, instructions: JUDGE, schema,
    input: `Course: CS 3410. Lectures: ${course.lectures.join('; ')}.\nThe session's goals at the start: ${goalsAtStart}\n${seenLessons(events, lesson).map(l => `A lesson prepared for this session: ${JSON.stringify({ title: l.title, summary: l.summary, keyPoints: l.keyPoints, steps: l.steps?.map(s => `${s.move}: ${s.aim}`) })}\n`).join('')}\nThe session:\n${timeline(events, t0, { student: true })}` });
  return json;
}

/** Writes evals/runs/<time>-<slug>/ (run.json, checks.json, transcript.md) and prints the summary. */
export async function writeRun(record, { heading }) {
  const dir = path.join(HERE, 'runs', `${new Date(record.t0).toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${record.scenario.slug}${record.label ? `-${record.label}` : ''}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'run.json'), JSON.stringify(record, null, 2));
  await writeFile(path.join(dir, 'checks.json'), JSON.stringify(record.checks, null, 2));
  await writeFile(path.join(dir, 'transcript.md'), `# ${record.scenario.title || record.scenario.slug}\n\n${new Date(record.t0).toLocaleString()} · session ${record.sessionId} · ${heading}${record.incident ? `\n\n**Incident:** ${record.incident}` : ''}\n\n${timeline(record.events, record.t0)}\n\n## Checks\n\n\`\`\`json\n${JSON.stringify(record.checks, null, 2)}\n\`\`\`\n`);
  summary(record, dir);
  return dir;
}

function summary({ checks: c, incident, problems = [] }, dir) {
  const j = c.judge;
  console.log(`\n${path.relative(process.cwd(), dir)}${incident ? `\nINCIDENT: ${incident}` : ''}
turns ${c.turns} · Plato replies ${c.replies} · median first reply ${c.medianFirstReplyMs ?? '-'} ms · timeouts ${c.timeouts} · context lines ${c.context.lines} (${c.context.chars} chars)
repeats: ${c.repeats.duplicates.length} near-duplicate consecutive replies, ${c.repeats.repeatedQuestions.length} repeated questions · drift: ${c.drift.replies} replies off their goal
agenda: ${c.agenda.flipFlops.length} flip-flops${c.agenda.flipFlops.map(f => ` [${f.goal}: ${f.from}→${f.to} at ${f.atS}s]`).join('')} · ${c.agenda.changes} changes (${c.agenda.evidenceMoves} on evidence) · completed ${c.agenda.completed} · finished ${JSON.stringify(c.agenda.finished)} · added ${JSON.stringify(c.agenda.added)} · current "${c.agenda.currentAtStart}" → "${c.agenda.currentAtEnd}"
plan briefs named: ${c.agenda.briefs.map(b => `"${b.goal}" ×${b.briefs}`).join(' → ') || 'none'}
update_agenda: ${Object.entries(c.agenda.calls).map(([a, n]) => `${a} ${n.applied}${n.refused ? ` (+${n.refused} refused)` : ''}`).join(', ')}${c.agenda.refusals.map(r => `\n  refused: ${short(r, 200)}`).join('')}
lesson steps: ${c.stepsPer10Turns} per 10 turns · ${c.agenda.lessonSteps.map(s => `"${s.goal}" reached ${s.max}/${s.of ?? '?'} (steps [${s.reached}], boards [${s.boards}])`).join(' · ') || 'none'}${c.cards ? `\ncards: ${c.cards.issued} issued · median answer → next card ${c.cards.medianNextCardMs ?? '-'} ms · think ${c.cards.think.calls} (median ${c.cards.think.medianMs ?? '-'} ms)${c.topicChanges?.length ? ` · topic changes ${c.topicChanges.length}` : ''}${c.cards.answers != null ? ` · branch match ${c.cards.branchMatchRate ?? '-'} of ${c.cards.answers} answers ${JSON.stringify(c.cards.byKind)} by ${JSON.stringify(c.cards.byHow)} · misconceptions caught ${c.cards.misconceptions.caught.length}, repaired ${c.cards.misconceptions.repaired.length}` : ''}` : ''}
words: tags ${JSON.stringify(c.words.tags)} · replies with * ${c.words.withAsterisk} · * in words ${c.words.asteriskInWords} · likely stripped * ${c.words.strippedAsterisk.length}
centered: briefs ${JSON.stringify(c.centered.briefs)} · opened ${JSON.stringify(c.centered.opened)}
boards: ${c.boards.shown} shown, ${c.boards.untaught.length} not taught${c.boards.untaught.map(b => ` [${b.titles.join(' / ') || 'untitled'}]`).join('')}
grounding: lectures named ${JSON.stringify(c.grounding.lecturesNamed)} · grounded replies ${c.grounding.groundedReplies}/${c.replies} · citing notes/lectures ${c.grounding.repliesCitingNotes}/${c.replies} · topics named ${c.grounding.topicsNamed.length} · key points ${c.grounding.lessons.map(l => `"${l.title}" (${l.source}) ${l.covered}/${l.of}`).join(', ') || 'n/a (no lesson seen)'} · course tools ${JSON.stringify(c.grounding.courseTools)}
tools: ${JSON.stringify(c.toolCalls)}
judge: ${j ? (j.error ? `failed (${j.error})` : `${j.score}/5 · ${j.reasons.join(' | ')}`) : 'skipped'}${problems.length ? `\nproblems (${problems.length}): ${problems.slice(0, 5).map(p => short(p, 160)).join(' | ')}` : ''}`);
}
