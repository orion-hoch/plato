// Shared by the understanding suite (run.mjs, student.mjs): the cached sandbox, the course material per topic, the
// representations under test, the regurgitation measure, the answer checks that run code, and cached model calls.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
// FROZEN holds what is domain-agnostic (the move rubric and its calibration); each course is a fixture (fixtures/<name>/).
export const FROZEN = path.join(HERE, 'frozen'), CACHE = path.join(HERE, 'cache'), SANDBOX = path.join(CACHE, 'sandbox');
export const readJson = async (file, fallback = undefined) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (fallback !== undefined) return fallback; throw error; } };
export const writeJson = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); };
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 12);
export const clip = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
export const mean = xs => { const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export const pct = x => x == null ? '–' : `${Math.round(x * 100)}%`;
export const fix = (x, d = 2) => x == null ? '–' : Number(x).toFixed(d);

// ---------- fixtures: a course to run the suite on (fixtures/<name>/fixture.json) ----------
/**
 * The fixture in use: { name, course, source, checks, catalogued, spine, simulator } from its fixture.json, plus its
 * dirs: `dir` (fixture.json, topics.json, its simulator library), `frozen` (its probes, banks, audits) and `cache` (its
 * frozen baselines; for a course built from files, its exam id).
 *  source.kind "snapshot": an exam already in data/ (copied into the sandbox); "files": Markdown files ingested into the
 *  sandbox through the real upload and knowledge pipeline (run.mjs --build-fixture).
 */
export let FX = null;
export async function loadFixture(name = 'cs3410') {
  const dir = path.join(HERE, 'fixtures', name), fx = await readJson(path.join(dir, 'fixture.json'));
  FX = { checks: ['arith'], catalogued: null, spine: null, ...fx, name, dir, frozen: path.join(dir, 'frozen'), cache: path.join(CACHE, name) };
  return FX;
}
export async function examIdOf(fx = FX) { return fx.source.examId ?? (await readJson(path.join(fx.cache, 'exam.json'), null))?.examId ?? null; }

// ---------- the sandbox: one VACUUM INTO copy of data/, kept in cache/ so Studies built there survive between runs ----------
/**
 * The fixture's cached sandbox dir (backend.db, blobs, local-principal.json), made once (read only from its origin);
 * `fresh` retakes it. Origin: data/ (the shared cache/sandbox), or a fixture's `source.sandbox`: another sandbox dir,
 * such as the one the Study pipeline builds its courses in (then its own copy, cache/<fixture>/sandbox).
 */
export const sandboxDir = () => FX?.source?.sandbox ? path.join(FX.cache, 'sandbox') : SANDBOX;
export async function sandbox({ fresh = false } = {}) {
  const dir = sandboxDir(), db = path.join(dir, 'backend.db');
  if (existsSync(db) && !fresh) return dir;
  const { DatabaseSync } = await import('node:sqlite');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const data = FX?.source?.sandbox ? path.resolve(ROOT, FX.source.sandbox) : path.join(ROOT, 'data'), real = new DatabaseSync(path.join(data, 'backend.db'), { readOnly: true });
  try { real.exec(`VACUUM INTO '${db.replaceAll("'", "''")}'`); } finally { real.close(); }
  await cp(path.join(data, 'blobs'), path.join(dir, 'blobs'), { recursive: true });
  await copyFile(path.join(data, 'local-principal.json'), path.join(dir, 'local-principal.json'));
  // Background work in flight at the snapshot is not ours (as evals/common.mjs does it).
  const copy = new DatabaseSync(db);
  try { copy.prepare("UPDATE jobs SET state = 'cancelled', data = json_set(data, '$.state', 'cancelled') WHERE state IN ('queued', 'running', 'retry_wait')").run(); } finally { copy.close(); }
  console.log(`sandbox: snapshot of ${path.relative(ROOT, data) || 'data'} in ${path.relative(process.cwd(), dir)}`);
  return dir;
}

/** A throwaway copy of the cached sandbox at `dest` (for runs that write learner evidence, which must not accumulate). */
export async function copySandbox(dest) {
  const { DatabaseSync } = await import('node:sqlite');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const from = await sandbox(), src = new DatabaseSync(path.join(from, 'backend.db'), { readOnly: true });
  try { src.exec(`VACUUM INTO '${path.join(dest, 'backend.db').replaceAll("'", "''")}'`); } finally { src.close(); }
  await cp(path.join(from, 'blobs'), path.join(dest, 'blobs'), { recursive: true });
  await copyFile(path.join(from, 'local-principal.json'), path.join(dest, 'local-principal.json'));
  return dest;
}

/** A limiter for whole tasks (each may open its own backend): at most `n` at once. */
export function pool(n) {
  // n: a number, or a function read before each start (a cap lowered while running holds back new tasks only).
  let active = 0; const waiting = [], cap = typeof n === 'function' ? n : () => n;
  return async task => {
    while (active >= cap()) await new Promise(r => waiting.push(r));
    active++;
    try { return await task(); } finally { active--; waiting.shift()?.(); }
  };
}

/** The backend's modules. Other agents edit the shared tree while suites run, so the backend can fail to load for a few
 *  minutes (a renamed export mid-edit). Then wait until a fresh process loads it and rerun this same command (an ES
 *  module that failed to link stays failed in this process), at most 5 times; any other error is thrown. */
async function importBackend() {
  try { return await import('../../backend/app.mjs'); }
  catch (e) {
    const n = Number(process.env.UNDERSTANDING_REEXEC || 0);
    if (!(e instanceof SyntaxError) || n >= 5) throw e;
    console.log(`[backend] does not load (${String(e.message).split('\n')[0]}): waiting until it does, then rerunning this command`);
    const { spawnSync } = await import('node:child_process');
    for (let i = 0; i < 90; i++) { // up to 45 minutes
      await new Promise(r => setTimeout(r, 30_000));
      if (spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', "await import('./backend/app.mjs')"], { cwd: ROOT }).status !== 0) continue;
      const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, UNDERSTANDING_REEXEC: String(n + 1) } });
      process.exit(r.status ?? 1);
    }
    throw e;
  }
}

