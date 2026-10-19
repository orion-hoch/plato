// An automated end-to-end run of one development course through the application's journeys (docs/system-spec.md §18b),
// in a sandbox (a copy of data/ on its own port), never against :5188 and never with ElevenLabs. Each step is recorded
// as { id, ok, ms, detail } in runs/<id>/e2e/<fixture>.json, which `run.mjs --checklist` reads:
//   create_course → add_files (several at once) → build_status (the pipeline to published, provisional included) →
//   first_session (the intake, through evals/stand-in.mjs with a simulated student) → learning_session (with what it
//   showed of reading, elements and problem help) → learner_map → restart_resume (the server restarted under a live
//   session, which must resume) → resume_next_day (needs a clock the sandbox can move; recorded as unmeasured).
// The local-actor development mode (stage, spec §18b) replaces the stand-in here once it lands.
// node evals/understanding/e2e.mjs --fixture bio [--files 2] [--turns 6] [--port 5210] [--run id] [--keep]
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { apiAt, freeBytes, startSandbox, stopSandbox, sleep } from '../common.mjs';
import { rm } from 'node:fs/promises';
import { FX, HERE, loadFixture, openApp, readJson, ROOT, sandbox, writeJson } from './lib.mjs';

const argv = process.argv.slice(2), has = f => argv.includes(f), opt = (f, d = null) => has(f) ? argv[argv.indexOf(f) + 1] : d;
const fixture = opt('--fixture', 'bio'), nFiles = Number(opt('--files', '2')), turns = Number(opt('--turns', '6')), port = Number(opt('--port', '5210'));
const runId = opt('--run') || `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-e2e-${fixture}`, OUT = path.join(HERE, 'runs', runId, 'e2e');
const log = (...x) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...x);
await loadFixture(fixture);
Object.assign(process.env, FX.sandboxEnv ?? {}, { LUNA_PUBLISH_WARNING_REVIEWS: 'provisional' }); // sandbox-only (the user's decision)
const steps = [], record = { fixture, runId, startedAt: new Date().toISOString(), steps };
const save = () => writeJson(path.join(OUT, `${fixture}.json`), { ...record, ok: steps.length > 0 && steps.every(s => s.ok || s.unmeasured) });
async function step(id, fn) {
  const t0 = Date.now();
  try { const detail = await fn(); steps.push({ id, ok: true, ms: Date.now() - t0, detail }); log(`✓ ${id} (${Math.round((Date.now() - t0) / 1000)} s)`); return detail; }
  catch (error) { steps.push({ id, ok: false, ms: Date.now() - t0, detail: error.message }); log(`✗ ${id}: ${error.message}`); return null; }
  finally { await save(); }
}

/** The files to upload: a files fixture's own; for an exam fixture, its originals exported from the sandbox. */
async function sourceFiles() {
  const dir = path.join(OUT, 'src'); await mkdir(dir, { recursive: true });
  if (FX.source.dir) {
    const src = path.join(FX.dir, FX.source.dir), names = (await readdir(src)).filter(f => f.endsWith('.md')).sort().slice(0, nFiles);
    return Promise.all(names.map(async n => ({ name: n, bytes: await readFile(path.join(src, n)) })));
  }
  const app = await openApp();
  try {
    const files = app.db.find('source_files', {}, { scope: app.scope }).filter(f => f.status === 'ready').slice(0, nFiles);
    return files.map(f => ({ name: f.filename, bytes: app.blobs.read(app.db.get('source_versions', f.currentSourceVersionId, app.scope).original, app.scope) }));
  } finally { app.close(); }
}

