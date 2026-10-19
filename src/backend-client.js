// Browser client for the v1 backend (docs/implementation-spec.md §10).
import { formatOf } from './study-material.mjs';

let tokenPromise = null;
/** The Authorization header the API takes, for the page's own routes (checkpoints, material notes). */
export const authHeader = async () => ({ Authorization: `Bearer ${await token()}` });
async function token() {
  tokenPromise ??= fetch('/v1/local/principal', { method: 'POST' }).then(async r => {
    if (!r.ok) throw Error('Could not sign in to the local Plato server.');
    return (await r.json()).token;
  }).catch(error => { tokenPromise = null; throw error; });
  return tokenPromise;
}

export class ApiError extends Error {
  constructor(status, error) { super(error?.message || `Request failed (${status}).`); this.status = status; this.code = error?.code; this.retryable = error?.retryable; }
}

// The learner's work is never lost to the network: a request marked `retry` (what they said, their writing, page
// evidence) that can't reach the server (a restart, the Mac waking) goes again, the same body and key (idempotent), with
// growing pauses, for up to RETRY_FOR_MS. watchConnection(fn) hears fn(false) while the server can't be reached and
// fn(true) once it can.
const RETRY_FOR_MS = 15 * 60_000, sleep = ms => new Promise(r => setTimeout(r, ms));
let connected = null;
export function watchConnection(fn) { connected = fn; }
async function request(method, path, { body, idempotencyKey, signal, headers = {}, retry = false } = {}) {
  for (let pause = 1000, until = Date.now() + RETRY_FOR_MS, signedIn = false; ; pause = Math.min(pause * 2, 15_000)) {
    let response;
    try {
      response = await fetch(path, {
        method, signal,
        headers: { Authorization: `Bearer ${await token()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      if (!retry || signal?.aborted || Date.now() > until) throw error;
      connected?.(false); await sleep(pause); continue;
    }
    if (retry && [502, 503, 504].includes(response.status) && Date.now() < until) { connected?.(false); await sleep(pause); continue; }
    // A server that came back with a new sign-in: sign in again, once.
    if (response.status === 401 && !signedIn) { tokenPromise = null; signedIn = true; continue; }
    connected?.(true);
    if (response.status === 304) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, payload.error);
    return payload;
  }
}

const key = () => crypto.randomUUID();

export const api = {
  token,
  listExams: () => request('GET', '/v1/exams'),
  createExam: fields => request('POST', '/v1/exams', { body: fields, idempotencyKey: key() }),
  patchExam: (examId, fields) => request('PATCH', `/v1/exams/${examId}`, { body: fields, idempotencyKey: key() }),
  status: examId => request('GET', `/v1/exams/${examId}/status`),
  topics: examId => request('GET', `/v1/exams/${examId}/topics`),
  progress: examId => request('GET', `/v1/exams/${examId}/progress`),
  material: examId => request('GET', `/v1/exams/${examId}/material`),
  feedback: (examId, fields) => request('POST', `/v1/exams/${examId}/feedback`, { body: fields, idempotencyKey: key() }),

  /** Upload files: one reservation for all, the bytes in parallel, then each finalized with a checksum the server
   *  verifies. The type is the extension's (the server matches it exactly). Each finalize starts a build that
   *  supersedes the one before, so they go back to back. A file the server refuses shows as failed in its status;
   *  one that fails here does not hold back the others, and the first such failure is thrown once they are in. */
  async upload(examId, files) {
    const sized = await Promise.all(files.map(async file => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { file, bytes, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') };
    }));
    const { uploads } = await request('POST', `/v1/exams/${examId}/uploads`, { body: { files: sized.map(({ file }) => ({ filename: file.name, size: file.size, declaredMime: formatOf(file)?.mime || file.type || 'application/octet-stream' })) }, idempotencyKey: key() });
    const puts = await Promise.allSettled(uploads.map(async (slot, i) => {
      if (!slot.uploadUrl) return;
      const put = await fetch(slot.uploadUrl, { method: 'PUT', body: sized[i].bytes, headers: { 'Content-Type': 'application/octet-stream' } });
      if (!put.ok) throw new ApiError(put.status, (await put.json().catch(() => ({}))).error);
    }));
    let problem = null;
    for (const [i, slot] of uploads.entries()) {
      if (!slot.uploadUrl) continue;
      try {
        if (puts[i].status === 'rejected') throw puts[i].reason;
        await request('POST', `/v1/exams/${examId}/uploads/${slot.sourceFileId}/finalize`, { body: { uploadToken: slot.uploadToken, checksum: `c1:sha256:${sized[i].digest}`, uploadedByteLength: sized[i].bytes.length }, idempotencyKey: key() });
      } catch (error) { problem ??= error; }
    }
    if (problem) throw problem;
  },

  startSession: (examId, fields = {}) => request('POST', `/v1/exams/${examId}/sessions`, { body: { clientSessionRequestId: key(), ...fields }, idempotencyKey: key() }),
  respond: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/responses`, { body: fields, retry: true }),
  end: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/end`, { body: fields }),
  focus: examId => request('GET', `/v1/exams/${examId}/focus`),
  createFocus: (examId, fields) => request('POST', `/v1/exams/${examId}/focus`, { body: fields, idempotencyKey: key() }),
  updateFocus: (examId, sectionId, fields) => request('PATCH', `/v1/exams/${examId}/focus/${sectionId}`, { body: fields, idempotencyKey: key() }),
  submitDrawing: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/drawings`, { body: fields, retry: fields.commit !== false }),
  // What a drawing is made of ({ imageBase64, ink } → { kind, reading, items, uncertain }): read only, in the background.
  readShapes: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/shapes`, { body: fields }),
  // The student's code from a code zone, compiled and run in the server's sandbox ({ language: 'c', source, stdin? }).
  runCode: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/run`, { body: fields }),
  // What the student's own notes say ({ query } → { excerpts: [{ text, source, anchorId }] }): a quick search, no model call.
  notes: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/notes`, { body: fields }),
  // The passage behind a source ref (its bare id), for a quote on the page: { ref, file, location, passage, before, after }.
  examSource: (examId, ref) => request('GET', `/v1/exams/${examId}/sources/${encodeURIComponent(ref)}`),
  // A question for the director (→ 202 { thinkId }); its answer comes later as thought.ready. And the topic the student
  // asked for (→ { say, card }; the new card also comes as card.issued).
  think: (sessionId, question) => request('POST', `/v1/sessions/${sessionId}/think`, { body: { question } }),
  changeTopic: (sessionId, to) => request('POST', `/v1/sessions/${sessionId}/topic-change`, { body: { to } }),
  // Guide mode (docs/teaching-guide-spec.md): { action: 'show', board } | { action: 'move_on', why } | { action: 'practice', about }
  // → { say, boardId?, card? }; a next card also comes as card.issued.
  guide: (sessionId, body) => request('POST', `/v1/sessions/${sessionId}/guide`, { body, idempotencyKey: key() }),
  agentEvents: (sessionId, fields) => request('POST', `/v1/sessions/${sessionId}/agent-events`, { body: fields, retry: true }),
  // What the learner did with an element or a reading (§15b, reading.md §8): { events } → 202 { accepted, observed, exposed, ignored }.
  evidence: (sessionId, events) => request('POST', `/v1/sessions/${sessionId}/evidence`, { body: { events }, retry: true }),
  // The open learner model (§10): { canDo, wrongModels, calibration, due }, or 404 before the route exists.
  map: examId => request('GET', `/v1/exams/${examId}/map`),

  /** Server events over SSE (fetch-based so the bearer token is sent). Returns a stop function. */
  events(sessionId, { cursor = 0, onEvent, onError }) {
    const controller = new AbortController();
    (async () => {
      let last = cursor;
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`/v1/sessions/${sessionId}/events?cursor=${last}`, { headers: { Authorization: `Bearer ${await token()}` }, signal: controller.signal });
          if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => ({}))).error);
          connected?.(true);
          const reader = response.body.getReader(), decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n'); buffer = frames.pop();
            for (const frame of frames) {
              const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
              if (!data) continue;
              const event = JSON.parse(data);
              if (typeof event.sequence === 'number') last = Math.max(last, event.sequence);
              onEvent(event);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError) onError?.(error); else connected?.(false); // unreachable: it reconnects from `last`
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    })();
    return () => controller.abort();
  },
};
