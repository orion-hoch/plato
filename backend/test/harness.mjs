import { createBackend } from '../app.mjs';
import { createClock } from '../core/util.mjs';
import { createMockProviders } from '../providers/mock/index.mjs';

/** A backend wired to deterministic mocks, a controllable clock and a fresh database. */
export function createTestBackend({ config, controls = {}, start = '2026-10-04T12:00:00Z', dbFile } = {}) {
  const clock = createClock(start);
  const providers = createMockProviders({ clock, controls });
  // No exam-problem pool unless a test asks for one: these scenarios count the short-question hopper.
  const app = createBackend({ clock, config: { examQuestionsPerUnit: 0, ...config }, providers, dbFile });
  app.controls = controls;
  // Until the learner module installs its bootstrap, give exams an explicit empty profile pointer.
  if (!app.hooks.examCreated.length) app.hooks.examCreated.push(exam => app.db.update('exams', { ...exam, currentProfileSnapshotId: 'syn_profile_v0' }));
  const learner = app.auth.createPrincipal();
  const admin = app.auth.createPrincipal({ tenantId: learner.tenantId, learnerId: null, role: 'admin' });
  return { app, clock, controls, learner, admin, createExam: (body = { title: 'Linear algebra' }, principal = learner) => app.services.exams.create(principal, body) };
}
