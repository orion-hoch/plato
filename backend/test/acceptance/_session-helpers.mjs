import { createTestBackend } from '../harness.mjs';
import { seedPublishedKnowledge } from '../fixtures.mjs';

// Shared setup for session scenarios: a published QR course, ready hopper questions, helpers for responses. Runs on
// the real modules with mock providers (v10: cards only; the actor speaks, so no playback is acknowledged here).

export async function setup(options = {}) {
  const t = createTestBackend(options);
  const exam = t.createExam(options.exam);
  const seeded = seedPublishedKnowledge(t.app, exam);
  await t.app.drain();
  let seq = 0;
  const S = () => t.app.services.session;
  const helpers = {
    ...t, exam, ids: seeded.ids, scope: exam.scope, manifestId: seeded.manifest.id,
    session: id => t.app.db.get('sessions', id),
    units: (sessionId, filter = () => true) => t.app.db.find('output_units', { sessionId }).filter(filter),
    events: sessionId => S().events(t.learner, sessionId, 0),
    async respond(sessionId, text, extra = {}) {
      const s = t.app.db.get('sessions', sessionId);
      return S().submitResponse(t.learner, sessionId, { clientResponseId: `r_${++seq}`, captureEpoch: s.epoch, turnId: s.currentTurnId, replyToQuestionId: null, text, finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null, ...extra });
    },
    /** A personalized notation question (two hints, numeric prompt) ready for the QR topic. */
    async notationQuestion(sessionId) {
      const s = t.app.db.get('sessions', sessionId);
      const { generationRequestId } = t.app.services.questions.requestCustom(exam.scope, { topicId: seeded.ids.qr.topicId, objectiveVersionIds: seeded.ids.qr.objectiveVersionIds, narrowTarget: 'interpret the transpose in q one transpose a two', intendedDifficulty: 'application', sessionId, turnId: s.currentTurnId });
      await t.app.drain();
      const status = t.app.services.questions.customStatus(exam.scope, generationRequestId);
      if (!status.questionId) throw new Error(`custom question not ready: ${JSON.stringify(status)}`);
      return t.app.services.questions.get(exam.scope, status.questionId);
    },
  };
  return helpers;
}

/** Start a session on QR and let its first card be issued. */
export async function startSession(h, topicKey = 'qr') {
  const start = h.app.services.session.start(h.learner, h.exam.id, { topicId: h.ids[topicKey].topicId });
  await h.app.drain();
  return start;
}
