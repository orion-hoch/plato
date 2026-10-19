// A13 — Unknown mastery, nonmonotonic estimate, and provider fallback (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupCourse, addQuestion, answer, settle, hint } from './learner-kit.mjs';

const RIGHT = 'it is the dot product, the coefficient of a2 along q1';

test('A13: unknown is null not zero; independent evidence raises, later contradiction lowers', async () => {
  const t = await setupCourse();
  const L = t.app.services.learner;
  const p0 = L.projection(t.scope, t.ids.eigen.topicId);
  assert.deepEqual([p0.estimate.status, p0.estimate.displayIndex, p0.estimate.ordinal, p0.estimate.distribution], ['unknown', null, null, null]);

  answer(t, addQuestion(t), RIGHT);
  await settle(t);
  const up = L.projection(t.scope, t.ids.qr.topicId).estimate.displayIndex;
  answer(t, addQuestion(t), 'it is the length of a2');
  await settle(t);
  const down = L.projection(t.scope, t.ids.qr.topicId).estimate.displayIndex;
  assert.ok(up > 35 && down < up, `nonmonotonic: ${up} then ${down}`);
  const history = L.history(t.scope, t.ids.qr.topicId);
  assert.equal(history.length, 2);
  for (const h of history) assert.ok(h.estimate.displayIndex >= 0 && h.estimate.displayIndex <= 100);
  for (const a of L.assessments(t.scope, t.ids.qr.topicId)) assert.equal(a.assessmentPolicyVersion, 'v1_engineering');
});

test('A13: an answer after a delivered hint stays assisted even if the model says independent', async () => {
  const t = await setupCourse();
  answer(t, addQuestion(t), RIGHT, { assistance: [hint('Transpose turns that column into a row.')] });
  await settle(t);
  const applied = t.app.services.learner.assessments(t.scope, t.ids.qr.topicId).find(a => a.disposition === 'applied');
  assert.ok(applied.findings.every(f => f.assistanceLevel === 'assisted'));
  assert.ok(t.app.services.learner.projection(t.scope, t.ids.qr.topicId).estimate.displayIndex < 35 + 16, 'smaller gain than independent');
});

test('A13: ambiguous or undelivered prompts never lower the estimate', async () => {
  const t = await setupCourse();
  answer(t, addQuestion(t), 'it is the length of a2', { evidenceStatus: 'ambiguous' });
  answer(t, addQuestion(t), 'it is the length of a2', { evidenceStatus: 'delivery_uncertain' });
  await settle(t);
  const p = t.app.services.learner.projection(t.scope, t.ids.qr.topicId);
  assert.equal(p.estimate.status, 'unknown');
  assert.equal(t.app.services.learner.history(t.scope, t.ids.qr.topicId).length, 0);
});

test('A13: a failed grade keeps the previous estimate; a failed learner assessor only records a failed attempt', async () => {
  const t = await setupCourse({ controls: { learnerAssessor: {} } });
  const L = t.app.services.learner;
  answer(t, addQuestion(t), RIGHT);
  await settle(t);
  const before = L.projection(t.scope, t.ids.qr.topicId);
  t.controls.learnerAssessor.fail = 'unavailable';
  answer(t, addQuestion(t), 'it is the length of a2');
  await settle(t, 8);
  // v10: the estimate is the learner model's, from the graded answer; the assessor no longer sets it.
  const after = L.projection(t.scope, t.ids.qr.topicId);
  assert.equal(after.projectionVersion, before.projectionVersion + 1);
  assert.ok(after.estimate.displayIndex < before.estimate.displayIndex);
  const failed = L.assessments(t.scope, t.ids.qr.topicId).filter(a => a.disposition === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(L.history(t.scope, t.ids.qr.topicId).length, 2);

  // Local stage failure: no grade, no movement.
  t.controls.learnerAssessor.fail = undefined;
  t.controls.localAssessor = { fail: 'timeout' };
  answer(t, addQuestion(t), RIGHT);
  await settle(t, 8);
  assert.ok(t.app.db.find('local_answer_assessments', {}, { scope: t.scope }).some(l => l.disposition === 'failed'));
  assert.equal(L.projection(t.scope, t.ids.qr.topicId).projectionVersion, after.projectionVersion);
});
