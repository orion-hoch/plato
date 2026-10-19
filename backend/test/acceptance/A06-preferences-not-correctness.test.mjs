// A06 — Preferences affect teaching, not correctness (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupCourse, addQuestion, answer, settle } from './learner-kit.mjs';

test('A06: identical answers under different profiles get identical correctness findings', async () => {
  const requests = [];
  const plain = await setupCourse({ controls: { localAssessor: { requests } } });
  const styled = await setupCourse({ controls: { localAssessor: { requests } }, examBody: { title: 'Linear algebra', preferences: [{ key: 'examples_first', value: true, applicability: 'exam' }, { key: 'pace', value: 'slow', applicability: 'exam' }] } });
  const text = 'it is the dot product, the coefficient of a2 along q1';
  for (const t of [plain, styled]) { answer(t, addQuestion(t), text); await settle(t); }
  const local = t => t.app.db.find('local_answer_assessments', {}, { scope: t.scope })[0];
  const strip = l => l.findings.map(f => ({ outcome: f.outcome, assistanceLevel: f.assistanceLevel, capability: f.capability }));
  assert.deepEqual(strip(local(plain)), strip(local(styled)));
  assert.equal(local(plain).disposition, local(styled).disposition);
  // The local stage never sees a mastery estimate; profiles differ only in delivery context.
  assert.equal(requests.length, 2);
  for (const r of requests) { assert.equal(r.priorProjection, undefined); assert.ok(!JSON.stringify(Object.keys(r)).includes('projection')); }
  assert.equal(requests[0].learnerContext.emptyProfile, true);
  assert.equal(requests[1].learnerContext.emptyProfile, false);
});

test('A06: liking a style is not mastery; inferred observations can be contradicted without erasing history', async () => {
  const t = await setupCourse({ controls: { learnerAssessor: {} } });
  const L = t.app.services.learner;
  const before = L.projection(t.scope, t.ids.qr.topicId);
  L.recordFeedback(t.scope, { text: 'I like examples first', type: 'preference', topicIds: [t.ids.qr.topicId] });
  await settle(t);
  assert.equal(L.projection(t.scope, t.ids.qr.topicId).projectionVersion, before.projectionVersion, 'a preference never moves mastery');
  assert.ok(L.profile(t.scope).snapshot.facts.some(f => f.key === 'examples_first' && f.origin === 'explicit_user'));

  // An inferred teaching observation from one answer is reviewable and low-confidence, never a trait.
  t.controls.learnerAssessor.profileChanges = { upsert: [{ factId: 'x', applicability: { level: 'learner', examId: null }, kind: 'preference', key: 'examples_improve_performance', value: true, origin: 'inferred', durability: 'until_revoked', evidence: [], counterEvidence: [], status: 'active', confidence: 0.9, validFrom: t.app.clock.iso(), expiresAt: null, supersedesFactId: null }], retractFactIds: [], reason: 'did well after an example' };
  answer(t, addQuestion(t), 'it is the dot product, the coefficient of a2 along q1');
  await settle(t);
  const observed = L.profile(t.scope).snapshot.facts.find(f => f.key === 'examples_improve_performance');
  assert.equal(observed.kind, 'teaching_observation');
  assert.equal(observed.durability, 'reviewable');
  assert.equal(observed.applicability.level, 'exam');
  assert.ok(observed.confidence <= 0.5);
  const snapshotWithFact = L.profile(t.scope).snapshot.id;

  // Later poor performance contradicts it; the older snapshot keeps the original fact.
  t.controls.learnerAssessor.profileChanges = { upsert: [], retractFactIds: [observed.factId], reason: 'performance after examples was poor' };
  answer(t, addQuestion(t), 'it is the length of q1');
  await settle(t);
  const retracted = L.profile(t.scope).snapshot.facts.find(f => f.factId === observed.factId);
  assert.equal(retracted.status, 'retracted');
  assert.ok(retracted.counterEvidence.length);
  assert.equal(t.app.db.get('profile_snapshots', snapshotWithFact).facts.find(f => f.factId === observed.factId).status, 'active');
});

test('A06: a QR notation question that references projections credits only the mapped objective', async () => {
  const requests = [];
  const t = await setupCourse({ controls: { learnerAssessor: { requests } } });
  const L = t.app.services.learner;
  answer(t, addQuestion(t, { contextTopic: 'projections' }), 'it is the dot product, the coefficient of a2 along q1');
  await settle(t);
  assert.equal(L.projection(t.scope, t.ids.qr.topicId).estimate.status, 'estimated');
  const proj = L.projection(t.scope, t.ids.projections.topicId);
  assert.equal(proj.estimate.status, 'unknown');
  assert.equal(proj.projectionVersion, 0, 'context-only topic gets no credit');
  // The broad estimator receives local findings and the versioned prior separately.
  const assess = requests.find(r => r.topicId === t.ids.qr.topicId);
  assert.ok(assess.priorProjection && assess.localAssessments.length);
  assert.ok(assess.localAssessments.every(l => l.findings.every(f => f.topicId === t.ids.qr.topicId)));
});
