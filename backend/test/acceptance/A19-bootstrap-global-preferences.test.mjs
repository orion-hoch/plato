// A19 — Bootstrap, global preferences, and profile head races (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { seedPublishedKnowledge } from '../fixtures.mjs';
import { settle } from './learner-kit.mjs';

test('A19: first exam bootstraps explicit empty snapshots and no fabricated content', async () => {
  const t = createTestBackend();
  const exam = t.createExam({ title: 'First' });
  const L = t.app.services.learner;
  const { snapshot, learnerSnapshot } = L.profile(exam.scope);
  assert.equal(snapshot.version, 0);
  assert.deepEqual(snapshot.facts, []);
  assert.equal(learnerSnapshot.version, 0);
  assert.equal(exam.currentProfileSnapshotId, snapshot.id);
  assert.equal(t.app.services.knowledge.published(exam.scope), null);
  assert.equal(L.projections(exam.scope).size, 0);
  assert.equal(L.contextRef(exam.scope, []).emptyProfile, true);
});

test('A19: a setup preference reaches the first personal view and the context every interpreter receives', async () => {
  const t = createTestBackend();
  const exam = t.createExam({ title: 'QR', goals: ['pass the final'], preferences: [{ key: 'examples_first', value: true, applicability: 'exam' }] });
  const L = t.app.services.learner;
  const facts = L.selectedFacts(exam.scope);
  assert.ok(facts.some(f => f.key === 'examples_first' && f.origin === 'explicit_user'));
  assert.ok(facts.some(f => f.kind === 'goal'));
  assert.equal(L.contextRef(exam.scope, []).emptyProfile, false);
  const { manifest } = seedPublishedKnowledge(t.app, exam);
  await settle({ app: t.app });
  const view = L.personalView(exam.scope, manifest.id);
  assert.ok(view.manifest, 'first personal manifest published without any session');
  assert.equal(view.manifest.version, 1);
  assert.ok(view.manifest.learnerContext.selectedFactIds.length >= 2);
});

test('A19: a learner-wide preference reaches every exam of that learner and no one else', async () => {
  const t = createTestBackend({ controls: { personalReviser: { mode: 'noop' } } });
  const L = t.app.services.learner;
  const published = t.createExam({ title: 'Published' });
  const pendingExam = t.createExam({ title: 'No material yet' });
  const other = t.app.auth.createPrincipal({ tenantId: t.learner.tenantId });
  const otherExam = t.createExam({ title: 'Other learner' }, other);
  const { manifest } = seedPublishedKnowledge(t.app, published);
  await settle({ app: t.app });
  const otherBefore = L.profile(otherExam.scope).snapshot;

  const r = L.recordFeedback(published.scope, { text: 'please go slower', type: 'preference', topicIds: [], applicability: 'learner' });
  assert.equal(r.fanOut, true);
  await settle({ app: t.app });

  for (const e of [published, pendingExam]) assert.ok(L.profile(e.scope).snapshot.facts.some(f => f.key === 'pace' && f.applicability.level === 'learner'));
  assert.equal(L.profile(otherExam.scope).snapshot.id, otherBefore.id, 'another learner is untouched');

  const decidedChange = L.changes(published.scope).find(c => c.kind === 'preference_change');
  assert.equal(decidedChange.status, 'decided');
  const decision = L.decisions(published.scope).find(d => d.id === decidedChange.decisionId);
  assert.equal(decision.inspection.targeted.length, t.app.services.knowledge.view(published.scope, manifest.id).topics.length, 'exam-wide change inspects every topic');

  // No base yet: the change waits explicitly, then is decided after the first publication.
  const waiting = L.changes(pendingExam.scope).find(c => c.kind === 'preference_change');
  assert.notEqual(waiting.status, 'decided');
  assert.equal(t.app.db.get('personal_batches', waiting.batchId).state, 'waiting_for_base');
  seedPublishedKnowledge(t.app, t.app.db.get('exams', pendingExam.id));
  await settle({ app: t.app });
  assert.equal(t.app.db.get('learner_changes', waiting.id).status, 'decided');

  // A later exam resolves the current head at bootstrap.
  const later = t.createExam({ title: 'Later' });
  assert.ok(L.profile(later.scope).snapshot.facts.some(f => f.key === 'pace'));
});

test('A19: concurrent learner profile updates use head CAS and keep both facts', async () => {
  const t = createTestBackend();
  const exam = t.createExam({ title: 'X' });
  const L = t.app.services.learner;
  let raced = false;
  t.app.learnerRaceHook = kind => {
    if (kind !== 'learner' || raced) return;
    raced = true;
    // Another request commits first while this one holds a stale head.
    L.recordFeedback(exam.scope, { text: 'I like examples first', type: 'preference', topicIds: [], applicability: 'learner' });
  };
  L.recordFeedback(exam.scope, { text: 'please go slower', type: 'preference', topicIds: [], applicability: 'learner' });
  const facts = L.profile(exam.scope).learnerSnapshot.facts.filter(f => f.status === 'active');
  assert.deepEqual(facts.map(f => f.key).sort(), ['examples_first', 'pace']);
});
