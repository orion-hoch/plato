// A12 — Custom narrow question and exposure (spec §13), plus rendering integrity and K→K' reuse.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { seedPublishedKnowledge } from '../fixtures.mjs';
import { newId } from '../../core/util.mjs';

const NARROW = 'interpret the transpose in qᵢᵀaⱼ';

async function setup(options) {
  const t = createTestBackend(options);
  const exam = t.createExam();
  const seeded = seedPublishedKnowledge(t.app, exam);
  await t.app.drain();
  return { ...t, exam, scope: exam.scope, seeded, q: t.app.services.questions };
}
const qr = s => s.seeded.ids.qr;
async function custom(s, extra = {}) {
  const { generationRequestId } = s.q.requestCustom(s.scope, { topicId: qr(s).topicId, objectiveVersionIds: qr(s).objectiveVersionIds, narrowTarget: NARROW, intendedDifficulty: 'application', sessionId: 'syn_session', turnId: `syn_turn_${newId('t')}`, ...extra });
  await s.app.drain();
  return { generationRequestId, status: s.q.customStatus(s.scope, generationRequestId) };
}

test('custom notation question: objectives, sources, learner dependencies, rubric, hints, validation; no new topic', async () => {
  const s = await setup();
  const topicsBefore = s.app.db.find('topics', {}, { scope: s.scope }).length;
  const { status } = await custom(s);
  assert.equal(status.state, 'ready');
  const question = s.q.get(s.scope, status.questionId);
  assert.equal(question.origin, 'personalized_custom');
  assert.equal(question.topicId, qr(s).topicId);
  assert.equal(question.narrowTarget, NARROW);
  assert.deepEqual(question.objectiveVersionIds, qr(s).objectiveVersionIds);
  assert.ok(question.objectiveTargets.every(t => t.role !== 'assessed' || t.criterionIds.length));
  assert.ok(question.sourceEvidence.some(e => e.id === qr(s).anchorId));
  assert.ok(question.learnerContext, 'personalized questions carry learner context');
  assert.ok(question.dependencies.some(d => d.relation === 'personalized_for'));
  assert.ok(question.dependencies.some(d => d.ref.kind === 'knowledge_manifest' && d.ref.id === s.seeded.manifest.id));
  const rubric = s.q.rubric(s.scope, question.rubricVersionId);
  assert.match(rubric.expectedAnswer, /^3, the coefficient/);
  assert.ok(rubric.criteria.length && rubric.criteria.every(c => question.objectiveVersionIds.includes(c.objectiveVersionId)));
  assert.equal(question.hints.length, 2);
  assert.equal(question.validationReportIds.length, 2);
  assert.equal(s.app.db.find('topics', {}, { scope: s.scope }).length, topicsBefore, 'no permanent topic');

  // Nothing the speaker or planner sees contains the answer.
  const listed = s.q.available(s.scope, { knowledgeManifestId: s.seeded.manifest.id, topicIds: [qr(s).topicId] });
  assert.ok(!JSON.stringify(listed).includes('coefficient (component)'));
  const spoken = s.q.speakingForm(s.scope, question.id);
  assert.equal(spoken.answerReveal, null);
  assert.deepEqual(spoken.allowedHintTexts, []);
  assert.ok(!JSON.stringify(spoken).includes('coefficient (component)'));
  const hinted = s.q.speakingForm(s.scope, question.id, { allowedHintIds: [question.hints[0].hintId] });
  assert.deepEqual(hinted.allowedHintTexts.map(h => h.text), [question.hints[0].text]);
});

