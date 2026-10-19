import { randomBytes } from 'node:crypto';
import { newId, hashOf } from './util.mjs';
import { AppError } from './errors.mjs';

// Authentication → principal → scope. Scope is always server-derived (spec §3).

export function createAuth({ db, clock }) {
  function createPrincipal({ tenantId = newId('ten'), learnerId = newId('lrn'), role = 'learner', token = randomBytes(24).toString('base64url') } = {}) {
    const record = { id: newId('prn'), tokenHash: hashOf(token), tenantId, learnerId: role === 'admin' && !learnerId ? null : learnerId, role, createdAt: clock.iso() };
    db.insert('principals', record);
    return { ...record, token };
  }

  function authenticate(header) {
    const token = /^Bearer\s+(.+)$/i.exec(header || '')?.[1];
    if (!token) throw new AppError('unauthenticated', 'Sign in first.');
    const principal = db.findOne('principals', { tokenHash: hashOf(token) });
    if (!principal) throw new AppError('unauthenticated', 'Sign in first.');
    return principal;
  }

  /** The exam, if this learner owns it and it is not deleted. Otherwise not-found (no enumeration). */
  function requireExam(principal, examId, { allowDeleting = false } = {}) {
    const exam = typeof examId === 'string' ? db.get('exams', examId, { tenantId: principal.tenantId, learnerId: principal.learnerId }) : null;
    if (!exam || exam.status === 'deleted' || (!allowDeleting && exam.status === 'deleting')) throw new AppError('ownership_denied', 'Exam not found.');
    return exam;
  }

  const learnerScope = principal => ({ tenantId: principal.tenantId, learnerId: principal.learnerId });
  const examScope = exam => ({ tenantId: exam.scope.tenantId, learnerId: exam.scope.learnerId, examId: exam.id });

  function requireAdmin(principal) { if (principal.role !== 'admin') throw new AppError('forbidden', 'Admin access required.'); }

  return { createPrincipal, authenticate, requireExam, learnerScope, examScope, requireAdmin };
}
