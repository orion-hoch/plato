// Agent transport: a realtime voice agent (the actor) is the speaking role; the session records what it actually said.
// v10: the course brief and plan briefs went with classic; a question reaches the page from a card's question board.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setup } from './_session-helpers.mjs';

async function agentSession(h) {
  const started = h.app.services.session.start(h.learner, h.exam.id, { topicId: h.ids.qr.topicId, transport: 'agent' });
  await h.app.drain();
  return started.sessionId;
}
const said = (h, sessionId, text, extra = {}) => h.app.services.session.agentEvents(h.learner, sessionId, { events: [{ clientEventId: `a_${Math.random()}`, type: 'agent_response', text, interrupted: false, occurredAt: h.clock.iso(), ...extra }] });

test('the agent asking the approved question marks it asked; the reply is attributed to it', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const q = await h.notationQuestion(sessionId);
  assert.ok(h.app.services.session.offerQuestion(sessionId, q.id), 'a card\'s question board holds it on the page');

  const r = said(h, sessionId, `Okay, try this one. ${q.voiceForm}`);
  assert.equal(r.receipts[0].kind, 'prompt');
  await h.app.drain();
  assert.equal(h.app.services.questions.get(h.scope, q.id).state, 'asked');
  const reply = await h.respond(sessionId, q.expectedAnswer, { replyToQuestionId: q.id });
  assert.equal(reply.attributedQuestionId, q.id);
  assert.equal(reply.evidenceStatus, 'eligible');
});

test('an interrupted agent utterance is recorded as delivery-unknown, and duplicates are idempotent', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const ev = { clientEventId: 'dup_1', type: 'agent_response', text: 'Here is a partial thought about projections', interrupted: true, occurredAt: h.clock.iso() };
  assert.equal(h.app.services.session.agentEvents(h.learner, sessionId, { events: [ev] }).receipts[0].status, 'accepted');
  assert.equal(h.app.services.session.agentEvents(h.learner, sessionId, { events: [ev] }).receipts[0].status, 'duplicate');
  const unit = h.units(sessionId).at(-1);
  const stages = h.app.db.find('delivery_events', { sessionId }).filter(d => d.semanticUnitId === unit.id).map(d => d.stage);
  assert.ok(stages.includes('delivery_unknown'));
  assert.ok(!stages.includes('played'));
});

test('a changed question wording is recorded as drift and not marked asked', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const q = await h.notationQuestion(sessionId);
  assert.ok(h.app.services.session.offerQuestion(sessionId, q.id));
  const drifted = q.voiceForm.replace(/\bthree\b|3/i, m => (/\d/.test(m) ? '4' : 'four'));
  assert.notEqual(drifted, q.voiceForm, 'fixture question contains a number to alter');
  const r = said(h, sessionId, drifted);
  assert.equal(r.receipts[0].kind, 'prompt');
  await h.app.drain();
  assert.notEqual(h.app.services.questions.get(h.scope, q.id).state, 'asked');
  assert.ok(h.app.db.find('delivery_events', { sessionId }).some(d => /prompt_drift/.test(d.note || '')));
});
