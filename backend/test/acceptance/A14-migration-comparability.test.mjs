// A14 — Objective migration and comparability (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { newId, hashOf } from '../../core/util.mjs';
import { setupCourse, addQuestion, answer, settle } from './learner-kit.mjs';

/** Publish K2: rename projections, split QR into two topics, change eigen's objective meaning. */
function publishK2(t) {
  const { app, scope, ids } = t;
  const { db, clock } = app;
  const v1 = app.services.knowledge.view(scope, t.manifest.id);
  const at = clock.iso();
  return db.tx(() => {
    const topicVersions = [], objectives = [...v1.objectives.filter(o => o.topicId !== ids.qr.topicId && o.topicId !== ids.eigen.topicId)];
    for (const tv of v1.topics) {
      if (tv.topicId === ids.projections.topicId) { const r = { ...tv, id: newId('topv'), version: 2, title: 'Orthogonal projections', createdAt: at }; db.insert('topic_versions', r); topicVersions.push(r); }
      else if (tv.topicId === ids.eigen.topicId) {
        const old = v1.objectives.find(o => o.topicId === ids.eigen.topicId);
        const changed = { ...old, id: newId('objv'), version: 2, statement: 'Diagonalize a 2×2 matrix using its eigenvectors.', capabilities: ['application', 'transfer'], meaningHash: hashOf('diagonalize'), supersedesId: old.id, createdAt: at };
        db.insert('objective_versions', changed); objectives.push(changed);
        const r = { ...tv, id: newId('topv'), version: 2, objectiveVersionIds: [changed.id], createdAt: at }; db.insert('topic_versions', r); topicVersions.push(r);
      } else if (tv.topicId !== ids.qr.topicId) topicVersions.push(tv);
    }
    const splits = ['qr-notation', 'qr-algorithm'].map(key => {
      const topic = { id: newId('top'), scope, createdAt: at, stableKey: key, retiredAt: null };
      db.insert('topics', topic);
      const objective = { id: newId('objv'), scope, createdAt: at, objectiveId: newId('obj'), version: 1, topicId: topic.id, statement: `${key} objective`, capabilities: ['explanation'], successCriteria: [], sourceEvidence: [], scopeBasis: 'source_coverage', examWeight: null, meaningHash: hashOf(key), supersedesId: null };
      db.insert('objective_versions', objective); objectives.push(objective);
      const tv = { id: newId('topv'), scope, createdAt: at, topicId: topic.id, version: 1, title: key, description: key, parentTopicId: ids['linear-algebra'].topicId, objectiveVersionIds: [objective.id], status: 'active' };
      db.insert('topic_versions', tv); topicVersions.push(tv);
      return { topic, objective };
    });
    const manifestId = newId('km');
    const migration = (kind, from, to, objectiveMappings, reassessmentRequired) => {
      const m = { id: newId('tmig'), scope, createdAt: at, fromKnowledgeManifestId: t.manifest.id, toKnowledgeManifestId: manifestId, kind, fromTopicIds: from, toTopicIds: to, objectiveMappings, reassessmentRequired, evidence: [] };
      db.insert('topic_migrations', m); return m.id;
    };
    const eigenOld = v1.objectives.find(o => o.topicId === ids.eigen.topicId), eigenNew = objectives.find(o => o.supersedesId === eigenOld.id);
    const migrationIds = [
      migration('rename', [ids.projections.topicId], [ids.projections.topicId], [], false),
      migration('split', [ids.qr.topicId], splits.map(s => s.topic.id), splits.map(s => ({ fromObjectiveVersionId: ids.qr.objectiveVersionIds[0], toObjectiveVersionId: s.objective.id, comparability: 'partial', reason: 'split' })), true),
      migration('objective_meaning_change', [ids.eigen.topicId], [ids.eigen.topicId], [{ fromObjectiveVersionId: eigenOld.id, toObjectiveVersionId: eigenNew.id, comparability: 'not_comparable', reason: 'now asks for diagonalization' }], true),
    ];
    const manifest = { ...v1.manifest, id: manifestId, version: 2, parentManifestId: t.manifest.id, buildId: newId('build'), createdAt: at, publishedAt: at, topicVersionIds: topicVersions.map(x => x.id), objectiveVersionIds: objectives.map(o => o.id), topicEvidenceLinkIds: v1.evidenceLinks.filter(l => l.topicId !== ids.qr.topicId).map(l => l.id), contentHash: hashOf(topicVersions.map(x => x.id)) };
    db.insert('knowledge_manifests', manifest);
    const exam = db.get('exams', t.exam.id);
    db.update('exams', { ...exam, publishedKnowledgeManifestId: manifestId });
    app.events.emit({ scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: t.exam.id, aggregateVersion: 2, payload: { examId: t.exam.id, oldManifestId: t.manifest.id, newManifestId: manifestId, migrationIds, changedDependencyRefs: [], topicIds: topicVersions.map(x => x.topicId), objectiveVersionIds: manifest.objectiveVersionIds, incompatibleTopicIds: [ids.qr.topicId] }, idempotencyKey: `knowledge.published:${manifestId}` });
    return { manifest, splits };
  });
}

