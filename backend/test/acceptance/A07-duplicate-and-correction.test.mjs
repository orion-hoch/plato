// A07 — Duplicate answer and correction (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupCourse, addQuestion, answer, settle } from './learner-kit.mjs';

const RIGHT = 'it is the dot product, the coefficient of a2 along q1';

test('A07: the same finalized response twice yields one evidence, one applied assessment, one history point', async () => {
  const t = await setupCourse();
  const q = addQuestion(t);
  const a = answer(t, q, RIGHT, { responseId: 'dup_1' });
  const b = answer(t, q, RIGHT, { responseId: 'dup_1' });
  assert.equal(a.id, b.id);
  await settle(t);
  answer(t, q, RIGHT, { responseId: 'dup_1' });
  await settle(t);
  const db = t.app.db;
  assert.equal(db.find('interaction_evidence', { responseId: 'dup_1' }).length, 1);
  assert.equal(db.find('learner_assessments', { disposition: 'applied' }, { scope: t.scope }).length, 1);
  assert.equal(t.app.services.learner.history(t.scope, t.ids.qr.topicId).length, 1);
  assert.throws(() => answer(t, q, 'something else', { responseId: 'dup_1' }), e => e.code === 'idempotency_conflict');
});

test('A07: a transcript correction supersedes without erasing and adjusts the projection once', async () => {
  const t = await setupCourse();
  const L = t.app.services.learner;
  const q = addQuestion(t);
  const original = answer(t, q, 'it is the length of q one', { responseId: 'orig' });
  await settle(t);
  const afterWrong = L.projection(t.scope, t.ids.qr.topicId);
  assert.ok(afterWrong.estimate.displayIndex < 35);

  const corrected = L.supersedeInteraction(t.scope, original.id, { responseId: 'orig_v2', finalizedAnswer: RIGHT });
  assert.equal(corrected.supersedesEvidenceId, original.id);
  await settle(t);
  const db = t.app.db;
  assert.ok(db.get('interaction_evidence', original.id), 'original evidence kept');
  const assessments = db.find('learner_assessments', { disposition: 'applied' }, { scope: t.scope });
  assert.equal(assessments.length, 2);
  const correction = assessments.find(a => a.interactionEvidenceIds.includes(corrected.id));
  assert.equal(correction.supersedesAssessmentId, assessments.find(a => a.interactionEvidenceIds.includes(original.id)).id);
  const history = L.history(t.scope, t.ids.qr.topicId);
  assert.equal(history.length, 2);
  assert.equal(history[1].kind, 'correction');
  assert.equal(history[1].supersedesHistoryPointId, history[0].id);
  assert.equal(L.projection(t.scope, t.ids.qr.topicId).projectionVersion, afterWrong.projectionVersion + 1);
  assert.ok(L.changes(t.scope).some(c => c.kind === 'correction'), 'correction reaches personalization');
});
