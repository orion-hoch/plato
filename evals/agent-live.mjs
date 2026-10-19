// Live: the real ElevenLabs tutor agent + the running backend (npm run dev), bridged the way the page
// bridges them. A synthetic student speaks; measures end of speech → transcript, → Plato's reply text,
// → Plato's first audio.
// node --env-file=.env evals/agent-live.mjs "<exam title>" --use-elevenlabs
import WebSocket from 'ws';

// Every run opens a real ElevenLabs conversation and speech, which spends the user's credits: never by default.
if (!process.argv.includes('--use-elevenlabs')) { console.error('This script talks to the live ElevenLabs agent and spends ElevenLabs credits. Pass --use-elevenlabs only with the user\'s explicit go-ahead.'); process.exit(2); }

const BASE = 'http://127.0.0.1:5188', key = process.env.ELEVENLABS_API_KEY, agentId = process.env.ELEVENLABS_AGENT_ID;
const title = process.argv.slice(2).find(a => !a.startsWith('--')) || 'CS 3130 Algorithms';
const t0 = performance.now(), ms = () => Math.round(performance.now() - t0), log = (...a) => console.log(`${String(ms()).padStart(6)}ms`, ...a);
const j = async (method, path, body, token) => { const r = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.json(); if (!r.ok) throw new Error(`${path}: ${JSON.stringify(x.error)}`); return x; };
async function speech(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'}?output_format=pcm_16000`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }) });
  return Buffer.from(await r.arrayBuffer());
}

const { token } = await j('POST', '/v1/local/principal');
const exam = (await j('GET', '/v1/exams', null, token)).exams.find(e => e.title === title && e.knowledgeReady);
if (!exam) throw new Error(`No ready exam "${title}"`);
const lines = (process.env.STUDENT_SAYS || 'Why is merge sort n log n and not n squared?|Okay. Can you quiz me on it?').split('|');
const clips = await Promise.all(lines.map(speech));

// Backend session in agent mode; its server events stream back over SSE.
const session = await j('POST', `/v1/exams/${exam.examId}/sessions`, { transport: 'agent', clientSessionRequestId: `agent-${Date.now()}` }, token);
const state = { epoch: session.epoch, turnId: session.currentTurnId, activeQuestionId: null };
const forward = [];
let open = false, ws = null;
(async () => {
  const r = await fetch(`${BASE}/v1/sessions/${session.sessionId}/events`, { headers: { Authorization: `Bearer ${token}` } });
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const frames = buf.split('\n\n'); buf = frames.pop();
    for (const f of frames) { const d = f.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join(''); if (!d) continue; const e = JSON.parse(d), p = e.payload || {};
      if (typeof e.epoch === 'number') state.epoch = Math.max(state.epoch, e.epoch);
      if (e.type === 'agent.context' || e.type === 'agent.brief') { log(`backend → ${e.type} (${p.text.length} chars${p.purpose ? `, plan: ${p.purpose}` : ''}${p.questionId ? ', with question' : ''})`); forward.push(p.text); flush(); }
      if (e.type === 'turn.listening' || e.type === 'session.started') { state.turnId = p.turnId ?? state.turnId; if ('activeQuestionId' in p) state.activeQuestionId = p.activeQuestionId; }
      if (e.type === 'response.committed') { state.turnId = p.turnId; log(`backend committed response (${p.evidenceStatus}${p.attributedQuestionId ? ', answers question' : ''})`); }
      if (e.type === 'agent.recorded') { log(`backend recorded Plato's words as ${p.kind}${p.questionId ? ' (question asked)' : ''}`); if (p.questionId) state.activeQuestionId = p.questionId; }
    } }
})();

// The agent over its WebSocket API.
const { signed_url } = await (await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { 'xi-api-key': key } })).json();
ws = new WebSocket(signed_url);
function flush() { if (!open) return; while (forward.length) ws.send(JSON.stringify({ type: 'contextual_update', text: forward.shift() })); }
const turn = { speechEnd: null, transcriptAt: null, replyAt: null, audioAt: null, reply: '' }, results = [];
let agentText = '';
ws.on('open', () => { open = true; ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' })); flush(); log('agent connected'); });
ws.on('message', async raw => {
  const m = JSON.parse(raw);
  if (m.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event.event_id })); return; }
  if (m.type === 'user_transcript') { const text = m.user_transcription_event.user_transcript; turn.transcriptAt ??= ms(); log(`transcript +${ms() - turn.speechEnd}ms: ${JSON.stringify(text)}`);
    void j('POST', `/v1/sessions/${session.sessionId}/responses`, { clientResponseId: crypto.randomUUID(), captureEpoch: state.epoch, turnId: state.turnId, replyToQuestionId: state.activeQuestionId, text, finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null }, token).catch(e => log('respond failed', e.message)); }
  if (m.type === 'agent_response') { const text = m.agent_response_event.agent_response; agentText = text; if (turn.speechEnd) { turn.replyAt ??= ms(); turn.reply = text; } log(`Plato${turn.speechEnd ? ` +${ms() - turn.speechEnd}ms` : ' (greeting)'}: ${JSON.stringify(text)}`);
    // The page reports what was said once it has played; here, right away.
    void j('POST', `/v1/sessions/${session.sessionId}/agent-events`, { events: [{ clientEventId: crypto.randomUUID(), type: 'agent_response', text, interrupted: false, occurredAt: new Date().toISOString() }] }, token).catch(() => {}); }
  if (m.type === 'audio' && turn.speechEnd && !turn.audioAt) { turn.audioAt = ms(); log(`first audio +${turn.audioAt - turn.speechEnd}ms`); }
});
await new Promise(r => setTimeout(r, 6000)); // greeting + course brief

for (const clip of clips) {
  Object.assign(turn, { speechEnd: null, transcriptAt: null, replyAt: null, audioAt: null, reply: '' });
  for (let i = 0; i < clip.length; i += 3200) { ws.send(JSON.stringify({ user_audio_chunk: clip.subarray(i, i + 3200).toString('base64') })); await new Promise(r => setTimeout(r, 100)); }
  turn.speechEnd = ms(); log('student stopped speaking');
  const silence = Buffer.alloc(3200).toString('base64');
  for (let i = 0; i < 150 && !(turn.audioAt && ms() - turn.audioAt > 6000); i++) { ws.send(JSON.stringify({ user_audio_chunk: silence })); await new Promise(r => setTimeout(r, 100)); }
  results.push({ transcriptMs: turn.transcriptAt && turn.transcriptAt - turn.speechEnd, replyTextMs: turn.replyAt && turn.replyAt - turn.speechEnd, firstAudioMs: turn.audioAt && turn.audioAt - turn.speechEnd, reply: turn.reply });
  await new Promise(r => setTimeout(r, 12000)); // let Astra's plan for this turn arrive as a brief
}
console.log(JSON.stringify(results, null, 2));
ws.close(); await j('POST', `/v1/sessions/${session.sessionId}/end`, { expectedEpoch: state.epoch }, token).catch(() => {});
process.exit(0);