test('A14: rename keeps identity/history; split and meaning change open new segments and never copy scores', async () => {
  const t = await setupCourse();
  const L = t.app.services.learner;
  const RIGHT = 'it is the dot product, the coefficient of a2 along q1';
  answer(t, addQuestion(t), RIGHT);
  answer(t, addQuestion(t, { topic: 'projections', expectedAnswer: 'the coefficient of a along q', alternatives: [] }), 'the coefficient of a along q');
  answer(t, addQuestion(t, { topic: 'eigen', expectedAnswer: 'a nonzero vector v with Av equals lambda v', alternatives: ['av equals lambda v'] }), 'a nonzero vector with Av equals lambda v');
  await settle(t);
  const projBefore = L.projection(t.scope, t.ids.projections.topicId), qrBefore = L.projection(t.scope, t.ids.qr.topicId), eigenBefore = L.projection(t.scope, t.ids.eigen.topicId);
  const qrHistory = L.history(t.scope, t.ids.qr.topicId), eigenHistory = L.history(t.scope, t.ids.eigen.topicId);
  assert.equal(eigenBefore.estimate.status, 'estimated');

  const { manifest: k2, splits } = publishK2(t);
  await settle(t);

  // Rename: same projection identity, same history, same estimate.
  const projAfter = L.projection(t.scope, t.ids.projections.topicId);
  assert.equal(projAfter.id, projBefore.id);
  assert.deepEqual(projAfter.estimate, projBefore.estimate);
  assert.equal(projAfter.comparabilitySegmentId, projBefore.comparabilitySegmentId);

  // Split: new topics start unknown in their own segments; QR's score is not copied; QR history stays.
  for (const s of splits) {
    const p = L.projection(t.scope, s.topic.id);
    assert.equal(p.estimate.status, 'unknown');
    assert.notEqual(p.comparabilitySegmentId, qrBefore.comparabilitySegmentId);
  }
  assert.deepEqual(L.history(t.scope, t.ids.qr.topicId), qrHistory);

  // Meaning change: a new segment, unknown until reassessed, old points untouched and marked by a transition.
  const eigenAfter = L.projection(t.scope, t.ids.eigen.topicId);
  assert.equal(eigenAfter.estimate.status, 'unknown');
  assert.notEqual(eigenAfter.comparabilitySegmentId, eigenBefore.comparabilitySegmentId);
  const eh = L.history(t.scope, t.ids.eigen.topicId);
  assert.deepEqual(eh.slice(0, eigenHistory.length), eigenHistory);
  assert.equal(eh.at(-1).kind, 'objective_transition');
  assert.equal(eh.at(-1).comparabilitySegmentId, eigenAfter.comparabilitySegmentId);

  // The personal view was rebased onto K2 and no longer carries the retired QR explanation.
  const view = L.personalView(t.scope, k2.id);
  assert.ok(view.manifest, 'compatible personal view for K2');
  assert.equal(view.manifest.knowledgeManifestId, k2.id);
  assert.ok(view.explanations.every(e => !e.topicIds.includes(t.ids.qr.topicId)));
  assert.equal(L.personalView(t.scope, t.manifest.id).pending, true, 'K1 overlay is not served with K2');
});
