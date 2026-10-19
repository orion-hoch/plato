// A01 — Heterogeneous batch and many-to-many grounding (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { makePdf, makePptx, uploadFile, md, spyProviders, scopeOf } from './_knowledge-files.mjs';

const longNotes = () => {
  const parts = ['# Projections', 'The projection of a onto a unit vector q is (qᵀa)q. Example: with q = (1, 0) and a = (3, 4) the projection is (3, 0).', 'Assume q has length one; otherwise divide by qᵀq.'];
  for (let i = 1; i <= 40; i++) parts.push(`Projection note ${i}: the residual a − (qᵀa)q is orthogonal to q, which is why least squares works in case ${i}.`);
  parts.push('# QR factorization', 'QR factorization writes A = QR. It uses Projections: each rᵢⱼ = qᵢᵀaⱼ.', '# Eigenvalues', 'An eigenvector v satisfies Av = λv with v ≠ 0.');
  return parts.join('\n\n');
};

test('A01: heterogeneous batch publishes anchored, many-to-many knowledge with full segment coverage', async () => {
  const { app, learner, createExam } = createTestBackend({ config: { segmentMaxTokens: 250, synthesisPartitionMaxInterpretations: 2 } });
  const calls = spyProviders(app);
  const exam = createExam({ title: 'Linear algebra', preferences: [] });
  const scope = scopeOf(app, exam);

  // No prior session: setup goes straight to uploads; topics are empty and nothing is fabricated.
  assert.equal(app.services.knowledge.published(scope), null);

  const pdf = makePdf(['# QR factorization\nThe Gram-Schmidt process gives A = QR.\nEach rᵢⱼ = qᵢᵀaⱼ is a projection coefficient.', '# Projections\nThe projection coefficient of a on q is qᵀa.']);
  const pptx = await makePptx([{ lines: ['QR factorization', 'Q has orthonormal columns; R is upper triangular.'] }, { lines: ['Projections', 'Project, subtract, normalize.'] }]);
  const notes = longNotes();
  const files = [
    uploadFile(app, learner, exam, { filename: 'lecture7.pdf', mime: 'application/pdf', bytes: pdf }),
    uploadFile(app, learner, exam, { filename: 'slides.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: pptx }),
    uploadFile(app, learner, exam, { filename: 'notes.md', ...md(notes) }),
    uploadFile(app, learner, exam, { filename: 'tool.exe', mime: 'application/x-msdownload', bytes: Buffer.from('MZ binary') }),
  ];
  assert.equal(files[3].status, 'failed');
  await app.drain();

  // Failed member stays visible; the rest publishes.
  const status = app.services.knowledge.status(learner, exam.id);
  assert.equal(status.files.length, 4);
  assert.equal(status.files.find(f => f.filename === 'tool.exe').error.code, 'unsupported_format');
  assert.equal(status.knowledgeVersion, 1);
  assert.equal(status.status, 'ready');

  // Originals retrievable byte-for-byte.
  const versions = app.db.find('source_versions', {}, { scope });
  const pdfVersion = versions.find(v => app.db.get('source_files', v.sourceFileId).filename === 'lecture7.pdf');
  assert.deepEqual(app.blobs.read(pdfVersion.original, scope), pdf);

  // L1 keeps page and slide anchors.
  const anchors = app.db.find('source_anchors', {}, { scope });
  assert.ok(anchors.some(a => a.location.page === 2));
  assert.ok(anchors.some(a => a.location.slide === 2));

  const view = app.services.knowledge.published(scope);
  // L2 goes beyond summaries: derived explanations, examples, assumptions, all grounded.
  const notesInterp = view.interpretations.find(i => app.db.get('source_versions', i.sourceVersionId).sourceFileId === files[2].sourceFileId);
  assert.ok(notesInterp.claims.some(c => c.kind === 'derived_explanation'));
  assert.ok(notesInterp.examples.length > 0);
  assert.ok(notesInterp.assumptions.some(a => /length one/.test(a)));
  const anchorIds = new Set(anchors.map(a => a.id));
  for (const i of view.interpretations) for (const c of i.claims) for (const e of c.evidence) assert.ok(anchorIds.has(e.id));

  // Many-to-many: one QR topic grounded in several files; one file supports several topics.
  const qr = view.topics.find(t => t.title === 'QR factorization');
  const qrLinks = view.evidenceLinks.filter(l => l.topicId === qr.topicId);
  const qrFiles = new Set(qrLinks.map(l => app.db.get('source_versions', app.db.get('source_anchors', l.sourceAnchorId).sourceVersionId).sourceFileId));
  assert.ok(qrFiles.size >= 2, `QR evidence from ${qrFiles.size} files`);
  const notesTopics = new Set(view.evidenceLinks.filter(l => app.db.get('source_versions', app.db.get('source_anchors', l.sourceAnchorId).sourceVersionId).sourceFileId === files[2].sourceFileId).map(l => l.topicId));
  assert.ok(notesTopics.size >= 3);
  assert.ok(view.objectives.length >= 3 && view.objectives.every(o => o.statement && o.capabilities.length));

  // Inputs larger than one segment: every segment covered or explicitly excluded.
  const notesSegments = app.db.find('source_segments', { sourceVersionId: notesInterp.sourceVersionId }, { scope });
  assert.ok(notesSegments.length > 2, `notes split into ${notesSegments.length} segments`);
  for (const entry of view.manifest.coverage) {
    const excluded = new Set(entry.excluded.map(e => e.segmentId).filter(Boolean));
    for (const seg of entry.allSegmentIds) assert.ok(entry.interpretedSegmentIds.includes(seg) || excluded.has(seg));
  }
  assert.equal(view.manifest.coverageStatus, 'complete');

  // Bounded synthesis ran in levels.
  const partitions = app.db.find('synthesis_partitions', { buildId: view.manifest.buildId }, { scope });
  assert.ok(partitions.some(p => p.level >= 1), 'merged partitions exist');

  // Interpreter received an explicit (empty) learner context, even on the first pass.
  const segmentCalls = calls.filter(c => c.method === 'interpret' && c.request.mode === 'segment');
  assert.ok(segmentCalls.length > 0 && segmentCalls.every(c => c.request.learnerContext && c.request.learnerContext.profileSnapshotId));
  assert.ok(segmentCalls.every(c => typeof c.request.learnerContext.emptyProfile === 'boolean'));

  // One publication event, delivered once.
  assert.equal(app.db.find('events', { eventType: 'knowledge.published' }).length, 1);
});
