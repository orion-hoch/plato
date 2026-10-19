import { createServer } from 'node:http';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { realpath, stat, writeFile, rename, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from './runtime.mjs';
import { createClaudeRuntime } from './claude-runtime.mjs';
import { createBackend } from '../backend/app.mjs';
import { createClock } from '../backend/core/util.mjs';
import { createLiveProviders } from '../backend/providers/live.mjs';
import { createHttpHandler } from '../backend/http/index.mjs';
import { localActor } from '../backend/session/agent.mjs';
import { claudeActor } from '../backend/session/claude-actor.mjs';
import { PROVIDER, signedIn } from '../backend/agents.mjs';
import { reviewVerdict, verdictNote } from '../backend/session/review.mjs';
import { BUNDLE as CIRCUIT_BUNDLE, circuitsReady } from '../backend/session/circuit.mjs';
import { SKILL as ANATOMY_SKILL } from '../backend/session/anatomy.mjs';
import { ready as manimReady } from '../backend/session/animate.mjs';
import { SHELF_DIR } from '../backend/lessons/kits.mjs';
import { createSecrets } from './secrets.mjs';
import { textOf, addSource, buildCourse, buildDue, buildState, hasGuide, saveNote, notesOf } from '../backend/lessons/build-course.mjs';
import { publishGuide } from '../backend/lessons/guide-manifest.mjs';

// Local server: the v1 backend (docs/implementation-spec.md) with live Codex models and optional
// ElevenLabs voice, plus the web app (Vite in development, dist/ in production).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 5188);
// PLATO_DATA_DIR runs a second, separate server on a copy of the data (evals/live-session.mjs --sandbox).
const dataDir = process.env.PLATO_DATA_DIR ? path.resolve(process.env.PLATO_DATA_DIR) : path.join(root, 'data');
const figureDir = path.join(dataDir, 'figures'); // Plato's anatomy figures (backend/session/anatomy.mjs), each a page of its own
const animationDir = path.join(dataDir, 'animations'); // Plato's Manim clips (backend/session/animate.mjs), <id>.mp4 and <id>.json

// Dev only: PLATO_CLOCK_OFFSET_MS shifts the backend's clock (e.g. 86400000 to test "coming back the next day" in a sandbox).
const clockOffset = Number(process.env.PLATO_CLOCK_OFFSET_MS || 0);
const baseClock = createClock();
const clock = clockOffset ? { ...baseClock, now: () => baseClock.now() + clockOffset, iso: () => new Date(baseClock.now() + clockOffset).toISOString() } : baseClock;
// The reply path's lanes run on a Codex process of their own: with one process for every lane, live turns waited behind the
// course model's builds inside it (11 Oct: think took 75 s while four topics were being studied).
const LIVE_LANES = new Set(['director', 'reply', 'replyLight', 'elements', 'voice']);
// The student's provider (PLATO_PROVIDER, backend/agents.mjs) runs every lane: Claude (server/claude-runtime.mjs) or ChatGPT (Codex).
const makeRuntime = PROVIDER === 'claude' ? createClaudeRuntime : createRuntime;
const liveRuntime = makeRuntime({ env: process.env }), backgroundRuntime = makeRuntime({ env: process.env });
const runtime = {
  roles: liveRuntime.roles,
  ready: () => Promise.all([liveRuntime.ready(), backgroundRuntime.ready()]),
  ask: options => (LIVE_LANES.has(options.role) ? liveRuntime : backgroundRuntime).ask(options),
  close: () => Promise.all([liveRuntime.close(), backgroundRuntime.close()]),
};
const app = createBackend({
  dbFile: path.join(dataDir, 'backend.db'),
  blobDir: path.join(dataDir, 'blobs'),
  clock,
  providers: createLiveProviders({ runtime, clock }),
  // New courses publish their topics from their files and study guide (the harness); PLATO_KNOWLEDGE=build: the older knowledge build.
  config: { sessionTickMs: 250, studyDir: path.join(dataDir, 'study-guides'), checkpointDir: path.join(dataDir, 'checkpoints'), figureDir, animationDir, knowledgeSource: process.env.PLATO_KNOWLEDGE === 'build' ? null : 'guide' }, // the agenda's held notes; each exam's study guide (backend/lessons/study.mjs); anatomy figures
});
const api = createHttpHandler(app, { localPrincipalFile: path.join(dataDir, 'local-principal.json') });
app.jobs.releaseOrphanedLeases();
app.start({ workers: Number(process.env.PLATO_WORKERS || 16) }); // 2 for the reply path, up to 12 for long builds, the rest for short background work
// Courses published before the course model went live are studied now (kick skips any that are built or building).
for (const exam of app.db.find('exams').filter(e => !['deleted', 'deleting'].includes(e.status) && e.publishedKnowledgeManifestId)) {
  try { app.services.understanding.kick({ tenantId: exam.scope.tenantId, learnerId: exam.scope.learnerId, examId: exam.id }); }
  catch (error) { console.error(`Course model for ${exam.title}: ${error.message}`); }
}
runtime.ready().catch(error => console.error(`${PROVIDER === 'codex' ? 'Codex' : 'Claude'} CLI unavailable: ${error.message}. Run \`npm run setup\`.`));

// The harness (15 Oct, the user: "an available harness that allows for users to input material and study"): every file
// uploaded to a course becomes a source Plato can look up and read, and a course with material and no study guide gets one
// built by Claude agents (backend/lessons/build-course.mjs), one course at a time, two minutes after its last upload.
// SETTLE_MS: a batch of files dropped together arrives within seconds (19 Oct: 30 s was a third of a new file's time to the guide).
const SETTLE_MS = 10_000;
let courseBuilding = null;
async function harnessTick() {
  for (const exam of app.db.find('exams').filter(e => e.knowledgeSource === 'guide' && !['deleted', 'deleting'].includes(e.status))) {
    const dir = path.join(dataDir, 'study-guides', exam.id), seenFile = path.join(dir, 'sources', '.seen.json');
    const files = app.db.find('source_files', {}, { scope: exam.scope }).filter(f => f.currentSourceVersionId && !['deleted', 'failed'].includes(f.status));
    // A guide written before the harness ran it (by hand, CS 2800): what is in sources/ before this tick's new files is what it was written from, so
    // material added later goes into it (the update agent) like a harness course's.
    if (!buildState(dir) && hasGuide(dir)) { let names = []; try { names = readdirSync(path.join(dir, 'sources')).filter(f => f.endsWith('.md')).sort(); } catch { /* none */ } writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ state: 'done', sources: names, baseline: true, at: new Date().toISOString() }, null, 2)); }
    let seen = {}; try { seen = JSON.parse(readFileSync(seenFile, 'utf8')); } catch { /* none yet */ }
    for (const f of files.filter(f => seen[f.id] !== f.currentSourceVersionId)) {
      try {
        const version = app.db.get('source_versions', f.currentSourceVersionId, exam.scope), bytes = app.blobs.read(version.original, exam.scope);
        const text = await textOf(f.filename, bytes);
        if (text?.trim()) addSource(dir, f.filename, text);
        if (/\.pdf$/i.test(f.filename)) { mkdirSync(path.join(dir, 'originals'), { recursive: true }); writeFileSync(path.join(dir, 'originals', path.basename(f.filename)), bytes); } // basename: a name like ../x can't write outside the course (19 Oct audit) // its pages as images, for what text loses (build-course.mjs ORIGINALS)
        seen[f.id] = f.currentSourceVersionId;
        mkdirSync(path.dirname(seenFile), { recursive: true }); writeFileSync(seenFile, JSON.stringify(seen));
      } catch (error) { console.warn(`Harness: couldn't read ${f.filename}: ${String(error?.message || error).slice(0, 200)}`); }
    }
    // A guide-backed course opens on its files at once, then on its plan's units, then their topics as each is written.
    if (exam.knowledgeSource === 'guide') { try { publishGuide(app, exam.scope, dir); } catch (error) { console.error(`Harness: ${exam.title}: couldn't publish its topics: ${error.message}`); } }
    const newest = Math.max(0, ...files.map(f => Date.parse(f.updatedAt || f.createdAt) || 0));
    if (courseBuilding || !files.length || !buildDue(dir) || Date.now() - newest < SETTLE_MS) continue;
    const noted = Object.values(notesOf(dir)).filter(n => n.note || n.model).map(n => `${n.file}${n.model ? ' (closest to their exam)' : ''}${n.note ? `: "${n.note}"` : ''}`);
    const about = [`Course: ${exam.title}.`, exam.examDate && `Exam date: ${exam.examDate}.`, exam.instructions, ...(exam.goals || []), noted.length && `What they said about their files: ${noted.join('; ')}.`].filter(Boolean).join(' ');
    console.log(`Harness: building the study guide for ${exam.title}.`);
    courseBuilding = buildCourse(dir, { about, kits: { figureDir, baseUrl: `http://127.0.0.1:${port}` }, onStage: st => console.log(`Harness: ${exam.title}: ${st.state}${st.done ? ` (${st.done.length} of ${st.units.length} units)` : ''}`) })
      .then(r => console.log(`Harness: ${exam.title}: ${r.topics} topics in ${r.units} units${r.failed.length ? `; failed: ${r.failed.map(x => x.unit).join(', ')}` : ''}.`))
      .catch(error => { console.error(`Harness: ${exam.title}: ${error.message}`); try { writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(dir, 'build.json'), 'utf8')), state: error.limit ? 'paused' : 'failed', error: String(error.message).slice(0, 500), at: new Date().toISOString() })); } catch { /* gone */ } })
      .finally(() => { courseBuilding = null; });
  }
}
// One tick at a time (an upload's wake-up can land on the minute's tick: both would read the same new files); one asked for
// meanwhile runs after it.
let ticking = null, again = false;
const tick = () => { if (ticking) { again = true; return; } ticking = harnessTick().catch(error => console.error(`Harness: ${error.message}`)).finally(() => { ticking = null; if (again) { again = false; tick(); } }); };
setInterval(tick, 60_000).unref();
// A finished upload wakes it: the file goes into sources at once, and the guide takes it in once the batch has settled.
let soon = 0, settled = 0;
app.events.listen(event => { if (event.eventType !== 'source.finalized') return; clearTimeout(soon); clearTimeout(settled); soon = setTimeout(tick, 3000); settled = setTimeout(tick, SETTLE_MS + 2000); });

