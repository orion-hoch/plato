// A17 — Personal no-op, coalescing, and version races (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupCourse, settle } from './learner-kit.mjs';

const feedback = (t, text, topicIds = [t.ids.qr.topicId]) => t.app.services.learner.recordFeedback(t.scope, { text, type: 'material_feedback', topicIds });

test('A17: related changes coalesce into one reconsideration, each with a traceable decision', async () => {
  const requests = [];
  const t = await setupCourse({ controls: { personalReviser: { mode: 'noop', requests } } });
  const before = requests.length;
  const a = feedback(t, 'the QR slide skipped a step');
  const b = feedback(t, 'also the notation on slide 8 is confusing');
  const c = feedback(t, 'and the example uses different letters');
  assert.ok(a.learnerChangeId && b.learnerChangeId && c.learnerChangeId);
  await settle(t);
  assert.equal(requests.length - before, 1, 'one coalesced reviser call');
  const L = t.app.services.learner;
  const decided = [a, b, c].map(x => t.app.db.get('learner_changes', x.learnerChangeId));
  assert.ok(decided.every(x => x.status === 'decided'));
  assert.equal(new Set(decided.map(x => x.decisionId)).size, 1);
  const decision = L.decisions(t.scope).find(d => d.id === decided[0].decisionId);
  assert.equal(decision.disposition, 'noop');
  assert.deepEqual(decision.changeIds.sort(), decided.map(x => x.id).sort());
  assert.ok(decision.reason && decision.evidence.length);
  // Duplicate and acknowledgment feedback is excluded with a reason.
  assert.match(feedback(t, 'the QR slide skipped a step').exclusionReason, /duplicate/);
  assert.match(feedback(t, 'ok thanks').exclusionReason, /acknowledgment/);
});

test('A17: a change arriving during revision stays pending for the next batch; overlays never trigger themselves', async () => {
  let injected = null;
  const t = await setupCourse({ controls: { personalReviser: { mode: 'revise' } } });
  t.controls.personalReviser.during = () => { if (!injected) injected = feedback(t, 'another problem with the QR proof'); };
  feedback(t, 'the QR slide skipped a step');
  await settle(t);
  const L = t.app.services.learner;
  const late = t.app.db.get('learner_changes', injected.learnerChangeId);
  assert.equal(late.status, 'decided');
  const first = L.changes(t.scope)[0];
  assert.notEqual(late.decisionId, first.decisionId, 'decided in its own later batch');
  // Generated material emitted no learner evidence: only the two feedback changes exist.
  assert.equal(L.changes(t.scope).length, 2);
});

test('A17: a candidate built on an obsolete profile cannot overwrite the newer state', async () => {
  let raced = false;
  const t = await setupCourse({ controls: { personalReviser: { mode: 'revise' } } });
  t.controls.personalReviser.during = () => {
    if (raced) return;
    raced = true;
    t.app.services.learner.recordFeedback(t.scope, { text: 'please go slower', type: 'preference', topicIds: [] });
  };
  feedback(t, 'the QR slide skipped a step');
  await settle(t, 6);
  const L = t.app.services.learner;
  const decisions = L.decisions(t.scope);
  const stale = decisions.find(d => d.disposition === 'stale');
  assert.ok(stale, 'stale decision recorded');
  const rejected = t.app.db.get('personal_manifests', stale.outputPersonalManifestId);
  assert.equal(rejected.status, 'rejected', 'obsolete candidate kept for audit');
  assert.notEqual(t.app.db.get('exams', t.exam.id).publishedPersonalManifestId, rejected.id);
  assert.ok(L.changes(t.scope).every(c => c.status === 'decided'), 'every change eventually decided');
});

test('A17: exhausted provider failure leaves changes pending, then reconciliation decides them', async () => {
  const t = await setupCourse({ controls: { personalReviser: { mode: 'fail' } } });
  const r = feedback(t, 'the QR slide skipped a step');
  await settle(t, 8);
  const L = t.app.services.learner;
  assert.equal(t.app.db.get('learner_changes', r.learnerChangeId).status, 'pending');
  assert.ok(L.decisions(t.scope).some(d => d.disposition === 'failed'), 'failure recorded, not a semantic no-op');
  t.controls.personalReviser.mode = 'noop';
  L.reconcile();
  await settle(t);
  assert.equal(t.app.db.get('learner_changes', r.learnerChangeId).status, 'decided');
});
