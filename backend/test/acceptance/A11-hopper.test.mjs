// A11 — Hopper reservation race, refill, and bounded work (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { seedPublishedKnowledge, QR_COURSE } from '../fixtures.mjs';

async function setup(options) {
  const t = createTestBackend(options);
  const exam = t.createExam();
  const seeded = seedPublishedKnowledge(t.app, exam);
  await t.app.drain();
  return { ...t, exam, scope: exam.scope, seeded, q: t.app.services.questions };
}
const reserveArgs = (s, extra = {}) => ({ scope: s.scope, sessionId: 'syn_session_a', epoch: 1, turnId: 'syn_turn_1', compatibleKnowledgeManifestId: s.seeded.manifest.id, topicId: s.seeded.ids.qr.topicId, purpose: 'probe', ...extra });

test('publication fills one basic and one challenging validated question per subtopic, then sleeps', async () => {
  const s = await setup();
  const supply = s.q.supply(s.scope);
  assert.equal(supply.length, 6); // projections, qr, eigen × basic/challenging; the root has no objectives
  const ready = s.app.db.find('question_records', { state: 'ready' }, { scope: s.scope });
  assert.equal(ready.length, 6);
  for (const q of ready) {
    assert.equal(q.learnerContext, null); // generic hopper items declare themselves generic
    assert.equal(q.origin, 'generic_hopper');
    assert.ok(q.rubricVersionId && s.q.rubric(s.scope, q.rubricVersionId).expectedAnswer);
    assert.equal(q.approvedRenderingIds.length, 1);
    assert.equal(q.validationReportIds.length, 2);
  }
  const requests = () => s.app.db.find('question_generation_requests', {}, { scope: s.scope }).length;
  const before = requests();
  await s.app.drain();
  for (const fn of s.app.reconcilers) fn();
  await s.app.drain();
  assert.equal(requests(), before, 'a full pool generates nothing more');
});

test('two concurrent reservations of one question: exactly one wins; the index forbids a second active lease', async () => {
  const s = await setup();
  const basic = s.app.db.find('question_records', { topicId: s.seeded.ids.qr.topicId, state: 'ready' }, { scope: s.scope }).find(q => q.intendedDifficulty === 'basic_diagnostic');
  const results = await Promise.allSettled([
    Promise.resolve().then(() => s.q.reserve(reserveArgs(s, { preferredQuestionId: basic.id, sessionId: 'syn_a' }))),
    Promise.resolve().then(() => s.q.reserve(reserveArgs(s, { preferredQuestionId: basic.id, sessionId: 'syn_b' }))),
  ]);
  const winners = results.filter(r => r.status === 'fulfilled' && r.value.question.id === basic.id);
  assert.equal(winners.length, 1);
  assert.equal(s.app.db.find('question_reservations', { questionId: basic.id, state: 'active' }, { scope: s.scope }).length, 1);
  const r = winners[0].value.reservation;
  assert.throws(() => s.app.db.insert('question_reservations', { ...r, id: 'syn_dup', sessionId: 'syn_c' }), /UNIQUE/);
});

test('reservation triggers bounded refill; event storms do not create fill storms', async () => {
  const s = await setup();
  const before = s.app.db.find('question_generation_requests', {}, { scope: s.scope }).length;
  const { question } = s.q.reserve(reserveArgs(s));
  await s.app.drain();
  const after = s.app.db.find('question_generation_requests', {}, { scope: s.scope });
  assert.equal(after.length, before + 1, 'one refill for the reserved slot');
  assert.equal(s.app.db.find('question_records', { topicId: question.topicId, state: 'ready' }, { scope: s.scope }).filter(q => q.intendedDifficulty === question.intendedDifficulty).length, 1);
  for (let i = 0; i < 10; i++) {
    s.app.events.emit({ scope: s.scope, eventType: 'question.invalidated', aggregateType: 'question', aggregateId: `syn_q_${i}`, payload: { questionId: `syn_q_${i}`, reservationId: null, topicId: question.topicId, slot: 'basic', version: 1 } });
  }
  await s.app.drain();
  const stormed = s.app.db.find('question_generation_requests', {}, { scope: s.scope });
  assert.equal(stormed.length, after.length, 'storm of events adds no work when the slot is full');
  const generic = s.app.db.find('question_records', { topicId: question.topicId }, { scope: s.scope }).filter(q => ['ready', 'reserved'].includes(q.state));
  assert.ok(generic.length <= s.app.config.maxGenericItemsPerSubtopic);
});

test('in-flight and per-subtopic caps hold even when generation keeps failing', async () => {
  const s = await setup({ controls: { questionGenerator: { fail: 1000 } } });
  for (let i = 0; i < 6; i++) { s.app.clock.advance(60_000); await s.app.drain(); }
  const requests = s.app.db.find('question_generation_requests', {}, { scope: s.scope });
  assert.equal(requests.length, 6);
  assert.ok(requests.every(r => r.state === 'failed' && r.error.code === 'provider_unavailable'));
  for (let i = 0; i < 5; i++) { for (const fn of s.app.reconcilers) fn(); s.app.clock.advance(60_000); await s.app.drain(); }
  const byTopic = new Map();
  for (const r of s.app.db.find('question_generation_requests', { state: ['queued', 'generating', 'validating'] }, { scope: s.scope })) byTopic.set(r.topicId, (byTopic.get(r.topicId) || 0) + 1);
  assert.ok([...byTopic.values()].every(n => n <= s.app.config.inFlightGenerationPerSubtopic));
  assert.equal(s.app.db.find('question_records', { state: 'ready' }, { scope: s.scope }).length, 0, 'failures never become ready');
});

