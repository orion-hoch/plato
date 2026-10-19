import { newId, hashOf } from '../core/util.mjs';
import { AppError, issue } from '../core/errors.mjs';
import { s, problems } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { RUBRIC_POLICY_VERSION, DIFFICULTIES, NUMBER_WORDS, inputProblems } from './records.mjs';
import { authorExam } from './exam.mjs';

// Questions (spec §4.5, §5.5, §9): bounded generic hopper per subtopic, on-demand custom path,
// validation before READY, atomic reservations with epoch-owned leases, exposure ledger, invalidation.
// Exam problems (format 'exam', exam.mjs) are filed under a unit (top-level topic): a small pool per unit, made one at
// a time per exam below every other background job, and on demand.

// basic is the diagnostic slot; challenging aims at transfer: several steps, in a setting unlike the notes' examples.
const SLOTS = { basic: 'basic_diagnostic', challenging: 'transfer', exam: 'application' };
const INFLIGHT = ['queued', 'generating', 'validating'];
// The agent's own requests run just below plan_turn (50), so planning a reply always goes first.
const CUSTOM_PRIORITY = 50, AGENT_PRIORITY = 45, REFILL_PRIORITY = 10, EXAM_POOL_PRIORITY = 5;
// A unit whose exam problems keep failing stops at this many failed attempts per published manifest.
const EXAM_POOL_FAILURES = 3;
// An exam problem is many long model calls (exam.mjs), so its work gets an hour, not ten minutes.
const EXAM_BUDGET = { maxProviderCalls: 12, maxInputTokens: 1_000_000, maxOutputTokens: 300_000, maxWallTimeMs: 3_600_000, maxAttempts: 2 };
const OUTPUT = s.object({ question: s.json(), rubric: s.json() });
const VALIDATION = s.object({ report: s.json(), repairInstructions: s.json() });
const CONDITION_WORDS = ['not', 'no', 'never', 'except', 'without', 'unless', 'only', 'nonzero', 'non', 'at least', 'at most'];