/** The backend in this process on the sandbox copy, or on `dir` (no workers started: nothing runs in the background),
 *  pointed at the fixture's exam (`app.examId`, `app.scope`, `app.km`; null while a files fixture is not built yet). */
export async function openApp(runtime = null, { dir: at = null, examId = null } = {}) {
  const dir = at ?? await sandbox(), EXAM = examId ?? (FX ? await examIdOf(FX) : null);
  const { createBackend } = await importBackend();
  const { createClock } = await import('../../backend/core/util.mjs');
  const clock = createClock();
  const providers = runtime ? (await import('../../backend/providers/live.mjs')).createLiveProviders({ runtime, clock }) : {};
  // backend/core/db.mjs sets WAL before its busy timeout, so opening fails while another process writes: retry for a minute.
  let app;
  for (let tries = 0; !app; tries++) {
    try { app = createBackend({ dbFile: path.join(dir, 'backend.db'), blobDir: path.join(dir, 'blobs'), clock, providers, config: { sessionTickMs: 250 } }); }
    // "locked": another process is writing; a migration's UNIQUE failure: another process applied it first (both resolve on reopening).
    catch (error) { if (!/locked|busy|UNIQUE constraint failed: schema_migrations/i.test(error.message) || tries >= 30) throw error; await new Promise(r => setTimeout(r, 2000)); }
  }
  app.dir = dir;
  app.principal = app.auth.authenticate(`Bearer ${JSON.parse(await readFile(path.join(dir, 'local-principal.json'), 'utf8')).token}`);
  const exam = EXAM && app.db.prepare('SELECT data FROM exams WHERE id = ?').get(EXAM);
  if (EXAM && !exam) throw Error(`exam ${EXAM} is not in the sandbox`);
  const e = exam ? JSON.parse(exam.data) : null;
  app.examId = e?.id ?? null; app.scope = e?.scope ?? null; app.km = e?.publishedKnowledgeManifestId ?? null;
  return app;
}

// ---------- the material ----------
/** A topic's notes: its own and its subtopics' evidence anchors plus its module concepts' anchors, as passages. */
export function topicMaterial(app, topicId, maxTokens = 7000) {
  const v = app.services.knowledge.view(app.scope, app.km), ids = new Set([topicId]);
  for (let grew = true; grew; ) { grew = false; for (const t of v.topics) if (ids.has(t.parentTopicId) && !ids.has(t.topicId)) { ids.add(t.topicId); grew = true; } }
  const node = app.services.modules?.get?.(app.scope, `mod_${topicId}`) ?? null;
  const anchors = [...new Set([...(node?.concepts || []).flatMap(c => c.anchorIds || []), ...v.evidenceLinks.filter(l => ids.has(l.topicId)).map(l => l.sourceAnchorId)])];
  const passages = app.services.knowledge.passages(app.scope, app.km, anchors, { maxTokens });
  const text = passages.map(p => `## ${p.lecture} > ${p.section}\n${p.blocks.map(b => b.text).join('\n\n')}`).join('\n\n');
  return { topicId, title: v.topics.find(t => t.topicId === topicId)?.title ?? node?.title, node, anchors, passages, text };
}

/** Every faithful anchor's text in the course: what "copied from the notes" is measured against. */
export function courseText(app) {
  const ids = app.db.find('source_anchors', {}, { scope: app.scope }).map(a => a.id);
  return app.services.knowledge.anchors(app.scope, ids).map(a => a.excerpt).filter(Boolean).join('\n\n');
}

