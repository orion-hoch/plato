// A02 — Unsupported format and uncertain formula (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { makePdf, uploadFile, scopeOf } from './_knowledge-files.mjs';

const scanned = () => makePdf(['# Projections\nThe projection of a onto unit q is (qᵀa)q.', null]);

test('A02: unsupported binaries fail visibly; an unreadable formula stays uncertain and is never invented', async () => {
  const { app, learner, createExam, controls } = createTestBackend();
  controls.extractor = { failFormula: true };
  const exam = createExam();
  const scope = scopeOf(app, exam);

  const binary = uploadFile(app, learner, exam, { filename: 'data.bin', mime: 'application/octet-stream', bytes: Buffer.from([0, 1, 2, 3]) });
  assert.equal(binary.status, 'failed');
  // Declared PDF but not PDF bytes: rejected at finalize after sniffing the real type.
  const fake = uploadFile(app, learner, exam, { filename: 'fake.pdf', mime: 'application/pdf', bytes: Buffer.from([0x00, 0xff, 0x13, 0x37, 0x42]) });
  assert.equal(fake.finalized.status, 'failed');
  const pdf = uploadFile(app, learner, exam, { filename: 'scan.pdf', mime: 'application/pdf', bytes: scanned() });
  await app.drain();

  const status = app.services.knowledge.status(learner, exam.id);
  const byName = name => status.files.find(f => f.filename === name);
  assert.equal(byName('data.bin').status, 'failed');
  assert.equal(byName('data.bin').error.code, 'unsupported_format');
  assert.equal(byName('fake.pdf').error.code, 'unsupported_format');
  assert.equal(byName('scan.pdf').status, 'needs_review');

  // L1: the scanned page is an explicit UNCERTAIN region with original evidence, escalated, not filled in.
  const artifact = app.db.find('extraction_artifacts', { sourceVersionId: pdf.finalized.sourceVersionId }, { scope })[0];
  assert.equal(artifact.status, 'partial');
  const uncertain = artifact.regions.filter(r => r.disposition !== 'faithful');
  assert.equal(uncertain.length, 1);
  assert.equal(uncertain[0].kind, 'formula');
  assert.equal(uncertain[0].extractedText, null);
  assert.ok(uncertain[0].originalEvidence.sha256);
  const markdown = app.blobs.readText(artifact.markdown, scope);
  const anchor = app.db.get('source_anchors', uncertain[0].anchorId, scope);
  assert.match(markdown, new RegExp(`\\[UNCERTAIN: [^\\]]+; anchor=${anchor.anchorKey}\\]`));
  assert.ok(artifact.escalation.some(e => e.requiredCapability === 'formula_ocr'));

  // Unaffected material publishes; the uncertain region is listed as excluded, and no claim rests on it.
  const view = app.services.knowledge.published(scope);
  assert.ok(view, 'readable material still publishes');
  assert.equal(view.manifest.coverageStatus, 'partial');
  const entry = view.manifest.coverage.find(c => c.sourceVersionId === pdf.finalized.sourceVersionId);
  assert.ok(entry.excluded.some(e => e.anchorIds.includes(anchor.id) && e.disposition === 'needs_review'));
  for (const i of view.interpretations) for (const c of [...i.claims, ...i.examples]) {
    if (c.evidence.some(e => e.id === anchor.id)) assert.equal(c.support, 'provisional');
  }
  assert.ok(!view.evidenceLinks.some(l => l.sourceAnchorId === anchor.id));
  const excerpts = app.services.knowledge.retrieve(scope, view.manifest.id, { topicIds: view.topics.map(t => t.topicId), objectiveVersionIds: [], anchorIds: [anchor.id], query: 'projection', relationTypes: [], reason: 'test', maxTokens: 5000 }).excerpts;
  assert.ok(!excerpts.some(e => e.anchorId === anchor.id), 'uncertain region is never served as text evidence');
});

test('A02: a model-assisted reading resolves the region and is tagged model-derived; no extractor means needs-review', async () => {
  const withReading = createTestBackend();
  withReading.controls.extractor = { readings: { 'scan.pdf': 'rᵢⱼ = qᵢᵀaⱼ' } };
  const exam = withReading.createExam();
  const up = uploadFile(withReading.app, withReading.learner, exam, { filename: 'scan.pdf', mime: 'application/pdf', bytes: scanned() });
  await withReading.app.drain();
  const scope = scopeOf(withReading.app, exam);
  const artifact = withReading.app.db.find('extraction_artifacts', { sourceVersionId: up.finalized.sourceVersionId }, { scope })[0];
  assert.equal(artifact.status, 'valid');
  assert.match(withReading.app.blobs.readText(artifact.markdown, scope), /model-derived/);
  assert.equal(withReading.app.db.find('source_anchors', { sourceVersionId: up.finalized.sourceVersionId }, { scope }).find(a => a.location.page === 2).origin, 'model');

  const none = createTestBackend();
  none.controls.extractor = { unavailable: true };
  const exam2 = none.createExam();
  const up2 = uploadFile(none.app, none.learner, exam2, { filename: 'scan.pdf', mime: 'application/pdf', bytes: scanned() });
  for (let i = 0; i < 4; i++) { await none.app.drain(); none.clock.advance(120_000); }
  const artifact2 = none.app.db.find('extraction_artifacts', { sourceVersionId: up2.finalized.sourceVersionId }, { scope: scopeOf(none.app, exam2) })[0];
  assert.equal(artifact2.status, 'partial');
  assert.ok(artifact2.issues.some(i => i.resolution === 'needs_review'));
});
