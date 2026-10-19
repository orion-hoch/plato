import { newId, hashOf } from '../../core/util.mjs';
import { createTestBackend } from '../harness.mjs';
import { seedPublishedKnowledge } from '../fixtures.mjs';

// Shared setup for learner/personalization scenarios: a published QR course, questions with
// rubrics in spec shapes, and answers committed the way the session coordinator commits them.

export async function setupCourse({ controls = {}, examBody, proposals = true, config } = {}) {
  const t = createTestBackend({ controls, config });
  const exam = t.createExam(examBody || { title: 'Linear algebra' });
  const seeded = seedPublishedKnowledge(t.app, exam);
  const { ids, interpretation } = seeded;
  if (proposals) {
    // The initial interpreter's proposed personal explanation (P1) over-assumes a projection gap.
    const row = t.app.db.get('base_interpretations', interpretation.id);
    t.app.db.replace('base_interpretations', { ...row, proposedPersonalExplanations: [{ topicIds: [ids.qr.topicId], text: 'Before QR, rebuild projection from scratch: start with what it means to drop a perpendicular onto a line.', reasons: ['initial guess: projection may be weak'], selectedExamples: [] }] });
  }
  await t.app.drain();
  return { ...t, exam: t.app.db.get('exams', exam.id), scope: { ...exam.scope }, ids, manifest: seeded.manifest };
}

/** A validated question + rubric. `contextTopic` is referenced but context-only (no credit). */
export function addQuestion(t, { topic = 'qr', prompt = 'What does q₁ᵀa₂ mean?', expectedAnswer = 'the dot product, the coefficient of a2 along q1', alternatives = ['coefficient along q1', 'amount along q one'], contextTopic = null, capability = 'explanation' } = {}) {
  const { app, scope, ids, manifest } = t;
  const at = app.clock.iso();
  const objectiveVersionId = ids[topic].objectiveVersionIds[0];
  const criterionId = newId('crit');
  const rubric = {
    id: newId('rubv'), scope, createdAt: at, rubricId: newId('rub'), version: 1, objectiveVersionIds: [objectiveVersionId], expectedAnswer, acceptableAlternatives: alternatives,
    criteria: [{ criterionId, objectiveVersionId, text: 'States the meaning of the coefficient.', capability, evidence: [] }],
    misconceptionChecks: [], assistanceInterpretation: 'Any delivered hint makes the answer assisted.', dependencies: [], policyVersion: 'v1_engineering', meaningHash: hashOf(expectedAnswer),
  };
  const objectiveTargets = [{ objectiveVersionId, topicId: ids[topic].topicId, role: 'assessed', criterionIds: [criterionId], capabilities: [capability] }];
  if (contextTopic) objectiveTargets.push({ objectiveVersionId: ids[contextTopic].objectiveVersionIds[0], topicId: ids[contextTopic].topicId, role: 'context_only', criterionIds: [], capabilities: [] });
  const question = {
    id: newId('q'), scope, createdAt: at, updatedAt: at, rowVersion: 0, version: 1, origin: 'generic_hopper', topicId: ids[topic].topicId, objectiveVersionIds: objectiveTargets.map(o => o.objectiveVersionId), narrowTarget: null,
    objectiveTargets, knowledgeManifestId: manifest.id, personalManifestId: null, learnerContext: null, semanticFamilyId: newId('fam'), semanticFingerprint: hashOf(prompt),
    intendedDifficulty: 'basic_diagnostic', difficultyNote: 'intended', prompt, voiceForm: prompt, approvedRenderingIds: [], choices: null, expectedAnswer, rubricVersionId: rubric.id,
    hints: [{ hintId: newId('hint'), order: 1, text: 'Transpose turns that column into a row so their product is a dot product.', revealsAnswer: false }],
    sourceEvidence: [], dependencies: [], validationReportIds: [], state: 'asked', generationRequestId: newId('gen'), failure: null, slot: 'basic',
  };
  app.db.insert('rubric_versions', rubric);
  app.db.insert('question_records', question);
  return { question, rubric };
}

let responseCounter = 0;
/** Commit an answer as the session coordinator would. */
export function answer(t, { question, rubric }, text, { assistance = [], evidenceStatus = 'eligible', responseId = `resp_${++responseCounter}`, sessionId = 'sess_1', turnId = `turn_${responseCounter}` } = {}) {
  const exam = t.app.db.get('exams', t.exam.id);
  return t.app.services.learner.commitInteraction(t.scope, {
    sessionId, turnId, responseId, questionId: question.id, questionVersion: question.version, promptSnapshot: question.prompt, promptDeliveryEventIds: ['del_prompt'],
    finalizedAnswer: text, asr: { finalized: true, confidence: null, ambiguousSpans: [] }, assistance, evidenceStatus, promptCompatibility: 'approved',
    objectiveVersionIds: question.objectiveVersionIds, rubricVersionId: rubric.id, knowledgeManifestId: t.manifest.id, personalManifestId: exam.publishedPersonalManifestId,
    profileSnapshotId: exam.currentProfileSnapshotId, responseAt: t.app.clock.iso(), observedFacts: [],
  });
}

/** Drain, letting coalescing windows elapse. */
export async function settle(t, rounds = 4) {
  for (let i = 0; i < rounds; i++) { await t.app.drain(); t.app.clock.advance(t.app.config.personalCoalesceMs + 10); }
  await t.app.drain();
}

export const hint = text => ({ questionId: null, semanticUnitId: newId('su'), kind: 'hint', text, deliveryEventIds: [newId('del')], extent: 'complete', recordedAt: '2026-10-04T12:00:00.000Z' });