test('a taught answer family cannot be selected as novel transfer; a recorded revisit can', async () => {
  const s = await setup();
  const first = s.q.get(s.scope, (await custom(s)).status.questionId);
  // Same structure, new numbers: forced into the same semantic family.
  s.controls.questionGenerator = { reuseFamily: 'transpose dot product coefficient form i' };
  const second = s.q.get(s.scope, (await custom(s)).status.questionId);
  assert.equal(second.semanticFamilyId, first.semanticFamilyId);
  assert.equal(second.state, 'ready');

  const base = { scope: s.scope, sessionId: 'syn_session', epoch: 1, turnId: 'syn_turn_x', compatibleKnowledgeManifestId: s.seeded.manifest.id, topicId: qr(s).topicId };
  const held = s.q.reserve({ ...base, preferredQuestionId: first.id, purpose: 'probe' });
  assert.equal(held.question.id, first.id);
  s.q.markDelivered(s.scope, { reservationId: held.reservation.id, deliveryEventIds: ['syn_d1'], extent: 'complete' });
  s.q.recordExposure(s.scope, { questionId: first.id, sessionId: 'syn_session', turnId: 'syn_turn_x', kind: 'answer_delivered', deliveryEventIds: ['syn_d2'] });

  const novel = (() => { try { return s.q.reserve({ ...base, preferredQuestionId: second.id, purpose: 'transfer' }); } catch (e) { return e; } })();
  assert.ok(novel.code === 'content_not_ready' || novel.question.semanticFamilyId !== first.semanticFamilyId);
  if (novel.reservation) s.q.release(s.scope, novel.reservation.id, { sessionEpoch: 1 });
  assert.equal(s.q.get(s.scope, second.id).state, 'ready');

  assert.throws(() => s.q.reserve({ ...base, preferredQuestionId: second.id, purpose: 'revisit', allowExposedForRevisit: true }), e => e.code === 'invalid_input');
  const revisit = s.q.reserve({ ...base, preferredQuestionId: second.id, purpose: 'revisit', allowExposedForRevisit: true, revisitReason: 'Consolidate the notation after the worked answer.' });
  assert.equal(revisit.question.id, second.id);
  assert.deepEqual(revisit.reservation.revisit, { reason: 'Consolidate the notation after the worked answer.' });

  // A fresh generation is told about exposed families and never reproduces one as new.
  const third = s.q.get(s.scope, (await custom(s)).status.questionId);
  assert.notEqual(third.semanticFamilyId, first.semanticFamilyId);
});

test('generation timeout: request fails with a structured error and nothing becomes ready', async () => {
  const s = await setup();
  s.controls.questionGenerator = { timeout: true };
  const { generationRequestId } = s.q.requestCustom(s.scope, { topicId: qr(s).topicId, narrowTarget: NARROW, sessionId: 'syn_session', turnId: 'syn_turn_t' });
  await s.app.drain();
  assert.notEqual(s.q.customStatus(s.scope, generationRequestId).state, 'ready');
  for (let i = 0; i < 6; i++) { s.app.clock.advance(60_000); await s.app.drain(); }
  const status = s.q.customStatus(s.scope, generationRequestId);
  assert.equal(status.state, 'failed');
  assert.equal(status.error.code, 'provider_timeout');
  assert.equal(status.questionId, null);
  assert.equal(s.app.db.find('question_records', { generationRequestId }, { scope: s.scope }).length, 0);
  // The tutor remains free: existing validated questions are still available and reservable.
  assert.ok(s.q.available(s.scope, { knowledgeManifestId: s.seeded.manifest.id, topicIds: [qr(s).topicId] }).length > 0);
});

test('validator rejection retries within budget, then fails without fabricating readiness', async () => {
  const s = await setup();
  s.controls.questionGenerator = { invalidAnswer: true };
  const { generationRequestId } = s.q.requestCustom(s.scope, { topicId: qr(s).topicId, narrowTarget: NARROW, sessionId: 'syn_session', turnId: 'syn_turn_v' });
  for (let i = 0; i < 6; i++) { await s.app.drain(); s.app.clock.advance(60_000); }
  const status = s.q.customStatus(s.scope, generationRequestId);
  assert.equal(status.state, 'failed');
  const candidates = s.app.db.find('question_records', { generationRequestId }, { scope: s.scope });
  assert.equal(candidates.length, s.app.config.providerRetriesPerJob, 'one candidate per attempt, kept for audit');
  assert.ok(candidates.every(q => q.state === 'failed' && q.failure.code === 'quality_gate'));
});

