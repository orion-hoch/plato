// A16 — Worker crash and atomic publication (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { AppError } from '../../core/errors.mjs';
import { uploadFile, md, runUntil, scopeOf } from './_knowledge-files.mjs';

const NOTES = '# Projections\n\nThe projection coefficient of a on unit q is qᵀa.\n\n# QR factorization\n\nQR uses Projections: rᵢⱼ = qᵢᵀaⱼ.';

test('A16: a crash after persisting artifacts but before acknowledgment is deduplicated on retry', async () => {
  const { app, learner, createExam, clock } = createTestBackend();
  const exam = createExam();
  const scope = scopeOf(app, exam);
  for (const type of ['extract_source', 'interpret_source']) {
    const spec = app.jobs.handlers.get(type), original = spec.handler;
    let crashed = false;
    spec.handler = async (payload, ctx) => {
      const result = await original(payload, ctx);
      if (!crashed) { crashed = true; throw new AppError('provider_timeout', `worker died after ${type} persisted`); }
      return result;
    };
  }
  let published = 0;
  app.events.subscribe('a16-counter', 'knowledge.published', () => { published++; });
  const up = uploadFile(app, learner, exam, { filename: 'notes.md', ...md(NOTES) });
  for (let i = 0; i < 4; i++) { await app.drain(); clock.advance(120_000); }

  assert.equal(app.db.find('extraction_artifacts', { sourceVersionId: up.finalized.sourceVersionId }, { scope }).length, 1);
  assert.equal(app.db.find('jobs', { type: 'interpret_source' }).length, 1);
  assert.equal(app.db.find('base_interpretations', { sourceVersionId: up.finalized.sourceVersionId, kind: 'segment' }, { scope }).length, app.db.find('source_segments', { sourceVersionId: up.finalized.sourceVersionId }, { scope }).length);
  assert.equal(app.db.find('knowledge_manifests', {}, { scope }).length, 1);
  assert.equal(published, 1, 'outbox delivered the publication logically once');
});

test('A16: an outbox consumer failure delivers later, once', async () => {
  const { app, learner, createExam, clock } = createTestBackend();
  const exam = createExam();
  let attempts = 0, applied = 0;
  app.events.subscribe('a16-flaky', 'knowledge.published', () => { attempts++; if (attempts === 1) throw new Error('consumer crashed before receipt'); applied++; });
  uploadFile(app, learner, exam, { filename: 'notes.md', ...md(NOTES) });
  await app.drain();
  clock.advance(10_000);
  await app.drain();
  app.events.dispatch();
  assert.equal(attempts, 2);
  assert.equal(applied, 1);
});

test('A16: a missing or corrupted artifact blocks publication; the prior manifest stays usable', async () => {
  const { app, learner, createExam } = createTestBackend();
  const exam = createExam();
  const scope = scopeOf(app, exam);
  uploadFile(app, learner, exam, { filename: 'a.md', ...md(NOTES) });
  await app.drain();
  const k1 = app.services.knowledge.published(scope);
  uploadFile(app, learner, exam, { filename: 'b.md', ...md('# Eigenvalues\n\nAv = λv with v ≠ 0.') });
  const build = () => app.db.findOne('revision_builds', { examId: exam.id, generation: 2 });
  await runUntil(app, () => app.db.find('jobs', { type: 'publish_knowledge' }).some(j => j.payload.buildId === build().id && j.state === 'queued'));
  // Corrupt the stored checksum of one interpretation's explanation artifact.
  const interp = app.db.find('base_interpretations', { id: build().candidate.interpretationIds }, { scope }).find(i => app.db.get('source_files', app.db.get('source_versions', i.sourceVersionId).sourceFileId).filename === 'b.md');
  app.db.prepare("UPDATE blobs SET sha256 = 'c1:sha256:0000', data = json_set(data, '$.sha256', 'c1:sha256:0000') WHERE id = ?").run(interp.explanation.blobId);
  await app.drain();
  assert.equal(build().state, 'needs_review');
  assert.ok(build().issues.some(i => i.code === 'missing_artifact'));
  assert.equal(app.db.get('exams', exam.id).publishedKnowledgeManifestId, k1.manifest.id);
  assert.ok(app.services.knowledge.retrieve(scope, k1.manifest.id, { topicIds: k1.topics.map(t => t.topicId), objectiveVersionIds: [], anchorIds: [], query: null, relationTypes: [], reason: 'still usable', maxTokens: 2000 }).excerpts.length > 0);
});

test('A16: an unvalidated interpretation cannot publish', async () => {
  const { app, learner, createExam, controls } = createTestBackend();
  controls.validator = { source_fidelity: 'needs_review' };
  const exam = createExam();
  uploadFile(app, learner, exam, { filename: 'a.md', ...md(NOTES) });
  await app.drain();
  assert.equal(app.db.get('exams', exam.id).publishedKnowledgeManifestId, null);
  const status = app.services.knowledge.status(learner, exam.id);
  assert.equal(status.status, 'needs_review');
  assert.equal(status.files[0].status, 'needs_review');
  assert.equal(app.services.knowledge.buildStatus(scopeOf(app, exam)).at(-1).state, 'failed');
});

test('A16: a stale lease holder cannot publish over the new owner', async () => {
  const { app, learner, createExam, clock } = createTestBackend();
  const exam = createExam();
  const scope = scopeOf(app, exam);
  const spec = app.jobs.handlers.get('publish_knowledge'), original = spec.handler;
  let stolen = false;
  spec.handler = async (payload, ctx) => {
    if (!stolen) { stolen = true; clock.advance(app.config.jobLeaseMs + 1); assert.ok(app.jobs.claim(), 'another worker reclaimed the expired lease'); }
    return original(payload, ctx);
  };
  uploadFile(app, learner, exam, { filename: 'a.md', ...md(NOTES) });
  await app.drain();
  assert.equal(app.db.find('knowledge_manifests', {}, { scope }).length, 0, 'the stale holder committed nothing');
  assert.equal(app.db.find('events', { eventType: 'knowledge.published' }).length, 0);
});

test('A16: exhausted attempts end visibly in needs-review, never stuck building', async () => {
  const { app, learner, createExam, controls, clock } = createTestBackend();
  controls.interpreter = { fail: true };
  const exam = createExam();
  uploadFile(app, learner, exam, { filename: 'a.md', ...md(NOTES) });
  for (let i = 0; i < 5; i++) { await app.drain(); clock.advance(120_000); }
  const status = app.services.knowledge.status(learner, exam.id);
  assert.equal(status.files[0].status, 'needs_review');
  assert.equal(status.pendingBuild, false);
  assert.equal(status.status, 'needs_review');

  const second = createTestBackend();
  second.controls.graph = { fail: true };
  const exam2 = second.createExam();
  uploadFile(second.app, second.learner, exam2, { filename: 'a.md', ...md(NOTES) });
  for (let i = 0; i < 5; i++) { await second.app.drain(); second.clock.advance(120_000); }
  const job = second.app.db.find('jobs', { type: 'build_graph' })[0];
  assert.ok(['needs_review', 'dead_letter'].includes(job.state), job.state);
  assert.equal(job.attempt, job.maxAttempts);
  assert.equal(second.app.services.knowledge.buildStatus(scopeOf(second.app, exam2)).at(-1).state, 'needs_review');
  assert.equal(second.app.services.knowledge.status(second.learner, exam2.id).pendingBuild, false);
});
