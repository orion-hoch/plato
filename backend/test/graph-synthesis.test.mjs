// Bounded graph synthesis across several partitions (spec §6): merge levels and finalize return small
// decisions, never the graph again; the pipeline carries every partition topic, objective and evidence
// link over to the topic it maps to, and the published manifest still covers every segment.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from './harness.mjs';
import { uploadFile, md, scopeOf } from './acceptance/_knowledge-files.mjs';

const FILES = [
  ['a.md', '# QR factorization\n\nQR factorization writes A = QR with orthonormal columns in Q.'],
  ['b.md', '# Projections\n\nThe projection coefficient of a on unit q is qᵀa.'],
  ['c.md', '# Eigenvalues\n\nAn eigenvector v satisfies Av = λv with v ≠ 0.'],
  ['d.md', '# Determinants\n\ndet(AB) = det(A) det(B).'],
  ['e.md', '# QR decomposition\n\nGram-Schmidt on the columns of A gives A = QR.'],
];

test('graph synthesis across partitions: small merge/finalize outputs, every partition topic carried over, full coverage', async () => {
  // 5 sources, 2 per partition: 3 partitions, merged over two levels (the odd one passes level 1 unmerged).
  const { app, learner, createExam, controls } = createTestBackend({ config: { synthesisPartitionMaxInterpretations: 2 } });
  controls.graph = { sameIdeas: [['qr-factorization', 'qr-decomposition']] }; // a.md and e.md, in different partitions
  const outputs = [];
  const buildOrPatch = app.providers.graphBuilder.buildOrPatch;
  app.providers.graphBuilder.buildOrPatch = async request => { const result = await buildOrPatch(request); outputs.push({ request, value: result.value }); return result; };
  const exam = createExam({ title: 'Linear algebra', instructions: 'Covers Eigenvalues (40%) and the rest of the notes.' });
  for (const [filename, text] of FILES) uploadFile(app, learner, exam, { filename, ...md(text) });
  await app.drain();
  const scope = scopeOf(app, exam);
  const view = app.services.knowledge.published(scope);
  const build = app.db.findOne('revision_builds', { id: view.manifest.buildId });
  const parts = app.db.find('synthesis_partitions', { buildId: build.id }, { scope });
  assert.equal(parts.filter(p => p.level === 0).length, 3);

  // (a) Merge and finalize return decisions only: no objectives or evidence links, a fraction of their input.
  const decisions = outputs.filter(o => o.request.mode !== 'partition');
  assert.equal(decisions.filter(o => o.request.mode === 'merge_partitions').length, 2);
  assert.ok(decisions.some(o => o.request.mode === 'finalize_graph'));
  for (const { request, value } of decisions) {
    assert.ok(!('objectives' in value) && !('evidenceLinks' in value), `${request.mode} re-emitted graph content`);
    assert.ok(JSON.stringify(value).length < JSON.stringify(request.partitionContents).length / 3, `${request.mode} output is small`);
  }

  // (b) Every partition topic survives or maps to its canonical topic, with its objectives and evidence links.
  const canonical = key => key === 'qr-decomposition' ? 'qr-factorization' : key;
  const topicOf = new Map(view.topics.map(t => [app.db.get('topics', t.topicId).stableKey, t.topicId]));
  assert.ok(!topicOf.has('qr-decomposition'), 'the duplicate idea merged into its canonical topic');
  for (const content of parts.filter(p => p.level === 0).map(p => JSON.parse(app.blobs.readText(p.output, scope)))) {
    for (const t of content.topics) assert.ok(topicOf.has(canonical(t.stableKey)), `topic ${t.stableKey} kept`);
    for (const o of content.objectives) assert.ok(view.objectives.some(x => x.topicId === topicOf.get(canonical(o.topicKey)) && x.statement === o.statement), `objective of ${o.topicKey} carried over`);
    for (const l of content.evidenceLinks) assert.ok(view.evidenceLinks.some(x => x.topicId === topicOf.get(canonical(l.topicKey)) && x.sourceAnchorId === l.anchorId), `link ${l.topicKey} → ${l.anchorId} carried over`);
  }
  assert.equal(view.objectives.filter(o => o.topicId === topicOf.get('qr-factorization')).length, 2, 'both QR objectives live under one topic');
  const eigen = view.objectives.find(o => o.topicId === topicOf.get('eigenvalues'));
  assert.equal(eigen.scopeBasis, 'explicit_exam');
  assert.equal(eigen.examWeight.value, 0.4, 'finalize objective edit applied with its exam evidence');

  // (c) Each merged level covers exactly its inputs, and the published manifest covers every segment.
  for (const p of parts.filter(p => p.level > 0)) assert.deepEqual(p.coveredSegmentIds, p.inputPartitionIds.flatMap(id => parts.find(x => x.id === id).coveredSegmentIds));
  const final = parts.find(p => p.id === build.candidate.finalPartitionId);
  assert.deepEqual(new Set(final.coveredSegmentIds), new Set(view.manifest.coverage.flatMap(c => c.interpretedSegmentIds)));
  assert.equal(view.manifest.coverageStatus, 'complete');
  assert.equal(view.manifest.coverage.length, FILES.length);
});