test('spoken-question integrity: approved wording passes; changed numbers or dropped conditions are drift', async () => {
  const s = await setup();
  const question = s.q.get(s.scope, (await custom(s)).status.questionId);
  assert.equal(s.q.checkRendering(s.scope, question.id, question.voiceForm).compatible, true);
  const changed = question.voiceForm.replace('(3, 4)', '(4, 4)');
  assert.deepEqual([s.q.checkRendering(s.scope, question.id, changed).compatible, s.q.checkRendering(s.scope, question.id, changed).drift], [false, true]);
  const wordy = question.voiceForm.replace('3', 'three').replace('4', 'four');
  assert.equal(s.q.checkRendering(s.scope, question.id, wordy.replace('four', 'five')).drift, true);
  const paraphrase = `Here is a question for you. ${question.voiceForm}`;
  assert.equal(s.q.checkRendering(s.scope, question.id, paraphrase).drift, false);
  assert.equal(s.q.checkRendering(s.scope, question.id, paraphrase).compatible, false, 'unvalidated paraphrase is not yet approved');
  const validated = await s.q.validateRendering(s.scope, question.id, paraphrase);
  assert.equal(validated.compatible, true);
  assert.equal(s.q.checkRendering(s.scope, question.id, paraphrase).renderingId, validated.renderingId);
});

test('an unchanged question stays usable under a new compatible manifest without rewriting its references', async () => {
  const s = await setup();
  const ready = s.app.db.find('question_records', { topicId: qr(s).topicId, state: 'ready' }, { scope: s.scope })[0];
  const k1 = s.seeded.manifest;
  const k2 = { ...k1, id: newId('km'), version: 2, parentManifestId: k1.id, publishedAt: s.app.clock.iso() };
  s.app.db.tx(() => {
    s.app.db.insert('knowledge_manifests', k2);
    const exam = s.app.db.get('exams', s.exam.id);
    s.app.db.update('exams', { ...exam, publishedKnowledgeManifestId: k2.id });
    s.app.events.emit({ scope: s.scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: s.exam.id, payload: { examId: s.exam.id, oldManifestId: k1.id, newManifestId: k2.id, migrationIds: [], changedDependencyRefs: [], topicIds: Object.values(s.seeded.ids).map(x => x.topicId), objectiveVersionIds: k1.objectiveVersionIds, incompatibleTopicIds: [] } });
  });
  await s.app.drain();
  const after = s.q.get(s.scope, ready.id);
  assert.equal(after.state, 'ready');
  assert.equal(after.knowledgeManifestId, k1.id, 'original reference preserved');
  assert.deepEqual(after.compatibleManifestIds, [k2.id]);
  const { question } = s.q.reserve({ scope: s.scope, sessionId: 'syn_s', epoch: 1, turnId: 'syn_t', compatibleKnowledgeManifestId: k2.id, topicId: qr(s).topicId, preferredQuestionId: ready.id });
  assert.equal(question.id, ready.id);
});

test('personal revision invalidates only profile-dependent questions whose declared facts changed', async () => {
  const s = await setup();
  const personal = s.q.get(s.scope, (await custom(s)).status.questionId);
  const generic = s.app.db.find('question_records', { origin: 'generic_hopper', state: 'ready' }, { scope: s.scope })[0];
  const profileDep = personal.dependencies.find(d => d.ref.kind === 'profile_snapshot');
  s.app.events.emit({ scope: s.scope, eventType: 'personal.published', aggregateType: 'exam', aggregateId: s.exam.id, payload: { oldPersonalManifestId: null, newPersonalManifestId: 'syn_p2', knowledgeManifestId: s.seeded.manifest.id, affectedTopicIds: [qr(s).topicId], changedRefs: [profileDep.ref] } });
  await s.app.drain();
  assert.equal(s.q.get(s.scope, personal.id).state, 'invalidated');
  assert.equal(s.q.get(s.scope, generic.id).state, 'ready');
});