// Voice: a short-lived ElevenLabs credential for the private Plato Tutor agent: a WebRTC conversation token, or, for a
// conversation in text (no microphone), a signed WebSocket URL, since ElevenLabs closes a text-only WebRTC room about
// 10 s in. The API key never reaches the browser. Accepts only an empty JSON body from this page, or {"textOnly":true}.
async function voiceToken(req, res) {
  if (new URL(req.url, 'http://localhost').pathname !== '/api/session') return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { send(405, { code: 'method_not_allowed', error: 'Use POST.' }); return true; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { code: 'invalid_origin', error: 'Session requests must come from this page.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 4096) { send(413, { code: 'request_too_large' }); return true; } parts.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { send(400, { code: 'invalid_json' }); return true; }
  const text = body?.textOnly === true;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== (text ? 1 : 0)) { send(400, { code: 'invalid_session_request', error: 'Send an empty JSON object, or {"textOnly":true}.' }); return true; }
  const key = process.env.ELEVENLABS_API_KEY?.trim(), agent = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (!key || !/^[A-Za-z0-9_-]{1,256}$/.test(agent || '')) { send(503, { code: 'not_configured', error: 'Set ELEVENLABS_API_KEY and run node scripts/setup-tutor-agent.mjs.' }); return true; }
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/${text ? 'get-signed-url' : 'token'}?${new URLSearchParams({ agent_id: agent })}`, { headers: { 'xi-api-key': key, Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) { send(upstream.status === 429 ? 429 : upstream.status === 401 || upstream.status === 403 ? 503 : 502, { code: upstream.status === 429 ? 'rate_limited' : payload?.detail?.status === 'quota_exceeded' ? 'quota_exceeded' : 'provider_unavailable' }); return true; }
    const credential = text ? payload?.signed_url : payload?.token;
    if (typeof credential !== 'string' || !credential.trim() || /\s/.test(credential) || (text && !credential.startsWith('wss://'))) { send(502, { code: 'invalid_provider_response' }); return true; }
    send(201, text ? { signedUrl: credential } : { conversationToken: credential });
  } catch { send(504, { code: 'provider_timeout' }); }
  return true;
}

// Voice in the text chat, with the student's own ElevenLabs API key, pasted into Plato's voice settings and kept by the system
// (server/secrets.mjs: the macOS Keychain) or ELEVENLABS_API_KEY in .env; without one, no voice buttons: his replies read aloud
// (POST /voice/tts { text } → audio/mpeg) and what they say heard (POST /voice/stt, a WAV body → { text }). The key never
// reaches the browser.
const secrets = createSecrets(dataDir), ELEVEN = 'https://api.elevenlabs.io/v1';
const elevenKey = async () => (await secrets.get('elevenlabs-api-key')) || process.env.ELEVENLABS_API_KEY?.trim() || '';
// GET /settings/voice → { set, hint, where }; POST { key } checks it with ElevenLabs and keeps it; DELETE forgets it.
async function voiceSettings(req, res) {
  if (new URL(req.url, 'http://localhost').pathname !== '/settings/voice') return false;
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(403, { error: 'Only from this page.' }); return true; }
  if (!signedInPage(req)) { json(401, { error: 'Sign in first.' }); return true; }
  const stored = await secrets.get('elevenlabs-api-key'), key = stored || process.env.ELEVENLABS_API_KEY?.trim() || '';
  if (req.method === 'GET') { json(200, { set: Boolean(key), hint: key ? `…${key.slice(-4)}` : '', where: stored ? secrets.where : key ? '.env' : secrets.where }); return true; }
  if (req.method === 'DELETE') { await secrets.remove('elevenlabs-api-key'); setupSeen = null; json(200, { set: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) }); return true; }
  if (req.method !== 'POST') { json(405, { error: 'Use GET, POST or DELETE.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 4096) { json(413, { error: 'Too long.' }); return true; } parts.push(part); }
  let pasted = ''; try { pasted = String(JSON.parse(Buffer.concat(parts).toString('utf8')).key || '').trim(); } catch { /* none */ }
  if (!/^[\w-]{20,200}$/.test(pasted)) { json(400, { error: 'That doesn’t look like an ElevenLabs API key.' }); return true; }
  // A key ElevenLabs says is invalid is refused; one restricted from this check (a scoped key) is kept.
  const check = await fetch(`${ELEVEN}/user`, { headers: { 'xi-api-key': pasted }, signal: AbortSignal.timeout(15_000) }).then(async r => ({ status: r.status, text: await r.text() }), () => null);
  if (check?.status === 401 && /invalid_api_key|invalid api key/i.test(check.text)) { json(400, { error: 'ElevenLabs didn’t accept that key.' }); return true; }
  try { await secrets.set('elevenlabs-api-key', pasted); } catch (error) { json(500, { error: `Couldn’t keep it: ${error.message}` }); return true; }
  setupSeen = null;
  json(200, { set: true, hint: `…${pasted.slice(-4)}`, where: secrets.where });
  return true;
}
async function voiceRoute(req, res) {
  const route = new URL(req.url, 'http://localhost').pathname;
  if (route !== '/voice/tts' && route !== '/voice/stt') return false;
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { json(405, { error: 'Use POST.' }); return true; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(403, { error: 'Only from this page.' }); return true; }
  if (!signedInPage(req)) { json(401, { error: 'Sign in first.' }); return true; }
  const apiKey = await elevenKey();
  if (!apiKey) { json(503, { error: 'Voice needs your ElevenLabs API key: add it in Plato’s voice settings.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 20_000_000) { json(413, { error: 'Too long.' }); return true; } parts.push(part); }
  const body = Buffer.concat(parts), headers = { 'xi-api-key': apiKey };
  try {
    if (route === '/voice/tts') {
      let text = ''; try { text = String(JSON.parse(body.toString('utf8') || '{}').text || '').slice(0, 5000); } catch { /* none */ }
      if (!text.trim()) { json(400, { error: 'No text.' }); return true; }
      const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || 'JBFqnCBsd6RMkjVDRZzb';
      const r = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: process.env.PLATO_TTS_MODEL?.trim() || 'eleven_v4_turbo' }), signal: AbortSignal.timeout(30_000) });
      if (!r.ok) { json(r.status === 401 ? 503 : 502, { error: `ElevenLabs couldn't speak that (${r.status}).` }); return true; }
      const audio = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'no-store' }); res.end(audio);
    } else {
      const form = new FormData();
      form.append('model_id', process.env.PLATO_STT_MODEL?.trim() || 'scribe_v1');
      form.append('file', new Blob([body], { type: 'audio/wav' }), 'speech.wav');
      const r = await fetch(`${ELEVEN}/speech-to-text`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(60_000) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { json(r.status === 401 ? 503 : 502, { error: `ElevenLabs couldn't hear that (${r.status}).` }); return true; }
      json(200, { text: String(out.text || '').trim() });
    }
  } catch { json(504, { error: 'ElevenLabs didn’t answer in time.' }); }
  return true;
}
// The course's part of Plato's brief, with where its study guide's build stands while one is being written (the harness).
function briefOf(dir) {
  let brief = ''; try { brief = readFileSync(path.join(dir, 'brief.md'), 'utf8'); } catch { /* none yet */ }
  let st = null; try { st = JSON.parse(readFileSync(path.join(dir, 'build.json'), 'utf8')); } catch { /* not building */ }
  const writing = st && ['planning', 'writing'].includes(st.state);
  return writing ? `${brief}\n\nTheir study guide is still being written from their material (${st.state === 'planning' ? 'planning its units' : `${st.done?.length || 0} of ${st.units?.length || '?'} units ready`}); until a topic arrives as context, teach from their material itself with look_up and read.`.trim() : brief;
}
// A colleague's check of Plato's verdict on their work (backend/session/review.mjs): the page asks after a reply that judges
// what they wrote, and a real misjudgment comes back as a quiet note for his next turn. PLATO_REVIEW=0 turns it off.
async function checkRoute(req, res) {
  if (new URL(req.url, 'http://localhost').pathname !== '/check') return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { send(405, { error: 'Use POST.' }); return true; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: 'Only from this page.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 64_000) { send(413, { error: 'Too large.' }); return true; } parts.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { send(400, { error: 'Invalid JSON.' }); return true; }
  if (!signedInPage(req)) { send(401, { error: 'Sign in first.' }); return true; }
  if (process.env.PLATO_REVIEW === '0') { send(200, { note: null }); return true; }
  const errors = await reviewVerdict({ exchange: String(body.exchange || '').slice(-12_000), course: String(body.course || '').slice(0, 8000) });
  send(200, { note: errors ? verdictNote(errors) : null });
  return true;
}
// The course is the signed-in learner's own (the Bearer token the API takes; 19 Oct audit: these routes had no login).
function ownCourse(req, examId) { try { app.auth.requireExam(app.auth.authenticate(req.headers.authorization), examId); return true; } catch { return false; } }
function signedInPage(req) { try { return !!app.auth.authenticate(req.headers.authorization); } catch { return false; } }
// What the student says a file they add is ("What is this?" in src/Material.jsx): { filename, note, model } for
// <study dir>/<examId>/notes.json, which goes at the top of Plato's brief at once and steers the harness (build-course.mjs saveNote).
async function materialNote(req, res) {
  const m = new URL(req.url, 'http://localhost').pathname.match(/^\/material-note\/(exam_[\w-]{6,40})$/);
  if (!m) return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { send(405, { error: 'Use POST.' }); return true; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: 'Only from this page.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 16_000) { send(413, { error: 'Too large.' }); return true; } parts.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { send(400, { error: 'Invalid JSON.' }); return true; }
  if (!ownCourse(req, m[1]) || !String(body?.filename || '').trim()) { send(404, { error: 'No such course or file.' }); return true; }
  saveNote(path.join(dataDir, 'study-guides', m[1]), String(body.filename).slice(0, 300), body.note, body.model);
  send(200, { saved: true });
  return true;
}
// Checkpoints (src/checkpoint.js): where the student is in each course (Plato's page, the conversation, what Plato remembers,
// their writing and drafts), saved by the page as it changes so a reload, a restart or a lost session brings it all back
// (19 Oct, the user: "really have a good checkpoint system in place"). <data>/checkpoints/<examId>.json, written whole
// (a temp file renamed over it) with the one before kept as .prev.
const checkpointDir = app.config.checkpointDir;
async function checkpoint(req, res) {
  const m = new URL(req.url, 'http://localhost').pathname.match(/^\/checkpoint\/(exam_[\w-]{6,40})$/);
  if (!m) return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: 'Only from this page.' }); return true; }
  if (!ownCourse(req, m[1])) { send(404, { error: 'No such course.' }); return true; }
  const file = path.join(checkpointDir, `${m[1]}.json`);
  if (req.method === 'GET') { try { send(200, await readFile(file, 'utf8')); } catch { send(200, 'null'); } return true; }
  if (req.method !== 'POST') { send(405, { error: 'Use GET or POST.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 8_000_000) { send(413, { error: 'Too large.' }); return true; } parts.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { send(400, { error: 'Invalid JSON.' }); return true; }
  if (!body || typeof body !== 'object' || !Number.isFinite(body.savedAt)) { send(400, { error: 'Not a checkpoint.' }); return true; }
  // An older copy never overwrites a newer one (two tabs, a late beacon).
  try { const was = JSON.parse(await readFile(file, 'utf8')); if (was?.savedAt > body.savedAt) { send(200, { kept: 'newer' }); return true; } } catch { /* the first */ }
  mkdirSync(checkpointDir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(body));
  await copyFile(file, `${file}.prev`).catch(() => {});
  await rename(tmp, file);
  send(200, { saved: body.savedAt });
  return true;
}
// Plato's turn (src/local-actor.js): POST /actor { course, face, context, dialogue } → { say, tools }; ?stream=1 streams it.
async function actorRoute(req, res) {
  if (new URL(req.url, 'http://localhost').pathname !== '/actor') return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { send(405, { error: 'Use POST.' }); return true; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: 'Only from this page.' }); return true; }
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 512_000) { send(413, { error: 'Too large.' }); return true; } parts.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { send(400, { error: 'Invalid JSON.' }); return true; }
  const lines = list => (Array.isArray(list) ? list : []).map(x => String(x).slice(0, 8000)).slice(-200);
  // The course's part of Plato's brief: <study dir>/<examId>/brief.md, for the course open on the page.
  const course = /^exam_[\w-]{6,40}$/.test(String(body.course || '')) ? body.course : null;
  if (course ? !ownCourse(req, course) : !signedInPage(req)) { send(401, { error: 'Sign in first.' }); return true; }
  const f = body.face && typeof body.face === 'object' ? body.face : null, cut = (x, n) => x ? String(x).slice(0, n) : null;
  const turn = { face: f && { face: cut(f.face, 20), topic: cut(f.topic, 200), note: cut(f.note, 600), by: cut(f.by, 10) }, context: lines(body.context), dialogue: lines(body.dialogue), brief: course ? briefOf(path.join(dataDir, 'study-guides', course)) : '' };
  // ?stream=1: newline-delimited JSON, the message as it is written ({ t: 'text', d }) then { t: 'done', say, tools }.
  // The student's provider (claudeActor), falling back to the light lane's actor (localActor) if it fails before writing.
  if (new URL(req.url, 'http://localhost').searchParams.get('stream') === '1') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
    const out = obj => res.write(`${JSON.stringify(obj)}\n`);
    let wrote = false;
    try {
      const r = await claudeActor(turn, { onText: d => { wrote = true; out({ t: 'text', d }); }, onThink: d => out({ t: 'think', d }) });
      out({ t: 'done', ...r });
    } catch (error) {
      console.warn(`Plato (${PROVIDER}): ${String(error?.message || error).slice(0, 200)}; the light model answers.`);
      if (error.limit) out({ t: 'error', error: `Your ${PROVIDER === 'codex' ? 'ChatGPT' : 'Claude'} plan's usage limit is reached. Plato can go on when it resets.` });
      else if (wrote) out({ t: 'done', say: '', tools: [] }); // part of a message is already shown: the turn ends there
      else {
        try { const r = await localActor(runtime, turn); if (r.say) out({ t: 'text', d: r.say }); out({ t: 'done', ...r }); }
        catch (e) { out({ t: 'error', error: String(e?.message || e).slice(0, 300) }); }
      }
    }
    res.end();
    return true;
  }
  try { send(200, await localActor(runtime, turn)); }
  catch (error) { send(502, { error: String(error?.message || error).slice(0, 300) }); }
  return true;
}

