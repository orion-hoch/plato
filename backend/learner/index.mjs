import { newId, hashOf } from '../core/util.mjs';
import { s, validate } from '../core/shape.mjs';
import { createProfiles, preferenceKey } from './profile.mjs';
import { createAssessment, POLICY } from './assessment.mjs';
import { createPersonal } from './personal.mjs';
import { createLearnerV2 } from './v2.mjs';

// Learner module: profiles, evidence, two-stage assessment, mastery, active personalization.
// Services per backend/CONTRACTS.md.

// `key` names the slot a preference answers (the tutor's remember_preference `about`), so a newer answer replaces the older.
const FEEDBACK = s.object({
  sessionId: s.nullable(s.string()), turnId: s.nullable(s.string()), topicIds: s.array(s.string(), { max: 50 }), text: s.string({ min: 1, max: 4000 }),
  type: s.enum(['preference', 'goal', 'correction', 'difficulty', 'material_feedback', 'other']), explicit: s.bool(), key: s.string({ min: 1, max: 60 }),
  applicability: s.enum(['exam', 'learner']), correctionOfResponseId: s.nullable(s.string()), supersedesFeedbackId: s.nullable(s.string()),
}, { optional: ['sessionId', 'turnId', 'topicIds', 'explicit', 'key', 'applicability', 'correctionOfResponseId', 'supersedesFeedbackId'] });
// About this course, not the learner: kept with the exam whatever applicability says.
const COURSE_KEYS = new Set(['help_wanted', 'exam_scope']);

const LEARNER_TABLES = ['profile_snapshots', 'learner_topic_states', 'interaction_evidence', 'learner_observations', 'feedback_evidence', 'local_answer_assessments', 'learner_assessments', 'mastery_projections', 'mastery_history_points', 'learner_changes', 'personal_batches', 'personal_explanations', 'personal_map_edges', 'personal_manifests', 'personal_revision_decisions'];

