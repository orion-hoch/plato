// A24 — The tutor understands before it acts (user request, 2026-10-05): non-speech never becomes a turn, and a glance
// at the page commits nothing. (v10: the planner, its briefs and the hints they allowed went with classic.)
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setup } from './_session-helpers.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image body for tests')]).toString('base64');

async function agentSession(h) {
  const { sessionId } = h.app.services.session.start(h.learner, h.exam.id, { topicId: h.ids.qr.topicId, transport: 'agent' });
  await h.app.drain();
  return sessionId;
}
const reply = async (h, sessionId, text) => { h.clock.advance(1000); const r = await h.respond(sessionId, text); await h.app.drain(); return r; };

test('non-speech is not a turn: no response, no evidence, no plan', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const counts = () => [h.app.db.find('finalized_responses', { sessionId }).length, h.app.db.find('teaching_plans', { sessionId }).length, h.app.db.find('interaction_evidence', {}, { scope: h.scope }).length];
  const before = counts();
  for (const text of ['...', '…', ' . . ', '', '?!']) await assert.rejects(h.respond(sessionId, text), e => e.code === 'invalid_input', JSON.stringify(text));
  await h.app.drain();
  assert.deepEqual(counts(), before);
  assert.equal((await reply(h, sessionId, 'ok')).evidenceStatus, 'eligible', 'a real word still counts');
});

test('a glance at the page reads it and commits nothing', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const s = h.session(sessionId);
  const counts = () => [h.app.db.find('finalized_responses', { sessionId }).length, h.app.db.find('teaching_plans', { sessionId }).length, h.app.db.find('blobs', {}, { scope: h.scope }).length];
  const before = counts();
  h.controls.drawingReader = { transcription: 'addi t0, t0, 1', mathLatex: null, confidence: 'clear', uncertainRegions: [] };
  const body = { clientResponseId: 'glance_1', imageBase64: PNG, replyToQuestionId: null, captureEpoch: s.epoch, turnId: s.currentTurnId, commit: false };
  assert.deepEqual(await h.app.services.session.drawings(h.learner, sessionId, body), { transcription: 'addi t0, t0, 1', mathLatex: null, confidence: 'clear', uncertainRegions: [] });
  await h.app.drain();
  assert.deepEqual(counts(), before);
  await assert.rejects(h.app.services.session.drawings(h.learner, sessionId, { ...body, imageBase64: Buffer.from('not a png at all').toString('base64') }), e => e.code === 'invalid_input');
  await assert.rejects(h.app.services.session.drawings(h.learner, sessionId, { ...body, commit: 'no' }), e => e.code === 'invalid_input');
  const { commit, ...committed } = body;
  assert.ok((await h.app.services.session.drawings(h.learner, sessionId, committed)).responseId, 'without commit:false it is an answer');
  // Words typed alongside the writing are part of the same answer.
  await h.app.services.session.drawings(h.learner, sessionId, { ...committed, clientResponseId: 'typed_and_written', text: 'is this the increment?' });
  assert.equal(h.app.db.findOne('finalized_responses', { sessionId, clientResponseId: 'typed_and_written' }).text, 'is this the increment?\naddi t0, t0, 1');
  await h.app.drain();
  await h.app.services.session.end(h.learner, sessionId, { expectedEpoch: h.session(sessionId).epoch });
  await assert.rejects(h.app.services.session.drawings(h.learner, sessionId, body), e => e.code === 'invalid_input', 'an ended session is not read');
});
