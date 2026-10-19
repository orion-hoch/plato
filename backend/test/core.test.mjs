// Foundation: migrations, scope, jobs (lease/retry/idempotency), outbox exactly-once consumers, blobs, exam deletion.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createBackend } from '../app.mjs';
import { createClock } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';

function backend() {
  const app = createBackend({ clock: createClock('2026-10-04T12:00:00Z') });
  // Minimal profile bootstrap until the learner module installs its own.
  if (!app.hooks.examCreated.length) app.hooks.examCreated.push(exam => app.db.update('exams', { ...exam, currentProfileSnapshotId: 'syn_profile_v0' }));
  return app;
}

test('exams are scoped: another learner cannot see or delete them', () => {
  const app = backend();
  const a = app.auth.createPrincipal(), b = app.auth.createPrincipal({ tenantId: a.tenantId });
  const exam = app.services.exams.create(a, { title: 'Linear algebra' });
  assert.equal(app.services.exams.get(a, exam.id).title, 'Linear algebra');
  assert.throws(() => app.services.exams.get(b, exam.id), e => e.code === 'ownership_denied');
  assert.throws(() => app.services.exams.remove(b, exam.id, {}), e => e.code === 'ownership_denied');
});

test('jobs: idempotent enqueue, retry with backoff, dead letter, lease loss cannot commit', async () => {
  const app = backend();
  const p = app.auth.createPrincipal();
  const exam = app.services.exams.create(p, { title: 'X' });
  let calls = 0;
  app.jobs.register('flaky', async () => { calls++; if (calls < 2) throw new AppError('provider_timeout', 'slow'); return { resultRefs: [{ kind: 'x', id: '1', version: null }] }; });
  const scope = { ...exam.scope };
  const j1 = app.jobs.enqueue({ scope, type: 'flaky', idempotencyKey: 'k1', payload: { a: 1 } });
  assert.equal(app.jobs.enqueue({ scope, type: 'flaky', idempotencyKey: 'k1', payload: { a: 1 } }).id, j1.id);
  assert.throws(() => app.jobs.enqueue({ scope, type: 'flaky', idempotencyKey: 'k1', payload: { a: 2 } }), e => e.code === 'idempotency_conflict');
  await app.jobs.runOnce();
  assert.equal(app.db.get('jobs', j1.id).state, 'retry_wait');
  app.clock.advance(60_000);
  await app.drain();
  assert.equal(app.db.get('jobs', j1.id).state, 'succeeded');

  app.jobs.register('broken', async () => { throw new AppError('invalid_input', 'bad'); });
  const j2 = app.jobs.enqueue({ scope, type: 'broken', idempotencyKey: 'k2', payload: {} });
  await app.drain();
  assert.equal(app.db.get('jobs', j2.id).state, 'dead_letter');

  // A worker whose lease expired and was re-claimed cannot commit.
  let stolen;
  app.jobs.register('slow', async (_payload, ctx) => {
    app.clock.advance(10 * 60_000);
    stolen = app.jobs.claim();
    assert.throws(() => ctx.commit(() => {}), e => e.code === 'stale_dependency');
    return {};
  });
  app.jobs.enqueue({ scope, type: 'slow', idempotencyKey: 'k3', payload: {} });
  await app.jobs.runOnce();
  assert.equal(stolen.type, 'slow');
});

test('outbox: consumers act on each event once, retries failed consumers', async () => {
  const app = backend();
  const p = app.auth.createPrincipal();
  const exam = app.services.exams.create(p, { title: 'X' });
  let seen = 0, flaky = 0;
  app.events.subscribe('counter', 'personal.decided', () => { seen++; });
  app.events.subscribe('flaky', 'personal.decided', () => { flaky++; if (flaky === 1) throw new Error('boom'); });
  const payload = { decisionId: 'd1', changeIds: ['c1'], disposition: 'noop', reason: 'already covered' };
  app.events.emit({ scope: exam.scope, eventType: 'personal.decided', aggregateType: 'exam', aggregateId: exam.id, payload });
  app.events.emit({ scope: exam.scope, eventType: 'personal.decided', aggregateType: 'exam', aggregateId: exam.id, payload });
  app.events.dispatch();
  app.clock.advance(5000);
  app.events.dispatch();
  assert.equal(seen, 1);
  assert.equal(flaky, 2);
  assert.throws(() => app.events.emit({ scope: exam.scope, eventType: 'personal.decided', aggregateType: 'exam', aggregateId: exam.id, payload: { decisionId: 'd2' } }), /missing/);
});

test('blobs verify checksums; deletion cancels jobs and tombstones the exam', async () => {
  const app = backend();
  const p = app.auth.createPrincipal();
  const exam = app.services.exams.create(p, { title: 'X' });
  const ref = app.blobs.put({ scope: exam.scope, bytes: Buffer.from('hello'), mediaType: 'text/plain' });
  assert.equal(app.blobs.readText(ref, exam.scope), 'hello');
  assert.equal(app.blobs.verify({ ...ref, sha256: 'c1:sha256:00' }, exam.scope), false);
  app.jobs.register('work', async () => ({}));
  const job = app.jobs.enqueue({ scope: exam.scope, type: 'work', idempotencyKey: 'w', payload: {} });
  app.services.exams.remove(p, exam.id, {});
  assert.throws(() => app.services.exams.get(p, exam.id), e => e.code === 'ownership_denied');
  await app.drain();
  assert.equal(app.db.get('exams', exam.id).status, 'deleted');
  assert.equal(app.db.get('jobs', job.id), null);
  assert.equal(app.blobs.verify(ref, exam.scope), false);
});
