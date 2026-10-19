// A live session run: the real page in headless Chrome, the real backend and the live ElevenLabs agent. By default
// (--sandbox) the backend is a second server on a snapshot of data/, so a run never writes the real learner's data;
// --live runs against the dev server at 127.0.0.1:5188. A student types each turn (scripted lines, or a student
// simulated from a persona through the Codex runtime); the page answers Plato's tool calls with its own code. The run
// records Plato's replies, his tool calls, the boards shown, the agendas and every context line he was sent, writes
// evals/runs/<stamp>-<scenario>/ (transcript.md, run.json, checks.json) and prints the checks. See evals/README.md.
// node evals/live-session.mjs <scenario> [--turns N] [--simulate] [--intro] [--live] [--no-judge] [--no-mic]
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../server/runtime.mjs';
import { SANDBOX_PORT, apiAt, checks, courseFacts, judge, loadScenario, sleep, startSandbox, stopSandbox, studentLine, timeline, writeRun } from './common.mjs';

const live = process.argv.includes('--live');
const BASE = live ? process.env.PLATO_URL || 'http://127.0.0.1:5188' : `http://127.0.0.1:${SANDBOX_PORT}`;
// At most 12 student turns in about 5 minutes. A turn ends once Plato has replied, no tool call is open and nothing has
// happened for QUIET_MS; TURN_MS is its hard limit.
const MAX_TURNS = 12, RUN_MS = 5 * 60_000, TURN_MS = 60_000, QUIET_MS = 2500, TYPE_DELAY_MS = 20, SPEECH_CPS = 12;

const argv = process.argv.slice(2), has = flag => argv.includes(flag);
const name = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--turns');
if (!name) { console.error('usage: node evals/live-session.mjs <scenario> [--turns N] [--simulate] [--intro] [--live] [--no-judge] [--no-mic]'); process.exit(2); }
const scenario = await loadScenario(name);
const simulate = has('--simulate'), noMic = has('--no-mic'), intro = has('--intro');
if (intro && live) { console.error('--intro resets the intro in the sandbox copy only; it cannot be used with --live.'); process.exit(2); }
// Every run here opens a real ElevenLabs conversation, which spends the user's ElevenLabs credits: never by default.
if (!has('--use-elevenlabs')) { console.error('This harness talks to the live ElevenLabs agent and spends ElevenLabs credits. The user asked that testing not call ElevenLabs: pass --use-elevenlabs only with their explicit go-ahead.'); process.exit(2); }
// --simulate: the scenario's first line opens, then the simulated student writes every turn. Otherwise its lines, in order.
const turnsWanted = Math.min(MAX_TURNS, (has('--turns') && Number(argv[argv.indexOf('--turns') + 1])) || (simulate ? MAX_TURNS : scenario.lines.length));