export function installLearner(app, { raceHook } = {}) {
  const { db, clock, jobs, events } = app;
  const profiles = createProfiles(app, { raceHook: (...args) => app.learnerRaceHook?.(...args) ?? raceHook?.(...args) });
  const lazy = {};
  const personal = createPersonal(app, { profiles, learner: { projection: (scope, topicId) => lazy.assessment.projection(scope, topicId) } });
  const assessment = lazy.assessment = createAssessment(app, { profiles, changes: personal });
  const v2 = createLearnerV2(app, { model: assessment.model, profiles });

  if (!db.findOne('assessment_policies', { version: POLICY.version })) db.insert('assessment_policies', { id: newId('pol'), ...POLICY });

  app.hooks.examCreated.push((exam, setup) => profiles.bootstrap(exam, setup));
  app.hooks.examDeleted.push(exam => { for (const t of LEARNER_TABLES) db.prepare(`DELETE FROM ${t} WHERE exam_id = ?`).run(exam.id); });

  /** Explicit feedback → FeedbackEvidence, profile facts and (unless excluded) a learner change. */
  function recordFeedback(scope, body) {
    validate(FEEDBACK, body);
    const topicIds = body.topicIds || [], explicit = body.explicit ?? true;
    const applicability = body.type === 'goal' || COURSE_KEYS.has(body.key) ? 'exam' : body.applicability || 'exam';
    const key = ['other', 'goal'].includes(body.key) ? null : body.key; // no single slot: keyed by their words, so several stand
    const text = profiles.normalize(body.text);
    // The same words about another slot ("no preference") are new feedback; without a key the identity is as before.
    const semanticKey = hashOf({ type: body.type, text, topicIds: [...topicIds].sort(), applicability, correctionOf: body.correctionOfResponseId || null, key: key || undefined });
    return db.tx(() => {
      const duplicate = db.findOne('feedback_evidence', { semanticKey }, { scope });
      if (duplicate) return { feedbackId: duplicate.id, learnerChangeId: null, exclusionReason: 'duplicate: identical feedback already recorded' };
      const feedback = { id: newId('fb'), scope, createdAt: clock.iso(), sessionId: body.sessionId ?? null, turnId: body.turnId ?? null, topicIds, text: body.text, type: body.type, explicit, applicability: { level: applicability, examId: applicability === 'exam' ? scope.examId : null }, supersedesFeedbackId: body.supersedesFeedbackId ?? null, correctionOfResponseId: body.correctionOfResponseId ?? null, semanticKey };
      db.insert('feedback_evidence', feedback);
      // "No" or "sure" answering a named slot is an answer, not an acknowledgment.
      if (!key && profiles.isAcknowledgment(body.text)) return { feedbackId: feedback.id, learnerChangeId: null, exclusionReason: 'acknowledgment, not feedback' };
      const evidence = [{ kind: 'feedback', id: feedback.id, detail: null }];
      const learnerScope = { tenantId: scope.tenantId, learnerId: scope.learnerId };
      if (body.type === 'preference' && explicit) {
        const f = profiles.fact({ applicability: feedback.applicability, kind: 'preference', key: key || preferenceKey(body.text), value: body.text, origin: 'explicit_user', durability: 'until_revoked', evidence });
        if (applicability === 'learner') {
          // Fan-out: every exam (this one included) re-resolves its snapshot and reconsiders via refresh_exam_profile.
          profiles.commitLearnerFacts(learnerScope, facts => profiles.upsertFacts(facts, [f]), { reason: 'learner-wide preference' });
          return { feedbackId: feedback.id, learnerChangeId: null, exclusionReason: null, fanOut: true };
        }
        profiles.commitExamFacts(scope, facts => profiles.upsertFacts(facts, [f]), { reason: 'explicit preference' });
      } else if (body.type === 'goal' && explicit) {
        profiles.commitExamFacts(scope, facts => profiles.upsertFacts(facts, [profiles.fact({ applicability: { level: 'exam', examId: scope.examId }, kind: 'goal', key: key || `goal_${hashOf(text).slice(-10)}`, value: body.text, origin: 'explicit_user', durability: 'until_revoked', evidence })]), { reason: 'explicit goal' });
      } else if (body.type === 'correction') {
        profiles.commitExamFacts(scope, facts => profiles.upsertFacts(facts, [profiles.fact({ applicability: { level: 'exam', examId: scope.examId }, kind: 'correction', key: `correction_${feedback.id}`, value: body.text, origin: 'explicit_user', durability: 'until_revoked', evidence })]), { reason: 'explicit correction' });
      } else if (body.type === 'difficulty' && explicit) {
        profiles.commitExamFacts(scope, facts => profiles.upsertFacts(facts, [profiles.fact({ applicability: { level: 'exam', examId: scope.examId }, kind: 'context', key: `difficulty_${topicIds.join('_') || 'exam'}`, value: body.text, origin: 'explicit_user', durability: 'session', evidence })]), { reason: 'stated difficulty' });
      }
      const kind = body.type === 'preference' ? 'preference_change' : body.type === 'correction' ? 'correction' : 'explicit_feedback';
      const { change, exclusionReason } = personal.create(scope, { kind, topicIds, evidence, semanticKey: `feedback:${semanticKey}`, reason: body.text.slice(0, 200), urgent: kind === 'correction' });
      return { feedbackId: feedback.id, learnerChangeId: change?.id || null, exclusionReason };
    });
  }

  /**
   * The student's chosen focus section (explicit intent): an exam goal fact the learner context carries,
   * and an explicit_feedback learner change so personalization reconsiders emphasis. null clears it.
   */
  function setFocus(scope, focus) {
    return db.tx(() => {
      const evidence = [{ kind: 'explicit_exam_instruction', id: focus?.sectionId || 'focus_cleared', detail: focus ? focus.name : null }];
      profiles.commitExamFacts(scope, facts => {
        const prior = facts.filter(f => f.status === 'active' && f.kind === 'goal' && f.key === 'focus_section').map(f => f.factId);
        const next = profiles.retractFacts(facts, prior, evidence);
        return focus ? profiles.upsertFacts(next, [profiles.fact({ applicability: { level: 'exam', examId: scope.examId }, kind: 'goal', key: 'focus_section', value: { sectionId: focus.sectionId, name: focus.name, topicIds: focus.topicIds, goal: focus.goal }, origin: 'explicit_user', durability: 'until_revoked', evidence })]) : next;
      }, { reason: 'focus section' });
      const { change } = personal.create(scope, {
        kind: 'explicit_feedback', topicIds: focus?.topicIds || [], evidence,
        semanticKey: `focus:${hashOf({ focus, at: clock.iso() })}`,
        reason: focus ? `Student chose to focus on "${focus.name}", aiming for ${focus.goal}.` : 'Student cleared their focus.',
      });
      return change?.id || null;
    });
  }

  // ---------- Jobs ----------
  jobs.register('assess_answer', assessment.assessAnswer);
  jobs.register('update_learner', assessment.updateLearner);
  jobs.register('assess_response', assessment.assessResponse);
  jobs.register('reconsider_personal', personal.reconsider, { maxAttempts: app.config.personalRevisionAttempts });
  jobs.register('publish_personal', personal.publishPersonalJob);
  jobs.register('refresh_exam_profile', async ({ examId, learnerSnapshotId }, ctx) => {
    const scope = ctx.job.scope;
    ctx.commit(() => {
      const snapshot = profiles.refreshExam(scope, learnerSnapshotId);
      if (snapshot) personal.create(scope, { kind: 'preference_change', topicIds: [], evidence: [{ kind: 'feedback', id: learnerSnapshotId, detail: 'learner-wide profile snapshot' }], semanticKey: `profile:${learnerSnapshotId}`, reason: 'Learner-wide profile changed.' });
    });
    return { resultRefs: [{ kind: 'exam', id: examId, version: null }] };
  });

  // ---------- Consumers ----------
  events.subscribe('learner.topics', 'knowledge.published', event => assessment.onKnowledgePublished(event.scope, event.payload));
  events.subscribe('learner.personal-base', 'knowledge.published', event => { if (app.db.get('exams', event.scope.examId)?.knowledgeSource !== 'guide') personal.onKnowledgePublished(event.scope, event.payload); }); // a guide-backed course has no personal explanations to rebase
  events.subscribe('learner.personal-coordinator', 'learner.changed', event => personal.enqueueChange(event));
  (app.reconcilers ||= []).push(() => personal.reconcile());

  app.services.learner = {
    profile: scope => ({ snapshot: profiles.examSnapshot(scope), learnerSnapshot: profiles.learnerSnapshot({ tenantId: scope.tenantId, learnerId: scope.learnerId }) }),
    contextRef: personal.contextRef, selectedFacts: personal.selectedFacts, topicStates: personal.topicStates,
    recordFeedback, setFocus,
    commitInteraction: assessment.commitInteraction, supersedeInteraction: assessment.supersedeInteraction,
    projection: (scope, topicId) => assessment.projection(scope, topicId),
    projections: assessment.projections, history: assessment.history,
    // The learner model (model.mjs): evidence in, θ/σ out. estimates → { topics, concepts } (observed, interpolated or prior).
    // v2 (v2.mjs, system-spec §10–11): an observation naming `kcs` goes to v2; v1's `keys` shape still works.
    observe: (scope, o) => o?.kcs ? v2.observe(scope, o) : assessment.model.observe(scope, o),
    expose: v2.expose, state: v2.state, mastered: v2.mastered, traits: v2.traits, priorities: v2.priorities, map: v2.map, coldStart: v2.coldStart,
    estimates: assessment.model.estimates, conceptStates: assessment.model.conceptStates,
    personalView: personal.personalView, latestPersonalManifestId: personal.latestPersonalManifestId,
    decisions: personal.decisions, changes: personal.changes, assessments: assessment.assessments,
    policy: () => POLICY,
    reconcile: personal.reconcile,
  };
}
