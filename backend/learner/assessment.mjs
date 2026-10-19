import { newId, hashOf } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';
import { s, problems } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { sameExact } from '../questions/records.mjs';
import { createLearnerModel } from './model.mjs';

// Evidence, assessment and mastery (spec §4.3, §5.2, §7.1 steps 3–4, §7.3; v10).
// Stage 1 (assess_answer): a posed graded question's answer against its versioned rubric and actual assistance. The
//   request carries no mastery estimate. Its findings are observations for the learner model (model.mjs), which owns
//   θ/σ and the mastery projections. Ordinary turns get no model call: the director's classification is their evidence.
// Stage 2 (update_learner): the assessor's diagnoses, inferred teaching observations and the hand-off to personalization.

export const POLICY_VERSION = 'v1_engineering';
export const POLICY = {
  version: POLICY_VERSION, allowedCapabilities: ['recall', 'explanation', 'application', 'transfer', 'delayed_retention'],
  estimationMode: 'reasoner_estimate',
  displayMapping: { labels: { unknown: 'Not assessed', emerging: 'Emerging', developing: 'Developing', secure: 'Secure' }, note: 'Index is a normalized display value, not a probability.' },
  evidenceEligibilityRules: ['Only eligible, finalized responses to fully delivered prompts are assessed.', 'Ambiguous transcripts, uncertain delivery and prompt drift never lower an estimate.'],
  updateRules: ['Independent evidence may raise or lower an estimate.', 'Only attributable objective findings update a topic.', 'Context-only objectives receive no credit.'],
  assistanceRules: ['An answer after any delivered hint is assisted.', 'Generated but unplayed assistance does not count.', 'Unknown delivery extent is never independent evidence.'],
  publishedAt: '2026-10-04T00:00:00.000Z', validationStatus: 'engineering_unvalidated',
};

const CAPABILITY = s.enum(POLICY.allowedCapabilities);
const EVIDENCE_REF = s.object({ kind: s.enum(['source_anchor', 'interaction', 'assessment', 'feedback', 'explicit_exam_instruction']), id: s.string({ min: 1 }), detail: s.nullable(s.string()) });
const UNCERTAINTY = s.object({ reason: s.string(), evidence: s.array(EVIDENCE_REF), alternatives: s.array(s.string()) });
export const ESTIMATE = s.object({
  status: s.enum(['unknown', 'estimated']), displayIndex: s.nullable(s.displayIndex()), ordinal: s.nullable(s.enum(['emerging', 'developing', 'secure'])),
  distribution: s.nullable(s.array(s.object({ label: s.string(), mass: s.fraction() }))), uncertainty: s.enum(['high', 'medium', 'low', 'unknown']), basis: s.string({ max: 2000 }),
});
const ASSISTANCE_LEVEL = s.enum(['independent', 'assisted', 'revealed', 'uncertain']);
const FINDING = s.object({
  objectiveVersionId: s.string({ min: 1 }), topicId: s.string({ min: 1 }), criterionId: s.string({ min: 1 }), capability: CAPABILITY,
  outcome: s.enum(['supported', 'contradicted', 'insufficient']), observed: s.string({ max: 4000 }),
  answerSpan: s.nullable(s.object({ start: s.int({ min: 0 }), end: s.int({ min: 0 }) })), assistanceLevel: ASSISTANCE_LEVEL, evidence: s.array(EVIDENCE_REF),
});
const DIAGNOSIS = s.object({
  diagnosisId: s.string({ min: 1 }), statement: s.string({ min: 1, max: 1000 }), status: s.enum(['provisional', 'supported', 'contradicted', 'resolved']),
  evidence: s.array(EVIDENCE_REF), alternativeExplanations: s.array(s.string()), confidence: s.nullable(s.fraction()), supersedesDiagnosisId: s.nullable(s.string()),
});
export const LOCAL_OUTPUT = s.object({
  assessment: s.object({
    disposition: s.enum(['assessed', 'insufficient_evidence', 'needs_clarification', 'failed']),
    findings: s.array(FINDING), uncertainty: s.array(UNCERTAINTY),
  }),
});
const FACT_IN = s.object({
  factId: s.string({ min: 1 }), applicability: s.object({ level: s.enum(['learner', 'exam']), examId: s.nullable(s.string()) }),
  kind: s.enum(['goal', 'preference', 'correction', 'teaching_observation', 'context']), key: s.string({ min: 1, max: 200 }), value: s.json(),
  origin: s.enum(['explicit_user', 'inferred']), durability: s.enum(['until_revoked', 'session', 'reviewable']), evidence: s.array(EVIDENCE_REF),
  counterEvidence: s.array(EVIDENCE_REF), status: s.enum(['active', 'superseded', 'retracted']), confidence: s.nullable(s.fraction()),
  validFrom: s.string(), expiresAt: s.nullable(s.string()), supersedesFactId: s.nullable(s.string()),
});
export const ASSESS_OUTPUT = s.object({
  assessment: s.object({
    disposition: s.enum(['applied', 'insufficient_evidence', 'needs_clarification', 'failed']),
    estimate: ESTIMATE, capabilities: s.array(s.object({ capability: CAPABILITY, estimate: ESTIMATE, evidenceIds: s.array(s.string()) })),
    diagnoses: s.array(DIAGNOSIS), uncertainty: s.array(UNCERTAINTY),
  }),
  profileChanges: s.object({ upsert: s.array(FACT_IN), retractFactIds: s.array(s.string()), reason: s.string() }),
  topicDiagnosisChanges: s.array(DIAGNOSIS),
  semanticChange: s.object({ eligible: s.bool(), reason: s.string(), kinds: s.array(s.enum(['meaningful_answer', 'explicit_feedback', 'correction', 'diagnosis_contradiction', 'preference_change', 'delayed_performance'])), affectedTopicIds: s.array(s.string()) }),
  nextDiagnosticSuggestion: s.nullable(s.string()),
});