// What this install can do (the first-run screen, src/Setup.jsx): the provider and whether its CLI is signed in, and which
// optional extras `npm run setup` put in place. Checked once a minute at most.
let setupSeen = null;
async function setupRoute(req, res) {
  if (req.method !== 'GET' || new URL(req.url, 'http://localhost').pathname !== '/setup') return false;
  if (!setupSeen || Date.now() - setupSeen.at > 60_000) {
    const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', process.env.CHROME_PATH].some(p => p && existsSync(p));
    setupSeen = { at: Date.now(), body: { provider: PROVIDER, ...(await signedIn()), extras: { circuits: circuitsReady(), figures: existsSync(path.join(ANATOMY_SKILL, 'SKILL.md')), voice: Boolean(await elevenKey()), kits: existsSync(path.join(SHELF_DIR, 'd3.js')), chrome, animations: manimReady() } } };
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(setupSeen.body));
  return true;
}

// An anatomy figure's page, framed on Plato's page (src/BoardStage.jsx): sandboxed wherever it is opened (its scripts run, with
// nothing of this app's origin).
async function figurePage(req, res) {
  const id = /^\/figures\/([\w-]{1,80})\.html$/.exec(new URL(req.url, 'http://localhost').pathname)?.[1];
  if (!id || req.method !== 'GET') return false;
  const file = path.join(figureDir, `${id}.html`);
  try {
    const info = await stat(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'Content-Security-Policy': 'sandbox allow-scripts', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
  return true;
}

// A Manim clip (backend/session/animate.mjs), played on Plato's page. Byte ranges, since Safari plays a <video> only from a
// server that answers them.
async function animationClip(req, res) {
  const id = /^\/animations\/(anim-[0-9a-f]{12})\.mp4$/.exec(new URL(req.url, 'http://localhost').pathname)?.[1];
  if (!id || req.method !== 'GET') return false;
  const file = path.join(animationDir, `${id}.mp4`);
  try {
    const { size } = await stat(file), r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const start = r ? (r[1] ? +r[1] : Math.max(0, size - +r[2])) : 0, end = r && r[1] && r[2] ? Math.min(+r[2], size - 1) : size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true; }
    res.writeHead(r ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(r ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}), 'Cache-Control': 'max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(file, { start, end }).pipe(res);
  } catch { res.writeHead(404); res.end(); }
  return true;
}

// The logic simulator's bundle, for the circuits' pages (backend/session/circuit.mjs).
// The shelf (tools/shelf): the browser libraries course kits draw with (backend/lessons/kits.mjs), by file name only.
async function shelfFile(req, res) {
  const name = /^\/shelf\/([\w.-]{1,60}\.(?:js|css))$/.exec(new URL(req.url, 'http://localhost').pathname)?.[1];
  if (!name || req.method !== 'GET') return false;
  try {
    const file = path.join(SHELF_DIR, name), info = await stat(file);
    res.writeHead(200, { 'Content-Type': `${name.endsWith('.css') ? 'text/css' : 'text/javascript'}; charset=utf-8`, 'Content-Length': info.size, 'Cache-Control': 'max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
  return true;
}
async function logicSim(req, res) {
  if (req.method !== 'GET' || new URL(req.url, 'http://localhost').pathname !== '/logic-sim.js') return false;
  try {
    const info = await stat(CIRCUIT_BUNDLE);
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': info.size, 'Cache-Control': 'max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(CIRCUIT_BUNDLE).pipe(res);
  } catch { res.writeHead(404); res.end(); }
  return true;
}

// Headers every page and file gets in production: no sniffing, no referrer, never framed.
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
let vite, dist;

async function serveProduction(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
  let target = path.resolve(dist, `.${pathname}`);
  if (!target.startsWith(`${dist}${path.sep}`) && target !== dist) { res.writeHead(404); res.end(); return; }
  try {
    let info;
    try { info = await stat(target); } catch { /* fall through to the SPA */ }
    if (!info?.isFile()) { if (path.extname(pathname)) { res.writeHead(404); res.end(); return; } target = path.join(dist, 'index.html'); info = await stat(target); }
    // Vite fingerprints everything under /assets/, so those never change; the page itself is always checked.
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': cache });
    createReadStream(await realpath(target)).pipe(res);
  } catch { res.writeHead(404); res.end(); }
}

const server = createServer(async (req, res) => {
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403); res.end('Use the local Plato app address.'); return; }
  try {
    if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('ok'); return; }
    if (await api(req, res)) return;
    if (await voiceToken(req, res)) return;
    if (await checkpoint(req, res) || await materialNote(req, res)) return;
    if (await actorRoute(req, res) || await checkRoute(req, res) || await setupRoute(req, res)) return;
    if (await voiceRoute(req, res) || await voiceSettings(req, res)) return;
    if (await figurePage(req, res) || await animationClip(req, res) || await logicSim(req, res) || await shelfFile(req, res)) return;
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.split(/[\\/]/).includes('data')) { res.writeHead(404); res.end(); return; }
    if (production) await serveProduction(req, res); else vite.middlewares(req, res);
  } catch (error) {
    console.error(`${req.method} ${req.url}: ${error?.stack || error}`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.headersTimeout = 10_000;

if (production) {
  try { dist = await realpath(path.join(root, 'dist')); }
  catch { console.error('No build to serve. Run `npm run build` first.'); process.exit(1); }
}
else {
  const { createServer: createViteServer } = await import('vite');
  // The data isn't the app's source: unwatched (a new anatomy figure, an .html in data/figures, made Vite reload the page).
  vite = await createViteServer({ root, server: { middlewareMode: true, ws: { server }, allowedHosts: ['localhost', '127.0.0.1'], watch: { ignored: [`${dataDir}/**`] } }, appType: 'spa' });
}
server.listen(port, '127.0.0.1', () => console.log(`Plato is ready at http://127.0.0.1:${port} (on ${PROVIDER === 'codex' ? 'ChatGPT' : 'Claude'})`));

// A stray rejection in background work is logged, not fatal: jobs are durable and their leases are retried.
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));

async function shutdown() {
  // Give in-flight work a few seconds, then go regardless.
  setTimeout(() => process.exit(1), 5_000).unref();
  app.stop();
  await runtime.close();
  server.closeAllConnections(); server.close();
  if (vite) await vite.close();
  app.close();
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
