import { newId, hashOf, backoff } from './util.mjs';
import { AppError } from './errors.mjs';

// Durable, at-least-once jobs with leases, checkpoints, bounded retries and idempotency keys.
// A worker that lost its lease (or whose exam was deleted) cannot commit. Spec §8.

export function createJobs({ db, clock, config }) {
  const handlers = new Map();
  let halted = false;
  const workerId = newId('wrk');

  function register(type, handler, { maxAttempts = config.providerRetriesPerJob, leaseMs = config.jobLeaseMs } = {}) {
    handlers.set(type, { handler, maxAttempts, leaseMs });
  }

  /** Enqueue a job. Same key + same input returns the existing job; a different input conflicts. */
  function enqueue({ scope, type, idempotencyKey, payload, priority = 0, availableAt, dependencies = [], maxAttempts }) {
    const inputHash = hashOf(payload);
    return db.tx(() => {
      const existing = db.findOne('jobs', { idempotencyKey, examId: scope.examId ?? null, type }, { scope: { tenantId: scope.tenantId, learnerId: scope.learnerId } });
      if (existing) {
        if (existing.inputHash !== inputHash) throw new AppError('idempotency_conflict', `Job key ${idempotencyKey} was reused with different input.`);
        return existing;
      }
      const exam = scope.examId ? db.get('exams', scope.examId) : null;
      const job = {
        id: newId('job'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0,
        type, idempotencyKey, inputHash, payload, dependencies,
        expectedDeletionGeneration: exam?.deletionGeneration ?? 0,
        state: 'queued', priority, attempt: 0, maxAttempts: maxAttempts ?? handlers.get(type)?.maxAttempts ?? config.providerRetriesPerJob,
        availableAt: availableAt ?? clock.now(), leaseOwner: null, leaseExpiresAt: null,
        checkpoint: null, resultRefs: [], lastError: null,
      };
      db.insert('jobs', job);
      return job;
    });
  }

  const examAlive = job => {
    if (!job.scope.examId || job.type === 'delete_exam') return true;
    const exam = db.get('exams', job.scope.examId);
    return exam && exam.status !== 'deleting' && exam.status !== 'deleted' && exam.deletionGeneration === job.expectedDeletionGeneration;
  };

  // The reply path's jobs never wait for a worker behind long ones: once background jobs fill their share of this
  // process's workers (config.backgroundJobs), a free worker takes only reply-path jobs (config.replyJobs).
  const { types: replyTypes, minPriority: replyPriority } = config.replyJobs;
  const replyPath = job => replyTypes.includes(job.type) && job.priority >= replyPriority;
  let background = 0, long = 0;
  // Builds that run for many minutes (the course model, the knowledge graph) take at most config.longJobs.max workers, so the
  // session's short background work (a late card's stand-in, learner updates, pregenerated cards) never waits behind them.
  const longTypes = config.longJobs.types, isLong = job => longTypes.includes(job.type);

  function claim() {
    if (halted) return null;
    return db.tx(() => {
      const now = clock.now(), onlyReply = background >= config.backgroundJobs, noLong = !onlyReply && long >= Math.max(1, Math.min(config.longJobs.max, config.backgroundJobs - 1));
      const row = db.prepare(`SELECT data FROM jobs WHERE ((state IN ('queued','retry_wait') AND available_at <= ?) OR (state = 'running' AND lease_expires_at < ?))
        ${onlyReply ? `AND type IN (${replyTypes.map(() => '?').join(',')}) AND priority >= ?` : ''}${noLong ? ` AND type NOT IN (${longTypes.map(() => '?').join(',')})` : ''} ORDER BY priority DESC, available_at, rowid LIMIT 1`).get(now, now, ...(onlyReply ? [...replyTypes, replyPriority] : []), ...(noLong ? longTypes : []));
      if (!row) return null;
      const job = JSON.parse(row.data);
      const spec = handlers.get(job.type);
      if (!spec) return null;
      if (!examAlive(job)) { db.update('jobs', { ...job, state: 'cancelled', updatedAt: clock.iso(), lastError: { code: 'deleted', retryable: false, message: 'Exam deleted.', retryAfterMs: null, issues: [] } }); return claim(); }
      return db.update('jobs', { ...job, state: 'running', attempt: job.attempt + 1, leaseOwner: `${workerId}:${newId('lease')}`, leaseExpiresAt: now + spec.leaseMs, updatedAt: clock.iso() });
    });
  }

  /** Context a handler uses to persist progress and commit only while it still owns the job. */
  function context(job) {
    let current = job;
    const owned = () => {
      const fresh = db.get('jobs', job.id);
      return fresh && fresh.state === 'running' && fresh.leaseOwner === job.leaseOwner && fresh.rowVersion === current.rowVersion && examAlive(fresh);
    };
    return {
      job,
      owned,
      checkpoint(data) {
        db.tx(() => {
          if (!owned()) throw new AppError('stale_dependency', 'Lost the job lease.');
          current = db.update('jobs', { ...current, checkpoint: data, updatedAt: clock.iso() });
        });
      },
      /** Run fn inside a transaction that first proves this worker still owns the job. */
      commit(fn) {
        return db.tx(() => {
          if (!owned()) throw new AppError('stale_dependency', 'Lost the job lease or the exam was deleted.');
          const result = fn();
          current = db.get('jobs', job.id);
          return result;
        });
      },
      get current() { return current; },
    };
  }

  /** Claim and run one job. Returns false when nothing was ready. */
  async function runOnce() {
    const job = claim();
    if (!job) return false;
    const counted = !replyPath(job), longOne = isLong(job);
    if (counted) background++;
    if (longOne) long++;
    const { handler, maxAttempts } = handlers.get(job.type);
    const ctx = context(job);
    // Heartbeat: keep the lease while the handler is still working (long model calls).
    const { leaseMs } = handlers.get(job.type);
    const heartbeat = setInterval(() => {
      try {
        db.tx(() => {
          const fresh = db.get('jobs', job.id);
          if (!fresh || fresh.state !== 'running' || fresh.leaseOwner !== job.leaseOwner) return;
          db.replace('jobs', { ...fresh, leaseExpiresAt: clock.now() + leaseMs });
        });
      } catch { /* the next beat retries */ }
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    try {
      const result = await handler(job.payload, ctx);
      db.tx(() => {
        const fresh = db.get('jobs', job.id);
        if (!fresh || fresh.leaseOwner !== job.leaseOwner || fresh.state !== 'running') return;
        db.update('jobs', { ...fresh, state: result?.state || 'succeeded', resultRefs: result?.resultRefs || [], leaseOwner: null, leaseExpiresAt: null, updatedAt: clock.iso() });
      });
    } catch (error) {
      // Shutting down: leave the job running; its lease expires and the next process resumes it.
      if (halted) return true;
      const err = error instanceof AppError ? error : new AppError('internal_error', 'Job failed.', { retryable: false });
      if (process.env.BACKEND_DEBUG && !(error instanceof AppError)) console.error(`job ${job.type} crashed:`, error);
      db.tx(() => {
        const fresh = db.get('jobs', job.id);
        if (!fresh || fresh.leaseOwner !== job.leaseOwner || fresh.state !== 'running') return;
        const deleted = !examAlive(fresh);
        const retry = !deleted && err.retryable && fresh.attempt < (fresh.maxAttempts || maxAttempts);
        const state = deleted ? 'cancelled' : err.code === 'stale_dependency' ? 'stale' : retry ? 'retry_wait' : err.code === 'quality_gate' || err.code === 'budget_exhausted' ? 'needs_review' : 'dead_letter';
        db.update('jobs', { ...fresh, state, lastError: err.toStructured(), leaseOwner: null, leaseExpiresAt: null, availableAt: retry ? clock.now() + (err.retryAfterMs ?? backoff(fresh.attempt, config.retryBaseMs)) : fresh.availableAt, updatedAt: clock.iso() });
      });
    } finally { clearInterval(heartbeat); if (counted) background--; if (longOne) long--; }
    return true;
  }

  /** Single-process server boot: jobs still "running" belong to a process that no longer exists. */
  function releaseOrphanedLeases() {
    db.tx(() => { for (const job of db.find('jobs', { state: 'running' })) db.replace('jobs', { ...job, leaseExpiresAt: 0 }); });
  }

  return { register, enqueue, claim, runOnce, handlers, workerId, examAlive, releaseOrphanedLeases, halt: () => { halted = true; } };
}
