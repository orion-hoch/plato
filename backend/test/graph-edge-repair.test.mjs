// A graph checker's finding about one connection repairs that connection instead of blocking the course:
// the edge is dropped from the publication with a recorded issue, the checker's own report is kept for audit,
// and a finding that is not about a connection still blocks (spec §4.2, §5.1).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from './harness.mjs';
import { uploadFile, md, scopeOf } from './acceptance/_knowledge-files.mjs';

const NOTES = '# Projections\n\nThe projection coefficient of a on unit q is qᵀa.\n\n# QR factorization\n\nQR factorization uses Projections: each rᵢⱼ = qᵢᵀaⱼ.';

for (const how of ['by_id', 'by_title']) test(`a connection the checker cannot ground (${how}) is removed and the course publishes`, async () => {
  const { app, learner, createExam, controls } = createTestBackend();
  controls.validator = { edgeFinding: how };
  const exam = createExam({ title: 'Linear algebra' });
  uploadFile(app, learner, exam, { filename: 'notes.md', ...md(NOTES) });
  await app.drain();
  const scope = scopeOf(app, exam);
  const view = app.services.knowledge.published(scope);
  assert.ok(view, 'published despite the edge finding');
  const build = app.db.findOne('revision_builds', { id: view.manifest.buildId });
  const removed = build.issues.find(i => i.code === 'unsupported_edges_removed');
  assert.ok(removed && removed.severity === 'warning' && removed.affected.length >= 1);
  for (const ref of removed.affected) assert.ok(!view.edges.some(e => e.id === ref.id), 'the flagged edge is not in the manifest');
  const reports = app.db.find('validation_reports', { id: build.candidate.graphReportIds }, { scope });
  assert.ok(reports.every(r => r.disposition === 'provisional_allowed' && r.repairOf), 'the manifest cites the repair report');
  assert.equal(app.db.get('validation_reports', reports[0].repairOf).disposition, 'repair_required', 'the checker report is kept');
});

test('a blocking graph finding that is not about one connection still blocks publication', async () => {
  const { app, learner, createExam, controls } = createTestBackend();
  controls.validator = { graph_integrity: 'needs_review' };
  const exam = createExam({ title: 'Linear algebra' });
  uploadFile(app, learner, exam, { filename: 'notes.md', ...md(NOTES) });
  await app.drain();
  assert.equal(app.services.knowledge.published(scopeOf(app, exam)), null);
});

test('topics that share a title are told apart by their parent, and stay unchanged otherwise', async () => {
  const { distinctTitles } = await import('../knowledge/build.mjs');
  const titles = distinctTitles([
    { key: 'memory', title: 'Memory', parentKey: null }, { key: 'calling', title: 'Calling Convention', parentKey: null },
    { key: 'c-stack', title: 'The Stack', parentKey: 'memory' }, { key: 'asm-stack', title: 'The Stack', parentKey: 'calling' },
    { key: 'heap', title: 'The Heap', parentKey: 'memory' },
    { key: 'a', title: 'Loops', parentKey: null }, { key: 'b', title: 'loops', parentKey: null },
  ]);
  assert.equal(titles.get('c-stack'), 'The Stack (Memory)');
  assert.equal(titles.get('asm-stack'), 'The Stack (Calling Convention)');
  assert.equal(titles.get('heap'), 'The Heap');
  assert.equal(titles.get('a'), 'Loops');
  assert.equal(titles.get('b'), 'loops (2)', 'top-level twins are numbered');
  assert.equal(new Set([...titles.values()].map(t => t.toLowerCase())).size, titles.size);
});
