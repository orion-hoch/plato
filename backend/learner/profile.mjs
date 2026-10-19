import { newId, hashOf } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';

// Learner profiles (spec §2.3, §4.3): a learner-wide head + immutable snapshots, and exam-scoped
// ProfileSnapshots that resolve learner-wide facts plus exam facts. Mutations commit a new
// snapshot and CAS the head/exam pointer, retrying against the new head on conflict.

const ACK = /^((ok|okay|k|thanks|thank you|got it|yes|no|yep|nope|cool|sure|right|mm+|hmm+)[.,!\s]*)+$/i;
const isConflict = error => error.code === 'version_conflict' || error.errcode === 2067 || /UNIQUE constraint/.test(error.message || '');
const normalize = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Stable key for an explicit preference so a newer statement supersedes an older one. */
export function preferenceKey(text) {
  const t = normalize(text);
  if (/example/.test(t)) return 'examples_first';
  if (/\b(slow|slower|fast|faster|pace|speed|quick)/.test(t)) return 'pace';
  if (/\b(short|shorter|brief|concise|long|detail)/.test(t)) return 'verbosity';
  if (/\b(picture|diagram|visual|draw)/.test(t)) return 'visual_explanations';
  return `preference_${hashOf(t).slice(-10)}`;
}

export function createProfiles(app, { raceHook } = {}) {
  const { db, clock } = app;

  const fact = ({ applicability, kind, key, value, origin, durability, evidence = [], confidence = null, supersedesFactId = null }) => ({
    factId: newId('fact'), applicability, kind, key, value, origin, durability, evidence, counterEvidence: [],
    status: 'active', confidence, validFrom: clock.iso(), expiresAt: null, supersedesFactId,
  });

  /** Replace active facts with the same (applicability, kind, key); keeps history in older snapshots. */
  function upsertFacts(facts, incoming) {
    let next = facts.map(f => ({ ...f }));
    for (const f of incoming) {
      const prior = next.find(x => x.status === 'active' && x.key === f.key && x.kind === f.kind && x.applicability.level === f.applicability.level);
      // An inferred observation never overrides an explicit statement of the same key.
      if (prior && prior.origin === 'explicit_user' && f.origin === 'inferred') continue;
      if (prior) { prior.status = 'superseded'; f.supersedesFactId = prior.factId; }
      next.push(f);
    }
    return next;
  }

  function retractFacts(facts, factIds, evidence) {
    return facts.map(f => factIds.includes(f.factId) && f.status === 'active' ? { ...f, status: 'retracted', counterEvidence: [...f.counterEvidence, ...evidence] } : f);
  }

  function head(learnerScope) {
    return db.findOne('learner_profile_heads', {}, { scope: learnerScope });
  }

  function ensureHead(learnerScope) {
    const existing = head(learnerScope);
    if (existing) return existing;
    const snapshot = { id: newId('lps'), scope: learnerScope, createdAt: clock.iso(), version: 0, parentSnapshotId: null, facts: [], contentHash: hashOf([]) };
    db.insert('learner_profile_snapshots', snapshot);
    const record = { id: newId('lph'), scope: learnerScope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, currentSnapshotId: snapshot.id, currentSnapshotVersion: 0 };
    db.insert('learner_profile_heads', record);
    return record;
  }

  const learnerSnapshot = learnerScope => {
    const h = ensureHead(learnerScope);
    return db.get('learner_profile_snapshots', h.currentSnapshotId, learnerScope);
  };

  /** Resolved facts for an exam: learner-wide facts, overridden by exam facts with the same key. */
  function resolve(learnerFacts, examFacts) {
    const active = examFacts.filter(f => f.status === 'active');
    const keys = new Set(active.map(f => `${f.kind}:${f.key}`));
    return [...learnerFacts.filter(f => f.status === 'active' && !keys.has(`${f.kind}:${f.key}`)), ...examFacts];
  }

  /**
   * Commit learner-wide facts: new snapshot + head CAS, retried against the new head on conflict.
   * Then every non-deleted exam of the learner gets a refresh_exam_profile job.
   */
  function commitLearnerFacts(learnerScope, mutate, { reason = 'profile change', excludeExamId = null } = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Optimistic: read the head, let others commit, then write a new snapshot + head CAS.
      const h = ensureHead(learnerScope);
      const current = db.get('learner_profile_snapshots', h.currentSnapshotId, learnerScope);
      raceHook?.('learner', h);
      try {
        return db.tx(() => {
          const facts = mutate(current.facts);
          const snapshot = { id: newId('lps'), scope: learnerScope, createdAt: clock.iso(), version: current.version + 1, parentSnapshotId: current.id, facts, contentHash: hashOf(facts) };
          db.insert('learner_profile_snapshots', snapshot);
          db.update('learner_profile_heads', { ...h, currentSnapshotId: snapshot.id, currentSnapshotVersion: snapshot.version, updatedAt: clock.iso() });
          for (const exam of db.find('exams', {}, { scope: learnerScope })) {
            if (['deleting', 'deleted'].includes(exam.status) || exam.id === excludeExamId) continue;
            app.jobs.enqueue({ scope: exam.scope, type: 'refresh_exam_profile', idempotencyKey: `refresh_exam_profile:${snapshot.id}`, payload: { examId: exam.id, learnerSnapshotId: snapshot.id, reason } });
          }
          return snapshot;
        });
      } catch (error) { if (!isConflict(error)) throw error; }
    }
    throw new AppError('version_conflict', 'Profile kept changing; try again.');
  }

  function examSnapshot(scope) {
    const exam = db.get('exams', scope.examId, scope);
    if (!exam?.currentProfileSnapshotId) return null;
    return db.get('profile_snapshots', exam.currentProfileSnapshotId, scope);
  }

  /** Commit an exam snapshot (exam facts mutated, learner facts re-resolved from the head) + exam pointer CAS. */
  function commitExamFacts(scope, mutate, { reason = 'profile change', emit = true } = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const exam = db.get('exams', scope.examId, scope);
      // A pointer to a snapshot that is gone (the table was emptied) starts the exam's facts afresh rather than failing every change.
      const current = db.get('profile_snapshots', exam.currentProfileSnapshotId, scope) ?? { id: null, version: 0, facts: [] };
      raceHook?.('exam', exam);
      try {
        return db.tx(() => {
          const learner = learnerSnapshot({ tenantId: scope.tenantId, learnerId: scope.learnerId });
          const examFacts = mutate(current.facts.filter(f => f.applicability.level === 'exam'));
          const facts = resolve(learner.facts, examFacts);
          const snapshot = { id: newId('ps'), scope, createdAt: clock.iso(), learnerProfileSnapshotId: learner.id, version: current.version + 1, parentSnapshotId: current.id, facts, contentHash: hashOf(facts) };
          db.insert('profile_snapshots', snapshot);
          db.update('exams', { ...exam, currentProfileSnapshotId: snapshot.id, updatedAt: clock.iso() });
          if (emit) app.events.emit({ scope, eventType: 'profile.changed', aggregateType: 'exam_profile', aggregateId: scope.examId, aggregateVersion: snapshot.version, payload: { learnerId: scope.learnerId, snapshotId: snapshot.id, version: snapshot.version, applicability: 'exam', reason }, idempotencyKey: `profile.changed:${snapshot.id}` });
          return snapshot;
        });
      } catch (error) { if (!isConflict(error)) throw error; }
    }
    throw new AppError('version_conflict', 'Profile kept changing; try again.');
  }

  /** Exam-creation bootstrap (§2.3): head → resolved v0 snapshot → setup facts → exam pointer. */
  function bootstrap(exam, { goals = [], preferences = [] }) {
    const scope = exam.scope, learnerScope = { tenantId: scope.tenantId, learnerId: scope.learnerId };
    const evidence = [{ kind: 'explicit_exam_instruction', id: exam.id, detail: 'exam setup' }];
    const learnerPrefs = preferences.filter(p => p.applicability === 'learner');
    if (learnerPrefs.length) {
      commitLearnerFacts(learnerScope, facts => upsertFacts(facts, learnerPrefs.map(p => fact({ applicability: { level: 'learner', examId: null }, kind: 'preference', key: p.key, value: p.value, origin: 'explicit_user', durability: 'until_revoked', evidence }))), { reason: 'setup preference', excludeExamId: exam.id });
    }
    const learner = learnerSnapshot(learnerScope);
    const v0Facts = resolve(learner.facts, []);
    const v0 = { id: newId('ps'), scope, createdAt: clock.iso(), learnerProfileSnapshotId: learner.id, version: 0, parentSnapshotId: null, facts: v0Facts, contentHash: hashOf(v0Facts) };
    db.insert('profile_snapshots', v0);
    const examFacts = [
      ...goals.map(g => fact({ applicability: { level: 'exam', examId: exam.id }, kind: 'goal', key: `goal_${hashOf(normalize(g)).slice(-10)}`, value: g, origin: 'explicit_user', durability: 'until_revoked', evidence })),
      ...preferences.filter(p => p.applicability === 'exam').map(p => fact({ applicability: { level: 'exam', examId: exam.id }, kind: 'preference', key: p.key, value: p.value, origin: 'explicit_user', durability: 'until_revoked', evidence })),
    ];
    let current = db.update('exams', { ...exam, currentProfileSnapshotId: v0.id, updatedAt: clock.iso() });
    if (examFacts.length) {
      const facts = resolve(learner.facts, examFacts);
      const v1 = { id: newId('ps'), scope, createdAt: clock.iso(), learnerProfileSnapshotId: learner.id, version: 1, parentSnapshotId: v0.id, facts, contentHash: hashOf(facts) };
      db.insert('profile_snapshots', v1);
      current = db.update('exams', { ...current, currentProfileSnapshotId: v1.id, updatedAt: clock.iso() });
    }
    return current;
  }

  /** Re-resolve an exam's snapshot from the current learner head (fan-out job). Returns the new snapshot or null. */
  function refreshExam(scope, learnerSnapshotId) {
    const current = examSnapshot(scope);
    if (!current || current.learnerProfileSnapshotId === learnerSnapshotId) return null;
    return commitExamFacts(scope, facts => facts, { reason: 'learner profile changed' });
  }

  return { fact, upsertFacts, retractFacts, head, ensureHead, learnerSnapshot, resolve, commitLearnerFacts, commitExamFacts, examSnapshot, bootstrap, refreshExam, isAcknowledgment: text => ACK.test(normalize(text)), normalize };
}
