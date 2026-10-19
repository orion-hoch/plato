import { newId, hashOf } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';
import { s, problems } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';

// Active personalization (spec §2.2, §4.4, §9): every eligible learner change reaches a recorded
// revision decision; Astra revises personal explanations/map or records a reasoned no-op; personal
// manifests publish with CAS against the base pointer, the personal pointer and learner versions.

const EVIDENCE_REF = s.object({ kind: s.enum(['source_anchor', 'interaction', 'assessment', 'feedback', 'explicit_exam_instruction']), id: s.string({ min: 1 }), detail: s.nullable(s.string()) });
const CLAIM = s.object({
  claimId: s.string({ min: 1 }), kind: s.enum(['source_statement', 'derived_explanation', 'assumption', 'example', 'implication', 'connection']), text: s.string({ min: 1, max: 4000 }),
  evidence: s.array(EVIDENCE_REF), support: s.enum(['direct', 'derived', 'provisional']), derivation: s.nullable(s.string()),
  uncertainties: s.array(s.object({ reason: s.string(), evidence: s.array(EVIDENCE_REF), alternatives: s.array(s.string()) })),
});
const EXPLANATION_IN = s.object({
  topicIds: s.array(s.string({ min: 1 }), { min: 1 }), text: s.string({ min: 1, max: 8000 }), selectedExamples: s.array(CLAIM),
  reasons: s.array(s.string()), baseInterpretationIds: s.array(s.string()), supersedesId: s.nullable(s.string()),
});
const EDGE_IN = s.object({
  fromTopicId: s.string({ min: 1 }), toTopicId: s.string({ min: 1 }), type: s.enum(['suggested_revisit', 'personal_prerequisite', 'helpful_connection', 'contrast_to_clarify']),
  explanation: s.string({ min: 1, max: 2000 }), evidence: s.array(EVIDENCE_REF), provisional: s.bool(), supersedesId: s.nullable(s.string()),
});
const EMPHASIS = s.object({ topicId: s.string({ min: 1 }), purpose: s.string(), priority: s.enum(['suggested', 'normal', 'deemphasized']), reason: s.string({ min: 1 }), evidence: s.array(EVIDENCE_REF) });
export const REVISER_OUTPUT = s.object({
  decision: s.object({
    disposition: s.enum(['revise', 'noop', 'needs_review']), reason: s.string({ min: 1, max: 4000 }), evidence: s.array(EVIDENCE_REF),
    inspected: s.array(s.object({ topicId: s.string({ min: 1 }), needsChange: s.bool(), note: s.string() })),
  }),
  explanations: s.array(EXPLANATION_IN), mapEdges: s.array(EDGE_IN),
  removedExplanationIds: s.array(s.string()), removedPersonalEdgeIds: s.array(s.string()), emphasis: s.array(EMPHASIS),
});

const INSPECT_BATCH = 12;

