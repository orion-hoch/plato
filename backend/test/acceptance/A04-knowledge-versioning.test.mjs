// A04 (knowledge side) — K1 keeps serving while K2 builds; stale generations cannot publish;
// historical anchors stay resolvable; replacements invalidate dependents traceably (spec §13, §6).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { uploadFile, md, runUntil, scopeOf } from './_knowledge-files.mjs';

const V1 = '# Projections\n\nThe projection coefficient of a on unit q is qᵀa.';
const V2 = '# Projections\n\nThe projection of a onto a unit vector q is (qᵀa)q; the coefficient is qᵀa.\n\n# Residuals\n\nThe residual a − (qᵀa)q is orthogonal to q.';

test('A04-knowledge: K1 serves during a K2 build; a late older generation cannot replace a newer one', async () => {
  const { app, learner, createExam } = createTestBackend();
  const exam = createExam();
  const scope = scopeOf(app, exam);
  const K = app.services.knowledge;
  const a = uploadFile(app, learner, exam, { filename: 'a.md', ...md(V1) });
  await app.drain();
  const k1 = K.published(scope);
  const k1Anchor = k1.evidenceLinks[0].sourceAnchorId;

  // Generation 2 starts; run it until its publication is queued, but not executed.
  uploadFile(app, learner, exam, { filename: 'b.md', ...md('# Eigenvalues\n\nAv = λv with v ≠ 0.') });
  const gen2 = () => app.db.findOne('revision_builds', { examId: exam.id, generation: 2 });
  await runUntil(app, () => app.db.find('jobs', { type: 'publish_knowledge' }).some(j => j.payload.buildId === gen2().id));
  assert.equal(K.published(scope).manifest.id, k1.manifest.id, 'K1 still served while K2 is pending');
  assert.equal(K.status(learner, exam.id).pendingBuild, true);

  // Generation 3 arrives before generation 2 publishes.
  uploadFile(app, learner, exam, { filename: 'c.md', ...md('# Determinants\n\ndet(AB) = det(A) det(B).') });
  await app.drain();
  assert.equal(gen2().state, 'stale');
  const k2 = K.published(scope);
  assert.notEqual(k2.manifest.id, k1.manifest.id);
  assert.equal(app.db.findOne('revision_builds', { id: k2.manifest.buildId }).generation, 3);
  assert.equal(app.db.find('knowledge_manifests', {}, { scope }).length, 2, 'only K1 and the generation-3 manifest were published');

  // Historical K1 stays loadable with resolvable anchors.
  assert.equal(K.view(scope, k1.manifest.id).manifest.id, k1.manifest.id);
  assert.match(K.anchors(scope, [k1Anchor])[0].excerpt, /projection coefficient/);

  // Replacing a.md is a new SourceVersion; old anchors keep old text, dependents are reported.
  const replaced = uploadFile(app, learner, exam, { filename: 'a.md', ...md(V2), replacingSourceFileId: a.sourceFileId });
  await app.drain();
  const k3 = K.published(scope);
  const event = app.db.find('events', { eventType: 'knowledge.published' }).find(e => e.payload.newManifestId === k3.manifest.id);
  assert.ok(event.payload.changedDependencyRefs.some(r => r.kind === 'source_version' && r.id === a.finalized.sourceVersionId));
  assert.ok(event.payload.changedDependencyRefs.some(r => r.kind === 'base_interpretation'));
  assert.ok(event.payload.incompatibleTopicIds.length >= 1, 'topics grounded in the replaced version are flagged');
  assert.equal(app.db.get('source_versions', replaced.finalized.sourceVersionId).replacesSourceVersionId, a.finalized.sourceVersionId);
  assert.match(K.anchors(scope, [k1Anchor])[0].excerpt, /projection coefficient of a on unit q/, 'old anchor meaning unchanged');
  assert.ok(!k3.manifest.sourceVersionIds.includes(a.finalized.sourceVersionId));

  // Unchanged sources were reused by reference, not reinterpreted.
  const bInterps = app.db.find('base_interpretations', { kind: 'source' }, { scope }).filter(i => app.db.get('source_files', app.db.get('source_versions', i.sourceVersionId).sourceFileId).filename === 'b.md');
  assert.equal(new Set(bInterps.map(i => i.extractionArtifactId)).size, 1, 'b.md was extracted and interpreted once');
});

test('A04-knowledge: topic identity survives renames; changed objectives version with a migration', async () => {
  const { app, learner, createExam, controls } = createTestBackend();
  const exam = createExam();
  const scope = scopeOf(app, exam);
  uploadFile(app, learner, exam, { filename: 'a.md', ...md(V1) });
  await app.drain();
  const k1 = app.services.knowledge.published(scope);
  const projections = k1.topics.find(t => t.title === 'Projections');
  controls.graph = { objectiveStatements: { projections: 'Construct an orthogonal projection and interpret its coefficient.' } };
  uploadFile(app, learner, exam, { filename: 'b.md', ...md('# Eigenvalues\n\nAv = λv.') });
  await app.drain();
  const k2 = app.services.knowledge.published(scope);
  const again = k2.topics.find(t => t.title === 'Projections');
  assert.equal(again.topicId, projections.topicId, 'stable topic ID');
  const obj1 = k1.objectives.find(o => o.topicId === projections.topicId), obj2 = k2.objectives.find(o => o.topicId === projections.topicId);
  assert.equal(obj2.objectiveId, obj1.objectiveId);
  assert.equal(obj2.version, obj1.version + 1);
  const migration = app.db.find('topic_migrations', { toKnowledgeManifestId: k2.manifest.id }, { scope }).find(m => m.kind === 'objective_meaning_change');
  assert.equal(migration.objectiveMappings[0].comparability, 'not_comparable');
  assert.equal(migration.reassessmentRequired, true);
});
