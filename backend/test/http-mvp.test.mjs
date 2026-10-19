// §14 completion: upload → session → answer → mastery → personal revision → next retrieval,
// through the HTTP routes, persisted services and queues, then a restart that preserves state.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBackend } from '../app.mjs';
import { createClock } from '../core/util.mjs';
import { createMockProviders } from '../providers/mock/index.mjs';
import { createHttpHandler } from '../http/index.mjs';

const NOTES = `# Projections
The projection of a onto a unit vector q is (qᵀa)q. The scalar qᵀa is the coefficient of a along q.

# QR factorization
Gram-Schmidt gives A = QR. Each entry rᵢⱼ = qᵢᵀaⱼ is the projection coefficient of column aⱼ on qᵢ.`;

async function boot(dir, clock) {
  const app = createBackend({ dbFile: path.join(dir, 'plato.db'), blobDir: path.join(dir, 'blobs'), clock, providers: createMockProviders({ clock, controls: {} }) });
  const handle = createHttpHandler(app, { localPrincipalFile: path.join(dir, 'principal.json') });
  const server = createServer(async (req, res) => { if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, { body, token, headers = {}, raw } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    return { status: response.status, body: response.status === 304 ? null : await response.json().catch(() => null), headers: response.headers };
  };
  let closed = false;
  return { app, server, call, close: () => { if (closed) return; closed = true; server.closeAllConnections(); server.close(); app.close(); } };
}

test('full flow over HTTP, then restart preserves state', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'plato-mvp-'));
  const clock = createClock('2026-10-04T12:00:00Z');
  let node = await boot(dir, clock);
  t.after(() => node.close());
  const { call, app } = node;

  const { body: { token } } = await call('POST', '/v1/local/principal');
  assert.ok(token);
  assert.equal((await call('GET', '/v1/exams')).status, 401);

  // Setup with an explicit learner preference.
  const created = await call('POST', '/v1/exams', { token, body: { title: 'Linear algebra', preferences: [{ key: 'examples_first', value: true, applicability: 'exam' }] }, headers: { 'Idempotency-Key': 'exam-1' } });
  assert.equal(created.status, 201);
  const replay = await call('POST', '/v1/exams', { token, body: { title: 'Linear algebra', preferences: [{ key: 'examples_first', value: true, applicability: 'exam' }] }, headers: { 'Idempotency-Key': 'exam-1' } });
  assert.equal(replay.body.examId, created.body.examId);
  assert.equal((await call('POST', '/v1/exams', { token, body: { title: 'Different' }, headers: { 'Idempotency-Key': 'exam-1' } })).status, 409);
  const examId = created.body.examId;

  // Before material: empty topics, session not ready.
  assert.deepEqual((await call('GET', `/v1/exams/${examId}/topics`, { token })).body.topics, []);
  assert.equal((await call('POST', `/v1/exams/${examId}/sessions`, { token, body: {} })).body.error.code, 'content_not_ready');

  // Upload → PUT bytes → finalize with checksum.
  const bytes = Buffer.from(NOTES);
  const { body: { uploads: [slot] } } = await call('POST', `/v1/exams/${examId}/uploads`, { token, body: { files: [{ filename: 'notes.md', size: bytes.length, declaredMime: 'text/markdown' }] } });
  assert.equal((await call('PUT', new URL(slot.uploadUrl, 'http://x').pathname, { raw: bytes })).status, 200);
  const checksum = `c1:sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const finalized = await call('POST', `/v1/exams/${examId}/uploads/${slot.sourceFileId}/finalize`, { token, body: { uploadToken: slot.uploadToken, checksum, uploadedByteLength: bytes.length } });
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  await app.drain();

  const status = (await call('GET', `/v1/exams/${examId}/status`, { token })).body;
  assert.ok(status.knowledgeVersion >= 1, JSON.stringify(status));
  const topics = (await call('GET', `/v1/exams/${examId}/topics`, { token })).body;
  assert.ok(topics.topics.length > 0);
  assert.ok(topics.topics.every(t => t.mastery.status === 'unknown' && t.mastery.displayIndex === null && t.mastery.label === 'Not assessed'));
  // The student projection exposes nothing internal.
  assert.deepEqual(Object.keys(topics.topics[0]).sort(), ['id', 'mastery', 'parentId', 'title']);

  // Session on a topic with a ready question (as when the student picks one): the agent asks for a question and the page
  // shows it, so it is posed (v10: the actor speaks; nothing to acknowledge, and no opening plan puts a topic in play).
  const exam = app.db.get('exams', examId), ready = app.services.questions.available(exam.scope, { knowledgeManifestId: exam.publishedKnowledgeManifestId }).find(q => q.format !== 'exam');
  const started = await call('POST', `/v1/exams/${examId}/sessions`, { token, body: { topicId: ready.topicId } });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const sessionId = started.body.sessionId;
  await app.drain();
  const offered = (await call('POST', `/v1/sessions/${sessionId}/questions`, { token, body: {} })).body;
  assert.equal(offered.state, 'ready', JSON.stringify(offered));
  const shown = await call('POST', `/v1/sessions/${sessionId}/agent-events`, { token, body: { events: [{ clientEventId: 'shown_1', type: 'board_shown', questionId: offered.question.questionId, text: offered.question.voiceForm, interrupted: false, occurredAt: clock.iso() }] } });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  await app.drain();
  const asked = app.db.get('sessions', sessionId).activeQuestionId;
  assert.equal(asked, offered.question.questionId, 'a question was delivered');

  // Answer it, correctly per the mock rubric.
  const question = app.services.questions.get(app.db.get('exams', examId).scope, asked);
  const fresh = app.db.get('sessions', sessionId);
  const answer = await call('POST', `/v1/sessions/${sessionId}/responses`, { token, body: { clientResponseId: 'resp_1', captureEpoch: fresh.epoch, turnId: fresh.currentTurnId, replyToQuestionId: asked, text: question.expectedAnswer, finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null } });
  assert.equal(answer.status, 202, JSON.stringify(answer.body));
  assert.equal(answer.body.questionId ?? answer.body.attributedQuestionId, asked);
  await app.drain();
  app.clock.advance(5000); // past the personalization coalescing window
  await app.drain();

  // Mastery estimated for that topic; a learner change got a recorded personal decision.
  const after = (await call('GET', `/v1/exams/${examId}/topics`, { token })).body;
  const assessed = after.topics.find(t => t.id === question.topicId);
  assert.equal(assessed.mastery.status, 'estimated', JSON.stringify(assessed));
  const scope = app.db.get('exams', examId).scope;
  const changes = app.services.learner.changes(scope);
  assert.ok(changes.length > 0);
  assert.ok(changes.every(c => c.status === 'decided' || c.status === 'coalesced'), JSON.stringify(changes.map(c => c.status)));
  assert.ok(app.services.learner.decisions(scope).length > 0);

  // Restart: the same database and blobs bring everything back.
  node.close();
  node = await boot(dir, clock);
  const again = (await node.call('GET', `/v1/exams/${examId}/topics`, { token })).body;
  assert.equal(again.topics.find(t => t.id === question.topicId).mastery.status, 'estimated');
  const resumed = await node.call('POST', `/v1/sessions/${sessionId}/resume`, { token, body: { clientResumeId: 'resume_1', lastAcknowledgedServerSequence: 0 } });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  assert.ok(Array.isArray(resumed.body.missedEvents) || Array.isArray(resumed.body.events), JSON.stringify(Object.keys(resumed.body)));

  // Another learner cannot reach any of it.
  const intruder = node.app.auth.createPrincipal();
  assert.equal((await node.call('GET', `/v1/exams/${examId}/topics`, { token: intruder.token })).status, 404);
  assert.equal((await node.call('POST', `/v1/sessions/${sessionId}/end`, { token: intruder.token, body: { expectedEpoch: 1 } })).status, 404);
});