const norm = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const numbersIn = text => (norm(text).replace(new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'g'), w => String(NUMBER_WORDS.indexOf(w))).match(/-?\d+(\.\d+)?/g) || []).sort();
const conditionsIn = text => CONDITION_WORDS.map(w => (norm(text).match(new RegExp(`\\b${w}\\b`, 'g')) || []).length);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function installQuestions(app) {
  const { db, clock, config, events, jobs } = app;
  const knowledge = () => app.services.knowledge;
  const learner = () => app.services.learner || {};
  const scopeOf = record => ({ tenantId: record.scope.tenantId, learnerId: record.scope.learnerId, examId: record.scope.examId });

  const compatible = (question, manifestId) => question.knowledgeManifestId === manifestId || (question.compatibleManifestIds || []).includes(manifestId);
  const slotOf = q => q.origin === 'generic_hopper' ? (q.format === 'exam' ? 'exam' : q.intendedDifficulty === 'basic_diagnostic' ? 'basic' : 'challenging') : null;
  const examPerUnit = () => config.examQuestionsPerUnit ?? 2;
  const exposedFamilies = scope => new Set(db.find('exposure_records', {}, { scope }).map(e => e.semanticFamilyId));
  const taughtFamilies = scope => new Set(db.find('exposure_records', { kind: ['answer_delivered', 'worked_example_delivered'] }, { scope }).map(e => e.semanticFamilyId));

  function setQuestion(question, patch) { return db.update('question_records', { ...question, ...patch, updatedAt: clock.iso() }); }
  /** A requested question that will not come: whoever asked for it is told (generic refills fail quietly). */
  function emitFailed(scope, request) {
    if (request.origin === 'personalized_custom') events.emit({ scope, eventType: 'question.generation_failed', aggregateType: 'question_generation_request', aggregateId: request.id, payload: { generationRequestId: request.id, topicId: request.topicId }, idempotencyKey: `question.generation_failed:${request.id}` });
  }
  function emitQuestion(type, question, reservationId = null) {
    events.emit({
      scope: scopeOf(question), eventType: type, aggregateType: 'question', aggregateId: question.id, aggregateVersion: question.rowVersion,
      payload: { questionId: question.id, reservationId, topicId: question.topicId, slot: slotOf(question), version: question.version },
      idempotencyKey: `${type}:${question.id}:${reservationId || ''}:${question.rowVersion}`,
    });
  }

  // ---------- Supply and refill (§9) ----------

  function eligibleTopics(view) {
    return view.topics.filter(t => t.status !== 'retired' && t.parentTopicId && t.objectiveVersionIds.length);
  }
  /** A topic and everything under it. */
  function subtree(view, topicId) {
    const out = [topicId];
    for (let i = 0; i < out.length; i++) for (const t of view.topics) if (t.parentTopicId === out[i] && !out.includes(t.topicId)) out.push(t.topicId);
    return out;
  }
  /** Units (top-level topics) with objectives somewhere under them: what exam problems are filed under. */
  const examUnits = view => view.topics.filter(t => { if (t.status === 'retired' || t.parentTopicId) return false; const ids = subtree(view, t.topicId); return view.objectives.some(o => ids.includes(o.topicId)); });

  function ensureSupply(scope, view) {
    if (db.get('exams', scope.examId)?.knowledgeSource === 'guide') return; // a guide-backed course practises from its guide's tries and its real problems
    const rows = [...eligibleTopics(view).flatMap(t => ['basic', 'challenging'].map(slot => [t, slot, config.readyPerSlot])), ...(examPerUnit() ? examUnits(view).map(u => [u, 'exam', examPerUnit()]) : [])];
    for (const [topic, slot, targetReadyCount] of rows) {
      const where = { topicId: topic.topicId, knowledgeManifestId: view.manifest.id, slot };
      if (db.findOne('question_supply', where, { scope })) continue;
      db.insert('question_supply', { id: newId('qsup'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, ...where, targetReadyCount, activeGenerationJobId: null, nextEligibleRefillAt: clock.iso(), pausedReason: null, lastActiveAt: null });
    }
  }

  /** Create at most one generation for this supply row, if the bounded pool needs one. Safe to call repeatedly. */
  function scheduleRefill(scope, supply) {
    return db.tx(() => {
      const row = db.get('question_supply', supply.id, scope);
      if (!row || row.pausedReason === 'superseded') return null;
      const exam = db.get('exams', scope.examId);
      if (!exam || exam.status === 'deleting' || exam.status === 'deleted' || exam.publishedKnowledgeManifestId !== row.knowledgeManifestId) return null;
      const generic = db.find('question_records', { topicId: row.topicId, origin: 'generic_hopper' }, { scope }).filter(q => compatible(q, row.knowledgeManifestId));
      const ready = generic.filter(q => q.state === 'ready' && slotOf(q) === row.slot).length;
      const requests = db.find('question_generation_requests', { origin: 'generic_hopper', state: INFLIGHT }, { scope });
      const inflightSlot = requests.filter(r => r.topicId === row.topicId && r.slot === row.slot).length;
      const inflightTopic = requests.filter(r => r.topicId === row.topicId).length;
      const activeTotal = generic.filter(q => q.state === 'ready' || q.state === 'reserved').length + inflightTopic;
      const examSlot = row.slot === 'exam';
      let pausedReason = null;
      if (ready + inflightSlot >= row.targetReadyCount) pausedReason = null; // full: sleep until an event
      // Exam problems: one in the making per exam, and a unit that keeps failing stops trying on this material.
      else if (examSlot && db.find('question_generation_requests', { origin: 'generic_hopper', state: 'failed', topicId: row.topicId, slot: 'exam' }, { scope }).filter(r => r.knowledgeManifestId === row.knowledgeManifestId).length >= EXAM_POOL_FAILURES) pausedReason = 'failing';
      else if (examSlot && requests.some(r => r.slot === 'exam')) pausedReason = 'exam_author_busy';
      else if (inflightTopic >= config.inFlightGenerationPerSubtopic) pausedReason = 'in_flight_cap';
      else if (activeTotal >= config.maxGenericItemsPerSubtopic) pausedReason = 'subtopic_cap';
      else if (requests.length >= config.queuedGenericJobsPerExam) pausedReason = 'exam_queue_cap';
      const needs = ready + inflightSlot < row.targetReadyCount && !pausedReason;
      if (!needs) { if (row.pausedReason !== pausedReason) db.update('question_supply', { ...row, pausedReason, updatedAt: clock.iso() }); return null; }
      const request = {
        id: newId('qgen'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, origin: 'generic_hopper', state: 'queued', format: examSlot ? 'exam' : 'short',
        topicId: row.topicId, slot: row.slot, objectiveVersionIds: null, narrowTarget: null, intendedDifficulty: SLOTS[row.slot],
        knowledgeManifestId: row.knowledgeManifestId, sessionId: null, turnId: null, questionId: null, error: null, attempts: 0,
      };
      db.insert('question_generation_requests', request);
      const recent = row.lastActiveAt && clock.now() - Date.parse(row.lastActiveAt) < 30 * 60_000;
      // The student's active focus section is filled first.
      const inFocus = (app.services.session?.activeFocus?.(scope)?.topicIds || []).includes(row.topicId);
      const job = examSlot
        ? jobs.enqueue({ scope, type: 'author_exam_question', idempotencyKey: `gen:${request.id}`, payload: { generationRequestId: request.id }, priority: EXAM_POOL_PRIORITY })
        : jobs.enqueue({ scope, type: 'refill_question', idempotencyKey: `gen:${request.id}`, payload: { generationRequestId: request.id }, priority: REFILL_PRIORITY + (recent ? 5 : 0) + (inFocus ? 8 : 0) });
      db.update('question_supply', { ...row, activeGenerationJobId: job.id, pausedReason: null, nextEligibleRefillAt: clock.iso(), updatedAt: clock.iso() });
      return request;
    });
  }

  function refillTopic(scope, topicId, slot = null) {
    const exam = db.get('exams', scope.examId);
    if (!exam?.publishedKnowledgeManifestId) return;
    for (const row of db.find('question_supply', { topicId, knowledgeManifestId: exam.publishedKnowledgeManifestId, ...(slot ? { slot } : {}) }, { scope })) scheduleRefill(scope, row);
  }

  /** The next exam problem for the pool (one at a time per exam): units in the student's focus first, then the most recently studied, then course order. */
  function refillExams(scope) {
    const exam = db.get('exams', scope.examId);
    if (!exam?.publishedKnowledgeManifestId || exam.knowledgeSource === 'guide') return;
    const view = knowledge().view(scope, exam.publishedKnowledgeManifestId);
    const rows = db.find('question_supply', { knowledgeManifestId: view.manifest.id }, { scope });
    const focus = new Set(app.services.session?.activeFocus?.(scope)?.topicIds || []);
    const studied = new Map(rows.filter(r => r.lastActiveAt).map(r => [r.topicId, Date.parse(r.lastActiveAt)]));
    const rank = row => { const ids = subtree(view, row.topicId); return ids.some(id => focus.has(id)) ? Infinity : Math.max(0, ...ids.map(id => studied.get(id) || 0)); };
    for (const [, row] of rows.filter(r => r.slot === 'exam' && r.pausedReason !== 'superseded').map(r => [rank(r), r]).sort((a, b) => b[0] - a[0])) scheduleRefill(scope, row);
  }
  const nextExamProblem = scope => { try { refillExams(scope); } catch { /* the reconciler tries again */ } };

  // ---------- Generation (§5.5) ----------

  async function generate({ generationRequestId }, ctx) {
    const job = ctx.job, scope = scopeOf(job);
    let request = db.get('question_generation_requests', generationRequestId, scope);
    if (!request || request.state === 'ready' || request.state === 'failed') return { resultRefs: request?.questionId ? [{ kind: 'question', id: request.questionId, version: 1 }] : [] };
    request = ctx.commit(() => db.update('question_generation_requests', { ...request, state: 'generating', attempts: request.attempts + 1, updatedAt: clock.iso() }));
    const finalAttempt = job.attempt >= job.maxAttempts;
    try {
      const k = knowledge();
      const view = k.view(scope, request.knowledgeManifestId);
      const topic = view.topics.find(t => t.topicId === request.topicId);
      if (!topic) throw new AppError('stale_dependency', 'Topic is not in the target manifest.', { retryable: false });
      // An exam problem covers its whole unit, grounded in more of the material; a short question its own topic.
      const exam = request.format === 'exam', topics = exam ? subtree(view, topic.topicId) : [topic.topicId];
      const objectives = view.objectives.filter(o => topics.includes(o.topicId) && (!request.objectiveVersionIds?.length || request.objectiveVersionIds.includes(o.id)));
      if (!objectives.length) throw new AppError('invalid_input', 'No assessable objectives for this topic.', { retryable: false });
      const retrieved = k.retrieve(scope, view.manifest.id, { topicIds: topics, objectiveVersionIds: objectives.map(o => o.id), anchorIds: [], query: request.narrowTarget, relationTypes: ['prerequisite'], reason: 'question generation', maxTokens: exam ? 8000 : 3000 });
      const sourceEvidence = k.anchors(scope, retrieved.excerpts.map(e => e.anchorId)).filter(e => e.excerpt !== null);
      const personal = request.origin === 'personalized_custom';
      const learnerContext = personal ? request.learnerContext : null;
      const selectedProfileFacts = personal ? (learner().selectedFacts?.(scope, [topic.topicId]) || []) : [];
      const personalManifest = personal && request.personalManifestId ? { id: request.personalManifestId, version: request.personalManifestVersion || null, contentHash: request.personalManifestHash || hashOf(request.personalManifestId) } : null;
      const families = [...exposedFamilies(scope)];
      const input = {
        origin: request.origin, generationRequestId: request.id, topic, objectives, intendedDifficulty: request.intendedDifficulty, narrowTarget: request.narrowTarget,
        knowledgeManifest: view.manifest, personalManifest,
        interpretations: view.interpretations.filter(i => i.topicIds.some(id => topics.includes(id))),
        personalExplanations: personal ? (learner().personalView?.(scope, view.manifest.id)?.explanations || []).filter(e => e.topicIds.some(id => topics.includes(id))) : [],
        sourceEvidence, learnerContext, selectedProfileFacts,
        exposureFamilies: families, exposureNotes: families.length ? [`${families.length} question families already exposed in this exam; do not repeat them or rename numbers/names of a taught answer.`] : [],
        rubricPolicyVersion: RUBRIC_POLICY_VERSION,
      };
      if (exam) Object.assign(input, {
        subtopics: topics.map(id => view.topics.find(t => t.topicId === id)).map(t => ({ topicId: t.topicId, title: t.title, description: t.description })),
        exam: (e => ({ title: e?.title ?? null, date: e?.examDate ?? null }))(db.get('exams', scope.examId)),
        // So a second problem for the unit is a different one.
        existingProblems: db.find('question_records', { topicId: topic.topicId }, { scope }).filter(q => q.format === 'exam' && !['failed', 'invalidated'].includes(q.state)).map(q => q.title),
      });
      input.work = workIdentity({ scope, idempotencyKey: `generate:${request.id}:${job.attempt}`, input: { requestId: request.id, attempt: job.attempt }, dependencies: [{ ref: { kind: 'knowledge_manifest', id: view.manifest.id, version: view.manifest.version }, hash: view.manifest.contentHash, relation: 'derived_from' }], clock, budget: exam ? EXAM_BUDGET : undefined });
      const result = exam ? await call(i => authorExam(app, i), input, { valueSchema: OUTPUT, what: 'exam problem' })
        : await call(app.providers.questionGenerator.generate, input, { valueSchema: OUTPUT, what: 'generated question' });
      if (result.outcome !== 'ok') {
        const e = result.error || { code: 'internal_error', message: result.reason || 'Generation failed.', retryable: false };
        throw new AppError(e.code, e.message, { retryable: e.retryable, issues: e.issues || [] });
      }
      let { question, rubric } = result.value;
      // Ownership and state are server-derived; a provider cannot assert readiness or another scope.
      question = { ...question, scope, origin: request.origin, topicId: topic.topicId, knowledgeManifestId: view.manifest.id, personalManifestId: personalManifest?.id || null, learnerContext, generationRequestId: request.id, state: 'validating', narrowTarget: request.narrowTarget, intendedDifficulty: request.intendedDifficulty, rowVersion: 0, failure: null, approvedRenderingIds: [], validationReportIds: [] };
      rubric = { ...rubric, scope, policyVersion: RUBRIC_POLICY_VERSION };
      const deterministic = checkCandidate(question, rubric, objectives, sourceEvidence, scope);
      ctx.commit(() => {
        db.insert('rubric_versions', rubric);
        db.insert('question_records', question);
        db.update('question_generation_requests', { ...db.get('question_generation_requests', request.id, scope), state: 'validating', questionId: question.id, updatedAt: clock.iso() });
      });
      const reports = deterministic.length ? [] : await validateCandidate(question, rubric, view, objectives, sourceEvidence, learnerContext, selectedProfileFacts, input.work);
      const blocking = [...deterministic, ...reports.filter(r => r.disposition !== 'pass').flatMap(r => r.issues.length ? r.issues : [issue(`${r.responsibility}_${r.disposition}`, `Validator returned ${r.disposition}.`, { severity: 'blocking' })])];
      if (blocking.length) {
        ctx.commit(() => setQuestion(db.get('question_records', question.id, scope), { state: 'failed', validationReportIds: reports.map(r => r.id), failure: { code: 'quality_gate', retryable: true, message: blocking[0].message, retryAfterMs: null, issues: blocking } }));
        throw new AppError('quality_gate', `Question failed validation: ${blocking[0].message}`, { retryable: true, issues: blocking });
      }
      // READY atomically: dependencies still current, rubric persisted, exact approved rendering.
      ctx.commit(() => {
        const exam = db.get('exams', scope.examId);
        const current = db.get('question_records', question.id, scope);
        const stillCompatible = exam.publishedKnowledgeManifestId === view.manifest.id || compatibleWithPublished(current, exam);
        if (!stillCompatible) {
          setQuestion(current, { state: 'invalidated', validationReportIds: reports.map(r => r.id) });
          db.update('question_generation_requests', { ...db.get('question_generation_requests', request.id, scope), state: 'failed', error: { code: 'stale_dependency', retryable: false, message: 'Knowledge changed during generation.', retryAfterMs: null, issues: [] }, updatedAt: clock.iso() });
          emitFailed(scope, request);
          return;
        }
        const rendering = { id: newId('qrnd'), scope, createdAt: clock.iso(), questionId: question.id, questionVersion: question.version, rubricVersionId: rubric.id, text: question.voiceForm, textHash: hashOf(norm(question.voiceForm)), equivalence: 'exact_approved', validationReportIds: reports.map(r => r.id), dependencies: question.dependencies };
        db.insert('question_renderings', rendering);
        const ready = setQuestion(current, { state: 'ready', approvedRenderingIds: [rendering.id], validationReportIds: reports.map(r => r.id) });
        db.update('question_generation_requests', { ...db.get('question_generation_requests', request.id, scope), state: 'ready', questionId: question.id, updatedAt: clock.iso() });
        const supply = db.findOne('question_supply', { activeGenerationJobId: job.id }, { scope });
        if (supply) db.update('question_supply', { ...supply, activeGenerationJobId: null, updatedAt: clock.iso() });
        emitQuestion('question.ready', ready);
      });
      if (exam && request.origin === 'generic_hopper') nextExamProblem(scope);
      return { resultRefs: [{ kind: 'question', id: question.id, version: question.version }] };
    } catch (error) {
      if (process.env.BACKEND_DEBUG && !(error instanceof AppError)) console.error('question generation', error);
      const err = error instanceof AppError ? error : new AppError('internal_error', 'Question generation failed.', { retryable: false });
      if (!err.retryable || finalAttempt) {
        try {
          ctx.commit(() => {
            db.update('question_generation_requests', { ...db.get('question_generation_requests', request.id, scope), state: 'failed', error: err.toStructured(), updatedAt: clock.iso() });
            const supply = db.findOne('question_supply', { activeGenerationJobId: job.id }, { scope });
            if (supply) db.update('question_supply', { ...supply, activeGenerationJobId: null, updatedAt: clock.iso() });
            emitFailed(scope, request);
          });
        } catch { /* lost lease: the next owner records the outcome */ }
        if (request.format === 'exam' && request.origin === 'generic_hopper') nextExamProblem(scope);
        throw new AppError(err.code, err.message, { retryable: false, issues: err.issues });
      }
      try { ctx.commit(() => db.update('question_generation_requests', { ...db.get('question_generation_requests', request.id, scope), state: 'queued', updatedAt: clock.iso() })); } catch { /* lease lost */ }
      throw err;
    }
  }

  function compatibleWithPublished(question, exam) { return compatible(question, exam.publishedKnowledgeManifestId); }

  /** Deterministic checks: answer present, assessed targets map to criteria, hints ordered, family not taught. */
  function checkCandidate(question, rubric, objectives, sourceEvidence, scope) {
    const out = [];
    const objectiveIds = new Set(objectives.map(o => o.id));
    if (!question.expectedAnswer?.trim()) out.push(issue('missing_expected_answer', 'Question has no expected answer.', { severity: 'blocking' }));
    if (!question.prompt?.trim() || !question.voiceForm?.trim()) out.push(issue('missing_prompt', 'Question has no prompt.', { severity: 'blocking' }));
    if (!DIFFICULTIES.includes(question.intendedDifficulty)) out.push(issue('bad_difficulty', 'Unknown intended difficulty.', { severity: 'blocking' }));
    const criterionIds = new Set(rubric.criteria.map(c => c.criterionId));
    for (const t of question.objectiveTargets) {
      if (!objectiveIds.has(t.objectiveVersionId)) out.push(issue('foreign_objective', 'Target objective is not in this topic/manifest.', { severity: 'blocking' }));
      if (t.role === 'assessed' && (!t.criterionIds.length || !t.criterionIds.every(id => criterionIds.has(id) && rubric.criteria.find(c => c.criterionId === id).objectiveVersionId === t.objectiveVersionId))) out.push(issue('unmapped_target', 'An assessed objective has no rubric criterion.', { severity: 'blocking' }));
      if (t.role === 'context_only' && t.criterionIds.length) out.push(issue('context_credit', 'A context-only objective cannot carry criteria.', { severity: 'blocking' }));
    }
    if (!question.objectiveTargets.some(t => t.role === 'assessed')) out.push(issue('nothing_assessed', 'Question assesses no objective.', { severity: 'blocking' }));
    if (question.hints.some((h, i) => h.order !== i + 1)) out.push(issue('hint_order', 'Hints must be ordered.', { severity: 'blocking' }));
    if (question.choices && new Set(question.choices.map(c => c.id)).size !== question.choices.length) out.push(issue('choice_ids', 'Choice ids must be unique.', { severity: 'blocking' }));
    for (const problem of inputProblems({ inputKind: question.inputKind || 'speech', inputSpec: question.inputSpec || {}, expectedStructured: rubric.expectedStructured ?? null })) out.push(issue('input_spec', `Answer input is inconsistent: ${problem}.`, { severity: 'blocking' }));
    const anchors = new Set(sourceEvidence.map(e => e.anchor.id));
    if (question.sourceEvidence.some(e => !anchors.has(e.id))) out.push(issue('foreign_evidence', 'Question cites evidence it was not given.', { severity: 'blocking' }));
    if (exposedFamilies(scope).has(question.semanticFamilyId)) out.push(issue('exposed_family', 'Question repeats an already exposed family.', { severity: 'blocking' }));
    return out;
  }

  async function validateCandidate(question, rubric, view, objectives, sourceEvidence, learnerContext, selectedProfileFacts, work) {
    const reports = [];
    for (const responsibility of ['question_answerability', 'math_and_reasoning']) {
      const result = await call(app.providers.validator.validate, {
        work, responsibility, candidate: { kind: 'question', id: question.id, version: question.version },
        candidatePayload: {
          prompt: question.prompt, voiceForm: question.voiceForm, choices: question.choices, expectedAnswer: rubric.expectedAnswer, acceptableAlternatives: rubric.acceptableAlternatives, criteria: rubric.criteria, hints: question.hints,
          ...(question.format === 'exam' ? { delivery: 'An exam problem shown whole on the page (prompt: setup and parts with points); voiceForm is only a one-line spoken introduction, never the problem.', parts: rubric.parts.map(p => ({ partId: p.partId, points: p.points, expectedAnswer: p.expectedAnswer, acceptableAlternatives: p.acceptableAlternatives })) } : {}),
        },
        originalEvidence: sourceEvidence.map(e => ({ anchor: e.anchor, excerpt: e.excerpt, artifact: e.anchor.evidenceArtifact })),
        manifestId: view.manifest.id, objectiveVersions: objectives, learnerContext, selectedProfileFacts, policyVersion: RUBRIC_POLICY_VERSION,
      }, { valueSchema: VALIDATION, what: 'validation report' });
      if (result.outcome !== 'ok') { const e = result.error || {}; throw new AppError(e.code || 'provider_unavailable', e.message || 'Validator failed.', { retryable: e.retryable ?? true }); }
      const report = { ...result.value.report, scope: question.scope, candidateKind: 'question', candidateId: question.id };
      db.insert('validation_reports', report);
      reports.push(report);
    }
    return reports;
  }

  jobs.register('refill_question', generate);
  jobs.register('generate_custom_question', generate);
  jobs.register('author_exam_question', generate, { maxAttempts: 2 });

  // ---------- Custom questions ----------

  /** format 'exam': an exam problem filed under topicId (a unit), made by the exam author. */
  function requestCustom(scope, { topicId, objectiveVersionIds = [], narrowTarget = null, intendedDifficulty = 'application', format = 'short', sessionId = null, turnId = null, knowledgeManifestId = null, requestedBy = null }) {
    if (!DIFFICULTIES.includes(intendedDifficulty)) throw new AppError('invalid_input', 'Unknown intended difficulty.');
    const exam = db.get('exams', scope.examId, scope);
    const manifestId = knowledgeManifestId || exam?.publishedKnowledgeManifestId;
    if (!manifestId) throw new AppError('content_not_ready', 'No published material yet.');
    const view = knowledge().view(scope, manifestId);
    if (!view.topics.some(t => t.topicId === topicId)) throw new AppError('invalid_input', 'Topic is not in the pinned material.');
    const learnerContext = learner().contextRef?.(scope, [topicId]) || { profileSnapshotId: exam.currentProfileSnapshotId, profileVersion: 0, topicStates: [], selectedFactIds: [], selectedEvidenceIds: [], emptyProfile: true };
    const personalManifestId = learner().latestPersonalManifestId?.(scope) || null;
    const key = `custom:${sessionId || 'none'}:${turnId || 'none'}:${hashOf({ topicId, objectiveVersionIds, narrowTarget, intendedDifficulty, ...(format === 'exam' ? { format } : {}) })}`;
    return db.tx(() => {
      // The agent asking again for one already made (or failed) wants another; one still being made is the same request.
      const prior = db.find('question_generation_requests', { origin: 'personalized_custom' }, { scope }).find(r => r.requestKey === key && (requestedBy !== 'agent' || INFLIGHT.includes(r.state)));
      if (prior) return { generationRequestId: prior.id };
      const request = {
        id: newId('qgen'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, origin: 'personalized_custom', state: 'queued', requestKey: key, format: format === 'exam' ? 'exam' : 'short',
        topicId, slot: null, objectiveVersionIds, narrowTarget, intendedDifficulty, knowledgeManifestId: manifestId, personalManifestId,
        learnerContext, sessionId, turnId, requestedBy, questionId: null, error: null, attempts: 0,
      };
      db.insert('question_generation_requests', request);
      jobs.enqueue({ scope, type: format === 'exam' ? 'author_exam_question' : 'generate_custom_question', idempotencyKey: `gen:${request.id}`, payload: { generationRequestId: request.id }, priority: requestedBy === 'agent' ? AGENT_PRIORITY : CUSTOM_PRIORITY });
      return { generationRequestId: request.id };
    });
  }

  /** A custom request's progress, and who asked for it in which session (the session delivers the result). */
  function customStatus(scope, generationRequestId) {
    const r = db.must('question_generation_requests', generationRequestId, scope, 'Generation request');
    return { state: r.state, questionId: r.state === 'ready' ? r.questionId : null, error: r.state === 'failed' ? r.error : null, topicId: r.topicId, narrowTarget: r.narrowTarget, sessionId: r.sessionId, requestedBy: r.requestedBy ?? null, format: r.format || 'short' };
  }

  // ---------- Reservations (§4.5, §7) ----------

  function expireLeases(scope = null) {
    const now = clock.now();
    const active = db.find('question_reservations', { state: 'active' }, scope ? { scope } : {}).filter(r => Date.parse(r.leaseExpiresAt) < now);
    for (const r of active) db.tx(() => {
      const fresh = db.get('question_reservations', r.id);
      if (fresh.state !== 'active' || Date.parse(fresh.leaseExpiresAt) >= now) return;
      if (fresh.deliveryEventIds.length) { db.update('question_reservations', { ...fresh, state: 'delivered', updatedAt: clock.iso() }); return; }
      db.update('question_reservations', { ...fresh, state: 'expired', updatedAt: clock.iso() });
      returnToPool(scopeOf(fresh), fresh.questionId, fresh.id);
    });
  }

  /** Reserved → ready only if nothing was delivered and dependencies still hold; otherwise invalidated. */
  function returnToPool(scope, questionId, reservationId) {
    const question = db.get('question_records', questionId, scope);
    if (!question || question.state !== 'reserved') return;
    if (db.find('exposure_records', { questionId }, { scope }).length) return; // anything audible keeps it asked
    const exam = db.get('exams', scope.examId);
    if (compatibleWithPublished(question, exam)) setQuestion(question, { state: 'ready' });
    else { const inv = setQuestion(question, { state: 'invalidated' }); emitQuestion('question.invalidated', inv, reservationId); }
  }

  function reserve(request) {
    const scope = request.work?.scope || request.scope;
    const { sessionId, epoch, turnId, compatibleKnowledgeManifestId, topicId, objectiveVersionIds = [], preferredQuestionId = null, purpose = 'probe', allowExposedForRevisit = false, revisitReason = null, format = 'short' } = request;
    if (!scope || !sessionId || !turnId || !Number.isInteger(epoch) || !compatibleKnowledgeManifestId || !topicId) throw new AppError('invalid_input', 'Reservation needs scope, session, epoch, turn, manifest and topic.');
    const revisit = purpose === 'revisit' && allowExposedForRevisit;
    if (revisit && !revisitReason) throw new AppError('invalid_input', 'A revisit needs a recorded reason.');
    expireLeases(scope);
    return db.tx(() => {
      const exposed = exposedFamilies(scope), taught = taughtFamilies(scope);
      const wantSlot = purpose === 'transfer' ? ['transfer', 'application'] : ['probe', 'explain', 'clarify', 'hint', 'acknowledge'].includes(purpose) ? ['basic_diagnostic', 'application', 'transfer'] : ['application', 'basic_diagnostic', 'transfer'];
      // A chosen exam problem is filed under its unit, not under the plan's topic, and covers objectives beyond it.
      const preferred = preferredQuestionId ? db.get('question_records', preferredQuestionId, scope) : null;
      const chosenExam = q => q.id === preferredQuestionId && q.format === 'exam';
      const candidates = db.find('question_records', { topicId: preferred?.format === 'exam' ? [...new Set([topicId, preferred.topicId])] : topicId, state: 'ready' }, { scope })
        .filter(q => compatible(q, compatibleKnowledgeManifestId))
        .filter(q => q.id === preferredQuestionId || (q.format === 'exam') === (format === 'exam'))
        .filter(q => chosenExam(q) || !objectiveVersionIds.length || q.objectiveVersionIds.some(id => objectiveVersionIds.includes(id)))
        .filter(q => q.origin === 'generic_hopper' || q.id === preferredQuestionId)
        // Novel selection never repeats an exposed family; a taught answer is never novel transfer.
        .filter(q => revisit ? !(purpose === 'transfer' && taught.has(q.semanticFamilyId)) : !exposed.has(q.semanticFamilyId))
        .filter(q => wantSlot.includes(q.intendedDifficulty))
        .sort((a, b) => (b.id === preferredQuestionId) - (a.id === preferredQuestionId) || wantSlot.indexOf(a.intendedDifficulty) - wantSlot.indexOf(b.intendedDifficulty) || a.createdAt.localeCompare(b.createdAt));
      for (const candidate of candidates) {
        try {
          const reserved = db.update('question_records', { ...candidate, state: 'reserved', updatedAt: clock.iso() }, { expectedRowVersion: candidate.rowVersion });
          const reservation = { id: newId('qres'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, questionId: candidate.id, questionVersion: candidate.version, sessionId, turnId, sessionEpoch: epoch, leaseExpiresAt: new Date(clock.now() + config.reservationLeaseMs).toISOString(), state: 'active', deliveryEventIds: [], purpose, revisit: revisit ? { reason: revisitReason } : null };
          db.insert('question_reservations', reservation);
          emitQuestion('question.reserved', reserved, reservation.id);
          const supply = db.find('question_supply', { topicId, knowledgeManifestId: compatibleKnowledgeManifestId }, { scope });
          for (const row of supply) db.update('question_supply', { ...row, lastActiveAt: clock.iso(), updatedAt: clock.iso() });
          return { question: reserved, reservation };
        } catch (error) {
          if (error.code === 'version_conflict' || /UNIQUE/.test(error.message)) continue; // lost the race for this one
          throw error;
        }
      }
      throw new AppError('content_not_ready', 'No compatible ready question for this topic.');
    });
  }

  function ownedReservation(scope, reservationId, sessionEpoch) {
    const r = db.must('question_reservations', reservationId, scope, 'Reservation');
    if (sessionEpoch !== undefined && r.sessionEpoch !== sessionEpoch) throw new AppError('version_conflict', 'Reservation belongs to another session epoch.');
    return r;
  }

  function release(scope, reservationId, { sessionEpoch } = {}) {
    return db.tx(() => {
      const r = ownedReservation(scope, reservationId, sessionEpoch);
      if (r.state !== 'active') return r;
      if (r.deliveryEventIds.length) return db.update('question_reservations', { ...r, state: 'delivered', updatedAt: clock.iso() });
      const released = db.update('question_reservations', { ...r, state: 'released', updatedAt: clock.iso() });
      returnToPool(scope, r.questionId, r.id);
      return released;
    });
  }

  function extendLease(scope, reservationId, { sessionEpoch }) {
    return db.tx(() => {
      const r = ownedReservation(scope, reservationId, sessionEpoch);
      if (r.state !== 'active') throw new AppError('version_conflict', 'Reservation is no longer active.');
      return db.update('question_reservations', { ...r, leaseExpiresAt: new Date(clock.now() + config.reservationLeaseMs).toISOString(), updatedAt: clock.iso() });
    });
  }

  /** First audible prompt: asked + exposure. Delivery wins over a racing release or expiry. Idempotent. */
  function markDelivered(scope, { reservationId, deliveryEventIds = [], extent = 'complete', sessionId, turnId }) {
    if (!deliveryEventIds.length) throw new AppError('invalid_input', 'Delivery needs the delivery event ids.');
    return db.tx(() => {
      const r = db.must('question_reservations', reservationId, scope, 'Reservation');
      if (r.state === 'invalidated') throw new AppError('stale_dependency', 'Reservation was invalidated.');
      const ids = [...new Set([...r.deliveryEventIds, ...deliveryEventIds])];
      const reservation = db.update('question_reservations', { ...r, state: 'delivered', deliveryEventIds: ids, updatedAt: clock.iso() });
      let question = db.get('question_records', r.questionId, scope);
      // A racing release may have put the question back; another session may even hold it. Delivery wins.
      for (const other of db.find('question_reservations', { questionId: question.id, state: 'active' }, { scope })) if (other.id !== r.id) db.update('question_reservations', { ...other, state: 'invalidated', updatedAt: clock.iso() });
      if (question.state !== 'asked') { question = setQuestion(question, { state: 'asked' }); emitQuestion('question.asked', question, r.id); }
      const kind = extent === 'complete' ? 'question_played' : 'partial_prompt';
      if (!db.find('exposure_records', { questionId: question.id, kind }, { scope }).some(e => e.reservationId === r.id)) {
        db.insert('exposure_records', { id: newId('qexp'), scope, createdAt: clock.iso(), questionId: question.id, semanticFamilyId: question.semanticFamilyId, sessionId: sessionId || r.sessionId, turnId: turnId || r.turnId, kind, deliveryEventIds: ids, evidenceId: null, reservationId: r.id });
      }
      return { reservation, question };
    });
  }

  function recordExposure(scope, { questionId, sessionId, turnId, kind, deliveryEventIds = [], evidenceId = null }) {
    if (!['question_played', 'partial_prompt', 'hint_played', 'answer_delivered', 'worked_example_delivered'].includes(kind)) throw new AppError('invalid_input', 'Unknown exposure kind.');
    const question = db.must('question_records', questionId, scope, 'Question');
    const record = { id: newId('qexp'), scope, createdAt: clock.iso(), questionId, semanticFamilyId: question.semanticFamilyId, sessionId, turnId, kind, deliveryEventIds, evidenceId };
    db.insert('exposure_records', record);
    return record;
  }

  // ---------- Reads ----------

  function available(scope, { knowledgeManifestId, topicIds = [] }) {
    const exposed = exposedFamilies(scope), exam = db.get('exams', scope.examId, scope);
    return db.find('question_records', { state: ['ready'], ...(topicIds.length ? { topicId: topicIds } : {}) }, { scope })
      .filter(q => q.origin === 'generic_hopper' || q.learnerContext)
      .map(q => ({
        questionId: q.id, topicId: q.topicId, intendedDifficulty: q.intendedDifficulty, objectiveVersionIds: q.objectiveTargets.filter(t => t.role === 'assessed').map(t => t.objectiveVersionId), exposed: exposed.has(q.semanticFamilyId), dependencyCompatible: compatible(q, knowledgeManifestId || exam.publishedKnowledgeManifestId),
        ...(q.format === 'exam' ? { format: 'exam', title: q.title, parts: q.parts.length, estimatedMinutes: q.estimatedMinutes } : {}),
      }));
  }

  /** The input as shown to the student: order items shuffled deterministically (never in answer order). */
  function displaySpec(q) {
    const spec = q.inputSpec || {};
    if (q.inputKind !== 'order' || !spec.items?.length) return spec;
    const answer = db.get('rubric_versions', q.rubricVersionId, q.scope)?.expectedStructured || spec.items.map(x => x.id);
    const items = [...spec.items].sort((a, b) => hashOf(`${q.id}:${a.id}`).localeCompare(hashOf(`${q.id}:${b.id}`)));
    if (items.length > 1 && items.every((x, i) => x.id === answer[i])) items.push(items.shift());
    return { ...spec, items };
  }

  /** What the speaking role may say. Hints only when authorized; the answer only when the plan allows. */
  function speakingForm(scope, questionId, { reservationId = null, allowedHintIds = [], mayRevealAnswer = false } = {}) {
    const q = db.must('question_records', questionId, scope, 'Question');
    const rendering = db.get('question_renderings', q.approvedRenderingIds[0], scope);
    const hints = q.hints.filter(h => allowedHintIds.includes(h.hintId));
    return {
      questionId: q.id, version: q.version, reservationId, renderingId: rendering?.id || null, renderingHash: rendering?.textHash || null, voiceForm: rendering?.text || q.voiceForm, choices: q.choices, inputKind: q.inputKind || 'speech', inputSpec: displaySpec(q), allowedHintIds: hints.map(h => h.hintId), allowedHintTexts: hints.map(h => ({ hintId: h.hintId, text: h.text })), answerReveal: mayRevealAnswer ? q.expectedAnswer : null,
      // An exam problem as the page shows it: never its parts' answers, criteria or checks.
      ...(q.format === 'exam' ? { format: 'exam', title: q.title, setup: q.setup, parts: q.parts.map(({ id, prompt, points, answer }) => ({ id, prompt, points, answer })), totalPoints: q.totalPoints, estimatedMinutes: q.estimatedMinutes } : {}),
    };
  }

  /** Deterministic drift guard. Approved wording is compatible; changed numbers/conditions/choices are drift. */
  function checkRendering(scope, questionId, spokenText) {
    const q = db.must('question_records', questionId, scope, 'Question');
    const renderings = q.approvedRenderingIds.map(id => db.get('question_renderings', id, scope)).filter(Boolean);
    const spoken = norm(spokenText);
    const exact = renderings.find(r => r.textHash === hashOf(spoken));
    if (exact) return { compatible: true, renderingId: exact.id, reason: 'approved wording', drift: false };
    const base = renderings[0]?.text || q.voiceForm;
    if (!sameList(numbersIn(base), numbersIn(spoken))) return { compatible: false, renderingId: null, reason: 'material drift: numbers changed', drift: true };
    if (!sameList(conditionsIn(base), conditionsIn(spoken))) return { compatible: false, renderingId: null, reason: 'material drift: a condition was added or dropped', drift: true };
    if (q.choices?.some(c => !spoken.includes(norm(c.text)))) return { compatible: false, renderingId: null, reason: 'material drift: a choice was changed or dropped', drift: true };
    return { compatible: false, renderingId: null, reason: 'unvalidated paraphrase; validate it before use', drift: false };
  }

  /** Validate a paraphrase as semantically equivalent and persist it as an approved rendering. */
  async function validateRendering(scope, questionId, text) {
    const guard = checkRendering(scope, questionId, text);
    if (guard.compatible || guard.drift) return guard;
    const q = db.must('question_records', questionId, scope, 'Question');
    const rubric = db.get('rubric_versions', q.rubricVersionId, scope);
    const work = workIdentity({ scope, idempotencyKey: `rendering:${questionId}:${hashOf(norm(text))}`, input: { questionId, text }, clock });
    const result = await call(app.providers.validator.validate, {
      work, responsibility: 'question_answerability', candidate: { kind: 'question_rendering', id: questionId, version: q.version },
      candidatePayload: { approvedPrompt: q.voiceForm, rendering: text, expectedAnswer: rubric.expectedAnswer, criteria: rubric.criteria },
      originalEvidence: [], manifestId: q.knowledgeManifestId, objectiveVersions: [], learnerContext: null, selectedProfileFacts: [], policyVersion: RUBRIC_POLICY_VERSION,
    }, { valueSchema: VALIDATION, what: 'rendering validation' });
    if (result.outcome !== 'ok' || result.value.report.disposition !== 'pass') return { compatible: false, renderingId: null, reason: 'paraphrase not validated as equivalent', drift: false };
    return db.tx(() => {
      const report = { ...result.value.report, scope, candidateKind: 'question_rendering', candidateId: questionId };
      db.insert('validation_reports', report);
      const rendering = { id: newId('qrnd'), scope, createdAt: clock.iso(), questionId, questionVersion: q.version, rubricVersionId: q.rubricVersionId, text, textHash: hashOf(norm(text)), equivalence: 'validated_equivalent', validationReportIds: [report.id], dependencies: q.dependencies };
      db.insert('question_renderings', rendering);
      const fresh = db.get('question_records', questionId, scope);
      setQuestion(fresh, { approvedRenderingIds: [...fresh.approvedRenderingIds, rendering.id] });
      return { compatible: true, renderingId: rendering.id, reason: 'validated equivalent', drift: false };
    });
  }

  // ---------- Invalidation and triggers ----------

  events.subscribe('questions.knowledge', 'knowledge.published', event => {
    const scope = scopeOf(event), p = event.payload;
    const view = knowledge().view(scope, p.newManifestId);
    const topics = new Set(view.topics.map(t => t.topicId)), objectives = new Set(view.objectives.map(o => o.id));
    const incompatible = new Set(p.incompatibleTopicIds || []);
    for (const q of db.find('question_records', { state: ['ready', 'reserved', 'validating', 'queued', 'generating'] }, { scope })) {
      if (compatible(q, p.newManifestId)) continue;
      const ok = topics.has(q.topicId) && !incompatible.has(q.topicId) && q.objectiveVersionIds.every(id => objectives.has(id));
      // Compatible unchanged questions are reused by a checked mapping; their original references stay as they were.
      if (ok) { setQuestion(q, { compatibleManifestIds: [...(q.compatibleManifestIds || []), p.newManifestId] }); continue; }
      const inv = setQuestion(q, { state: 'invalidated' });
      for (const r of db.find('question_reservations', { questionId: q.id, state: 'active' }, { scope })) db.update('question_reservations', { ...r, state: 'invalidated', updatedAt: clock.iso() });
      emitQuestion('question.invalidated', inv);
    }
    for (const row of db.find('question_supply', {}, { scope })) if (row.knowledgeManifestId !== p.newManifestId && row.pausedReason !== 'superseded') db.update('question_supply', { ...row, pausedReason: 'superseded', updatedAt: clock.iso() });
    ensureSupply(scope, view);
    for (const row of db.find('question_supply', { knowledgeManifestId: p.newManifestId }, { scope })) scheduleRefill(scope, row);
  });

  events.subscribe('questions.personal', 'personal.published', event => {
    const scope = scopeOf(event), p = event.payload;
    const changed = new Set((p.changedRefs || []).map(r => r.id));
    const affected = new Set(p.affectedTopicIds || []);
    for (const q of db.find('question_records', { origin: 'personalized_custom', state: ['ready', 'reserved'] }, { scope })) {
      const personalDeps = q.dependencies.filter(d => d.relation === 'personalized_for');
      const hit = changed.size ? personalDeps.some(d => changed.has(d.ref.id)) : (affected.has(q.topicId) && q.personalManifestId === p.oldPersonalManifestId);
      if (!hit) continue;
      const inv = setQuestion(q, { state: 'invalidated' });
      for (const r of db.find('question_reservations', { questionId: q.id, state: 'active' }, { scope })) db.update('question_reservations', { ...r, state: 'invalidated', updatedAt: clock.iso() });
      emitQuestion('question.invalidated', inv);
    }
  });

  events.subscribe('questions.refill', ['question.reserved', 'question.asked', 'question.invalidated'], event => {
    if (event.payload.slot) refillTopic(scopeOf(event), event.payload.topicId, event.payload.slot);
  });

  // Bounded reconciliation: expire leases and repair missed scheduling from durable state.
  // ponytail: app.mjs resets app.reconcilers after installs; register once construction finishes.
  queueMicrotask(() => app.reconcilers.push(() => {
    expireLeases();
    for (const row of db.find('question_supply', {})) if (row.pausedReason !== 'superseded' && row.slot !== 'exam') scheduleRefill(scopeOf(row), row);
    // Exam pools, also for material published before they existed (after a restart, not only at the next publication).
    for (const exam of db.find('exams', {})) {
      if (!exam.publishedKnowledgeManifestId || ['deleting', 'deleted'].includes(exam.status)) continue;
      try { ensureSupply(exam.scope, knowledge().view(exam.scope, exam.publishedKnowledgeManifestId)); refillExams(exam.scope); } catch { /* next round */ }
    }
  }));

  app.hooks.examDeleted.push(exam => {
    for (const table of ['question_records', 'rubric_versions', 'question_renderings', 'question_reservations', 'exposure_records', 'question_supply', 'question_generation_requests']) db.prepare(`DELETE FROM ${table} WHERE exam_id = ?`).run(exam.id);
  });

  app.services.questions = {
    available, reserve, release, extendLease, markDelivered, recordExposure, requestCustom, customStatus,
    get: (scope, questionId) => db.must('question_records', questionId, scope, 'Question'),
    speakingForm, rubric: (scope, rubricVersionId) => db.must('rubric_versions', rubricVersionId, scope, 'Rubric'),
    checkRendering, validateRendering, expireLeases, refillTopic,
    supply: scope => db.find('question_supply', {}, { scope }),
    exposures: scope => db.find('exposure_records', {}, { scope }),
    // Problems in a value against the generator draft schema, for adapter contract tests.
    _problems: value => problems(OUTPUT, value),
  };
}
