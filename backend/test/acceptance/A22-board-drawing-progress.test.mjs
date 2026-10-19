// A22 — Visible progress, board-projected questions and drawn answers (user additions, 2026-10-05).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setup } from './_session-helpers.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image body for tests')]).toString('base64');

async function agentSession(h) {
  const { sessionId } = h.app.services.session.start(h.learner, h.exam.id, { topicId: h.ids.qr.topicId, transport: 'agent' });
  await h.app.drain();
  return sessionId;
}
// A card's question board holds the question on the page until it is shown (v10; the planner chose it before).
async function projectQuestion(h, sessionId) {
  const q = await h.notationQuestion(sessionId);
  assert.ok(h.app.services.session.offerQuestion(sessionId, q.id));
  return q;
}
const board = (h, sessionId, fields) => h.app.services.session.agentEvents(h.learner, sessionId, { events: [{ clientEventId: `b_${Math.random()}`, interrupted: false, occurredAt: h.clock.iso(), ...fields }] }).receipts[0];

test('progress: every topic starts Not assessed; an assessed answer adds history; nothing internal leaks', async () => {
  const h = await setup();
  const before = h.app.services.session.progress(h.scope);
  assert.equal(before.overall.label, 'Not assessed');
  assert.equal(before.overall.displayIndex, null);
  assert.equal(before.overall.assessedTopics, 0);
  assert.ok(before.topics.every(t => t.mastery.label === 'Not assessed' && t.mastery.displayIndex === null && t.history.length === 0));
  assert.ok(before.topics.find(t => t.id === h.ids.qr.topicId).objectives[0].statement);

  const sessionId = await agentSession(h);
  const q = await projectQuestion(h, sessionId);
  board(h, sessionId, { type: 'board_shown', questionId: q.id, text: q.voiceForm });
  await h.respond(sessionId, q.expectedAnswer, { replyToQuestionId: q.id });
  await h.app.drain(); h.clock.advance(5000); await h.app.drain();

  const after = h.app.services.session.progress(h.scope);
  const qr = after.topics.find(t => t.id === q.topicId);
  assert.equal(qr.mastery.status, 'estimated');
  assert.ok(qr.history.length >= 1 && qr.history.every(p => p.segment && p.at && p.label));
  assert.equal(after.overall.assessedTopics, 1);
  assert.ok(after.recent.some(r => r.topicId === q.topicId && r.from === null));
  const text = JSON.stringify(after);
  for (const secret of [q.expectedAnswer, 'rubric', 'diagnos', 'excerpt', 'uncertainty']) assert.ok(!text.includes(secret), `progress leaks ${secret}`);
});

test('a question projected with its exact wording is asked once; changed wording is drift', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const q = await projectQuestion(h, sessionId);
  const ready = h.events(sessionId).filter(e => e.type === 'question.ready').at(-1);
  assert.deepEqual(Object.keys(ready.payload.question).sort(), ['choices', 'inputKind', 'inputSpec', 'questionId', 'voiceForm']);
  assert.equal(ready.payload.question.voiceForm, q.voiceForm);

  const drift = board(h, sessionId, { type: 'board_shown', questionId: q.id, text: q.voiceForm.replace(/\bthree\b|3/i, m => (/\d/.test(m) ? '4' : 'four')) });
  assert.equal(drift.status, 'accepted');
  await h.app.drain();
  assert.notEqual(h.app.services.questions.get(h.scope, q.id).state, 'asked');

  assert.equal(board(h, sessionId, { type: 'board_shown', questionId: q.id, text: q.voiceForm }).kind, 'prompt');
  board(h, sessionId, { type: 'board_shown', questionId: q.id, text: q.voiceForm }); // shown again: still one delivery
  await h.app.drain();
  assert.equal(h.app.services.questions.get(h.scope, q.id).state, 'asked');
  assert.equal(h.app.db.find('exposure_records', { questionId: q.id }).filter(e => e.kind === 'question_played').length, 1);
  assert.equal(board(h, sessionId, { type: 'board_shown', questionId: 'q_not_active', text: 'anything' }).status, 'rejected');
});

test('board explanations are recorded as delivered board content', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const r = board(h, sessionId, { type: 'board_content', text: '## Projection\n$\\text{proj}_q a = (q^T a) q$' });
  assert.equal(r.kind, 'explanation');
  const unit = h.units(sessionId).at(-1);
  assert.equal(unit.surface, 'board');
  assert.ok(h.app.db.find('delivery_events', { sessionId }).some(d => d.semanticUnitId === unit.id && d.stage === 'played'));
});

test('a drawn answer is stored, read, committed like speech, idempotent; unreadable is ambiguous', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const q = await projectQuestion(h, sessionId);
  board(h, sessionId, { type: 'board_shown', questionId: q.id, text: q.voiceForm });
  const s = h.session(sessionId);
  const body = { clientResponseId: 'draw_1', imageBase64: PNG, replyToQuestionId: q.id, captureEpoch: s.epoch, turnId: s.currentTurnId };
  h.controls.drawingReader = { transcription: q.expectedAnswer, mathLatex: null, confidence: 'clear', uncertainRegions: [] };
  const r = await h.app.services.session.drawings(h.learner, sessionId, body);
  assert.equal(r.attributedQuestionId, q.id);
  assert.equal(r.evidenceStatus, 'eligible');
  assert.equal(r.transcription, q.expectedAnswer);
  const response = h.app.db.get('finalized_responses', r.responseId);
  assert.ok(h.app.blobs.verify(response.answerArtifact, h.scope));
  assert.equal(h.app.db.findOne('interaction_evidence', { responseId: r.responseId }).answerArtifact.sha256, response.answerArtifact.sha256);

  h.controls.drawingReader = { transcription: 'something else entirely' };
  assert.deepEqual(await h.app.services.session.drawings(h.learner, sessionId, body), r, 'replay returns the first reading');
  await assert.rejects(h.app.services.session.drawings(h.learner, sessionId, { ...body, turnId: 'turn_other' }), e => e.code === 'idempotency_conflict');
  await assert.rejects(h.app.services.session.drawings(h.learner, sessionId, { ...body, clientResponseId: 'draw_bad', imageBase64: Buffer.from('not a png at all').toString('base64') }), e => e.code === 'invalid_input');

  const s2 = h.session(sessionId);
  h.controls.drawingReader = { transcription: '', confidence: 'unreadable', uncertainRegions: ['the whole answer'] };
  const unreadable = await h.app.services.session.drawings(h.learner, sessionId, { ...body, clientResponseId: 'draw_2', captureEpoch: s2.epoch, turnId: s2.currentTurnId });
  assert.equal(unreadable.evidenceStatus, 'ambiguous');
  assert.equal(unreadable.confidence, 'unreadable');
  h.controls.drawingReader = { fail: true };
  const s3 = h.session(sessionId);
  const failed = await h.app.services.session.drawings(h.learner, sessionId, { ...body, clientResponseId: 'draw_3', captureEpoch: s3.epoch, turnId: s3.currentTurnId });
  assert.equal(failed.evidenceStatus, 'ambiguous');
});