// Runs inside the page before its own code (read only: every hook passes values through unchanged).
function pageHooks() {
  const log = window.__evals = [], rec = (kind, data) => log.push({ at: Date.now(), kind, ...data });
  const copy = value => { try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return String(value); } };
  // What Plato is sent and what he says, as the ElevenLabs SDK encodes and decodes its messages.
  const SENT = new Set(['contextual_update', 'user_message', 'client_tool_result']);
  const encode = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (s) {
    if (typeof s === 'string' && s.startsWith('{"type":"')) try { const m = JSON.parse(s); if (SENT.has(m.type)) rec('sent', { type: m.type, text: String(m.text ?? m.result ?? '') }); } catch { /* not ours */ }
    return encode.apply(this, arguments);
  };
  const decode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function () {
    const s = decode.apply(this, arguments);
    if (typeof s === 'string' && s[0] === '{' && s.includes('"type"')) try {
      const m = JSON.parse(s);
      if (m.type === 'agent_response') rec('plato', { text: String(m.agent_response_event?.agent_response ?? '') });
      else if (m.type === 'agent_response_correction') rec('plato-corrected', { text: String(m.agent_response_correction_event?.corrected_agent_response ?? '') });
      else if (m.type === 'conversation_initiation_metadata') rec('connected', { conversationId: m.conversation_initiation_metadata_event?.conversation_id });
      else if (m.type === 'client_tool_call') rec('tool-asked', { name: m.client_tool_call?.tool_name });
    } catch { /* not ours */ }
    return s;
  };
  // The dev handle (window.__plato): its tools are the very object the conversation calls, so wrapping them records
  // every call and result; the bridge's agendas, server events and context lines are recorded the same way.
  let plato, calls = 0;
  Object.defineProperty(window, '__plato', { configurable: true, get: () => plato, set: value => { plato = value; try { wrap(value); } catch (error) { rec('hook-error', { text: String(error) }); } } });
  function wrap({ tools = {}, bridge } = {}) {
    for (const [name, fn] of Object.entries(tools)) if (typeof fn === 'function') tools[name] = function (params) {
      const id = ++calls, done = (result, error) => rec('tool-done', { id, name, result: copy(result), ...(error ? { error: String(error?.message || error) } : {}) });
      rec('tool', { id, name, params: copy(params) });
      try { const out = fn.apply(this, arguments); if (typeof out?.then === 'function') out.then(r => done(r), e => done(null, e)); else done(out); return out; }
      catch (error) { done(null, error); throw error; }
    };
    if (!bridge) return;
    for (const key of ['onContext', 'onNews']) { const f = bridge[key]; if (typeof f === 'function') bridge[key] = function (text) { rec('bridge-context', { via: key, text: String(text) }); return f.apply(this, arguments); }; }
    const { setAgenda, receive } = bridge;
    bridge.setAgenda = function (agenda) { rec('agenda', { agenda: copy(agenda) }); return setAgenda.apply(this, arguments); };
    bridge.receive = function (event) { rec('server', { type: event?.type, payload: copy(event?.payload) }); return receive.apply(this, arguments); };
  }
  // The board as shown (its titles and text), and the line at the foot of the conversation (a problem Plato can't say).
  // Whether Plato is speaking, from the mosaic's label (a voice reply takes as long as it takes to say).
  let board = '', status = '', mode = '';
  setInterval(() => {
    const now = document.querySelector('.orb-button')?.getAttribute('aria-label') || '';
    if (now !== mode) { mode = now; rec('mode', { text: now }); }
    const page = document.querySelector('section.page');
    const titles = page ? [...page.querySelectorAll('.page-label')].map(e => e.textContent.trim()).filter(Boolean) : [];
    const text = page ? page.innerText.replace(/^×\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 1500) : '';
    if (`${titles}#${text}` !== board) { board = `${titles}#${text}`; rec('board', { titles, text }); }
    const said = document.querySelector('.log-error')?.textContent || '';
    if (said !== status) { status = said; rec('status', { text: said }); }
  }, 400);
}