export function createPersonal(app, { profiles, learner }) {
  const { db, clock, events, jobs, config, blobs } = app;
  const providers = () => app.providers || {};
  const knowledge = () => app.services.knowledge;

  // ---------- Learner context ----------

  function selectedFacts(scope, _topicIds = []) {
    const snap = profiles.examSnapshot(scope);
    return (snap?.facts || []).filter(f => f.status === 'active').sort((a, b) => (a.origin === 'explicit_user' ? 0 : 1) - (b.origin === 'explicit_user' ? 0 : 1)).slice(0, 20);
  }
  function topicStates(scope, topicIds = []) {
    return topicIds.length ? db.find('learner_topic_states', { topicId: topicIds }, { scope }) : [];
  }
  /** LearnerContextRef (§4.4). An empty profile is explicit, never omitted. */
  function contextRef(scope, topicIds = []) {
    const snap = profiles.examSnapshot(scope);
    const states = topicStates(scope, topicIds);
    const facts = selectedFacts(scope, topicIds);
    const assessments = states.flatMap(st => st.latestAssessmentIds.slice(0, 2));
    return {
      profileSnapshotId: snap?.id ?? null, profileVersion: snap?.version ?? 0,
      topicStates: states.map(st => { const p = learner.projection(scope, st.topicId); return { topicId: st.topicId, stateVersion: st.stateVersion, masteryProjectionId: p?.id ?? st.masteryProjectionId, projectionVersion: p?.projectionVersion ?? 0 }; }),
      selectedFactIds: facts.map(f => f.factId), selectedEvidenceIds: assessments,
      emptyProfile: facts.length === 0,
    };
  }

  // ---------- Learner changes and batches ----------

  /** Create a learner change unless it is a semantic duplicate. Emits learner.changed. */
  function create(scope, { kind, topicIds = [], evidence, semanticKey, reason = '', urgent = false }) {
    return db.tx(() => {
      if (db.findOne('learner_changes', { semanticKey }, { scope })) return { change: null, exclusionReason: 'duplicate: an identical change was already recorded' };
      const last = db.prepare('SELECT MAX(sequence) AS s FROM learner_changes WHERE exam_id = ?').get(scope.examId);
      const previous = db.findOne('learner_changes', {}, { scope, order: 'sequence DESC' });
      const nextContext = contextRef(scope, topicIds);
      const change = {
        id: newId('lc'), scope, createdAt: clock.iso(), sequence: (last?.s ?? 0) + 1, semanticKey, topicIds, kind, evidence,
        previousContext: previous?.nextContext ?? nextContext, nextContext, status: 'pending', decisionId: null, batchId: null, urgent, reason,
      };
      db.insert('learner_changes', change);
      events.emit({ scope, eventType: 'learner.changed', aggregateType: 'learner_change', aggregateId: change.id, payload: { changeId: change.id, priorContext: change.previousContext, nextContext, evidence, affectedTopicIds: topicIds, kind }, idempotencyKey: `learner.changed:${change.id}` });
      return { change, exclusionReason: null };
    });
  }

  function newBatch(scope, changeIds, delayMs) {
    const batch = { id: newId('pb'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, state: 'open', changeIds, availableAt: clock.now() + delayMs };
    db.insert('personal_batches', batch);
    jobs.enqueue({ scope, type: 'reconsider_personal', idempotencyKey: `reconsider:${batch.id}`, payload: { batchId: batch.id }, availableAt: batch.availableAt, priority: 30 });
    return batch;
  }

  /** learner.changed consumer: coalesce into the open batch (window/max from config); urgent changes go at once. */
  function enqueueChange(event) {
    const scope = event.scope;
    const change = db.get('learner_changes', event.payload.changeId, scope);
    if (!change || change.batchId) return;
    let batch = null;
    if (!change.urgent) {
      const open = db.find('personal_batches', { state: 'open' }, { scope, order: 'rowid' }).find(b => b.changeIds.length < config.personalCoalesceMax);
      if (open) { batch = db.update('personal_batches', { ...open, changeIds: [...open.changeIds, change.id], updatedAt: clock.iso() }); db.replace('learner_changes', { ...change, batchId: batch.id, status: 'coalesced' }); }
    }
    if (!batch) {
      batch = newBatch(scope, [change.id], change.urgent ? 0 : config.personalCoalesceMs);
      db.replace('learner_changes', { ...change, batchId: batch.id });
    }
  }

  // ---------- Personal views ----------

  const manifestById = (scope, id) => id ? db.get('personal_manifests', id, scope) : null;

  function explanationText(e, scope) { try { return blobs.readText(e.explanation, scope); } catch { return ''; } }

  function personalView(scope, knowledgeManifestId) {
    const exam = db.get('exams', scope.examId, scope);
    const manifest = manifestById(scope, exam?.publishedPersonalManifestId);
    const pendingChanges = db.find('learner_changes', { status: ['pending', 'coalesced'] }, { scope }).length > 0;
    if (!manifest || manifest.knowledgeManifestId !== knowledgeManifestId) return { manifest: null, explanations: [], edges: [], emphasis: [], pending: true };
    const explanations = db.find('personal_explanations', { id: manifest.explanationIds }, { scope }).map(e => {
      const anchorIds = [...new Set(e.selectedExamples.flatMap(c => c.evidence.filter(x => x.kind === 'source_anchor').map(x => x.id)))];
      const base = knowledge().view(scope, knowledgeManifestId).interpretations.filter(i => e.baseInterpretationIds.includes(i.id));
      for (const i of base) for (const c of i.claims) if (c.evidence.length && c.kind === 'source_statement' && (i.topicIds.some(t => e.topicIds.includes(t)))) for (const ev of c.evidence) if (ev.kind === 'source_anchor') anchorIds.push(ev.id);
      const baseEvidence = knowledge().anchors(scope, [...new Set(anchorIds)].slice(0, 6)).map(a => ({ anchorId: a.anchor.id, excerpt: a.excerpt }));
      return { ...e, text: explanationText(e, scope), baseEvidence };
    });
    return { manifest, explanations, edges: db.find('personal_map_edges', { id: manifest.personalMapEdgeIds }, { scope }), emphasis: manifest.emphasis, pending: pendingChanges };
  }

  // ---------- Validation of personal material ----------

  function originalEvidenceFor(scope, view, topicIds) {
    const anchorIds = view.evidenceLinks.filter(l => topicIds.includes(l.topicId)).map(l => l.sourceAnchorId).slice(0, 12);
    return knowledge().anchors(scope, anchorIds).map(a => ({ anchor: a.anchor, excerpt: a.excerpt, artifact: a.anchor.evidenceArtifact }));
  }

  async function validateCandidate(scope, { candidate, payload, topicIds, view, responsibilities, learnerContext }) {
    const reports = [];
    for (const responsibility of responsibilities) {
      const request = {
        work: workIdentity({ scope, idempotencyKey: `validate:${candidate.id}:${responsibility}`, input: payload, clock }),
        responsibility, candidate, candidatePayload: payload, originalEvidence: originalEvidenceFor(scope, view, topicIds),
        manifestId: view.manifest.id, objectiveVersions: view.objectives.filter(o => topicIds.includes(o.topicId)), learnerContext, selectedProfileFacts: selectedFacts(scope), policyVersion: 'v1_engineering',
      };
      const result = await call(i => providers().validator.validate(i), request, { what: 'validation report' });
      if (result.outcome === 'failed') throw new AppError(result.error.code, result.error.message, { retryable: result.error.retryable });
      reports.push(result.value.report);
    }
    return reports;
  }
  const passes = report => report.disposition === 'pass' || report.disposition === 'provisional_allowed';

  function storeReports(scope, reports) {
    for (const r of reports) db.insert('validation_reports', { ...r, scope, candidateKind: r.candidateRef.kind, candidateId: r.candidateRef.id });
  }

  // ---------- Building records ----------

  function explanationRecord(scope, input, { knowledgeManifestId, learnerContext, triggerEvidence, prior }) {
    return {
      id: newId('pe'), scope, createdAt: clock.iso(), version: (prior?.version || 0) + 1, supersedesId: prior?.id || input.supersedesId || null,
      topicIds: input.topicIds, baseInterpretationIds: input.baseInterpretationIds, knowledgeManifestId,
      explanation: blobs.putText({ scope, text: input.text }), selectedExamples: input.selectedExamples, learnerContext,
      reasons: input.reasons, triggerEvidence, dependencies: [{ ref: { kind: 'knowledge_manifest', id: knowledgeManifestId, version: null }, hash: hashOf(knowledgeManifestId), relation: 'personalized_for' }, { ref: { kind: 'profile_snapshot', id: learnerContext.profileSnapshotId, version: learnerContext.profileVersion }, hash: hashOf(learnerContext), relation: 'personalized_for' }],
      validationReportIds: [],
    };
  }

  function edgeRecord(scope, input, view, prior) {
    // A personal edge can change emphasis but cannot fabricate a prerequisite.
    const canonical = view.edges.some(e => e.type === 'prerequisite' && e.fromTopicId === input.fromTopicId && e.toTopicId === input.toTopicId);
    return { id: newId('pme'), scope, createdAt: clock.iso(), edgeId: prior?.edgeId || newId('pedge'), version: (prior?.version || 0) + 1, fromTopicId: input.fromTopicId, toTopicId: input.toTopicId, type: input.type, explanation: input.explanation, evidence: input.evidence, provisional: input.provisional || (input.type === 'personal_prerequisite' && !canonical), supersedesId: prior?.id || input.supersedesId || null };
  }

  /** Publish a personal manifest with CAS on both exam pointers. Returns null when they moved. */
  function publishManifest(scope, { base, prior, learnerContext, explanationIds, edgeIds, emphasis, decisionIds, expectedProfileSnapshotId, expectedTopicStates = [] }) {
    const exam = db.get('exams', scope.examId, scope);
    const stale = exam.publishedKnowledgeManifestId !== base.manifest.id || (exam.publishedPersonalManifestId || null) !== (prior?.id || null)
      || (expectedProfileSnapshotId !== undefined && exam.currentProfileSnapshotId !== expectedProfileSnapshotId)
      || expectedTopicStates.some(t => (db.findOne('learner_topic_states', { topicId: t.topicId }, { scope })?.stateVersion ?? 0) !== t.stateVersion);
    const last = db.prepare('SELECT MAX(version) AS v FROM personal_manifests WHERE exam_id = ?').get(scope.examId);
    const manifest = {
      id: newId('pm'), scope, createdAt: clock.iso(), version: (last?.v ?? 0) + 1, parentManifestId: prior?.id || null, knowledgeManifestId: base.manifest.id, learnerContext,
      explanationIds, personalMapEdgeIds: edgeIds, emphasis, revisionDecisionIds: decisionIds,
      dependencies: [{ ref: { kind: 'knowledge_manifest', id: base.manifest.id, version: base.manifest.version }, hash: base.manifest.contentHash, relation: 'personalized_for' }],
      contentHash: hashOf({ explanationIds, edgeIds, emphasis }), status: stale ? 'rejected' : 'published', publishedAt: stale ? null : clock.iso(),
    };
    db.insert('personal_manifests', manifest);
    if (stale) return { manifest, published: false };
    db.update('exams', { ...exam, publishedPersonalManifestId: manifest.id, updatedAt: clock.iso() });
    events.emit({ scope, eventType: 'personal.published', aggregateType: 'exam_personal_view', aggregateId: scope.examId, aggregateVersion: manifest.version, payload: { oldPersonalManifestId: prior?.id || null, newPersonalManifestId: manifest.id, knowledgeManifestId: base.manifest.id, affectedTopicIds: [...new Set(db.find('personal_explanations', { id: explanationIds }, { scope }).flatMap(e => e.topicIds))] }, idempotencyKey: `personal.published:${manifest.id}` });
    return { manifest, published: true };
  }

  // ---------- First personal view / rebase onto a new base ----------

  /** Ensure the exam has a personal manifest compatible with the published base (bootstrap or rebase). */
  async function ensureCompatible(scope, ctx) {
    const base = knowledge().published(scope);
    if (!base) return null;
    const exam = db.get('exams', scope.examId, scope);
    const prior = manifestById(scope, exam.publishedPersonalManifestId);
    if (prior && prior.knowledgeManifestId === base.manifest.id) return { base, manifest: prior };
    const topicIds = base.topics.map(t => t.topicId);
    const learnerContext = contextRef(scope, topicIds);
    const candidates = [];
    if (prior) {
      // Rebase: carry explanations/edges whose topics still exist under the new base.
      for (const e of db.find('personal_explanations', { id: prior.explanationIds }, { scope })) {
        if (!e.topicIds.every(t => topicIds.includes(t))) continue;
        candidates.push({ input: { topicIds: e.topicIds, text: explanationText(e, scope), selectedExamples: e.selectedExamples, reasons: [...e.reasons, 'rebased onto new knowledge manifest'], baseInterpretationIds: base.interpretations.filter(i => i.topicIds.some(t => e.topicIds.includes(t))).map(i => i.id), supersedesId: e.id }, prior: e, trigger: e.triggerEvidence });
      }
    }
    const covered = new Set(candidates.flatMap(c => c.input.topicIds));
    for (const p of base.proposedPersonal) {
      const ids = (p.topicIds || []).filter(t => topicIds.includes(t));
      if (!ids.length || ids.every(t => covered.has(t)) || !p.text) continue;
      candidates.push({ input: { topicIds: ids, text: p.text, selectedExamples: p.selectedExamples || [], reasons: p.reasons || ['initial interpretation proposal'], baseInterpretationIds: p.baseInterpretationIds || [], supersedesId: null }, prior: null, trigger: [] });
    }
    const kept = [], reports = [];
    for (const c of candidates) {
      const candidate = { kind: 'personal_explanation_candidate', id: newId('pec'), version: null };
      const r = await validateCandidate(scope, { candidate, payload: c.input, topicIds: c.input.topicIds, view: base, responsibilities: ['personalization_grounding', 'source_fidelity'], learnerContext });
      reports.push(...r);
      if (r.every(passes)) kept.push({ ...c, reportIds: r.map(x => x.id) });
    }
    const edges = prior ? db.find('personal_map_edges', { id: prior.personalMapEdgeIds }, { scope }).filter(e => topicIds.includes(e.fromTopicId) && topicIds.includes(e.toTopicId)) : [];
    const commit = () => db.tx(() => {
      storeReports(scope, reports);
      const explanationIds = kept.map(c => { const rec = { ...explanationRecord(scope, c.input, { knowledgeManifestId: base.manifest.id, learnerContext, triggerEvidence: c.trigger, prior: c.prior }), validationReportIds: c.reportIds }; db.insert('personal_explanations', rec); return rec.id; });
      const edgeIds = edges.map(e => { const rec = edgeRecord(scope, e, base, e); db.insert('personal_map_edges', rec); return rec.id; });
      const emphasis = (prior?.emphasis || []).filter(x => topicIds.includes(x.topicId));
      return publishManifest(scope, { base, prior, learnerContext, explanationIds, edgeIds, emphasis, decisionIds: [] });
    });
    const out = ctx ? ctx.commit(commit) : commit();
    if (!out.published) throw new AppError('stale_dependency', 'Pointers moved while publishing the personal view.', { retryable: true });
    return { base, manifest: out.manifest };
  }

  async function publishPersonalJob(_payload, ctx) {
    try { await ensureCompatible(ctx.job.scope, ctx); }
    catch (error) {
      // The base moved on: a newer publish_personal job handles it.
      if (error.code === 'stale_dependency' && !ctx.owned()) throw error;
      if (error.code === 'stale_dependency') throw new AppError('provider_timeout', 'retry publish', { retryable: true, retryAfterMs: 0 });
      throw error;
    }
    return {};
  }

  // ---------- reconsider_personal ----------

  function decide(scope, batch, changeIds, fields) {
    const decision = { id: newId('prd'), scope, createdAt: clock.iso(), changeIds, dependencies: [], runs: [], outputPersonalManifestId: null, affectedInterpretationIds: [], affectedTopicIds: [], affectedPersonalEdgeIds: [], evidence: [], ...fields };
    db.insert('personal_revision_decisions', decision);
    events.emit({ scope, eventType: 'personal.decided', aggregateType: 'personal_batch', aggregateId: batch.id, payload: { decisionId: decision.id, changeIds, disposition: decision.disposition, reason: decision.reason }, idempotencyKey: `personal.decided:${decision.id}` });
    return decision;
  }

  function markChanges(scope, changeIds, fields) {
    for (const id of changeIds) { const c = db.get('learner_changes', id, scope); if (c) db.replace('learner_changes', { ...c, ...fields }); }
  }

  async function reconsider({ batchId }, ctx) {
    const scope = ctx.job.scope;
    const batch = db.get('personal_batches', batchId, scope);
    if (!batch || ['done', 'superseded'].includes(batch.state)) return {};
    const changes = db.find('learner_changes', { id: batch.changeIds }, { scope }).filter(c => c.status !== 'decided');
    if (!changes.length) { ctx.commit(() => db.update('personal_batches', { ...batch, state: 'done', updatedAt: clock.iso() })); return {}; }
    const changeIds = changes.map(c => c.id);

    // No published base yet: the batch waits explicitly for material.
    if (!knowledge().published(scope)) {
      ctx.commit(() => db.update('personal_batches', { ...batch, state: 'waiting_for_base', updatedAt: clock.iso() }));
      return { state: 'succeeded' };
    }
    ctx.commit(() => db.update('personal_batches', { ...batch, state: 'running', updatedAt: clock.iso() }));
    const { base, manifest: prior } = await ensureCompatible(scope, ctx);
    const allTopics = base.topics.map(t => t.topicId);

    // Scope selection: changed topics + neighbors, or every topic in bounded batches for exam-wide changes.
    const changed = [...new Set(changes.flatMap(c => c.topicIds))].filter(t => allTopics.includes(t));
    const examWide = changes.some(c => !c.topicIds.length);
    const targeted = [], excluded = [];
    if (examWide) {
      const order = topicStates(scope, allTopics).sort((a, b) => String(b.lastMeaningfulEvidenceAt || '').localeCompare(String(a.lastMeaningfulEvidenceAt || ''))).map(s => s.topicId);
      for (const t of [...changed, ...order, ...allTopics]) if (!targeted.some(x => x.topicId === t)) targeted.push({ topicId: t, reason: changed.includes(t) ? 'directly affected' : 'exam-wide change: inspected' });
    } else {
      for (const t of changed) targeted.push({ topicId: t, reason: 'directly affected' });
      for (const e of base.edges) for (const [a, b] of [[e.fromTopicId, e.toTopicId], [e.toTopicId, e.fromTopicId]]) if (changed.includes(a) && !targeted.some(x => x.topicId === b)) targeted.push({ topicId: b, reason: `nearby (${e.type})` });
      for (const t of allTopics) if (!targeted.some(x => x.topicId === t)) excluded.push({ topicId: t, reason: 'no dependency on the changed evidence or its graph neighbors' });
    }
    const priorExplanations = prior ? db.find('personal_explanations', { id: prior.explanationIds }, { scope }).map(e => ({ ...e, text: explanationText(e, scope) })) : [];
    const priorEdges = prior ? db.find('personal_map_edges', { id: prior.personalMapEdgeIds }, { scope }) : [];
    const triggering = changes.flatMap(c => c.evidence).map(ev => ev.kind === 'interaction' ? db.get('interaction_evidence', ev.id, scope) : ev.kind === 'feedback' ? db.get('feedback_evidence', ev.id, scope) : null).filter(Boolean);
    const learnerContext = contextRef(scope, targeted.map(t => t.topicId));
    const expectedTopicStates = learnerContext.topicStates.map(t => ({ topicId: t.topicId, stateVersion: t.stateVersion }));

    const outputs = [], runs = [];
    for (let i = 0; i < targeted.length; i += INSPECT_BATCH) {
      const chunk = targeted.slice(i, i + INSPECT_BATCH).map(t => t.topicId);
      const request = {
        work: workIdentity({ scope, idempotencyKey: `reconsider:${batch.id}:${i}`, input: { changeIds, chunk }, clock, dependencies: changes.map(c => ({ ref: { kind: 'learner_change', id: c.id, version: null }, hash: hashOf(c.evidence), relation: 'personalized_for' })) }),
        changes, knowledge: base.manifest, priorPersonal: prior || null, learnerContext: contextRef(scope, chunk), selectedProfileFacts: selectedFacts(scope, chunk),
        selectedTopicStates: topicStates(scope, chunk), triggeringEvidence: triggering,
        affectedBaseInterpretations: base.interpretations.filter(x => x.topicIds.some(t => chunk.includes(t))),
        priorExplanations: priorExplanations.filter(e => e.topicIds.some(t => chunk.includes(t))),
        priorPersonalEdges: priorEdges.filter(e => chunk.includes(e.fromTopicId) || chunk.includes(e.toTopicId)),
        nearbyTopics: base.topics.filter(t => chunk.includes(t.topicId)), nearbyEdges: base.edges.filter(e => chunk.includes(e.fromTopicId) || chunk.includes(e.toTopicId)),
        originalEvidence: originalEvidenceFor(scope, base, chunk).map(e => ({ anchor: e.anchor, excerpt: e.excerpt || '' })),
      };
      const result = await call(x => providers().personalReviser.reconsider(x), request, { valueSchema: REVISER_OUTPUT, what: 'personal revision' });
      runs.push(...(result.providerRuns || []));
      if (result.outcome === 'failed') {
        const finalAttempt = ctx.job.attempt >= Math.min(ctx.job.maxAttempts, config.personalRevisionAttempts);
        if (result.error?.retryable && !finalAttempt) throw new AppError(result.error.code, result.error.message, { retryable: true });
        // Exhausted: the changes stay pending and retryable; this is not a semantic no-op.
        ctx.commit(() => {
          decide(scope, batch, changeIds, { disposition: 'failed', reason: `Revision failed: ${result.reason}`, targetKnowledgeManifestId: base.manifest.id, priorPersonalManifestId: prior?.id || null, targetLearnerContext: learnerContext, runs, inspection: { targeted, excluded } });
          markChanges(scope, changeIds, { status: 'pending', batchId: null });
          db.update('personal_batches', { ...db.get('personal_batches', batch.id, scope), state: 'failed', updatedAt: clock.iso() });
        });
        return { state: 'succeeded' };
      }
      outputs.push({ chunk, value: result.value });
    }

    // Aggregate and validate.
    const value = { explanations: [], mapEdges: [], removedExplanationIds: [], removedPersonalEdgeIds: [], emphasis: [], reasons: [], evidence: [], inspected: [], needsReview: false };
    for (const o of outputs) {
      const v = o.value;
      value.explanations.push(...v.explanations.filter(e => e.topicIds.every(t => allTopics.includes(t))));
      value.mapEdges.push(...v.mapEdges.filter(e => allTopics.includes(e.fromTopicId) && allTopics.includes(e.toTopicId)));
      value.removedExplanationIds.push(...v.removedExplanationIds.filter(id => priorExplanations.some(e => e.id === id)));
      value.removedPersonalEdgeIds.push(...v.removedPersonalEdgeIds.filter(id => priorEdges.some(e => e.id === id)));
      value.emphasis.push(...v.emphasis.filter(e => allTopics.includes(e.topicId)));
      value.reasons.push(v.decision.reason); value.evidence.push(...v.decision.evidence); value.inspected.push(...v.decision.inspected);
      if (v.decision.disposition === 'needs_review') value.needsReview = true;
    }
    const inspectedAreas = targeted.map(t => ({ topicId: t.topicId, needsChange: value.inspected.find(x => x.topicId === t.topicId)?.needsChange ?? false, note: value.inspected.find(x => x.topicId === t.topicId)?.note || t.reason }));
    const revising = value.explanations.length || value.mapEdges.length || value.removedExplanationIds.length || value.removedPersonalEdgeIds.length || value.emphasis.length;
    const evidence = value.evidence.length ? value.evidence : changes.flatMap(c => c.evidence);
    const reason = value.reasons.filter(Boolean).join(' ') || (revising ? 'Revised after learner evidence.' : '');

    const reports = [];
    const candidateIds = new Map();
    if (revising && !value.needsReview) {
      for (const e of value.explanations) {
        const candidate = { kind: 'personal_explanation_candidate', id: newId('pec'), version: null };
        const r = await validateCandidate(scope, { candidate, payload: e, topicIds: e.topicIds, view: base, responsibilities: ['personalization_grounding', 'source_fidelity', 'math_and_reasoning'], learnerContext });
        reports.push(...r); candidateIds.set(e, r.map(x => x.id));
        if (!r.every(passes)) value.needsReview = true;
      }
      for (const e of value.mapEdges) {
        const candidate = { kind: 'personal_map_edge_candidate', id: newId('pec'), version: null };
        const r = await validateCandidate(scope, { candidate, payload: e, topicIds: [e.fromTopicId, e.toTopicId], view: base, responsibilities: ['personalization_grounding'], learnerContext });
        reports.push(...r);
        if (!r.every(passes)) value.needsReview = true;
      }
    }

    const common = { targetKnowledgeManifestId: base.manifest.id, priorPersonalManifestId: prior?.id || null, targetLearnerContext: learnerContext, affectedInterpretationIds: base.interpretations.filter(x => x.topicIds.some(t => targeted.some(y => y.topicId === t))).map(x => x.id), affectedTopicIds: targeted.map(t => t.topicId), affectedPersonalEdgeIds: priorEdges.filter(e => targeted.some(t => t.topicId === e.fromTopicId || t.topicId === e.toTopicId)).map(e => e.id), runs, inspection: { targeted, excluded, areas: inspectedAreas } };

    ctx.commit(() => {
      storeReports(scope, reports);
      let decision;
      if (value.needsReview) {
        decision = decide(scope, batch, changeIds, { ...common, disposition: 'needs_review', reason: reason || 'Validation found an unsupported or ungrounded revision.', evidence, validationReportIds: reports.map(r => r.id) });
        markChanges(scope, changeIds, { status: 'decided', decisionId: decision.id });
      } else if (!revising) {
        if (!reason || !targeted.length) throw new AppError('quality_gate', 'A no-op needs a reason and an inspected scope.');
        decision = decide(scope, batch, changeIds, { ...common, disposition: 'noop', reason, evidence });
        markChanges(scope, changeIds, { status: 'decided', decisionId: decision.id });
      } else {
        const decisionId = newId('prd');
        const removed = new Set(value.removedExplanationIds);
        const newExplanations = value.explanations.map(e => {
          const priorSame = priorExplanations.find(p => p.id === e.supersedesId);
          if (priorSame) removed.add(priorSame.id);
          const rec = { ...explanationRecord(scope, e, { knowledgeManifestId: base.manifest.id, learnerContext, triggerEvidence: evidence, prior: priorSame }), validationReportIds: candidateIds.get(e) || [] };
          db.insert('personal_explanations', rec); return rec;
        });
        const removedEdges = new Set(value.removedPersonalEdgeIds);
        const newEdges = value.mapEdges.map(e => { const p = priorEdges.find(x => x.id === e.supersedesId); if (p) removedEdges.add(p.id); const rec = edgeRecord(scope, e, base, p); db.insert('personal_map_edges', rec); return rec; });
        const emphasis = [...(prior?.emphasis || []).filter(x => !value.emphasis.some(y => y.topicId === x.topicId)), ...value.emphasis];
        const out = publishManifest(scope, {
          base, prior, learnerContext,
          explanationIds: [...(prior?.explanationIds || []).filter(id => !removed.has(id)), ...newExplanations.map(e => e.id)],
          edgeIds: [...(prior?.personalMapEdgeIds || []).filter(id => !removedEdges.has(id)), ...newEdges.map(e => e.id)],
          emphasis, decisionIds: [decisionId, ...(prior?.revisionDecisionIds || [])].slice(0, 50),
          expectedProfileSnapshotId: learnerContext.profileSnapshotId, expectedTopicStates,
        });
        if (!out.published) {
          // The world moved: keep the candidate for audit, decide stale, and reconsider against the new state.
          decision = decide(scope, batch, changeIds, { ...common, id: decisionId, disposition: 'stale', reason: 'Profile, learner state or pointers changed during revision; candidate kept for audit.', evidence, outputPersonalManifestId: out.manifest.id });
          markChanges(scope, changeIds, { status: 'pending', decisionId: null, batchId: null });
          const fresh = newBatch(scope, changeIds, 0);
          markChanges(scope, changeIds, { batchId: fresh.id });
        } else {
          decision = decide(scope, batch, changeIds, { ...common, id: decisionId, disposition: 'revise', reason: reason || 'Revised after learner evidence.', evidence, outputPersonalManifestId: out.manifest.id, validationReportIds: reports.map(r => r.id) });
          markChanges(scope, changeIds, { status: 'decided', decisionId: decision.id });
        }
      }
      db.update('personal_batches', { ...db.get('personal_batches', batch.id, scope), state: 'done', updatedAt: clock.iso() });
    });
    return { resultRefs: [{ kind: 'personal_batch', id: batch.id, version: null }] };
  }

  /** knowledge.published: bootstrap/rebase the personal view, then wake batches that waited for material. */
  function onKnowledgePublished(scope, payload) {
    jobs.enqueue({ scope, type: 'publish_personal', idempotencyKey: `publish_personal:${payload.newManifestId}`, payload: { knowledgeManifestId: payload.newManifestId }, priority: 40 });
    for (const b of db.find('personal_batches', { state: 'waiting_for_base' }, { scope })) {
      const next = db.update('personal_batches', { ...b, state: 'open', updatedAt: clock.iso() });
      jobs.enqueue({ scope, type: 'reconsider_personal', idempotencyKey: `reconsider:${b.id}:${payload.newManifestId}`, payload: { batchId: next.id }, priority: 30 });
    }
  }

  /** Reconciliation: pending changes with no live batch (e.g. after an exhausted failure) get one. */
  function reconcile() {
    const orphans = db.prepare("SELECT data FROM learner_changes WHERE status IN ('pending','coalesced') AND batch_id IS NULL").all().map(r => JSON.parse(r.data));
    const byExam = new Map();
    for (const c of orphans) byExam.set(c.scope.examId, [...(byExam.get(c.scope.examId) || []), c]);
    for (const [, list] of byExam) {
      const scope = list[0].scope;
      const exam = db.get('exams', scope.examId);
      if (!exam || ['deleting', 'deleted'].includes(exam.status)) continue;
      db.tx(() => { const b = newBatch(scope, list.map(c => c.id), 0); markChanges(scope, list.map(c => c.id), { batchId: b.id }); });
    }
  }

  return {
    contextRef, selectedFacts, topicStates, create, enqueueChange, personalView, ensureCompatible, publishPersonalJob, reconsider, onKnowledgePublished, reconcile,
    latestPersonalManifestId: scope => db.get('exams', scope.examId, scope)?.publishedPersonalManifestId || null,
    decisions: scope => db.find('personal_revision_decisions', {}, { scope }),
    changes: scope => db.find('learner_changes', {}, { scope, order: 'sequence' }),
  };
}