// ---------- regurgitation: the share of words inside an 8-word sequence that also occurs in the notes ----------
const N = 8;
const tokens = text => String(text ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || [];
export const gramsOf = text => { const t = tokens(text), out = new Set(); for (let i = 0; i + N <= t.length; i++) out.add(t.slice(i, i + N).join(' ')); return out; };
/** { words, copied, rate } of `text` against the notes' 8-grams; prose only when `prose` (fenced code cut, it is quoted on purpose). */
export function regurgitation(text, grams, { prose = true } = {}) {
  const t = tokens(prose ? String(text).replace(/```[\s\S]*?```/g, ' ') : text), hit = new Array(t.length).fill(false);
  for (let i = 0; i + N <= t.length; i++) if (grams.has(t.slice(i, i + N).join(' '))) for (let k = i; k < i + N; k++) hit[k] = true;
  const copied = hit.filter(Boolean).length;
  return { words: t.length, copied, rate: t.length ? copied / t.length : 0 };
}
/** The longest copied runs, for the report. */
export function copiedRuns(text, grams, n = 3) {
  const t = tokens(String(text).replace(/```[\s\S]*?```/g, ' ')), hit = new Array(t.length).fill(false), runs = [];
  for (let i = 0; i + N <= t.length; i++) if (grams.has(t.slice(i, i + N).join(' '))) for (let k = i; k < i + N; k++) hit[k] = true;
  for (let i = 0; i < t.length; ) { if (!hit[i]) { i++; continue; } let j = i; while (j < t.length && hit[j]) j++; runs.push(t.slice(i, j).join(' ')); i = j; }
  return runs.sort((a, b) => b.length - a.length).slice(0, n);
}

// Close paraphrase: verbatim 8-grams miss a sentence of the notes with a few words swapped ("as the notes state it" in
// other words). A sentence counts as close when 80% of its content words are in ONE sentence of the notes; the rate is
// the share of content words in such sentences. Harder to game than n-grams: synonym swaps of whole sentences still show.
const STOPW = new Set('the a an of to in is are and or for on with as by that this it its be at from into than then so if not but can each which when where what how there their they these those was were has have had do does done will would should could may might must also only just more most very such any all both one two you your we our us'.split(' '));
const contentWords = s => new Set(tokens(s).filter(w => w.length > 2 && !STOPW.has(w)));
const sentencesOf = text => String(text ?? '').replace(/```[\s\S]*?```/g, ' ').split(/(?<=[.!?;:])\s+|\n+/).map(x => x.trim()).filter(Boolean);
/** The notes' sentences as content-word sets (build once per run), indexed by word. */
export function notesIndex(text) {
  const sets = sentencesOf(text).map(contentWords).filter(s => s.size >= 4), byWord = new Map();
  sets.forEach((s, i) => { for (const w of s) (byWord.get(w) || byWord.set(w, []).get(w)).push(i); });
  return { sets, byWord };
}
export function paraphrase(text, index, { threshold = 0.8, min = 6 } = {}) {
  let words = 0, close = 0;
  for (const sentence of sentencesOf(text)) {
    const c = contentWords(sentence);
    if (c.size < min) continue;
    words += c.size;
    const hits = new Map();
    for (const w of c) for (const i of index.byWord.get(w) || []) hits.set(i, (hits.get(i) || 0) + 1);
    if (Math.max(0, ...hits.values()) / c.size >= threshold) close += c.size;
  }
  return { words, close, rate: words ? close / words : 0 };
}

// The text of a representation, for regurgitation: its string leaves, never ids, refs or quotes the route asks them to read.
// Programs and diagram data are skipped too (a check program is code, not prose), as backend/understanding/study.mjs does.
// Runnable parts of a Study (task families' generate/solve, executable rules, simulations) are code too.
const NOT_TEXT = new Set(['id', 'ids', 'refs', 'ref', 'sources', 'conceptIds', 'anchorIds', 'sourceRef', 'questionIds', 'topicId', 'topicIds', 'lookFor', 'builtAt', 'version', 'to', 'lecture', 'lectures', 'goalId', 'key', 'selfExam', 'where', 'questionId', 'itemId', 'check', 'program', 'diagramData', 'meta',
  'familyId', 'generate', 'solve', 'rules', 'simulation', 'code', 'seed', 'input', 'features', 'verification', 'courseModelId', 'wrongModelId', 'probeId', 'quality', 'log']);
export function textOf(value, key = null) {
  if (NOT_TEXT.has(key)) return '';
  if (typeof value === 'string') return /\s/.test(value.trim()) ? value : ''; // a single token is an id, a ref or a value, not prose
  if (Array.isArray(value)) return value.map(v => textOf(v)).join('\n');
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => textOf(v, k)).join('\n');
  return '';
}

// ---------- the representations under test ----------
/**
 * Today's representation of a topic (the baseline), frozen once by freezeBaselines (cache/representations/baseline/):
 * its module node and the lesson today's director teaches a goal on it from. Null until frozen.
 */
export const baselineRep = (app, topicId) => readJson(path.join(FX.cache, 'representations', 'baseline', `${topicId}.json`), null);

const cancelQueued = (app, keep) => {
  // Every exam's: the sandbox is ours, and a job of another exam would otherwise be claimed in between.
  for (const job of app.db.find('jobs', { state: ['queued', 'retry_wait'] })) if (!keep(job)) app.db.update('jobs', { ...job, state: 'cancelled', updatedAt: new Date().toISOString() });
};
/** Runs the queued jobs `keep` allows, `parallel` at a time, and only those: anything else queued, before or while they
 *  run (a card's background refinements, other goals' lessons, the next turn), is cancelled before each pick. */