test('release restores an undelivered valid question; delivered or partial stays asked and exposed', async () => {
  const s = await setup();
  const first = s.q.reserve(reserveArgs(s));
  s.q.release(s.scope, first.reservation.id, { sessionEpoch: 1 });
  assert.equal(s.q.get(s.scope, first.question.id).state, 'ready');

  const second = s.q.reserve(reserveArgs(s, { preferredQuestionId: first.question.id }));
  assert.throws(() => s.q.release(s.scope, second.reservation.id, { sessionEpoch: 2 }), e => e.code === 'version_conflict');
  s.q.markDelivered(s.scope, { reservationId: second.reservation.id, deliveryEventIds: ['syn_del_1'], extent: 'partial' });
  s.q.release(s.scope, second.reservation.id, { sessionEpoch: 1 });
  assert.equal(s.q.get(s.scope, first.question.id).state, 'asked');
  const exposures = s.q.exposures(s.scope).filter(e => e.questionId === first.question.id);
  assert.deepEqual(exposures.map(e => e.kind), ['partial_prompt']);
  // A partially delivered question is not offered again as unseen.
  assert.ok(s.q.available(s.scope, { knowledgeManifestId: s.seeded.manifest.id, topicIds: [first.question.topicId] }).every(a => a.questionId !== first.question.id));
});

test('delivery wins over a racing release', async () => {
  const s = await setup();
  const { reservation, question } = s.q.reserve(reserveArgs(s));
  s.q.release(s.scope, reservation.id, { sessionEpoch: 1 }); // release raced ahead of the delivery receipt
  assert.equal(s.q.get(s.scope, question.id).state, 'ready');
  s.q.markDelivered(s.scope, { reservationId: reservation.id, deliveryEventIds: ['syn_del_2'], extent: 'complete' });
  assert.equal(s.q.get(s.scope, question.id).state, 'asked');
  assert.equal(s.app.db.get('question_reservations', reservation.id).state, 'delivered');
  // Idempotent: the same receipt again changes nothing.
  s.q.markDelivered(s.scope, { reservationId: reservation.id, deliveryEventIds: ['syn_del_2'], extent: 'complete' });
  assert.equal(s.q.exposures(s.scope).filter(e => e.questionId === question.id).length, 1);
});

test('lease expiry returns undelivered work; invalidation and expiry never make a stale question ready', async () => {
  const s = await setup();
  const { reservation, question } = s.q.reserve(reserveArgs(s));
  s.app.clock.advance(s.app.config.reservationLeaseMs + 1);
  for (const fn of s.app.reconcilers) fn();
  assert.equal(s.app.db.get('question_reservations', reservation.id).state, 'expired');
  assert.equal(s.q.get(s.scope, question.id).state, 'ready');

  const held = s.q.reserve(reserveArgs(s, { preferredQuestionId: question.id }));
  // New material makes QR incompatible.
  const renamed = { ...QR_COURSE, topics: QR_COURSE.topics.map(t => ({ ...t, key: `${t.key}-v2`, parentKey: t.parentKey && `${t.parentKey}-v2` })), edges: QR_COURSE.edges.map(e => ({ ...e, from: `${e.from}-v2`, to: `${e.to}-v2` })) };
  const k2 = seedPublishedKnowledge(s.app, s.exam, renamed, { version: 2, previousManifestId: s.seeded.manifest.id });
  s.app.events.dispatch();
  void k2;
  // Every topic has a new identity in K2, so every K1 question is incompatible.
  assert.equal(s.q.get(s.scope, question.id).state, 'invalidated');
  s.app.clock.advance(s.app.config.reservationLeaseMs + 1);
  for (const fn of s.app.reconcilers) fn();
  assert.equal(s.q.get(s.scope, question.id).state, 'invalidated');
  assert.equal(s.app.db.get('question_reservations', held.reservation.id).state, 'invalidated');
  await s.app.drain();
  assert.ok(s.app.db.find('question_records', { knowledgeManifestId: k2.manifest.id, state: 'ready' }, { scope: s.scope }).length > 0, 'K2 refills');
});

test('on-demand custom work is claimed before background refill', async () => {
  const s = await setup();
  // Make refill work exist, then a custom request.
  s.q.reserve(reserveArgs(s));
  s.app.events.dispatch();
  s.q.requestCustom(s.scope, { topicId: s.seeded.ids.qr.topicId, narrowTarget: 'interpret the transpose in qᵢᵀaⱼ', intendedDifficulty: 'application', sessionId: 'syn_a', turnId: 'syn_t' });
  const claimed = s.app.jobs.claim();
  assert.equal(claimed.type, 'generate_custom_question');
});