/** A session through the stand-in on a copy of this server's data, with a simulated student (sim/student.mjs). */
async function session(name, base, examId, { intro = false, persona = 'P4', topicId = null, env = {}, turnsHere = turns } = {}) {
  const sim = await import('./sim/core.mjs'), dir = path.join(OUT, name); await mkdir(dir, { recursive: true });
  const lib = await import(path.join(FX.dir, 'beliefs.mjs')), concept = lib.concepts[0];
  const cfg = path.join(dir, 'student-config.json'), out = path.join(dir, 'student.json'), scenario = path.join(dir, `e2e-${fixture}-${name}.json`);
  await writeJson(cfg, { fixture, course: FX.course, persona: sim.personaOf(persona), world: 'N', seed: 1, concepts: [concept.id], out, hold: false, checkBack: true });
  await writeJson(scenario, { title: `e2e ${fixture} ${name}`, examId, persona: persona, lines: [intro ? 'hi' : `hi, can we work on ${concept.title.toLowerCase()}?`] });
  const before = new Set(await readdir(path.join(ROOT, 'evals', 'runs')).catch(() => []));
  const code = await new Promise(resolve => {
    const fd = openSync(path.join(dir, 'stand-in.log'), 'w');
    const child = spawn(process.execPath, ['--no-warnings', 'evals/stand-in.mjs', scenario, '--turns', String(turnsHere), '--no-judge', '--student', path.join(HERE, 'sim', 'student.mjs'), '--data', base.dir, '--port', String(port + 1), ...(intro ? ['--intro'] : []), ...(topicId ? ['--topic', topicId] : [])],
      { cwd: ROOT, env: { ...process.env, ...env, UNDERSTANDING_STUDENT: cfg }, stdio: ['ignore', fd, fd] });
    child.on('exit', resolve);
  });
  const runDir = (await readdir(path.join(ROOT, 'evals', 'runs'))).filter(d => !before.has(d) && d.includes(`e2e-${fixture}-${name}`)).sort().at(-1);
  const run = runDir ? await readJson(path.join(ROOT, 'evals', 'runs', runDir, 'run.json'), null) : null, simOut = await readJson(out, null);
  if (!run) throw Error(`no session record (stand-in exit ${code}; see ${path.relative(ROOT, path.join(dir, 'stand-in.log'))})`);
  if (run.incident) throw Error(`incident: ${run.incident}`);
  const replies = run.events.filter(e => e.kind === 'plato').length;
  if (!replies) throw Error('Plato never spoke');
  return { runDir: path.join('evals', 'runs', runDir), turns: run.turns.length, replies, run, sim: simOut };
}