export async function runOnly(app, keep, parallel = 3) {
  const loop = async () => {
    for (;;) {
      cancelQueued(app, keep);
      if (!app.db.find('jobs', { state: ['queued', 'retry_wait'] }).some(keep)) return;
      if (!await app.jobs.runOnce()) await new Promise(r => setTimeout(r, 500));
    }
  };
  // One job runner per sandbox copy across processes: another runner would cancel this one's jobs (a lock dir, as mkdir is atomic).
  // ponytail: a stale lock (a killed run) is taken over after 3 hours; delete <dir>/.jobs.lock to free it sooner.
  const lock = path.join(app.dir, '.jobs.lock');
  for (let waited = 0; ; waited++) {
    try { await mkdir(lock); break; } catch {
      const { mtimeMs } = await import('node:fs').then(fs => fs.statSync(lock));
      if (Date.now() - mtimeMs > 3 * 3600_000) { await rm(lock, { recursive: true, force: true }); continue; }
      if (waited % 60 === 0) console.log(`  waiting for another run's jobs on ${path.basename(app.dir)} to finish…`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  try { await Promise.all(Array.from({ length: parallel }, loop)); } finally { await rm(lock, { recursive: true, force: true }); }
}

/**
 * Freezes today's representation of each topic through the real path: a session started on the topic (a pressed topic
 * leads the agenda, as the page does it), whose goal gets the instant lesson at once and Astra's lesson from
 * `prepare_lesson` (the deep setting at high effort, as the server runs it at session start); only those jobs run, in
 * this process, on the cached sandbox. The baseline is the module plus the lesson the director then teaches from
 * (Astra's when it held up, else the instant one), with card 1 as it was issued.
 */
export async function freezeBaselines(app, topicIds) {
  const dir = path.join(FX.cache, 'representations', 'baseline'), todo = [];
  for (const topicId of topicIds) if (!existsSync(path.join(dir, `${topicId}.json`))) todo.push(topicId);
  if (!todo.length) return;
  const started = todo.map(topicId => {
    const r = app.services.session.start(app.principal, app.examId, { topicId });
    return { topicId, r, goal: r.agenda?.goals.find(g => g.id === r.agenda.currentGoalId) ?? null };
  });
  const goals = new Set(started.map(x => x.goal?.id).filter(Boolean));
  console.log(`baseline: ${todo.length} sessions started; preparing their lessons (the deep setting, high effort, 3 at a time)…`);
  if (app.services.lessons) await runOnly(app, job => job.type === 'prepare_lesson' && goals.has(job.payload?.goal?.id));
  for (const { topicId, r, goal } of started) {
    // Lessons retire with the engine's course-model teaching (v12): then today's representation has no lesson to freeze.
    const node = app.services.modules?.get?.(app.scope, `mod_${topicId}`) ?? null, lesson = goal && app.services.lessons?.forGoal ? app.services.lessons.forGoal(app.scope, goal, app.km) : null, instant = r.lesson?.lesson ?? null;
    const brief = l => l && { title: l.title, source: l.source, summary: l.summary, keyPoints: l.keyPoints, example: l.example, misconceptions: l.misconceptions,
      steps: (l.steps || []).map(st => ({ move: st.move, aim: st.aim, say: st.say, board: st.board?.content ?? (st.board ? JSON.stringify(st.board).slice(0, 600) : null), check: st.check, ladder: (st.ladder || []).map(({ level, use, prompt, expected, ifWrong }) => ({ level, use, prompt, expected, ifWrong })) })) };
    await writeJson(path.join(dir, `${topicId}.json`), {
      kind: 'baseline', topicId, title: node?.title ?? topicId, frozenAt: new Date().toISOString(),
      goal: goal && { title: goal.title, mode: goal.mode, doneWhen: goal.doneWhen, why: goal.why ?? null, topicIds: goal.topicIds },
      module: node && { source: node.source, summary: node.summary, concepts: node.concepts.map(c => ({ id: c.id, statement: c.statement, lecture: c.lecture, links: (c.links || []).map(l => ({ to: l.to, relation: l.relation, why: l.why })) })), example: node.example, misconceptions: node.misconceptions, goals: node.goals },
      lesson: brief(lesson), lessonInstant: lesson?.source === 'astra' ? { source: instant?.source ?? null, title: instant?.title ?? null } : null,
      card1: r.card && { source: r.card.source, say: r.card.say, ask: r.card.ask, expect: (r.card.expect || []).map(({ kind, when }) => ({ kind, when })) },
    });
    try { app.services.session.end(app.principal, r.sessionId, { expectedEpoch: r.epoch }); } catch { /* ended or moved on: nothing to keep */ }
    console.log(`  ${node?.title}: lesson ${lesson?.source ?? 'none'}${lesson?.source === 'astra' ? '' : ' (Astra\'s did not land)'}; card 1 ${r.card?.ask ? 'asks' : 'asks nothing'}`);
  }
}

/**
 * The topic's Study (backend/understanding, the contract's Study shape), from `app.services.understanding` when it is
 * there, else the `studies` table. Its self-exam is left out (the answerer gets understanding, not graded answers).
 */
export async function studyRep(app, topicId) {
  const u = app.services.understanding;
  let study = null;
  for (const fn of ['get', 'study', 'forTopic']) if (!study && typeof u?.[fn] === 'function') { try { study = await u[fn](app.scope, topicId); } catch { /* next */ } }
  if (!study) { try { study = app.db.find('studies', { topicId }, { scope: app.scope }).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null; } catch { study = null; } }
  if (!study) return null;
  // Its own measurements and bookkeeping are not understanding: the answerer and the director get the Study's content.
  // `quality` holds its own gate, ablation, grounding and regurgitation results: measurements of the Study, not its content.
  const { scope, rowVersion, inputHash, failedFor, selfExam, regurgitation: r, grounding, versions, current, builtAt, knowledgeManifestId, quality, log, ...rest } = study;
  return { kind: 'study', topicId, title: rest.title ?? topicId, study: rest, selfExam: selfExam ?? null,
    meta: { builtAt, versions, current, version: rest.version ?? null, regurgitation: r?.share ?? quality?.regurgitation?.share ?? null, selfExam: selfExam?.score ?? null, gate: quality?.gate?.pass ?? null, ablation: quality?.ablation ?? null } };
}
/** The representation under test: the Study, today's baseline, the topic's notes alone, or nothing (the model alone). */
export const representation = async (app, topicId, against) => against === 'studies' ? studyRep(app, topicId) : against === 'baseline' ? baselineRep(app, topicId)
  : { kind: against, topicId, title: topicMaterial(app, topicId).title, ...(against === 'notes' ? { notes: topicMaterial(app, topicId).text } : {}) };
/** What an answerer or director is given of a representation: everything but the self-exam. */
export const repForModel = rep => rep.kind === 'study' ? { title: rep.title, study: rep.study } : rep.kind === 'baseline' ? { title: rep.title, module: rep.module, lesson: rep.lesson }
  : rep.kind === 'notes' ? { title: rep.title, notes: rep.notes } : { title: rep.title };

// ---------- answers checked by running ----------
/** Runs a probe's check: C (backend/run runC: its stdout), RISC-V (shared/elements/trace.mjs, a bounded interpreter: the
 *  register's final value), JavaScript (backend/run runJs, sandboxed: its stdout) or arithmetic (a JS expression of
 *  numbers and operators only). Gives the output text, or throws why not. */
export async function runCheck(c) {
  if (c.kind === 'c') {
    const { runC } = await import('../../backend/run/index.mjs');
    const r = await runC({ source: c.source });
    if (!r.ok) throw Error(`C ${r.phase} failed: ${clip(r.stderr, 200)}`);
    return r.stdout.trim();
  }
  if (c.kind === 'riscv') {
    const trace = await import('../../shared/elements/trace.mjs');
    const spec = trace.validate({ lang: 'riscv', code: c.source, watch: [c.register], init: c.init ? JSON.parse(c.init) : {} });
    return trace.run(spec, { maxSteps: 5000, maxCells: 64 }).at(-1).vars[0].value;
  }
  if (c.kind === 'js') {
    // The shared verifier's runner (backend/run runJs, via backend/understanding/verify.mjs): a separate node process
    // under sandbox-exec (no network, no file writes, a time limit), the same one the Study pipeline checks with.
    const { runJs } = await import('../../backend/run/index.mjs');
    const r = await runJs({ source: c.source });
    if (!r.ok) throw Error(r.timedOut ? 'the program did not finish in time' : `the program failed: ${clip(r.stderr, 200)}`);
    return r.stdout.trim();
  }
  if (c.kind === 'arith') {
    // ponytail: a character allowlist, not a parser; model-written expressions only, never student input.
    if (!/^[\d\sa-fxn+\-*/%()&|^~<>.,]+$/i.test(c.source)) throw Error(`not plain arithmetic: ${clip(c.source, 80)}`);
    return String(Function(`"use strict"; return (${c.source});`)());
  }
  throw Error(`no check of kind ${c.kind}`);
}
// Values in a text, in order and in decimal ("0x1F" → 31, "minus 3" → -3), for comparing answers by what they mean.
const numsOf = text => (String(text ?? '').toLowerCase().replace(/[−–]/g, '-').replace(/\b(minus|negative)\s+/g, '-').match(/-?(0x[0-9a-f]+|0b[01]+|\d+(\.\d+)?)/g) || [])
  .map(v => { const neg = v.startsWith('-'), t = v.replace(/^-/, ''), n = t.startsWith('0x') ? parseInt(t.slice(2), 16) : t.startsWith('0b') ? parseInt(t.slice(2), 2) : Number(t); return String(neg ? -n : n); });
const compact = text => String(text ?? '').toLowerCase().replace(/[\s,`'"]/g, '');
/** Whether two short answers are the same: the same text, or the same values in the same order (any base). */
export function sameValue(a, b) {
  if (compact(a) && compact(a) === compact(b)) return true;
  const x = numsOf(a), y = numsOf(b);
  return x.length > 0 && x.join(' ') === y.join(' ');
}
/** Whether a value (a check's output) is stated in a prose answer: verbatim, or all its values, in order, among the
 *  answer's values (other numbers may come between: "-20 + 26 = 6, stores 6" states "6 6"). A sanity check that the
 *  reference does not contradict the run; the run against the check's own expectation is the real test. */
export function statedIn(value, prose) {
  if (compact(value) && compact(prose).includes(compact(value))) return true;
  const x = numsOf(value), y = numsOf(prose);
  let k = 0;
  for (const v of y) if (k < x.length && v === x[k]) k++;
  return x.length > 0 && k === x.length;
}

// ---------- model calls: bounded, cached on disk (a stall loses one call, a rerun of the same run costs nothing) ----------
let runtime = null;
/** Use a runtime made elsewhere (the stand-in's, inside its process) instead of starting a second app-server. */
export const setRuntime = rt => { runtime = rt; };
export async function getRuntime() { if (!runtime) { const { createRuntime } = await import('../../server/runtime.mjs'); runtime = createRuntime(); } return runtime; }
export async function closeRuntime() { await runtime?.close(); runtime = null; }
const POOL = Number(process.env.UNDERSTANDING_POOL || 3); // live calls in flight from this suite; the machine is shared
let running = 0; const queue = [];
export const gate = async task => { await new Promise(r => { queue.push(r); if (running < POOL) { running++; queue.shift()(); } }); try { return await task(); } finally { running--; if (queue.length) { running++; queue.shift()(); } } };
/**
 * One structured call. `role`: a lane of server/runtime.mjs, used at its own model and default effort ('heavy' = the
 * deep setting at high; 'light' = the light setting at low), or `effort: 'medium'` on heavy as evals/common.mjs's judge
 * does. Cached under cache/calls/<key>-<hash of the call>.json when `key` is given; retried once.
 */
export async function ask({ key, role, effort, instructions, input, schema, timeoutMs = 600_000 }) {
  // The key names the call; the hash makes any change to what is asked a new call (a cached answer never answers a different question).
  const file = key && path.join(CACHE, 'calls', `${key}-${hash([role, effort ?? null, instructions, input, schema])}.json`);
  if (file) { const hit = await readJson(file, null); if (hit) return hit.json; }
  const rt = await getRuntime();
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, timings } = await gate(() => rt.ask({ role, effort, instructions, input: typeof input === 'string' ? input : JSON.stringify(input), schema, timeoutMs }));
      if (file) await writeJson(file, { at: new Date().toISOString(), role, effort: effort ?? rt.roles[role].effort, model: rt.roles[role].model, ms: timings.totalMs, json });
      return json;
    } catch (error) { last = error; console.warn(`  call ${key || role} failed (${attempt}/2): ${error.message}`); }
  }
  throw last;
}
export const settingOf = async (role, effort) => { const rt = await getRuntime(); return `${rt.roles[role].model}/${effort ?? rt.roles[role].effort}`; };

/** Runs `fn` over `items` with every result awaited (the pool bounds the live calls). */
export const each = (items, fn) => Promise.all(items.map((x, i) => fn(x, i).catch(error => ({ error: error.message, item: x }))));

// ---------- the scoreboard ----------
export async function scoreboard(row) {
  const file = path.join(HERE, 'scoreboard.md');
  if (!existsSync(file)) await writeFile(file, '# Understanding scoreboard\n\nOne row per run (`node evals/understanding/run.mjs`). Columns are explained in README.md. Lower is better for regurgitation, grounding errors and gate failures.\n\n| date | run | fixture | level | against | prompts | metrics |\n|---|---|---|---|---|---|---|\n');
  // A run from a code snapshot (snapshot.sh) names it: the code is what the snapshot's hash says it was.
  const code = process.env.UNDERSTANDING_SNAPSHOT ? ` · code snapshot ${process.env.UNDERSTANDING_SNAPSHOT}` : '';
  await appendFile(file, `| ${row.date} | ${row.run} | ${row.fixture ?? FX?.name ?? '–'} | ${row.level} | ${row.against} | ${row.prompts}${code} | ${row.metrics} |\n`);
}

/** Cohen's κ over label pairs; `weighted`: linear weights on the ordinal 0/1/2 (pairs with NA left out). */
export function kappa(pairs, weighted = false) {
  const ps = weighted ? pairs.filter(([a, b]) => a !== 'NA' && b !== 'NA') : pairs, n = ps.length;
  if (!n) return { n: 0, agreement: null, kappa: null };
  const cats = [...new Set(ps.flat())], w = (a, b) => weighted ? 1 - Math.abs(Number(a) - Number(b)) / 2 : a === b ? 1 : 0;
  const po = ps.reduce((sum, [a, b]) => sum + w(a, b), 0) / n, pa = c => ps.filter(([a]) => a === c).length / n, pb = c => ps.filter(([, b]) => b === c).length / n;
  let pe = 0;
  for (const a of cats) for (const b of cats) pe += pa(a) * pb(b) * w(a, b);
  return { n, agreement: po, kappa: pe >= 1 ? (po >= 1 ? 1 : 0) : (po - pe) / (1 - pe) };
}

/** Simple JSON-schema builders for strict structured output (every property required; `nul` makes one nullable). */
export const S = {
  obj: props => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props }),
  arr: items => ({ type: 'array', items }), str: { type: 'string' }, num: { type: 'number' }, int: { type: 'integer' }, bool: { type: 'boolean' },
  en: values => ({ type: 'string', enum: values }), nul: t => ({ ...t, type: [t.type, 'null'], ...(t.enum ? { enum: [...t.enum, null] } : {}) }),
};

// ---------- level 3's process metrics (the lead, 2026-10-08): what the tutor does with a learner's answer ----------
const normLine = x => String(x ?? '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const PUMP = /^(go on|say (a bit )?more( about (why|that|it|how))?|tell me (more|why)( about (that|it))?|keep going|tell me (more|what you('| a)re (considering|thinking))|tell me how you got (there|that)|how did you get (there|that)|walk me through (it|that|how you got (there|that)|your (thinking|reasoning|steps)|where that (move|step) would land)|what was your (thinking|reasoning)( there)?|what makes you say that)\W*$/i;
// A hold: an acknowledgement, or the holding line the voice says while the card is on its way ("Hm, let me think about that.").
const ACK = /^(?:(?:hm+|hmm+|okay|ok|alright|right|sure|good question)[,.!]?\s*)?(take your time|no rush|sure|okay|ok|got it|mm+-?hm+|let me (think|see|look)( about (that|this|it)| at (that|this|it)| for a (second|moment)| on (that|this|it))?|one (moment|second|sec)|give me a (second|moment)|just a (second|moment))\W*$/i;
/** A tutor turn: 'drawout' (a pump, or a card's neutral line, after an optional "I heard …" echo), 'ack' (a hold), else 'substantive'. */
export function turnKind(text, neutrals = new Set()) {
  const t = String(text ?? '').replace(/[’‘]/g, "'").trim().replace(/^i heard\b[^.?!]*[.?!]\s*/i, '').replace(/^(okay|ok|sure|hmm|right|alright)[,.!]\s*/i, '').trim();
  if (!t) return 'drawout'; // an echo alone ("I heard 7.") draws out too
  if (ACK.test(t)) return 'ack';
  // Spec §13 rule 9 (the lead): their unproven claim named back as a question in their own words counts as the answer's one draw-out.
  if (/^(so,? )?(you're saying|you mean|you think|your idea is)\b[^?]*\?\s*$|^do you mean\b[^?]*\?\s*$/i.test(t)) return 'drawout';
  return PUMP.test(t) || neutrals.has(normLine(t)) ? 'drawout' : 'substantive';
}
const ANSWER_ACTS = new Set(['answer', 'explain', 'attempt']);
/**
 * One session's process: an episode opens at a learner answer and closes at the first substantive tutor turn (draw-outs
 * between them are counted; the clock runs from the first answer); stated beliefs (the simulated student said a belief)
 * and whether the engine matched them to a wrong model (a card answering that line names one, or is a repair) or the
 * perception saw them identified; the enacted engagement level of each element that left the page.
 * record: the stand-in's run.json; logRows: the simulated student's log (rows marked dropped were never said).
 */
export function processMetrics(record, logRows = []) {
  const ev = [...(record?.events || [])].sort((a, b) => a.at - b.at), cards = ev.filter(e => e.kind === 'server' && e.type === 'card.issued'), students = ev.filter(e => e.kind === 'student');
  const neutrals = new Set(cards.map(e => normLine(e.payload?.card?.neutral)).filter(Boolean));
  const episodes = []; let open = null;
  for (const e of ev) {
    if (e.kind === 'student' && ANSWER_ACTS.has(e.meta?.act) && !open) open = { at: e.at, drawOuts: 0 };
    else if (e.kind === 'plato' && open) { const k = turnKind(e.text, neutrals); if (k === 'drawout') open.drawOuts++; else if (k === 'substantive') {
      // The lead's production-equivalent estimate (beside the headline, never instead of it): each actor call in the episode
      // counted at 1.0 s (ElevenLabs' typical) in place of the stand-in's measured time; engine and card timings as measured,
      // so the move is never earlier than its card plus one call.
      const calls = ev.filter(x => x.kind === 'actor' && x.at > open.at && x.at <= e.at), card = cards.filter(c => c.at <= e.at).at(-1);
      const prodMs = Math.max(e.at - open.at - calls.reduce((s, x) => s + (x.ms ?? 0), 0) + 1000 * calls.length, card && card.at > open.at ? card.at - open.at + 1000 : 0);
      episodes.push({ drawOuts: open.drawOuts, ms: e.at - open.at, prodMs }); open = null; } }
  }
  if (open) episodes.push({ drawOuts: open.drawOuts, ms: null }); // the session ended first
  const stated = logRows.filter(l => !l.dropped && l.content?.act === 'explain' && l.content.belief).map(l => {
    const i = students.findIndex(e => e.text === l.line); if (i < 0) return null;
    const resp = cards.filter(c => c.at > students[i].at && c.at <= (students[i + 1]?.at ?? Infinity)).map(c => c.payload?.card ?? {});
    const seen = logRows.slice(logRows.indexOf(l) + 1).find(x => x.perception)?.perception;
    return { belief: l.content.belief, matched: resp.some(c => c.verdict?.wrongModel || c.move === 'repair'), perceived: !!seen && ((seen.identified || []).includes(l.content.belief) || (seen.refutes || []).some(r => r.bugId === l.content.belief)) };
  }).filter(Boolean);
  const enacted = ev.filter(e => e.kind === 'evidence' && e.event?.type === 'enacted_level').map(e => e.event.level ?? e.event.value).filter(Boolean);
  // False diagnoses (the perception, v6): tutor turns that attribute to the student, or repair, a belief they don't hold.
  const perceived = logRows.filter(l => l.perception), misattributed = perceived.map(l => l.perception.misattributed).filter(Boolean);
  return { episodes, stated, enacted, perceivedTurns: perceived.length, misattributed, verdicts: spokenVerdicts(ev, cards, students, logRows) };
}
// Spoken verdicts (the lead, safety): a Plato line that opens a sentence with a verdict word. Backed when a card answering the
// student's line carries a decisive verdict of that polarity, or the line exactly matches a literal branch ("If exactly") of
// the card that asked. Wrong when the simulator's truth about that line disagrees (a wrong answer validated, a right one rejected).
// Rule 7's hedged forms count too (the lead, 2026-10-09, a measurement correction applied from then on, old runs not recounted):
// "I think that's right"; "I get something different", "that's not what I get".
const POSITIVE = /^(yes|yeah|yep|right|exactly|correct|that'?s (it|right|correct)|that is (it|right|correct)|spot on|i think that'?s right)\b/i, NEGATIVE = /^(no|nope|not quite|not yet|not exactly|incorrect|wrong|that'?s not (it|right|correct)|i get something different|that'?s not what i get)\b(?! (rush|problem|worries|need|pressure|hurry|shame|harm|stress)\b)/i; // idioms, not verdicts (the lead, 2026-10-09: "no pressure…" etc. added after a result)
const VERDICT_SIGN = { correct: 1, valid_nonstandard: 1, incorrect: -1, wrong_model: -1, slip: -1, missing_piece: -1, partial: -1 }, BRANCH_SIGN = { correct: 1, wrong_model: -1, incorrect: -1, partial: -1, slip: -1 };
function spokenVerdicts(ev, cards, students, logRows) {
  const out = [];
  for (const e of ev.filter(x => x.kind === 'plato')) {
    const sentences = String(e.text).replace(/[’‘]/g, "'").split(/(?<=[.!?])\s+/).map(x => x.trim()), first = sentences.find(x => POSITIVE.test(x) || NEGATIVE.test(x));
    if (!first) continue;
    const sign = POSITIVE.test(first) ? 1 : -1, said = students.filter(x => x.at < e.at).at(-1);
    if (!said) { out.push({ text: e.text.slice(0, 160), sign, backed: false, truth: null, wrong: false }); continue; }
    const answered = cards.filter(c => c.at > said.at && c.at <= e.at).map(c => c.payload?.card ?? {}), asking = cards.filter(c => c.at <= said.at).at(-1)?.payload?.card;
    const norm = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9.-]+/g, ' ').trim();
    // A card that repairs, or a matched wrong model (a belief with its error kind), is a negative verdict on the line.
    const signOf = c => VERDICT_SIGN[c.verdict?.value] ?? (c.move === 'repair' || c.verdict?.wrongModel || (c.verdict?.utterance === 'belief' && c.verdict?.errorKind) ? -1 : 0);
    const backed = answered.some(c => signOf(c) === sign) || (asking?.expect || []).some(b => b.literal && norm(b.literal) === norm(said.text) && BRANCH_SIGN[b.kind] === sign);
    const row = logRows.find(l => !l.dropped && l.line === said.text), c = row?.content;
    const truth = !c ? null : ['answer', 'attempt'].includes(c.act) ? (typeof c.isRight === 'boolean' ? c.isRight : null) : c.act === 'explain' ? !c.belief : null;
    // Disputed: the simulator calls it wrong, but a deterministic verdict at trust 1 backed what was said. The perception may have
    // read a stale or different item; listed for the lead's ruling with its transcript, never dropped.
    const wrong = truth !== null && (sign === 1) !== truth, disputed = wrong && answered.some(c => (c.verdict?.trust ?? 0) >= 1 && VERDICT_SIGN[c.verdict?.value] === sign);
    out.push({ text: e.text.slice(0, 160), to: said.text.slice(0, 120), sign, backed, truth, wrong, disputed });
  }
  return out;
}
/** Pooled over sessions: draw-outs per answer (mean, max, share over one), answer → substantive move p50/p95 (ms), stated beliefs matched, enacted levels. */
export function processSummary(ps) {
  const eps = ps.flatMap(p => p?.episodes || []), done = eps.map(e => e.ms).filter(Number.isFinite).sort((a, b) => a - b), q = f => done.length ? done[Math.min(done.length - 1, Math.floor(done.length * f))] : null;
  const prod = eps.map(e => e.prodMs).filter(Number.isFinite).sort((a, b) => a - b), qp = f => prod.length ? prod[Math.min(prod.length - 1, Math.floor(prod.length * f))] : null;
  const st = ps.flatMap(p => p?.stated || []), levels = ps.flatMap(p => p?.enacted || []), share = xs => xs.length ? xs.filter(Boolean).length / xs.length : null;
  return { answers: eps.length, drawOutsMean: eps.length ? eps.reduce((s, e) => s + e.drawOuts, 0) / eps.length : null, drawOutsMax: eps.length ? Math.max(...eps.map(e => e.drawOuts)) : null, overOne: share(eps.map(e => e.drawOuts > 1)),
    answerToMoveP50: q(0.5), answerToMoveP95: q(0.95), answerToMoveProdP50: qp(0.5), answerToMoveProdP95: qp(0.95), neverMoved: share(eps.map(e => e.ms === null)), stated: st.length, statedMatched: share(st.map(s => s.matched)), statedPerceived: share(st.map(s => s.perceived)),
    enacted: levels.reduce((o, l) => ({ ...o, [l]: (o[l] || 0) + 1 }), {}), aboveViewing: share(levels.map(l => l !== 'viewing')),
    verdictsSpoken: ps.reduce((n, p) => n + (p?.verdicts?.length || 0), 0), unbackedVerdicts: ps.flatMap(p => (p?.verdicts || []).filter(v => !v.backed)), wrongVerdicts: ps.flatMap(p => (p?.verdicts || []).filter(v => v.wrong)),
    falseDiagnosisRate: (() => { const n = ps.reduce((t, p) => t + (p?.perceivedTurns || 0), 0); return n ? ps.reduce((t, p) => t + (p?.misattributed?.length || 0), 0) / n : null; })(), sessionsWithFalseDiagnosis: share(ps.filter(p => p?.perceivedTurns).map(p => p.misattributed.length > 0)) };
}
