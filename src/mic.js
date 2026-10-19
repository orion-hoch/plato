// Listening in the text chat (13 Oct, the user: "why doesn't it listen, that's a core component"): the microphone recorded on
// the page at 16 kHz while the talk button (or Space) is on, sent when it goes off and heard by ElevenLabs on the student's own
// API key (server /voice/stt): tap to talk, tap again to send.
import { authHeader } from './backend-client.js';
let rec = null;

export async function startRecording() {
  if (rec) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: 16000 }), source = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
  node.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node); node.connect(ctx.destination);
  rec = { stream, ctx, source, node, chunks };
}

/** Stops and hears what was said: { text } ('' when nothing was), or { error }. */
export async function stopRecording() {
  const r = rec; rec = null;
  if (!r) return { text: '' };
  try { r.source.disconnect(); r.node.disconnect(); } catch { /* already */ }
  r.stream.getTracks().forEach(t => t.stop());
  const rate = r.ctx.sampleRate; void r.ctx.close();
  const samples = new Float32Array(r.chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of r.chunks) { samples.set(c, at); at += c.length; }
  if (samples.length < rate * 0.3) return { text: '' };
  const response = await fetch('/voice/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...await authHeader().catch(() => ({})) }, body: wav(samples, rate) }).catch(() => null);
  if (!response) return { error: 'Couldn’t reach the speech recognizer.' };
  const body = await response.json().catch(() => ({}));
  return response.ok ? { text: String(body.text || '').trim() } : { error: body.error || 'Couldn’t hear that.' };
}
export const recording = () => Boolean(rec);

// 16-bit PCM WAV, mono.
function wav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buffer), str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buffer], { type: 'audio/wav' });
}