const events = [], problems = [], api = apiAt(BASE);
let cursor = 0, page, browser, runtime, incident = null, started = false;
async function pull() {
  const fresh = await page.evaluate(from => (window.__evals || []).slice(from), cursor).catch(() => []);
  cursor += fresh.length; events.push(...fresh);
}
async function until(test, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) { await pull(); const value = await test(); if (value) return value; }
  return null;
}
// ---------- the run (called at the end of this file, once everything below is defined) ----------
const t0 = Date.now(), turns = [];
let session = null, sandboxed = null;
async function main() { try {
  if (!live) sandboxed = await startSandbox({ examId: scenario.examId, intro });
  // The microphone is the only thing stubbed. By default it is a fake device that hears silence: the page runs as for a
  // person with a microphone who types (text-only conversations, with no microphone, are closed by ElevenLabs about 10 s
  // after they connect, as of 2026-10-07; see evals/README.md). --no-mic denies it, for the page's text-only path.
  const silence = path.join(os.tmpdir(), 'plato-eval-silence.wav'), header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + 96_000, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48_000, 24); header.writeUInt32LE(96_000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(96_000, 40);
  if (!noMic) await writeFile(silence, Buffer.concat([header, Buffer.alloc(96_000)])); // one second of 16-bit 48 kHz silence, looped
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ...(noMic ? [] : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${silence}`])] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (noMic) await (await browser.newBrowserCDPSession()).send('Browser.setPermission', { permission: { name: 'microphone' }, setting: 'denied', origin: BASE })
    .catch(error => problems.push(`microphone not explicitly denied (${error.message}); headless Chrome has none anyway`));
  else await context.grantPermissions(['microphone'], { origin: BASE });
  page = await context.newPage();
  // The run tests the code it loaded: Vite's hot-reload socket is held so another agent's edit can't reload the page mid-run.
  await page.routeWebSocket(url => url.pathname === '/' && url.searchParams.has('token'), () => {});
  await page.addInitScript(pageHooks);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text().slice(0, 400)}`); });
  page.on('pageerror', error => problems.push(`page error: ${String(error).slice(0, 400)}`));
  page.on('framenavigated', frame => { if (started && frame === page.mainFrame()) incident = 'The page reloaded mid-run.'; });
  // The conversation's lifecycle as the network sees it: each token is a new ElevenLabs conversation; its LiveKit socket.
  const net = text => events.push({ at: Date.now(), kind: 'net', text });
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/session') net('voice token requested (a new conversation)'); });
  page.on('response', r => {
    if (r.status() >= 400) net(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    // Lessons the page received: GET /lesson, and the session's start result.
    else if (/^\/v1\/sessions\/[^/]+\/lesson$|^\/v1\/exams\/[^/]+\/sessions$/.test(new URL(r.url()).pathname)) r.json().then(b => b?.lesson && events.push({ at: Date.now(), kind: 'lesson', lesson: b.lesson }), () => {});
  });
  page.on('websocket', ws => {
    const host = new URL(ws.url()).host;
    if (ws.url().startsWith(BASE.replace('http', 'ws'))) return;
    net(`socket open ${host}`); ws.on('close', () => net(`socket closed ${host}`));
    // A text-only conversation runs over the agent's own WebSocket as JSON frames (WebRTC data goes through the page hooks).
    if (host.includes('livekit')) return;
    const json = s => { try { return JSON.parse(s); } catch { return null; } }, add = e => e && events.push({ at: Date.now(), ...e });
    ws.on('framesent', ({ payload }) => { const m = json(payload); if (['contextual_update', 'user_message', 'client_tool_result'].includes(m?.type)) add({ kind: 'sent', type: m.type, text: String(m.text ?? m.result ?? '') }); });
    ws.on('framereceived', ({ payload }) => {
      const m = json(payload);
      add(m?.type === 'agent_response' ? { kind: 'plato', text: String(m.agent_response_event?.agent_response ?? '') }
        : m?.type === 'agent_response_correction' ? { kind: 'plato-corrected', text: String(m.agent_response_correction_event?.corrected_agent_response ?? '') }
        : m?.type === 'conversation_initiation_metadata' ? { kind: 'connected', conversationId: m.conversation_initiation_metadata_event?.conversation_id }
        : m?.type === 'client_tool_call' ? { kind: 'tool-asked', name: m.client_tool_call?.tool_name } : null);
    });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Ready: a backend session, a live conversation, and the course brief sent to it.
  const ready = await until(async () => {
    const s = await page.evaluate(() => ({ id: window.__plato?.bridge?.session, examId: window.__plato?.bridge?.exam?.examId })).catch(() => ({}));
    return s.id && events.some(e => e.kind === 'connected') && events.some(e => e.kind === 'sent' && e.type === 'contextual_update') ? s : null;
  }, 60_000);
  if (!ready) throw Error(`The page never got ready (session, conversation and brief). Page says: "${events.findLast(e => e.kind === 'status')?.text || ''}". ${problems.slice(-3).join(' | ')}`);
  session = ready;
  if (scenario.examId && ready.examId !== scenario.examId) throw Error(`The page opened exam ${ready.examId}, not ${scenario.examId}: it always opens the newest course.`);
  started = true;
  await sleep(2000); // the brief's context lines settle (the page coalesces them for 1.5 s)

  const turnsFrom = Date.now(); // the turn budget starts here: setting up (the sandbox, the page) doesn't count
  for (let n = 1; n <= turnsWanted && !incident && Date.now() - turnsFrom < RUN_MS - TURN_MS; n++) {
    const line = simulate && n > 1 ? await nextLine().catch(error => { problems.push(`simulated student: ${error.message}`); return null; }) : scenario.lines[n - 1];
    if (!line) break;
    await sleep(800); // reads, then types: keys anywhere on the page go to its unseen line, Enter sends it
    await page.keyboard.type(line, { delay: TYPE_DELAY_MS });
    const at = Date.now();
    await page.keyboard.press('Enter');
    events.push({ at, kind: 'student', text: line });
    turns.push({ n, student: line, at, ...await replyTo(line, at) });
    const last = turns.at(-1);
    console.log(`${n}. student: ${line}\n   plato:   ${last.replies.map(r => r.text).join(' / ').slice(0, 300) || '(no reply)'}${last.timedOut ? ' [timed out]' : ''}`);
    if (!last.delivered) { incident = 'The typed line never reached Plato.'; break; }
  }
  await sleep(3000); await pull(); // the last agenda and planner events
} catch (error) {
  incident = error.message;
} finally {
  await finish();
} }

// Plato's turn: his replies once he has said something, has stopped speaking, no tool call is open and nothing happened
// for QUIET_MS.
async function replyTo(line, since) {
  const busy = new Set(['plato', 'tool', 'tool-done', 'board', 'mode']);
  for (;;) {
    await sleep(300); await pull();
    const fresh = events.filter(e => e.at >= since), replies = fresh.filter(e => e.kind === 'plato');
    const delivered = fresh.some(e => e.kind === 'sent' && e.type === 'user_message' && e.text.includes(line));
    // Speaking counts only while his last reply could still be being said: a stalled LiveKit signal can leave the label on.
    const last = replies.at(-1), speaking = events.findLast(e => e.kind === 'mode')?.text === 'Plato is speaking';
    const open = fresh.some(e => e.kind === 'tool' && !events.some(d => d.kind === 'tool-done' && d.id === e.id))
      || (speaking && last && Date.now() - last.at < 3000 + last.text.length * 1000 / SPEECH_CPS);
    const quiet = Date.now() - Math.max(since, ...fresh.filter(e => busy.has(e.kind)).map(e => e.at));
    const result = { delivered, replies: replies.map(({ at, text }) => ({ at, text })), firstReplyMs: replies[0] ? replies[0].at - since : null };
    if (replies.length && !open && quiet >= QUIET_MS) return { ...result, timedOut: false };
    if (Date.now() - since > TURN_MS || incident || (!delivered && Date.now() - since > 5000)) return { ...result, timedOut: true };
  }
}

const nextLine = () => studentLine(runtime ??= createRuntime(), scenario.persona, timeline(events, t0, { student: true }));

async function finish() {
  started = false;
  let lesson = null, course = { lectures: [], topics: [] };
  try { ({ course, lesson } = await courseFacts(api, session?.examId || scenario.examId, session?.id)); } catch (error) { problems.push(`course facts: ${error.message}`); }
  // The session ends the way the page ends it (its epoch moves on as events come, so a conflict is tried again).
  for (let tries = 0; session?.id && tries < 3; tries++) {
    const epoch = await page?.evaluate(() => window.__plato?.bridge?.state?.epoch).catch(() => null);
    try { await api('POST', `/v1/sessions/${session.id}/end`, { expectedEpoch: epoch || 1 }); break; }
    catch (error) { if (tries === 2 || error.code !== 'version_conflict') problems.push(`ending the session: ${error.message}`); await sleep(1000); }
  }
  await browser?.close().catch(() => {});
  if (sandboxed) await stopSandbox(sandboxed.server);
  const record = { harness: 'live-session', scenario, simulate, base: BASE, sandbox: sandboxed && { dir: sandboxed.dir, introReset: intro }, t0, startedAt: new Date(t0).toISOString(), endedAt: new Date().toISOString(), incident,
    examId: session?.examId ?? null, sessionId: session?.id ?? null, conversations: events.filter(e => e.kind === 'connected').map(e => e.conversationId), course, lesson, turns, problems, events };
  record.checks = checks({ events, turns, t0, lesson, course });
  if (!has('--no-judge') && turns.length) { runtime ??= createRuntime(); record.checks.judge = await judge(runtime, { events, t0, course, lesson, goalsAtStart: record.checks.agenda.start }).catch(error => ({ error: error.message })); }
  await runtime?.close();
  await writeRun(record, { heading: `ElevenLabs agent · ${simulate ? 'simulated student' : 'scripted student'}` });
}

await main();