let sb = null, sbb = null;
try {
  const free = await freeBytes(); if (free < 5 * 2 ** 30) throw Error(`only ${(free / 2 ** 30).toFixed(1)} GB free on the disk: an e2e run needs 5 GB to start`);
  await sandbox(); // the fixture's cached sandbox (a copy of data/, or of the Study pipeline's sandbox)
  sb = await startSandbox({ examId: null, port, source: (await import('./lib.mjs')).sandboxDir() });
  const api = apiAt(sb.base);
  const exam = await step('create_course', async () => { const r = await api('POST', '/v1/exams', { title: `${FX.source.title ?? FX.course} (e2e ${new Date().toISOString().slice(0, 10)})` }); return { examId: r.examId }; });
  const files = await sourceFiles();
  await step('add_files', async () => {
    const { uploads } = await api('POST', `/v1/exams/${exam.examId}/uploads`, { files: files.map(f => ({ filename: f.name, size: f.bytes.length, declaredMime: 'text/markdown' })) });
    for (const [i, u] of uploads.entries()) {
      if (!u.uploadToken) throw Error(`${files[i].name}: ${u.error?.message ?? u.status}`);
      const put = await fetch(`${sb.base}/v1/uploads/${u.uploadToken}`, { method: 'PUT', body: files[i].bytes });
      if (!put.ok) throw Error(`${files[i].name}: upload ${put.status}`);
      await api('POST', `/v1/exams/${exam.examId}/uploads/${u.sourceFileId}/finalize`, { uploadToken: u.uploadToken, checksum: createHash('sha256').update(files[i].bytes).digest('hex'), uploadedByteLength: files[i].bytes.length });
    }
    return { files: files.map(f => f.name) };
  });
  const built = await step('build_status', async () => {
    const seen = [];
    for (const end = Date.now() + 90 * 60_000; Date.now() < end; await sleep(20_000)) {
      const st = await api('GET', `/v1/exams/${exam.examId}/status`), line = `${st.status}${st.pendingBuild ? ' (building)' : ''}: ${(st.files || []).map(f => `${f.filename} ${f.status}`).join(', ')}`;
      if (line !== seen.at(-1)) { seen.push(line); log(`  status: ${line}`); }
      if (st.knowledgeVersion) return { statuses: seen, knowledgeVersion: st.knowledgeVersion, provisional: !!st.provisional };
      if ((st.files || []).length && st.files.every(f => ['failed'].includes(f.status))) throw Error(`every file failed: ${line}`);
    }
    throw Error('not published within 90 minutes');
  });
  if (built) {
    await step('first_session', async () => { const s = await session('first', sb, exam.examId, { intro: true, persona: 'P1' }); return { runDir: s.runDir, turns: s.turns, replies: s.replies }; });
    const learning = await step('learning_session', async () => { const s = await session('learning', sb, exam.examId, { persona: 'P4' }); return { runDir: s.runDir, turns: s.turns, replies: s.replies, perceptions: s.sim?.log ?? [], cards: [...s.run.events.filter(e => e.kind === 'render').map(e => e.what), ...s.run.events.filter(e => e.kind === 'server' && e.type === 'card.issued').map(e => e.payload?.card?.board?.kind === 'element' ? `element:${e.payload.card.board.element?.kind}` : e.payload?.card?.board?.kind ?? (e.payload?.card?.show?.kind ?? null))].filter(Boolean) }; });
    if (learning) {
      const moves = learning.perceptions.flatMap(l => l.perception?.moves ?? []);
      await step('reading', async () => { if (!moves.some(m => m.kind === 'read')) throw Error('no reading move in the learning session'); return { reads: moves.filter(m => m.kind === 'read').length }; });
      await step('elements', async () => { const kinds = learning.cards.filter(k => k && k !== 'markdown'); if (!kinds.length) throw Error('no element on any card'); return { kinds: [...new Set(kinds)] }; });
      await step('problem_help', async () => { const asked = learning.perceptions.filter(l => l.content?.act === 'help'); if (!asked.length) return { note: 'the student never asked for help in this run', unmeasured: true }; const answered = asked.filter((l, i) => learning.perceptions[learning.perceptions.indexOf(l) + 1]?.perception?.moves.some(m => ['hint', 'worked_example', 'explain'].includes(m.kind))); if (!answered.length) throw Error('help asked for, never given'); return { asked: asked.length, answered: answered.length }; });
      learning.perceptions = undefined;
    }
    await step('learner_map', async () => { const p = await api('GET', `/v1/exams/${exam.examId}/progress`); return { topics: (p.topics || []).length, hasMap: !!p.map }; });
    // Resilience: a session live on this server, the server restarted, the session resumed.
    await step('restart_resume', async () => {
      const started = await api('POST', `/v1/exams/${exam.examId}/sessions`, { clientSessionRequestId: `e2e-${Date.now()}` });
      await stopSandbox(sb.server);
      sbb = await startSandbox({ port, reuse: sb.dir });
      const r = await apiAt(sbb.base)('POST', `/v1/sessions/${started.sessionId}/resume`, { clientResumeId: `e2e-resume-${Date.now()}`, lastAcknowledgedServerSequence: 0 });
      if (r.status && !['active', 'listening', 'planning'].includes(r.status) && !r.session) throw Error(`resumed as ${JSON.stringify(r).slice(0, 200)}`);
      return { sessionId: started.sessionId, resumed: Object.keys(r).slice(0, 8) };
    });
    // The next day: the same data, the backend's clock a day later (LUNA_CLOCK_OFFSET_MS, dev-only); a session starts on what is due.
    await step('resume_next_day', async () => {
      await stopSandbox((sbb ?? sb).server);
      sbb = await startSandbox({ port, reuse: sb.dir, env: { LUNA_CLOCK_OFFSET_MS: '86400000' } });
      const next = await apiAt(sbb.base)('POST', `/v1/exams/${exam.examId}/sessions`, { clientSessionRequestId: `e2e-nextday-${Date.now()}` });
      const goal = next.agenda?.goals?.find(g => g.id === next.agenda.currentGoalId);
      if (!next.sessionId || !goal) throw Error(`the next day's session has no goal: ${JSON.stringify(next.agenda ?? next).slice(0, 200)}`);
      return { sessionId: next.sessionId, goal: goal.title, why: goal.why ?? null, card: next.card?.ask ?? next.card?.say ?? null };
    });
    // A failed model call never leaves silence or a broken card (LUNA_FAULTS, dev-only): the director lane fails every call.
    await step('model_failure', async () => {
      const s = await session('faults', sbb ?? sb, exam.examId, { persona: 'P4', env: { LUNA_FAULTS: 'director:fail:1' }, turnsHere: 4 });
      const students = s.run.events.filter(e => e.kind === 'student'), silent = students.filter((e, i) => !s.run.events.some(p => p.kind === 'plato' && p.at > e.at && p.at < (students[i + 1]?.at ?? Infinity)));
      if (silent.length) throw Error(`${silent.length} of ${students.length} student turns got no reply with the director lane failing`);
      return { turns: students.length, replies: s.replies, cards: s.run.events.filter(e => e.kind === 'server' && e.type === 'card.issued').length };
    });
  }
} catch (error) {
  steps.push({ id: 'harness', ok: false, detail: error.message }); await save();
  log(`harness: ${error.message}`);
} finally {
  if (sbb) await stopSandbox(sbb.server); else if (sb) await stopSandbox(sb.server);
  if (sb?.dir && !has('--keep')) await rm(sb.dir, { recursive: true, force: true }).catch(() => {}); // the disk contract: only the sandbox this run created
  record.endedAt = new Date().toISOString(); await save();
  log(`e2e ${fixture}: ${steps.filter(s => s.ok).length} ok, ${steps.filter(s => !s.ok && !s.unmeasured).length} failed, ${steps.filter(s => s.unmeasured).length} unmeasured → ${path.relative(ROOT, path.join(OUT, `${fixture}.json`))}`);
  process.exit(0);
}