const ASSIST_RANK = { independent: 0, uncertain: 1, assisted: 2, revealed: 3 };
export const UNKNOWN = Object.freeze({ status: 'unknown', displayIndex: null, ordinal: null, distribution: null, uncertainty: 'unknown', basis: 'No assessed evidence yet.' });

/** true/false when a structured answer can be graded exactly, null when the model must judge it. */
export function gradeStructured(q, r, evidence) {
  const answer = evidence.structuredAnswer, expected = r?.expectedStructured;
  if (!answer || expected === undefined || expected === null || !EXACT_KINDS.has(q?.inputKind) || answer.kind !== q.inputKind) return null;
  const v = answer.value, sorted = x => [...x].map(String).sort().join('|');
  switch (q.inputKind) {
    case 'choice': return String(v) === String(expected);
    case 'multi_select': return Array.isArray(v) && sorted(v) === sorted(expected);
    case 'order': return Array.isArray(v) && v.map(String).join('|') === expected.map(String).join('|');
    case 'match': return Array.isArray(v) && sorted(v.map(p => `${p[0]}>${p[1]}`)) === sorted(expected.map(p => `${p[0]}>${p[1]}`));
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      const tol = q.inputSpec?.tolerance ?? 0;
      return Math.abs(v - expected) <= Math.max(1e-9, Math.abs(expected) * tol);
    }
    default: return null;
  }
}
const EXACT_KINDS = new Set(['choice', 'multi_select', 'order', 'match', 'number']);

/** Assistance actually delivered before the answer, from the evidence's delivery snapshot. */
export function deliveredAssistance(evidence) {
  let level = 'independent';
  for (const a of evidence.assistance || []) {
    const l = a.extent === 'uncertain' ? 'uncertain' : a.kind === 'answer_reveal' || a.kind === 'worked_step' ? 'revealed' : 'assisted';
    if (ASSIST_RANK[l] > ASSIST_RANK[level]) level = l;
  }
  if (evidence.evidenceStatus === 'delivery_uncertain' && level === 'independent') level = 'uncertain';
  return level;
}

