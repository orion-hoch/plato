// A05 — Active QR personalization is observable in subsequent retrieval (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setupCourse, addQuestion, answer, settle } from './learner-kit.mjs';

test('A05: notation-not-projection evidence revises the personal view used by the next retrieval', async () => {
  const t = await setupCourse();
  const { app, scope, ids, manifest } = t;
  const L = app.services.learner;

  // First personal view (P1) was bootstrapped from the interpreter's proposal, without any session.
  const p1 = L.personalView(scope, manifest.id);
  assert.equal(p1.manifest.version, 1);
  assert.match(p1.explanations[0].text, /projection from scratch/);
  assert.equal(L.projection(scope, ids.qr.topicId).estimate.status, 'unknown');

  const q = addQuestion(t);
  const evidence = answer(t, q, "I know how to take a projection, but I don't know what that q with the little T means.");
  await settle(t);

  // Assessment: insufficient evidence for QR application, a provisional notation diagnosis with an alternative.
  const qrState = L.topicStates(scope, [ids.qr.topicId])[0];
  const dx = qrState.diagnoses.find(d => /notation/.test(d.statement));
  assert.ok(dx, 'notation diagnosis recorded');
  assert.equal(dx.status, 'provisional');
  assert.ok(dx.alternativeExplanations.length);
  assert.equal(L.projection(scope, ids.qr.topicId).estimate.status, 'unknown', 'self-report does not zero or score QR');

  // A learner change was recorded and decided with a revision.
  const change = L.changes(scope).find(c => c.evidence.some(e => e.id === evidence.id));
  assert.ok(change, 'learner change created from the answer');
  assert.equal(change.status, 'decided');
  const decision = L.decisions(scope).find(d => d.id === change.decisionId);
  assert.equal(decision.disposition, 'revise');
  assert.ok(decision.changeIds.includes(change.id));
  assert.ok(decision.evidence.some(e => e.id === evidence.id), 'decision cites the triggering evidence');
  assert.ok(decision.inspection.targeted.some(x => x.topicId === ids.projections.topicId), 'nearby projection topic inspected');

  // A new personal version was published and adopted by retrieval.
  const p2 = L.personalView(scope, manifest.id);
  assert.equal(p2.manifest.version, 2);
  assert.equal(p2.manifest.parentManifestId, p1.manifest.id);
  assert.equal(p2.manifest.knowledgeManifestId, manifest.id);
  assert.equal(decision.outputPersonalManifestId, p2.manifest.id);
  assert.equal(app.db.get('exams', t.exam.id).publishedPersonalManifestId, p2.manifest.id);
  const revised = p2.explanations.find(e => e.topicIds.includes(ids.qr.topicId));
  assert.match(revised.text, /Start with the notation/);
  assert.match(revised.text, /projection coefficient/);
  assert.ok(!p2.explanations.some(e => /from scratch/.test(e.text)), 'remedial explanation superseded');
  assert.ok(revised.triggerEvidence.some(e => e.id === evidence.id));
  assert.ok(revised.dependencies.some(d => d.relation === 'personalized_for' && d.ref.kind === 'profile_snapshot'));
  assert.ok(revised.validationReportIds.length >= 2, 'grounding + source checks recorded');
  assert.ok(revised.baseEvidence.some(b => /qᵢᵀaⱼ/.test(b.excerpt)), 'retrieved with its base source evidence');
  const edge = p2.edges.find(e => e.type === 'helpful_connection');
  assert.equal(edge.fromTopicId, ids.qr.topicId);
  assert.equal(edge.toTopicId, ids.projections.topicId);
  assert.ok(p2.emphasis.some(x => x.topicId === ids.projections.topicId && x.priority === 'deemphasized'));
  const published = app.db.find('events', { eventType: 'personal.published' });
  assert.ok(published.some(e => e.payload.newPersonalManifestId === p2.manifest.id && e.causationId === null));
});

test('A05: a profile-only prompt change is not enough — every eligible change reaches a decision', async () => {
  const t = await setupCourse({ controls: { personalReviser: { mode: 'noop' } } });
  const q = addQuestion(t);
  answer(t, q, 'it is the dot product, the coefficient along q1');
  await settle(t);
  const L = t.app.services.learner;
  const changes = L.changes(t.scope);
  assert.ok(changes.length >= 1);
  for (const c of changes) {
    assert.equal(c.status, 'decided');
    const d = L.decisions(t.scope).find(x => x.id === c.decisionId);
    assert.equal(d.disposition, 'noop');
    assert.ok(d.reason.length > 10 && d.evidence.length, 'a no-op carries a reason and evidence');
    assert.ok(d.inspection.targeted.length, 'a no-op is never zero-topic without inspection');
  }
});
