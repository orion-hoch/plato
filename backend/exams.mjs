import { rmSync } from 'node:fs';
import path from 'node:path';
import { newId } from './core/util.mjs';
import { s, validate } from './core/shape.mjs';
import { AppError } from './core/errors.mjs';

// Exams: creation with profile bootstrap (§2.3), patch with CAS (§10), asynchronous deletion
// with generation checks (§8). Modules hook in through app.hooks.

const CREATE = s.object({
  title: s.string({ min: 1, max: 200 }),
  instructions: s.nullable(s.string({ max: 20_000 })),
  examDate: s.nullable(s.string({ max: 40 })),
  goals: s.array(s.string({ max: 1000 }), { max: 20 }),
  preferences: s.array(s.object({ key: s.string({ min: 1, max: 100 }), value: s.json(), applicability: s.enum(['exam', 'learner']) }), { max: 20 }),
}, { optional: ['instructions', 'examDate', 'goals', 'preferences'] });

const PATCH = s.object({
  title: s.string({ min: 1, max: 200 }), instructions: s.nullable(s.string({ max: 20_000 })),
  examDate: s.nullable(s.string({ max: 40 })), expectedRowVersion: s.int({ min: 0 }),
}, { optional: ['title', 'instructions', 'examDate'] });

export function installExams(app) {
  const { db, clock, events, jobs } = app;
  app.hooks = { examCreated: [], examPatched: [], examDeleting: [], examDeleted: [] };

  function create(principal, body) {
    validate(CREATE, body);
    const scopeBase = app.auth.learnerScope(principal);
    return db.tx(() => {
      const id = newId('exam');
      const exam = {
        id, scope: { ...scopeBase, examId: id }, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0,
        title: body.title, status: 'setup', instructions: body.instructions ?? null, examDate: body.examDate ?? null,
        currentProfileSnapshotId: null, publishedKnowledgeManifestId: null, publishedPersonalManifestId: null,
        desiredBuildGeneration: 0, deletionGeneration: 0,
        ...(app.config.knowledgeSource === 'guide' ? { knowledgeSource: 'guide' } : {}), // its topics from its study guide (backend/lessons/guide-manifest.mjs)
      };
      db.insert('exams', exam);
      // The learner module resolves the profile head and sets currentProfileSnapshotId.
      let current = exam;
      for (const hook of app.hooks.examCreated) current = hook(current, { goals: body.goals || [], preferences: body.preferences || [] }) || current;
      if (!current.currentProfileSnapshotId) throw new Error('Exam bootstrap did not create a profile snapshot.');
      return current;
    });
  }

  function patch(principal, examId, body) {
    validate(PATCH, body);
    const exam = app.auth.requireExam(principal, examId);
    if (exam.rowVersion !== body.expectedRowVersion) throw new AppError('version_conflict', 'The exam changed; reload and try again.');
    return db.tx(() => {
      const next = db.update('exams', { ...exam, ...Object.fromEntries(['title', 'instructions', 'examDate'].filter(k => body[k] !== undefined).map(k => [k, body[k]])), updatedAt: clock.iso() }, { expectedRowVersion: body.expectedRowVersion });
      for (const hook of app.hooks.examPatched) hook(exam, next);
      return db.get('exams', examId);
    });
  }

  function remove(principal, examId, { expectedRowVersion }) {
    const exam = app.auth.requireExam(principal, examId, { allowDeleting: true });
    if (exam.status === 'deleting') return { deletionId: `del_${exam.id}_${exam.deletionGeneration}`, status: 'deleting' };
    if (expectedRowVersion !== undefined && exam.rowVersion !== expectedRowVersion) throw new AppError('version_conflict', 'The exam changed; reload and try again.');
    return db.tx(() => {
      const next = db.update('exams', { ...exam, status: 'deleting', deletionGeneration: exam.deletionGeneration + 1, updatedAt: clock.iso() });
      // Cancel queued and running work now; workers re-check the generation before committing.
      for (const job of db.find('jobs', { examId: exam.id, state: ['queued', 'retry_wait', 'running'] })) db.update('jobs', { ...job, state: 'cancelled', leaseOwner: null, leaseExpiresAt: null, updatedAt: clock.iso() });
      for (const hook of app.hooks.examDeleting) hook(next);
      events.emit({ scope: next.scope, eventType: 'exam.deleted', aggregateType: 'exam', aggregateId: exam.id, aggregateVersion: next.rowVersion, payload: { examId: exam.id, deletionGeneration: next.deletionGeneration }, idempotencyKey: `exam.deleted:${exam.id}:${next.deletionGeneration}` });
      jobs.enqueue({ scope: { ...next.scope }, type: 'delete_exam', idempotencyKey: `delete_exam:${exam.id}:${next.deletionGeneration}`, payload: { examId: exam.id, deletionGeneration: next.deletionGeneration }, priority: 100 });
      return { deletionId: `del_${exam.id}_${next.deletionGeneration}`, status: 'deleting' };
    });
  }

  // The deletion job itself must run even though the exam is "deleting": it carries the new generation.
  jobs.register('delete_exam', async ({ examId, deletionGeneration }, ctx) => {
    const exam = db.get('exams', examId);
    if (!exam || exam.deletionGeneration !== deletionGeneration) return { state: 'stale' };
    app.blobs.deleteExam(examId);
    // Its study guide, sources and kits, and the student's checkpoint of it (19 Oct: these stayed on disk after a delete).
    const { studyDir, checkpointDir } = app.config;
    if (studyDir && /^exam_[\w-]+$/.test(examId)) rmSync(path.join(studyDir, examId), { recursive: true, force: true });
    if (checkpointDir) for (const end of ['', '.prev']) rmSync(path.join(checkpointDir, `${examId}.json${end}`), { force: true });
    db.tx(() => {
      for (const hook of app.hooks.examDeleted) hook(exam);
      db.prepare('DELETE FROM jobs WHERE exam_id = ? AND id != ?').run(examId, ctx.job.id);
      db.insert('tombstones', { id: newId('tmb'), scope: exam.scope, kind: 'exam', deletionGeneration, createdAt: clock.iso(), examId });
      db.update('exams', { ...db.get('exams', examId), status: 'deleted', title: '', instructions: null, examDate: null, publishedKnowledgeManifestId: null, publishedPersonalManifestId: null, updatedAt: clock.iso() });
    });
    return { resultRefs: [{ kind: 'exam', id: examId, version: null }] };
  });

  app.services.exams = { create, patch, remove, get: (principal, examId) => app.auth.requireExam(principal, examId) };
}