export function createAssessment(app, { profiles, changes }) {
  const { db, clock, events, jobs } = app;
  const providers = () => app.providers || {};

  const question = (scope, id) => app.services.questions?.get?.(scope, id) ?? db.get('question_records', id, scope);
  const rubric = (scope, id) => app.services.questions?.rubric?.(scope, id) ?? db.get('rubric_versions', id, scope);
  const knowledgeView = (scope, manifestId) => app.services.knowledge.view(scope, manifestId);
  const model = createLearnerModel(app, { ensureTopic, question });

  // ---------- Topic state and projections ----------

  function projection(scope, topicId) { return db.findOne('mastery_projections', { topicId }, { scope }); }
  function topicState(scope, topicId) { return db.findOne('learner_topic_states', { topicId }, { scope }); }

  function ensureTopic(scope, topicId, objectiveVersionIds = [], { segment } = {}) {
    let p = projection(scope, topicId);
    if (!p) {
      p = { id: newId('mp'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, topicId, projectionVersion: 0, currentAssessmentId: null, estimate: { ...UNKNOWN }, capabilities: [], objectiveVersionIds, assessmentPolicyVersion: POLICY_VERSION, comparabilitySegmentId: segment || newId('seg'), lastEvidenceAt: null };
      db.insert('mastery_projections', p);
    }
    if (!topicState(scope, topicId)) {
      const exam = db.get('exams', scope.examId, scope);
      db.insert('learner_topic_states', { id: newId('lts'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, topicId, stateVersion: 0, profileSnapshotId: exam.currentProfileSnapshotId, diagnoses: [], latestAssessmentIds: [], masteryProjectionId: p.id, resumeStateId: null, lastMeaningfulEvidenceAt: null });
    }
    return p;
  }

  function appendHistory(scope, p, { assessmentId, kind, effectiveEvidenceAt, supersedesHistoryPointId = null }) {
    const last = db.prepare('SELECT MAX(sequence) AS s FROM mastery_history_points WHERE exam_id = ? AND topic_id = ?').get(scope.examId, p.topicId);
    const point = { id: newId('mhp'), scope, createdAt: clock.iso(), topicId: p.topicId, sequence: (last?.s ?? 0) + 1, assessmentId, projectionVersion: p.projectionVersion, estimate: p.estimate, capabilities: p.capabilities, effectiveEvidenceAt: effectiveEvidenceAt || clock.iso(), recordedAt: clock.iso(), kind, comparabilitySegmentId: p.comparabilitySegmentId, supersedesHistoryPointId };
    db.insert('mastery_history_points', point);
    return point;
  }

  /** knowledge.published: unknown projections for new topics; migrations open new comparability segments. */
  function onKnowledgePublished(scope, payload) {
    const v = knowledgeView(scope, payload.newManifestId);
    const migrations = (payload.migrationIds || []).length ? db.find('topic_migrations', { id: payload.migrationIds }, { scope }) : [];
    for (const m of migrations) {
      if (!['split', 'merge', 'objective_meaning_change'].includes(m.kind)) continue; // rename/reparent keep id and history
      for (const topicId of m.toTopicIds) {
        const existing = projection(scope, topicId);
        const segment = newId('seg');
        if (!existing) { ensureTopic(scope, topicId, [], { segment }); continue; }
        // Same topic, new meaning: a new comparability segment starting unknown. Old points stay as they were.
        // segmentStartedAt: the learner model counts only evidence from here on for this topic.
        const next = db.update('mastery_projections', { ...existing, estimate: { ...UNKNOWN, basis: `Objective changed (${m.kind}); reassessment required.` }, capabilities: [], currentAssessmentId: null, comparabilitySegmentId: segment, segmentStartedAt: clock.iso(), projectionVersion: existing.projectionVersion + 1, updatedAt: clock.iso() });
        appendHistory(scope, next, { assessmentId: null, kind: 'objective_transition' });
      }
    }
    for (const t of v.topics) ensureTopic(scope, t.topicId, t.objectiveVersionIds);
  }

  // ---------- Evidence ----------

  const EVIDENCE_IN = s.object({
    sessionId: s.string({ min: 1 }), turnId: s.string({ min: 1 }), responseId: s.nullable(s.string()), questionId: s.nullable(s.string()), questionVersion: s.nullable(s.int()),
    promptSnapshot: s.string(), promptDeliveryEventIds: s.array(s.string()), finalizedAnswer: s.nullable(s.string()), answerArtifact: s.nullable(s.json()),
    asr: s.nullable(s.object({ finalized: s.bool(), confidence: s.nullable(s.fraction()), ambiguousSpans: s.array(s.string()) })),
    assistance: s.array(s.json()), evidenceStatus: s.enum(['eligible', 'ambiguous', 'incomplete_prompt', 'delivery_uncertain', 'prompt_drift', 'withdrawn']),
    promptRenderingId: s.nullable(s.string()), promptCompatibility: s.enum(['approved', 'material_drift', 'unknown']),
    objectiveVersionIds: s.array(s.string()), rubricVersionId: s.nullable(s.string()), knowledgeManifestId: s.string({ min: 1 }), personalManifestId: s.nullable(s.string()),
    profileSnapshotId: s.string({ min: 1 }), responseAt: s.string(), observedFacts: s.array(s.string()), supersedesEvidenceId: s.nullable(s.string()),
    topicIds: s.array(s.string()), structuredAnswer: s.nullable(s.object({ kind: s.string({ max: 40 }), value: s.json() })),
  }, { optional: ['structuredAnswer', 'responseId', 'questionId', 'questionVersion', 'answerArtifact', 'asr', 'promptRenderingId', 'rubricVersionId', 'personalManifestId', 'observedFacts', 'supersedesEvidenceId', 'topicIds', 'promptDeliveryEventIds', 'assistance', 'objectiveVersionIds', 'promptCompatibility', 'finalizedAnswer'] });

  /** Store InteractionEvidence and schedule assessment. Idempotent on responseId. */
  function commitInteraction(scope, fields) {
    const p = problems(EVIDENCE_IN, fields);
    if (p.length) throw new AppError('invalid_input', `Invalid interaction evidence: ${p.slice(0, 4).join('; ')}`);
    return db.tx(() => {
      if (fields.responseId) {
        const prior = db.findOne('interaction_evidence', { responseId: fields.responseId }, { scope });
        if (prior) {
          if ((prior.finalizedAnswer ?? null) !== (fields.finalizedAnswer ?? null)) throw new AppError('idempotency_conflict', 'This response was already committed with different text.');
          return prior;
        }
      }
      const { topicIds = [], ...rest } = fields;
      const evidence = {
        id: newId('ie'), scope, createdAt: clock.iso(),
        responseId: null, questionId: null, questionVersion: null, promptDeliveryEventIds: [], finalizedAnswer: null, answerArtifact: null, asr: null, assistance: [],
        promptRenderingId: null, promptCompatibility: 'unknown', objectiveVersionIds: [], rubricVersionId: null, personalManifestId: null, observedFacts: [], supersedesEvidenceId: null, structuredAnswer: null,
        ...rest, topicIds,
      };
      // Prompt drift / ambiguity / uncertain delivery: keep the record, never grade it adversely.
      if (evidence.promptCompatibility === 'material_drift' && evidence.evidenceStatus === 'eligible') evidence.evidenceStatus = 'prompt_drift';
      db.insert('interaction_evidence', evidence);
      // Only a posed graded question is graded by a model; any other line stays a record (the director reads answers to cards).
      if (evidence.evidenceStatus === 'eligible' && evidence.questionId && evidence.rubricVersionId) {
        jobs.enqueue({ scope, type: 'assess_answer', idempotencyKey: `assess_answer:${evidence.id}`, payload: { evidenceId: evidence.id }, priority: 20 });
      }
      return evidence;
    });
  }

  /** Transcript correction: a superseding evidence record; originals stay. */
  function supersedeInteraction(scope, priorEvidenceId, fields) {
    const prior = db.must('interaction_evidence', priorEvidenceId, scope, 'Evidence');
    const { id, scope: _s, createdAt, ...base } = prior;
    return commitInteraction(scope, { ...base, ...fields, supersedesEvidenceId: prior.id });
  }

  // ---------- Stage 1: local answer assessment ----------

  function learnerInputs(scope, topicIds) {
    return { learnerContext: changes.contextRef(scope, topicIds), selectedProfileFacts: changes.selectedFacts(scope, topicIds) };
  }

  async function assessAnswer({ evidenceId }, ctx) {
    const scope = ctx.job.scope;
    const evidence = db.must('interaction_evidence', evidenceId, scope, 'Evidence');
    const q = question(scope, evidence.questionId), r = rubric(scope, evidence.rubricVersionId);
    if (!q || !r) throw new AppError('stale_dependency', 'Question or rubric missing for assessment.');
    const v = knowledgeView(scope, evidence.knowledgeManifestId);
    const objectives = v.objectives.filter(o => evidence.objectiveVersionIds.includes(o.id) || q.objectiveVersionIds.includes(o.id));
    const anchorIds = [...new Set(objectives.flatMap(o => o.sourceEvidence.filter(e => e.kind === 'source_anchor').map(e => e.id)))];
    const topicIds = [...new Set(q.objectiveTargets.map(t => t.topicId))];
    const request = {
      work: workIdentity({ scope, idempotencyKey: `local:${evidence.id}`, input: { evidenceId, rubric: r.id }, clock, dependencies: [{ ref: { kind: 'interaction_evidence', id: evidence.id, version: null }, hash: hashOf(evidence), relation: 'assessed_with' }, { ref: { kind: 'rubric_version', id: r.id, version: r.version }, hash: r.meaningHash, relation: 'assessed_with' }] }),
      interaction: evidence, question: q, rubric: r, objectives,
      sourceEvidence: app.services.knowledge.anchors(scope, anchorIds).map(a => ({ anchor: a.anchor, excerpt: a.excerpt || '' })),
      ...learnerInputs(scope, topicIds), policy: POLICY,
    };
    // Exact input kinds are graded deterministically against the rubric's structured answer; an exam problem part by part.
    const exam = q.format === 'exam' && Array.isArray(r.parts);
    const exact = exam ? null : gradeStructured(q, r, evidence);
    const result = exam ? await assessExam(q, r, evidence, request)
      : exact ? exactAssessment(exact, q, r, evidence) : await call(i => providers().localAssessor.assessAnswer(i), request, { valueSchema: LOCAL_OUTPUT, what: 'local assessment' });
    const finalAttempt = ctx.job.attempt >= ctx.job.maxAttempts;
    if (result.outcome === 'failed' && result.error?.retryable && !finalAttempt) throw new AppError(result.error.code, result.error.message, { retryable: true });

    const ledgerLevel = deliveredAssistance(evidence);
    const assessed = new Map(q.objectiveTargets.filter(t => t.role === 'assessed').map(t => [t.objectiveVersionId, t]));
    // Only rubric-mapped, assessed objectives count; the model cannot claim less help than was delivered.
    const findings = result.outcome === 'ok' ? result.value.assessment.findings
      .filter(f => assessed.has(f.objectiveVersionId) && assessed.get(f.objectiveVersionId).topicId === f.topicId && r.criteria.some(c => c.criterionId === f.criterionId))
      .map(f => ({ ...f, assistanceLevel: ASSIST_RANK[f.assistanceLevel] >= ASSIST_RANK[ledgerLevel] ? f.assistanceLevel : ledgerLevel, evidence: f.evidence.length ? f.evidence : [{ kind: 'interaction', id: evidence.id, detail: null }] })) : [];
    const disposition = result.outcome === 'ok' ? result.value.assessment.disposition : 'failed';
    const prior = db.findOne('local_answer_assessments', { interactionEvidenceId: evidence.id }, { scope, order: 'version DESC' });
    const local = {
      id: newId('laa'), scope, createdAt: clock.iso(), version: (prior?.version || 0) + 1, supersedesId: prior?.id || null,
      interactionEvidenceId: evidence.id, questionId: q.id, questionVersion: q.version, rubricVersionId: r.id, policyVersion: POLICY_VERSION,
      findings, disposition, uncertainty: result.outcome === 'ok' ? result.value.assessment.uncertainty : [{ reason: result.reason || 'provider failed', evidence: [], alternatives: [] }],
      dependencies: request.work.dependencies, runs: result.providerRuns,
      // Partial credit: each part's points times the share of its criteria the answer supports.
      ...(exam ? { parts: r.parts.map(p => ({ partId: p.partId, points: p.points, earned: Math.round(10 * p.points * p.criterionIds.filter(id => findings.some(f => f.criterionId === id && f.outcome === 'supported')).length / Math.max(1, p.criterionIds.length)) / 10 })) } : {}),
    };
    ctx.commit(() => {
      for (const o of model.graded(local, q, evidence)) model.observe(scope, o); // θ/σ and the mastery bars (before the row, which a first backfill would read)
      db.insert('local_answer_assessments', local);
      const byTopic = new Map();
      for (const f of findings) byTopic.set(f.topicId, [...(byTopic.get(f.topicId) || []), f]);
      // Topics with attributable findings get a learner update; a failed local assessment records a failed attempt.
      const targets = disposition === 'failed' ? topicIds.filter(t => assessed.size && [...assessed.values()].some(a => a.topicId === t)) : [...byTopic.keys()];
      for (const topicId of targets) jobs.enqueue({ scope, type: 'update_learner', idempotencyKey: `update_learner:${local.id}:${topicId}`, payload: { topicId, localAssessmentIds: [local.id], evidenceIds: [evidence.id], failedLocal: disposition === 'failed' }, priority: 15 });
      if (!targets.length && disposition !== 'failed') jobs.enqueue({ scope, type: 'assess_response', idempotencyKey: `assess_response:${evidence.id}`, payload: { evidenceId: evidence.id, topicIds }, priority: 10 });
    });
    return { resultRefs: [{ kind: 'local_answer_assessment', id: local.id, version: local.version }] };
  }

  const deterministicRun = () => ({ adapter: 'deterministic', modelId: 'structured-answer', modelVersion: '1', promptTemplateVersion: 'structured_grade_v1', configVersion: app.config.version, requestId: newId('req'), startedAt: clock.iso(), finishedAt: clock.iso() });

  function exactAssessment(correct, q, r, evidence) {
    const findings = q.objectiveTargets.filter(t => t.role === 'assessed').flatMap(t => t.criterionIds.map(criterionId => ({
      objectiveVersionId: t.objectiveVersionId, topicId: t.topicId, criterionId, capability: r.criteria.find(c => c.criterionId === criterionId)?.capability || t.capabilities[0] || 'recall',
      outcome: correct ? 'supported' : 'contradicted', observed: `${q.inputKind} answer ${correct ? 'matches' : 'does not match'} the expected answer: ${evidence.finalizedAnswer ?? ''}`.slice(0, 4000),
      answerSpan: null, assistanceLevel: 'independent', evidence: [{ kind: 'interaction', id: evidence.id, detail: null }],
    })));
    return { outcome: 'ok', value: { assessment: { disposition: 'assessed', findings, uncertainty: [] } }, reason: null, uncertainties: [], issues: [], error: null, providerRuns: [deterministicRun()] };
  }

  /**
   * An exam answer graded part by part: a number or choice part exactly, a blank part as no evidence, and every other
   * part by the assessor on that part's criteria and answer only. A reply without per-part answers is read whole.
   */
  async function assessExam(q, r, evidence, request) {
    const given = evidence.structuredAnswer?.kind === 'exam' ? evidence.structuredAnswer.value : null;
    const targets = new Map(q.objectiveTargets.filter(t => t.role === 'assessed').map(t => [t.objectiveVersionId, t]));
    const findings = [], open = [];
    for (const p of r.parts) {
      const answer = given ? String(given[p.partId] ?? '').trim() : null;
      const same = answer ? sameExact(p.kind, answer, p.expectedStructured, (q.parts.find(x => x.id === p.partId)?.answer.choices || []).map(c => c.id)) : null;
      if (answer === null || (answer && same === null)) { open.push({ ...p, answer }); continue; }
      for (const criterionId of p.criterionIds) {
        const c = r.criteria.find(x => x.criterionId === criterionId), t = targets.get(c?.objectiveVersionId);
        if (c && t) findings.push({ objectiveVersionId: t.objectiveVersionId, topicId: t.topicId, criterionId, capability: c.capability, outcome: !answer ? 'insufficient' : same ? 'supported' : 'contradicted', observed: `Part ${p.partId}: ${answer ? `${JSON.stringify(answer.slice(0, 300))} ${same ? 'matches' : 'does not match'} the expected answer` : 'left blank'}.`, answerSpan: null, assistanceLevel: 'independent', evidence: [{ kind: 'interaction', id: evidence.id, detail: null }] });
      }
    }
    let uncertainty = [], runs = [deterministicRun()];
    if (open.length) {
      const ids = new Set(open.flatMap(p => p.criterionIds)), points = c => r.parts.find(p => p.partId === c.partId)?.points;
      const result = await call(i => providers().localAssessor.assessAnswer(i), {
        ...request,
        rubric: { ...r, criteria: r.criteria.filter(c => ids.has(c.criterionId)).map(c => ({ ...c, text: `[Part ${c.partId}, ${points(c)} points] ${c.text}` })), expectedAnswer: open.map(p => `Part ${p.partId}: ${p.expectedAnswer}`).join('\n'), acceptableAlternatives: open.flatMap(p => p.acceptableAlternatives.map(a => `Part ${p.partId}: ${a}`)) },
        interaction: { ...evidence, promptSnapshot: q.prompt, finalizedAnswer: given ? open.map(p => `Part ${p.partId}: ${p.answer}`).join('\n\n') : evidence.finalizedAnswer },
      }, { valueSchema: LOCAL_OUTPUT, what: 'local assessment' });
      if (result.outcome !== 'ok') return result;
      findings.push(...result.value.assessment.findings);
      uncertainty = result.value.assessment.uncertainty; runs = [...runs, ...result.providerRuns];
    }
    return { outcome: 'ok', value: { assessment: { disposition: findings.some(f => f.outcome !== 'insufficient') ? 'assessed' : 'insufficient_evidence', findings, uncertainty } }, reason: null, uncertainties: [], issues: [], error: null, providerRuns: runs };
  }

  // ---------- Stage 2: broader estimate for one topic ----------

  function priorEvidence(scope, topicId, excludeIds) {
    const recent = db.find('learner_assessments', { topicId }, { scope, order: 'rowid DESC', limit: 5 });
    const ids = [...new Set(recent.flatMap(a => a.interactionEvidenceIds))].filter(id => !excludeIds.includes(id));
    return ids.length ? db.find('interaction_evidence', { id: ids }, { scope }) : [];
  }

  /**
   * Shared by update_learner (with findings) and assess_response (diagnoses only): the assessor's diagnoses, inferred
   * teaching observations and the hand-off to personalization. The estimate is the learner model's; the record keeps it.
   */
  async function estimateTopic(scope, { topicId, localAssessmentIds = [], evidenceIds, failedLocal = false, scoreable }, ctx) {
    ensureTopic(scope, topicId);
    const locals = localAssessmentIds.length ? db.find('local_answer_assessments', { id: localAssessmentIds }, { scope }) : [];
    const interactions = db.find('interaction_evidence', { id: evidenceIds }, { scope });
    // A correction supersedes the assessment applied for the evidence it replaces.
    const supersededEvidenceIds = interactions.map(e => e.supersedesEvidenceId).filter(Boolean);
    const supersededAssessment = supersededEvidenceIds.length ? db.find('learner_assessments', { topicId, disposition: 'applied' }, { scope }).reverse().find(a => a.interactionEvidenceIds.some(id => supersededEvidenceIds.includes(id))) : null;
    const rubricIds = [...new Set(locals.map(l => l.rubricVersionId))];
    const rubrics = rubricIds.map(id => rubric(scope, id)).filter(Boolean);
    const appliedKey = scoreable ? hashOf({ evidence: [...evidenceIds].sort(), topicId, policy: POLICY_VERSION, rubrics: rubricIds.sort(), locals: localAssessmentIds.map(id => db.get('local_answer_assessments', id, scope)?.version) }) : null;
    if (appliedKey && db.findOne('learner_assessments', { appliedKey }, { scope })) return { duplicate: true };

    const prior = projection(scope, topicId), state = topicState(scope, topicId);
    const v = knowledgeView(scope, interactions[0]?.knowledgeManifestId || db.get('exams', scope.examId, scope).publishedKnowledgeManifestId);
    const objectives = v.objectives.filter(o => o.topicId === topicId);
    const attributable = locals.map(l => ({ ...l, findings: l.findings.filter(f => f.topicId === topicId) }));
    let result;
    if (failedLocal) result = { outcome: 'failed', value: null, reason: 'Local assessment failed.', providerRuns: [], issues: [], uncertainties: [], error: null };
    else {
      const request = {
        work: workIdentity({ scope, idempotencyKey: `assess:${topicId}:${evidenceIds.join(',')}`, input: { topicId, evidenceIds, prior: prior.projectionVersion }, clock, dependencies: [{ ref: { kind: 'mastery_projection', id: prior.id, version: prior.projectionVersion }, hash: hashOf(prior.estimate), relation: 'assessed_with' }] }),
        topicId, localAssessments: attributable, relevantInteractions: interactions, rubricVersions: rubrics, objectives, priorProjection: prior,
        ...learnerInputs(scope, [topicId]), relevantPriorEvidence: priorEvidence(scope, topicId, evidenceIds), diagnoses: state.diagnoses, policy: POLICY,
      };
      result = await call(i => providers().learnerAssessor.assess(i), request, { valueSchema: ASSESS_OUTPUT, what: 'learner assessment' });
      if (result.outcome === 'failed' && result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true });
    }

    return ctx.commit(() => {
      const latest = projection(scope, topicId);
      const value = result.outcome === 'ok' ? result.value : null;
      const hasFindings = attributable.some(l => l.findings.length);
      let disposition = value ? value.assessment.disposition : 'failed';
      // Without attributable findings there is nothing applied: diagnoses only.
      if (disposition === 'applied' && (!scoreable || !hasFindings)) disposition = 'insufficient_evidence';
      const applied = disposition === 'applied';
      const allFindings = attributable.flatMap(l => l.findings.map(f => ({ objectiveVersionId: f.objectiveVersionId, criterionId: f.criterionId, observed: f.observed, outcome: f.outcome, assistanceLevel: f.assistanceLevel, evidence: f.evidence })));
      const assessment = {
        id: newId('la'), scope, createdAt: clock.iso(), version: 1, supersedesAssessmentId: applied ? supersededAssessment?.id || null : null,
        topicId, objectiveVersionIds: [...new Set(allFindings.map(f => f.objectiveVersionId))], interactionEvidenceIds: evidenceIds, localAnswerAssessmentIds: localAssessmentIds,
        rubricVersionId: rubricIds[0] || null, assessmentPolicyVersion: POLICY_VERSION, priorProjectionId: latest.id, priorProjectionVersion: latest.projectionVersion,
        findings: allFindings, estimate: latest.estimate, capabilities: latest.capabilities, // the learner model's, as it stands
        diagnoses: value?.assessment.diagnoses || [], uncertainty: value?.assessment.uncertainty || [{ reason: result.reason || 'assessment failed', evidence: [], alternatives: [] }],
        disposition, comparabilitySegmentId: latest.comparabilitySegmentId, dependencies: [], runs: result.providerRuns || [],
        appliedKey: applied ? appliedKey : null,
      };
      db.insert('learner_assessments', assessment);

      // Topic state: diagnoses with history (superseded ones keep their records in assessments).
      const st = topicState(scope, topicId);
      const diagnosisChanges = [...(value?.assessment.diagnoses || []), ...(value?.topicDiagnosisChanges || [])];
      const byId = new Map(st.diagnoses.map(d => [d.diagnosisId, d]));
      for (const d of diagnosisChanges) { if (d.supersedesDiagnosisId) byId.delete(d.supersedesDiagnosisId); byId.set(d.diagnosisId, d); }
      const contradicted = diagnosisChanges.filter(d => d.status === 'contradicted' && st.diagnoses.some(x => x.diagnosisId === (d.supersedesDiagnosisId || d.diagnosisId) && x.status !== 'contradicted'));
      db.update('learner_topic_states', { ...st, stateVersion: st.stateVersion + 1, diagnoses: [...byId.values()], latestAssessmentIds: [assessment.id, ...st.latestAssessmentIds].slice(0, 10), lastMeaningfulEvidenceAt: value ? clock.iso() : st.lastMeaningfulEvidenceAt, updatedAt: clock.iso() });

      // Inferred profile changes: reviewable, evidence-backed; never explicit, never a trait from one answer.
      if (value && (value.profileChanges.upsert.length || value.profileChanges.retractFactIds.length)) {
        const ev = [{ kind: 'assessment', id: assessment.id, detail: null }];
        const incoming = value.profileChanges.upsert.filter(f => f.origin === 'inferred').map(f => profiles.fact({ applicability: { level: 'exam', examId: scope.examId }, kind: f.kind === 'preference' ? 'teaching_observation' : f.kind, key: f.key, value: f.value, origin: 'inferred', durability: 'reviewable', evidence: [...f.evidence, ...ev], confidence: Math.min(f.confidence ?? 0.5, 0.5) }));
        profiles.commitExamFacts(scope, facts => profiles.retractFacts(profiles.upsertFacts(facts, incoming), value.profileChanges.retractFactIds, ev), { reason: value.profileChanges.reason || 'assessment evidence' });
      }

      // Mandatory hand-off to personalization for meaningful changes.
      if (value?.semanticChange.eligible) {
        const kinds = contradicted.length ? ['diagnosis_contradiction', ...value.semanticChange.kinds] : value.semanticChange.kinds;
        const kind = supersededAssessment ? 'correction' : kinds[0] || 'meaningful_answer';
        changes.create(scope, {
          kind, topicIds: [...new Set([topicId, ...value.semanticChange.affectedTopicIds])],
          evidence: [...evidenceIds.map(id => ({ kind: 'interaction', id, detail: null })), { kind: 'assessment', id: assessment.id, detail: null }],
          semanticKey: `assessment:${assessment.id}`, reason: value.semanticChange.reason, urgent: kind === 'correction',
        });
      }
      return { resultRefs: [{ kind: 'learner_assessment', id: assessment.id, version: 1 }] };
    });
  }

  const updateLearner = (payload, ctx) => estimateTopic(ctx.job.scope, { ...payload, scoreable: true }, ctx);
  async function assessResponse({ evidenceId, topicIds }, ctx) {
    let last;
    for (const topicId of topicIds) last = await estimateTopic(ctx.job.scope, { topicId, evidenceIds: [evidenceId], scoreable: false }, ctx);
    return last || {};
  }

  return {
    model, ensureTopic, projection, topicState, onKnowledgePublished, commitInteraction, supersedeInteraction,
    assessAnswer, updateLearner, assessResponse,
    projections: scope => new Map(db.find('mastery_projections', {}, { scope }).map(p => [p.topicId, p])),
    history: (scope, topicId) => db.find('mastery_history_points', { topicId }, { scope, order: 'sequence' }),
    assessments: (scope, topicId) => db.find('learner_assessments', topicId ? { topicId } : {}, { scope }),
  };
}
