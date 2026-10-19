import { newId, hashOf, estimateTokens } from '../core/util.mjs';
import { AppError, issue } from '../core/errors.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { INTERPRETATION, GRAPH_CANDIDATE, MERGE_DECISIONS, GRAPH_OUTLINE, VALIDATE_OUTPUT } from './schemas.mjs';

// L2 interpretation, L3 graph, bounded refinement, atomic publication and invalidation (spec §2.1, §5.1, §6).
// Every provider result is checked deterministically before it becomes a record: evidence must resolve
// to real anchors of the right source, graph references must close, hierarchy must be acyclic.

const SEGMENT_CONCURRENCY = 4;
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } }));
  return results;
}
const MERGE_FAN_IN = 12;
const BLOCKING = new Set(['repair_required', 'needs_review']);
const DISPOSITION_RANK = { pass: 0, provisional_allowed: 1, repair_required: 2, needs_review: 3 };
const EVIDENCE_PER_CALL = 40; // original excerpts one validator call carries
// What a validator payload's batchable items cite: interpretation claims, or graph edges.
const CITES = { claims: c => c.evidence.map(e => e.id), edges: e => e.evidenceAnchorIds };
const TERMINAL_BUILD = new Set(['published', 'stale', 'failed', 'needs_review']);

/**
 * Graph content from model decisions (merge levels and finalize; spec §6 bounded synthesis). The model only
 * says which keys are one idea (`mergedKeys`), where topics sit and which edges are new; every objective,
 * evidence link and edge of `contents` moves to the key its topic now maps to, so nothing vanishes with a
 * merge, and a topic the decisions leave out keeps its place. Objective edits address `contents` as the model
 * saw it: a topic's objectives by position, null for all.
 * ponytail: one stable key in two contents is one topic (keys are reused across partitions by design); if two
 * partitions ever reuse a key for different ideas, have partitions report collisions instead of trusting the key.
 */
function assemble(contents, decisions) {
  const into = new Map();
  for (const t of decisions.topics) for (const k of t.mergedKeys) if (k !== t.key) into.set(k, t.key);
  const canon = key => { for (const seen = new Set(); into.has(key) && !seen.has(key);) { seen.add(key); key = into.get(key); } return key; };
  const decided = new Map();
  for (const t of decisions.topics) if (!decided.has(t.key)) decided.set(t.key, t);

  // Each surviving key keeps its first content topic (its own definition over one it absorbed), then new keys.
  const base = new Map();
  for (const c of contents) for (const t of c.topics) {
    const key = canon(t.stableKey), prior = base.get(key);
    if (!prior || (t.stableKey === key && prior.stableKey !== key)) base.set(key, t);
  }
  for (const t of decisions.topics) if (!base.has(canon(t.key))) base.set(canon(t.key), null);
  const topics = [...base].map(([key, t]) => {
    const d = decided.get(key), parent = d ? d.parentKey : t?.parentStableKey ?? null, p = parent && canon(parent);
    return { stableKey: key, title: d?.title ?? t?.title ?? key, description: d?.description ?? t?.description ?? '', parentStableKey: p && p !== key ? p : null };
  });

  // Identical statements under one topic are one objective; their evidence is pooled.
  const objectives = new Map(), edits = decisions.objectiveEdits || [];
  for (const c of contents) {
    const position = new Map();
    for (const o of c.objectives) {
      const i = position.get(o.topicKey) ?? 0;
      position.set(o.topicKey, i + 1);
      const e = edits.find(x => x.topicKey === o.topicKey && (x.objectiveIndex === null || x.objectiveIndex === i));
      const topicKey = canon(o.topicKey), id = `${topicKey}\n${o.statement.trim().replace(/\s+/g, ' ').toLowerCase()}`, same = objectives.get(id);
      if (same) { same.evidenceAnchorIds = [...new Set([...same.evidenceAnchorIds, ...o.evidenceAnchorIds])]; continue; }
      objectives.set(id, { ...o, topicKey, ...(e && { scopeBasis: e.scopeBasis, ...(e.examWeight !== null && { examWeight: e.examWeight, examWeightEvidence: e.examWeightEvidence }) }) });
    }
  }
  const links = new Map();
  for (const c of contents) for (const l of c.evidenceLinks) { const topicKey = canon(l.topicKey), id = `${topicKey}\n${l.anchorId}`; if (!links.has(id)) links.set(id, { ...l, topicKey }); }
  const edges = new Map();
  for (const e of [...contents.flatMap(c => c.edges), ...decisions.edges]) {
    const fromKey = canon(e.fromKey), toKey = canon(e.toKey), id = `${fromKey}\n${toKey}\n${e.type}`;
    if (fromKey !== toKey && !edges.has(id)) edges.set(id, { ...e, fromKey, toKey });
  }
  return { topics, objectives: [...objectives.values()], edges: [...edges.values()], evidenceLinks: [...links.values()], migrations: decisions.migrations || [], affectedInterpretationIds: decisions.affectedInterpretationIds || [], reasons: decisions.reasons, noChangeReason: decisions.noChangeReason ?? null };
}

/**
 * Topic titles a student can tell apart: when two topics share a title (say "The Stack" under C memory and under
 * calling conventions), each one that has a parent is named with it, "The Stack (Calling Convention)". `entries` is
 * [{ key, title, parentKey }]; returns Map key → title. Distinct titles come back unchanged.
 */
export function distinctTitles(entries) {
  const byKey = new Map(entries.map(e => [e.key, e])), norm = t => String(t).trim().toLowerCase();
  const count = new Map();
  for (const e of entries) count.set(norm(e.title), (count.get(norm(e.title)) || 0) + 1);
  const out = new Map(entries.map(e => [e.key, count.get(norm(e.title)) > 1 && byKey.get(e.parentKey) ? `${e.title} (${byKey.get(e.parentKey).title})` : e.title]));
  // Still equal (same parent title, or several at the top level): number them in order.
  const again = new Map();
  for (const [key, title] of out) { const n = (again.get(norm(title)) || 0) + 1; again.set(norm(title), n); if (n > 1) out.set(key, `${title} (${n})`); }
  return out;
}

export function createBuild(app) {
  const { db, clock, blobs, jobs, events, config } = app;
  const reader = () => app.services.knowledge;
  const learner = () => app.services.learner || {};

  // ---------- shared helpers ----------

  function learnerInputs(scope, topicIds = []) {
    const l = learner();
    const exam = db.get('exams', scope.examId);
    const learnerContext = l.contextRef ? l.contextRef(scope, topicIds) : { profileSnapshotId: exam.currentProfileSnapshotId, profileVersion: 0, topicStates: [], selectedFactIds: [], selectedEvidenceIds: [], emptyProfile: true };
    return { learnerContext, selectedProfileFacts: l.selectedFacts ? l.selectedFacts(scope, topicIds) : [], selectedTopicStates: l.topicStates ? l.topicStates(scope, topicIds) : [] };
  }

  const anchorExcerpt = (anchor, scope) => anchor.disposition && anchor.disposition !== 'faithful'
    ? `[UNCERTAIN: ${anchor.kind || 'region'} could not be read; anchor=${anchor.anchorKey}]`
    : blobs.readText(anchor.evidenceArtifact, scope);

  const semanticHash = interp => hashOf({ claims: interp.claims.map(c => [c.kind, c.text, c.evidence.map(e => e.id).sort(), c.support]).sort((a, b) => String(a).localeCompare(String(b))), assumptions: interp.assumptions });

  /** Provider candidate → BaseInterpretation, dropping or downgrading anything not grounded in `allowed` anchors. */
  function toInterpretation(candidate, { scope, kind, allowed, sv, artifact, segmentIds, runs, version, supersedesId, topicIds = [], graphContextManifestId = null, extra = {} }) {
    const issues = [];
    const ground = claimLike => {
      const valid = (claimLike.evidenceAnchorIds || []).filter(id => allowed.has(id));
      const invalid = (claimLike.evidenceAnchorIds || []).filter(id => !allowed.has(id));
      if (invalid.length) issues.push(issue('unresolved_evidence', `Claim "${claimLike.text.slice(0, 80)}" cited anchors outside this source: ${invalid.join(', ')}.`, { affected: invalid.map(id => ({ kind: 'source_anchor', id, version: null })), resolution: 'repaired' }));
      const uncertain = valid.filter(id => allowed.get(id).disposition !== 'faithful');
      const factual = claimLike.kind === 'source_statement' || claimLike.kind === 'example';
      if (!valid.length && factual) { issues.push(issue('ungrounded_claim', `Dropped a ${claimLike.kind} with no resolvable evidence.`, { resolution: 'repaired' })); return null; }
      const uncertainties = (claimLike.uncertainties || []).map(u => ({ reason: u.reason, evidence: [], alternatives: u.alternatives || [] }));
      let support = claimLike.support;
      if (!valid.length) { support = 'provisional'; uncertainties.push({ reason: 'No resolvable source evidence.', evidence: [], alternatives: [] }); }
      if (uncertain.length) { support = 'provisional'; uncertainties.push({ reason: 'Cites a region whose extraction is uncertain.', evidence: uncertain.map(id => ({ kind: 'source_anchor', id, detail: null })), alternatives: [] }); }
      if (support === 'direct' && !factual) support = 'derived';
      return { claimId: newId('clm'), kind: claimLike.kind, text: claimLike.text, evidence: valid.map(id => ({ kind: 'source_anchor', id, detail: null })), support, derivation: claimLike.derivation ?? null, uncertainties };
    };
    const indexMap = new Map(), claims = [];
    candidate.claims.forEach((c, i) => { const g = ground(c); if (g) { indexMap.set(i, g.claimId); claims.push(g); } });
    const examples = candidate.examples.map(e => ground(e)).filter(Boolean);
    const explanation = blobs.putText({ scope, text: candidate.explanation });
    const record = {
      id: newId('interp'), scope, createdAt: clock.iso(), sourceVersionId: sv.id, extractionArtifactId: artifact.id, version, supersedesId,
      topicIds, sourceSegmentIds: segmentIds, explanation, claims, assumptions: candidate.assumptions, examples,
      graphContextManifestId, status: 'candidate', dependencies: [
        { ref: { kind: 'source_version', id: sv.id, version: sv.version }, hash: sv.contentHash, relation: 'derived_from' },
        { ref: { kind: 'extraction_artifact', id: artifact.id, version: artifact.version }, hash: artifact.markdown.sha256, relation: 'derived_from' },
      ],
      validationReportIds: [], runs, kind,
      concepts: candidate.concepts.map(c => ({ name: c.name, parentName: c.parentName ?? null, summary: c.summary, claimIds: c.claimIndexes.map(i => indexMap.get(i)).filter(Boolean), anchorIds: c.anchorIds.filter(id => allowed.has(id)) })),
      proposedPersonalExplanations: candidate.proposedPersonalExplanations.map(p => ({ ...p, exampleAnchorIds: p.exampleAnchorIds.filter(id => allowed.has(id)), topicIds: [] })),
      proposedConnections: candidate.proposedConnections.map(p => { const ev = p.evidenceAnchorIds.filter(id => allowed.has(id)); return { ...p, evidenceAnchorIds: ev, support: ev.length ? p.support : 'provisional' }; }),
      unresolvedQuestions: candidate.unresolvedQuestions, issues, ...extra,
    };
    record.semanticHash = semanticHash(record);
    return record;
  }

  /**
   * Run one validator responsibility; returns a ValidationReport (or throws to retry). A long source's claims,
   * or a large graph's edges, cite more anchors than one call can carry, so they are checked in batches whose
   * cited excerpts fit, and the batch reports merge into one: nothing is judged without its evidence (§6).
   */
  async function validateCandidate(ctx, args) {
    const field = Object.keys(CITES).find(k => Array.isArray(args.payload?.[k]));
    if (!field || new Set(args.anchorIds).size <= EVIDENCE_PER_CALL) return validateOnce(ctx, args);
    const cite = CITES[field], batches = [];
    let batch = [], cited = new Set();
    for (const item of args.payload[field]) {
      const ids = cite(item);
      if (batch.length && new Set([...cited, ...ids]).size > EVIDENCE_PER_CALL) { batches.push(batch); batch = []; cited = new Set(); }
      batch.push(item); for (const id of ids) cited.add(id);
    }
    if (batch.length) batches.push(batch);
    const reports = await mapLimit(batches, SEGMENT_CONCURRENCY, (part, i) => validateOnce(ctx, { ...args, payload: { ...args.payload, [field]: part, ...(i && args.payload.examples ? { examples: [] } : {}) }, anchorIds: part.flatMap(cite), part: i }));
    const worst = reports.reduce((a, r) => (DISPOSITION_RANK[r.disposition] ?? 3) > (DISPOSITION_RANK[a.disposition] ?? 3) ? r : a);
    return { ...worst, id: newId('vrep'), checks: reports.flatMap(r => r.checks || []), issues: reports.flatMap(r => r.issues || []), runs: reports.flatMap(r => r.runs || []), repairInstructions: reports.flatMap(r => r.repairInstructions || []) };
  }

  async function validateOnce(ctx, { scope, responsibility, candidate, payload, anchorIds, objectives = [], manifestId = null, part = null }) {
    const evidence = [...new Set(anchorIds)].slice(0, EVIDENCE_PER_CALL).map(id => db.get('source_anchors', id, scope)).filter(Boolean).map(anchor => ({ anchor, excerpt: anchor.disposition === 'faithful' ? anchorExcerpt(anchor, scope) : null, artifact: anchor.evidenceArtifact }));
    const request = { work: workIdentity({ scope, idempotencyKey: `validate:${responsibility}:${candidate.id}${part === null ? '' : `:${part}`}`, input: payload, clock }), responsibility, candidate, candidatePayload: payload, originalEvidence: evidence, manifestId, objectiveVersions: objectives, learnerContext: null, selectedProfileFacts: [], policyVersion: 'validation_v1' };
    const result = await call(input => app.providers.validator.validate(input), request, { valueSchema: VALIDATE_OUTPUT, what: `${responsibility} validation` });
    let report;
    if (result.outcome === 'ok') report = { ...result.value.report, id: result.value.report.id || newId('vrep'), scope, createdAt: clock.iso(), candidateRef: candidate, responsibility, dependencies: request.work.dependencies, repairInstructions: result.value.repairInstructions };
    else if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true });
    else report = { id: newId('vrep'), scope, createdAt: clock.iso(), candidateRef: candidate, responsibility, disposition: 'needs_review', checks: [{ check: responsibility, passed: null, evidence: [], note: 'Validator unavailable.' }], issues: [issue('validator_unavailable', result.error?.message || 'Validator unavailable.', { severity: 'blocking', affected: [candidate], resolution: 'needs_review' })], dependencies: [], runs: result.providerRuns, repairInstructions: [] };
    return report;
  }
  const storeReport = report => db.insert('validation_reports', { ...report, candidateKind: report.candidateRef.kind, candidateId: report.candidateRef.id });

  // ---------- builds and advancement ----------

  /** New build generation for an exam (inside a tx). Older unfinished builds become stale. */
  function newBuild(examId, reason, changedRefs = []) {
    return db.tx(() => {
      const exam = db.get('exams', examId);
      const generation = exam.desiredBuildGeneration + 1;
      for (const b of db.find('revision_builds', { examId, kind: 'knowledge' })) if (!TERMINAL_BUILD.has(b.state)) db.update('revision_builds', { ...b, state: 'stale', updatedAt: clock.iso(), reason: `${b.reason}; superseded by generation ${generation}` });
      const build = {
        id: newId('build'), scope: { ...exam.scope }, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, kind: 'knowledge', generation,
        parentManifestId: exam.publishedKnowledgeManifestId, targetManifestId: null, sourceVersionIds: [], learnerChangeIds: [], coverage: [], pendingSynthesisPartitionIds: [],
        state: 'queued', round: 0, budget: config.buildBudget, consumedCalls: 0, changedRefs, issues: [], reason, refinement: [], candidate: null,
      };
      db.insert('revision_builds', build);
      db.update('exams', { ...exam, desiredBuildGeneration: generation, status: exam.publishedKnowledgeManifestId ? exam.status : 'building', updatedAt: clock.iso() });
      maybeAdvance(examId);
      return build;
    });
  }

  const latestSourceInterp = (scope, sourceVersionId) => db.find('base_interpretations', { sourceVersionId, kind: 'source' }, { scope, order: 'version DESC' })[0] || null;

  /** Start the graph once every finalized source of the current build is settled (inside a tx). */
  function maybeAdvance(examId, exceptJobId = null) {
    db.tx(() => {
      const exam = db.get('exams', examId);
      const build = db.findOne('revision_builds', { examId, kind: 'knowledge', generation: exam.desiredBuildGeneration });
      if (!build || build.state !== 'queued') return;
      const files = db.find('source_files', { examId }).filter(f => f.currentSourceVersionId && f.status !== 'deleted');
      if (files.some(f => f.status === 'processing')) return;
      // v7 ingest: on a published course a rebuild waits until new files are attached to the modules (backend/ingest), then starts low.
      if (exam.publishedKnowledgeManifestId && db.find('jobs', { examId, type: 'attach_material', state: ['queued', 'running', 'retry_wait'] }).some(j => j.id !== exceptJobId)) return;
      const scope = build.scope;
      const eligible = files.map(f => latestSourceInterp(scope, f.currentSourceVersionId)).filter(i => i?.status === 'validated');
      if (!eligible.length) {
        db.update('revision_builds', { ...build, state: 'failed', issues: [...build.issues, issue('no_eligible_sources', 'No source produced validated material.', { severity: 'blocking', resolution: 'needs_review' })], updatedAt: clock.iso() });
        if (!exam.publishedKnowledgeManifestId) db.update('exams', { ...exam, status: 'needs_review', updatedAt: clock.iso() });
        return;
      }
      db.update('revision_builds', { ...build, state: 'building', sourceVersionIds: eligible.map(i => i.sourceVersionId), updatedAt: clock.iso() });
      jobs.enqueue({ scope, type: 'build_graph', idempotencyKey: `build_graph:${build.id}`, payload: { buildId: build.id }, priority: 8 }); // ahead of the course model's builds (5–9 is theirs; a wanted topic is 9), which go stale on a new manifest
    });
  }

  /** Reject results for a build that is no longer the exam's desired generation. */
  function currentBuild(ctx, buildId) {
    const build = db.must('revision_builds', buildId, ctx.job.scope);
    const exam = db.get('exams', build.scope.examId);
    if (exam.desiredBuildGeneration !== build.generation || build.state === 'stale') {
      ctx.commit(() => { const b = db.get('revision_builds', buildId); if (b.state !== 'stale') db.update('revision_builds', { ...b, state: 'stale', updatedAt: clock.iso() }); });
      return null;
    }
    return build;
  }

  /** A build whose job gives up must say so: mark it needs_review (non-retryable errors only), then rethrow. */
  function guarded(handler) {
    return async (payload, ctx) => {
      try { return await handler(payload, ctx); }
      catch (error) {
        const final = !(error instanceof AppError) || !error.retryable || ctx.job.attempt >= ctx.job.maxAttempts;
        if (final && error.code !== 'stale_dependency') {
          try {
            ctx.commit(() => {
              const b = db.get('revision_builds', payload.buildId);
              if (b && !TERMINAL_BUILD.has(b.state)) db.update('revision_builds', { ...b, state: 'needs_review', issues: [...b.issues, issue(error.code || 'internal_error', error.message || 'Build step failed.', { severity: 'blocking', resolution: 'needs_review' })], updatedAt: clock.iso() });
              const exam = db.get('exams', b.scope.examId);
              if (!exam.publishedKnowledgeManifestId) db.update('exams', { ...exam, status: 'needs_review', updatedAt: clock.iso() });
            });
          } catch { /* lost lease: the new owner decides */ }
        }
        throw error;
      }
    };
  }

  function spend(build, n = 1) {
    build.consumedCalls += n;
    if (build.consumedCalls > build.budget.maxProviderCalls) throw new AppError('budget_exhausted', `Build exceeded ${build.budget.maxProviderCalls} provider calls.`, { retryable: false });
  }

  // ---------- interpret_source (L2) ----------

  function ensureSegments(scope, artifact) {
    const existing = db.find('source_segments', { extractionArtifactId: artifact.id }, { scope, order: 'segment_index' });
    if (existing.length) return existing;
    const anchors = db.find('source_anchors', { id: artifact.anchorIds }, { scope });
    const ordered = artifact.anchorIds.map(id => anchors.find(a => a.id === id));
    const segments = [];
    let current = [], tokens = 0;
    const flush = () => {
      if (!current.length) return;
      const prev = segments.at(-1);
      const overlap = prev ? prev.anchorIds.slice(-config.segmentOverlapAnchors) : [];
      segments.push({ id: newId('seg'), scope, createdAt: clock.iso(), sourceVersionId: artifact.sourceVersionId, extractionArtifactId: artifact.id, segmentIndex: segments.length, anchorIds: current.map(a => a.id), overlapAnchorIds: overlap, contentHash: hashOf(current.map(a => a.excerptHash)), estimatedTokens: tokens, segmentationPolicyVersion: `seg_v1_${config.segmentMaxTokens}` });
      current = []; tokens = 0;
    };
    for (const anchor of ordered) {
      const t = anchor.disposition === 'faithful' ? estimateTokens(anchorExcerpt(anchor, scope)) : 30;
      if (current.length && tokens + t > config.segmentMaxTokens) flush();
      current.push(anchor); tokens += t;
    }
    flush();
    db.tx(() => { for (const seg of segments) db.insert('source_segments', seg); });
    return segments;
  }

  jobs.register('interpret_source', async ({ sourceVersionId, extractionArtifactId }, ctx) => {
    const scope = ctx.job.scope;
    const sv = db.must('source_versions', sourceVersionId, scope);
    const file = db.must('source_files', sv.sourceFileId, scope);
    if (file.currentSourceVersionId !== sv.id) return { state: 'stale' };
    // A guide-backed course (PLATO_KNOWLEDGE=guide): the harness reads the file into its sources and publishes its topics from the
    // study guide (backend/lessons/guide-manifest.mjs), so nothing is interpreted and no knowledge build waits on it.
    if (db.get('exams', scope.examId)?.knowledgeSource === 'guide') {
      ctx.commit(() => {
        db.update('source_files', { ...db.get('source_files', file.id), status: 'ready', error: null, updatedAt: clock.iso() });
        for (const b of db.find('revision_builds', { examId: scope.examId, kind: 'knowledge' })) if (!TERMINAL_BUILD.has(b.state)) db.update('revision_builds', { ...b, state: 'stale', reason: 'guide-backed course', updatedAt: clock.iso() });
      });
      return { state: 'stale' };
    }
    const artifact = db.must('extraction_artifacts', extractionArtifactId, scope);
    const done = latestSourceInterp(scope, sv.id);
    if (done && done.extractionArtifactId === artifact.id) { ctx.commit(() => settleSource(scope, sv, done)); return { resultRefs: [{ kind: 'base_interpretation', id: done.id, version: done.version }] }; }
    const segments = ensureSegments(scope, artifact);
    const anchorsById = new Map(db.find('source_anchors', { id: artifact.anchorIds }, { scope }).map(a => [a.id, a]));
    const published = reader().published(scope);
    const graphContext = published ? { manifestId: published.manifest.id, topics: published.topics, edges: published.edges, objectives: published.objectives } : { manifestId: null, topics: [], edges: [], objectives: [] };
    const learnerIn = learnerInputs(scope, published?.topics.map(t => t.topicId) || []);
    const segmentInterps = new Map(db.find('base_interpretations', { sourceVersionId, kind: 'segment' }, { scope }).filter(i => i.extractionArtifactId === artifact.id).map(i => [i.segmentId, i]));
    const excluded = [...(ctx.current.checkpoint?.excluded || [])];
    // Segments are interpreted in parallel (bounded); overlap anchors carry continuity across boundaries.
    await mapLimit(segments.filter(seg => !segmentInterps.has(seg.id) && !excluded.some(e => e.segmentId === seg.id)), SEGMENT_CONCURRENCY, async seg => {
      const evidenceIds = [...seg.overlapAnchorIds, ...seg.anchorIds];
      const previous = segmentInterps.get(segments[seg.segmentIndex - 1]?.id);
      const request = {
        mode: 'segment', segmentInterpretations: [], work: workIdentity({ scope, idempotencyKey: `interpret:${seg.id}`, input: { seg: seg.id }, clock }),
        sourceVersionId, extraction: artifact, sourceEvidence: evidenceIds.map(id => ({ anchor: anchorsById.get(id), excerpt: anchorExcerpt(anchorsById.get(id), scope) })),
        priorInterpretation: null, segments: [seg], declaredCoverage: coverageEntry(sv, artifact, segments, [...segmentInterps.values()], excluded, false),
        relatedSegmentSummaries: previous ? [{ interpretationId: previous.id, coveredSegmentIds: previous.sourceSegmentIds, text: previous.concepts.map(c => `${c.name}: ${c.summary}`).join('\n') }] : [],
        graphContext, ...learnerIn, sourceName: file.filename,
      };
      const result = await call(input => app.providers.interpreter.interpret(input), request, { valueSchema: INTERPRETATION, what: 'segment interpretation' });
      if (result.outcome !== 'ok') {
        if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true });
        excluded.push({ segmentId: seg.id, anchorIds: seg.anchorIds, reason: result.error?.message || 'Interpretation failed.', disposition: 'failed' });
        ctx.checkpoint({ excluded });
        return;
      }
      const allowed = new Map(evidenceIds.map(id => [id, anchorsById.get(id)]));
      const record = toInterpretation(result.value, { scope, kind: 'segment', allowed, sv, artifact, segmentIds: [seg.id], runs: result.providerRuns, version: 1, supersedesId: null, extra: { segmentId: seg.id } });
      ctx.commit(() => db.insert('base_interpretations', record));
      segmentInterps.set(seg.id, record);
    });

    // Merge segment interpretations into one per-source interpretation, in bounded levels.
    const parts = [...segmentInterps.values()].sort((a, b) => segments.findIndex(s => s.id === a.segmentId) - segments.findIndex(s => s.id === b.segmentId));
    if (!parts.length) {
      ctx.commit(() => {
        const f = db.get('source_files', file.id);
        db.update('source_files', { ...f, status: 'needs_review', error: { code: 'quality_gate', retryable: true, message: 'No part of this file could be interpreted.', retryAfterMs: null, issues: [] }, updatedAt: clock.iso() });
        maybeAdvance(scope.examId);
      });
      return { state: 'needs_review' };
    }
    let level = parts, runs = [];
    const allowed = new Map([...anchorsById].filter(([, a]) => a.disposition === 'faithful'));
    do {
      const next = [];
      const groups = [];
      for (let i = 0; i < level.length; i += MERGE_FAN_IN) groups.push([i, level.slice(i, i + MERGE_FAN_IN)]);
      const mergedGroups = await mapLimit(groups, SEGMENT_CONCURRENCY, async ([i, group]) => {
        if (group.length === 1 && level.length > 1) return group[0];
        const request = { mode: 'source_merge', segmentInterpretations: group, work: workIdentity({ scope, idempotencyKey: `merge:${sv.id}:${i}`, input: group.map(g => g.id), clock }), sourceVersionId, extraction: artifact, sourceEvidence: [], priorInterpretation: null, segments, declaredCoverage: coverageEntry(sv, artifact, segments, parts, excluded, false), relatedSegmentSummaries: [], graphContext, ...learnerIn, sourceName: file.filename };
        const result = await call(input => app.providers.interpreter.interpret(input), request, { valueSchema: INTERPRETATION, what: 'source merge' });
        if (result.outcome !== 'ok') { if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true }); throw new AppError('quality_gate', 'Could not merge segment interpretations.', { retryable: false }); }
        runs.push(...result.providerRuns);
        return toInterpretation(result.value, { scope, kind: 'merge-level', allowed, sv, artifact, segmentIds: group.flatMap(g => g.sourceSegmentIds), runs: result.providerRuns, version: 0, supersedesId: null });
      });
      next.push(...mergedGroups);
      level = next;
    } while (level.length > 1);
    const merged = level[0];
    const prior = latestSourceInterp(scope, sv.id);
    const source = { ...merged, id: newId('interp'), kind: 'source', version: (prior?.version || 0) + 1, supersedesId: prior?.id || null, runs: runs.length ? runs : merged.runs, sourceSegmentIds: parts.flatMap(p => p.sourceSegmentIds) };

    const checkAll = async candidate => {
      const out = await Promise.all(['source_fidelity', 'math_and_reasoning'].map(responsibility => validateCandidate(ctx, { scope, responsibility, candidate: { kind: 'base_interpretation', id: candidate.id, version: candidate.version }, payload: { claims: candidate.claims, assumptions: candidate.assumptions, examples: candidate.examples }, anchorIds: candidate.claims.flatMap(c => c.evidence.map(e => e.id)) })));
      return out;
    };
    let reports = await checkAll(source);
    // One bounded repair: hand the checkers' instructions back to the interpreter, then check again.
    const instructions = reports.filter(r => r.disposition === 'repair_required').flatMap(r => r.repairInstructions || []);
    if (instructions.length) {
      const request = { mode: 'source_merge', segmentInterpretations: [source], repairInstructions: instructions, work: workIdentity({ scope, idempotencyKey: `repair:${sv.id}:${source.version}`, input: instructions, clock }), sourceVersionId, extraction: artifact, sourceEvidence: [], priorInterpretation: source, segments, declaredCoverage: source.coverage || null, relatedSegmentSummaries: [], graphContext, ...learnerIn, sourceName: file.filename };
      const repaired = await call(input => app.providers.interpreter.interpret(input), request, { valueSchema: INTERPRETATION, what: 'repair' });
      if (repaired.outcome === 'ok') {
        const candidate = { ...toInterpretation(repaired.value, { scope, kind: 'source', allowed, sv, artifact, segmentIds: source.sourceSegmentIds, runs: [...source.runs, ...repaired.providerRuns], version: source.version, supersedesId: source.supersedesId }), repairOf: reports.map(r => r.id) };
        const second = await checkAll(candidate);
        if (!second.some(r => BLOCKING.has(r.disposition))) { Object.assign(source, candidate, { id: candidate.id }); reports = [...reports, ...second]; }
        else reports = [...reports, ...second];
      }
    }
    const latestReports = reports.slice(-2);
    const blocked = latestReports.some(r => BLOCKING.has(r.disposition));
    source.status = blocked ? 'needs_review' : 'validated';
    source.validationReportIds = (blocked ? reports : latestReports).map(r => r.id);
    source.issues = [...source.issues, ...reports.flatMap(r => r.issues)];
    source.coverage = coverageEntry(sv, artifact, segments, parts, excluded, !blocked);
    ctx.commit(() => {
      for (const r of reports) storeReport(r);
      db.insert('base_interpretations', source);
      const dep = db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)');
      dep.run('source_version', sv.id, 'base_interpretation', source.id, scope.examId);
      dep.run('extraction_artifact', artifact.id, 'base_interpretation', source.id, scope.examId);
      settleSource(scope, sv, source);
    });
    return { resultRefs: [{ kind: 'base_interpretation', id: source.id, version: source.version }] };
  });

  /** Coverage inventory (§4.2): every segment interpreted or excluded; uncertain regions listed. */
  function coverageEntry(sv, artifact, segments, interpreted, excluded, validated) {
    const interpretedIds = [...new Set(interpreted.flatMap(i => i.sourceSegmentIds))];
    const uncertain = artifact.regions.filter(r => r.disposition !== 'faithful');
    const entries = [
      ...excluded.map(e => ({ segmentId: e.segmentId, anchorIds: e.anchorIds, reason: e.reason, disposition: e.disposition })),
      ...uncertain.map(r => ({ segmentId: null, anchorIds: [r.anchorId], reason: r.uncertaintyReason || 'Region could not be read faithfully.', disposition: r.disposition === 'unreadable' ? 'unreadable' : 'needs_review' })),
    ];
    const complete = validated && interpretedIds.length === segments.length && !entries.length;
    return { sourceVersionId: sv.id, extractionArtifactId: artifact.id, allSegmentIds: segments.map(s => s.id), interpretedSegmentIds: interpretedIds, validatedSegmentIds: validated ? interpretedIds : [], excluded: entries, status: complete ? 'complete' : interpretedIds.length ? 'partial' : 'unavailable' };
  }

  function settleSource(scope, sv, source) {
    const file = db.get('source_files', sv.sourceFileId);
    if (file.currentSourceVersionId === sv.id) {
      const status = source.status === 'validated' && source.coverage.status === 'complete' ? 'ready' : 'needs_review';
      const error = status === 'ready' ? null : { code: 'quality_gate', retryable: false, message: source.status === 'validated' ? 'Parts of this file could not be read; the rest is in use.' : 'This file needs review before it can be used.', retryAfterMs: null, issues: source.issues.filter(i => i.severity === 'blocking') };
      if (file.status !== status || JSON.stringify(file.error) !== JSON.stringify(error)) db.update('source_files', { ...file, status, error, updatedAt: clock.iso() });
    }
    // v7 ingest: a new file on a published course (never its first build) is filed under the modules first (backend/ingest).
    if (source.status === 'validated' && sv.version === 1 && file.currentSourceVersionId === sv.id && db.get('exams', scope.examId)?.publishedKnowledgeManifestId && jobs.handlers.has('attach_material')) jobs.enqueue({ scope, type: 'attach_material', idempotencyKey: `attach:${sv.id}`, payload: { sourceVersionId: sv.id }, priority: 7 });
    maybeAdvance(scope.examId);
  }

  // ---------- build_graph (L3) ----------

  function eligibleInterpretations(scope, build) {
    return build.sourceVersionIds.map(id => latestSourceInterp(scope, id)).filter(i => i && i.status === 'validated');
  }

  async function graphCall(ctx, build, request, what, valueSchema = GRAPH_CANDIDATE) {
    spend(build);
    const result = await call(input => app.providers.graphBuilder.buildOrPatch(input), request, { valueSchema, what });
    if (result.outcome !== 'ok') {
      if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true });
      throw new AppError(result.error?.code === 'budget_exhausted' ? 'budget_exhausted' : 'quality_gate', `Graph ${what} failed: ${result.error?.message || 'unknown'}`, { retryable: false });
    }
    return result;
  }

  /** Finalize returns an outline; the full candidate is assembled from the merged content it was shown. */
  // ponytail: the outline still lists every topic (~130 B each: ~14 KB for CS 3410's 105, about 2 minutes);
  // near ~270 topics it would take half the 10-minute call. Then ask only for changed topics: omitted ones keep their place.
  const finalizeGraph =async (ctx, build, request, what) => assemble(request.partitionContents, (await graphCall(ctx, build, request, what, GRAPH_OUTLINE)).value);

  const graphInput = i => ({ id: i.id, sourceVersionId: i.sourceVersionId, claims: i.claims, concepts: i.concepts, proposedConnections: i.proposedConnections, assumptions: i.assumptions, topicIds: i.topicIds });

  jobs.register('build_graph', guarded(async ({ buildId }, ctx) => {
    const build = currentBuild(ctx, buildId);
    if (!build) return { state: 'stale' };
    const scope = build.scope;
    const exam = db.get('exams', scope.examId);
    const interps = eligibleInterpretations(scope, build);
    const parent = build.parentManifestId ? reader().view(scope, build.parentManifestId) : null;
    const learnerIn = learnerInputs(scope, parent?.topics.map(t => t.topicId) || []);
    const base = { work: workIdentity({ scope, idempotencyKey: `graph:${build.id}`, input: build.id, clock, budget: build.budget }), parentManifest: parent?.manifest || null, sourceEvidence: [], declaredCoverage: interps.map(i => i.coverage), existingTopics: parent?.topics || [], existingObjectives: parent?.objectives || [], existingEdges: parent?.edges || [], examInstructions: exam.instructions, explicitScopeEvidence: exam.instructions ? [{ kind: 'explicit_exam_instruction', id: 'exam_instructions', detail: null }] : [], ...learnerIn, existingTopicKeys: (parent?.topics || []).map(t => db.get('topics', t.topicId)?.stableKey).filter(Boolean) };

    // Bounded synthesis: partitions → merged levels → final graph. Each level persists its artifact; the
    // calls of one level are independent, so they run in parallel (bounded), like segment interpretation.
    const N = config.synthesisPartitionMaxInterpretations;
    const stored = (lvl, index) => db.findOne('synthesis_partitions', { buildId, level: lvl, partitionIndex: index }, { scope });
    const groupsOf = items => Array.from({ length: Math.ceil(items.length / N) }, (_, i) => items.slice(i * N, i * N + N));
    const partitions = await mapLimit(groupsOf(interps), SEGMENT_CONCURRENCY, async (group, i) => {
      const done = stored(0, i);
      if (done) return done;
      const result = await graphCall(ctx, build, { ...base, mode: 'partition', interpretations: group.map(graphInput), synthesisPartitions: [], partitionContents: [] }, 'partition');
      const part = { id: newId('part'), scope, createdAt: clock.iso(), buildId, level: 0, partitionIndex: i, inputInterpretationIds: group.map(g => g.id), inputPartitionIds: [], coveredSegmentIds: group.flatMap(g => g.coverage.interpretedSegmentIds), sourceAnchorIds: [...new Set(group.flatMap(g => g.concepts.flatMap(c => c.anchorIds)))], output: blobs.putText({ scope, text: JSON.stringify(result.value), mediaType: 'application/json' }), dependencies: group.map(g => ({ ref: { kind: 'base_interpretation', id: g.id, version: g.version }, hash: g.semanticHash, relation: 'derived_from' })), issues: [] };
      ctx.commit(() => db.insert('synthesis_partitions', part));
      return part;
    });
    let current = partitions;
    for (let level = 1; current.length > 1; level++) {
      current = await mapLimit(groupsOf(current), SEGMENT_CONCURRENCY, async (group, i) => {
        if (group.length === 1) return group[0]; // nothing to merge it with at this level
        const done = stored(level, i);
        if (done) return done;
        // The model returns only cross-partition decisions; the merged content is assembled, never re-emitted.
        const contents = group.map(g => JSON.parse(blobs.readText(g.output, scope)));
        const result = await graphCall(ctx, build, { ...base, mode: 'merge_partitions', interpretations: [], synthesisPartitions: group, partitionContents: contents }, 'merge', MERGE_DECISIONS);
        const part = { id: newId('part'), scope, createdAt: clock.iso(), buildId, level, partitionIndex: i, inputInterpretationIds: [], inputPartitionIds: group.map(g => g.id), coveredSegmentIds: group.flatMap(g => g.coveredSegmentIds), sourceAnchorIds: [...new Set(group.flatMap(g => g.sourceAnchorIds))], output: blobs.putText({ scope, text: JSON.stringify(assemble(contents, result.value)), mediaType: 'application/json' }), dependencies: group.map(g => ({ ref: { kind: 'synthesis_partition', id: g.id, version: null }, hash: g.output.sha256, relation: 'derived_from' })), issues: [] };
        ctx.commit(() => db.insert('synthesis_partitions', part));
        return part;
      });
      for (const p of current) if (!partitions.includes(p)) partitions.push(p);
    }
    const finalPartition = current[0];
    const mergedContent = JSON.parse(blobs.readText(finalPartition.output, scope));
    const graph = await finalizeGraph(ctx, build, { ...base, mode: 'finalize_graph', interpretations: interps.map(graphInput), synthesisPartitions: [finalPartition], partitionContents: [mergedContent] }, 'finalize');
    const applied = ctx.commit(() => applyGraph(scope, exam, build, graph, interps, parent));
    const settled = settleEdges(applied, await validateCandidate(ctx, { scope, responsibility: 'graph_integrity', candidate: { kind: 'graph_candidate', id: `${build.id}:r0`, version: 0 }, payload: graphPayload(applied), anchorIds: graphAnchors(applied) }));
    ctx.commit(() => {
      for (const r of settled.reports) storeReport(r);
      const b = db.get('revision_builds', buildId);
      const candidate = { ...candidateOf(settled.applied), finalPartitionId: finalPartition.id, partitionIds: partitions.map(p => p.id), graphReportIds: [settled.reports.at(-1).id] };
      db.update('revision_builds', { ...b, state: 'validating', round: 0, consumedCalls: build.consumedCalls, candidate, issues: [...b.issues, ...applied.issues, ...settled.issues], pendingSynthesisPartitionIds: [], updatedAt: clock.iso() });
      events.emit({ scope, eventType: 'knowledge.candidate_changed', aggregateType: 'revision_build', aggregateId: buildId, aggregateVersion: 0, payload: { buildId, changedRefs: candidate.topicVersionIds.map(id => ({ kind: 'topic_version', id, version: null })), round: 0 }, idempotencyKey: `candidate_changed:${buildId}:0` });
      if (config.refinementRounds > 0 && candidate.affectedInterpretationIds.length && !applied.issues.some(i => i.severity === 'blocking')) jobs.enqueue({ scope, type: 'refine_knowledge', idempotencyKey: `refine:${buildId}:1`, payload: { buildId, round: 1 }, priority: 8 });
      else jobs.enqueue({ scope, type: 'publish_knowledge', idempotencyKey: `publish:${buildId}`, payload: { buildId }, priority: 8 });
    });
    return { resultRefs: [{ kind: 'revision_build', id: buildId, version: null }] };
  }));

  /** What the graph checker sees: topics by title with parents, edges by endpoint titles with their evidence. */
  // Edges' own evidence first (a large graph is checked edge batch by edge batch), then topic links while they fit.
  const graphAnchors = applied => [...applied.edges.flatMap(e => e.evidence.map(x => x.id)), ...applied.links.map(l => l.sourceAnchorId)];
  const keyOf = id => db.get('topics', id)?.stableKey || id;
  const graphPayload = applied => {
    const title = id => applied.topicVersions.find(t => t.topicId === id)?.title || id;
    return {
      topics: applied.topicVersions.map(t => ({ key: keyOf(t.topicId), title: t.title, parent: t.parentTopicId ? keyOf(t.parentTopicId) : null, objectives: applied.objectives.filter(o => o.topicId === t.topicId).map(o => o.statement) })),
      edges: applied.edges.map(e => ({ edgeId: e.id, from: keyOf(e.fromTopicId), to: keyOf(e.toTopicId), fromTitle: title(e.fromTopicId), toTitle: title(e.toTopicId), type: e.type, explanation: e.explanation, support: e.support, evidenceAnchorIds: e.evidence.map(x => x.id) })),
    };
  };

  /**
   * The graph checker's findings about single connections are repaired here instead of blocking the whole
   * manifest: a connection it could not ground is dropped from this publication (recorded, never silent) and
   * its report is answered by a deterministic repair report. Any other blocking finding still blocks (§4.2).
   */
  function settleEdges(applied, report) {
    const blocking = (report.issues || []).filter(i => i.severity === 'blocking');
    if (!BLOCKING.has(report.disposition) || !blocking.length) return { applied, reports: [report], issues: report.issues || [] };
    const title = id => applied.topicVersions.find(t => t.topicId === id)?.title || '';
    const named = e => `${title(e.fromTopicId)} → ${title(e.toTopicId)}`;
    const keyed = e => `${keyOf(e.fromTopicId)} → ${keyOf(e.toTopicId)}`;
    const edgesOf = i => {
      const ids = new Set((i.affected || []).filter(a => a.kind === 'graph_edge').map(a => a.id)), text = String(i.message || '');
      return applied.edges.filter(e => ids.has(e.id) || text.includes(named(e)) || text.includes(keyed(e)));
    };
    const found = blocking.map(edgesOf);
    if (found.some(edges => !edges.length)) return { applied, reports: [report], issues: report.issues };
    const removed = [...new Map(found.flat().map(e => [e.id, e])).values()];
    const gone = new Set(removed.map(e => e.id));
    const note = issue('unsupported_edges_removed', `Removed ${removed.length} connection(s) the graph checker could not ground: ${removed.map(named).join('; ')}.`, { severity: 'warning', resolution: 'repaired', affected: removed.map(e => ({ kind: 'graph_edge', id: e.id, version: null })) });
    const issues = [...report.issues.map(i => blocking.includes(i) ? { ...i, severity: 'warning', resolution: 'repaired' } : i), note];
    const repair = { ...report, id: newId('vrep'), createdAt: clock.iso(), disposition: 'provisional_allowed', checks: [...(report.checks || []), { check: 'edge_repair', passed: true, evidence: [], note: note.message }], issues, runs: [], repairOf: report.id };
    return { applied: { ...applied, edges: applied.edges.filter(e => !gone.has(e.id)) }, reports: [report, repair], issues };
  }

  const candidateOf = applied => ({
    topicVersionIds: applied.topicVersions.map(t => t.id), objectiveVersionIds: applied.objectives.map(o => o.id), edgeVersionIds: applied.edges.map(e => e.id),
    topicEvidenceLinkIds: applied.links.map(l => l.id), migrationIds: applied.migrations.map(m => m.id), interpretationIds: applied.interpretations.map(i => i.id),
    affectedInterpretationIds: applied.affectedInterpretationIds, retiredTopicIds: applied.retiredTopicIds,
  });

  /** Turn a graph candidate into spec entities with stable topic identity and deterministic integrity checks. */
  function applyGraph(scope, exam, build, candidate, interps, parent) {
    const issues = [];
    const validAnchors = new Map();
    for (const svId of build.sourceVersionIds) for (const a of db.find('source_anchors', { sourceVersionId: svId }, { scope })) if (a.disposition === 'faithful' || !a.disposition) validAnchors.set(a.id, a);
    const keys = new Map(candidate.topics.map(t => [t.stableKey, t]));
    if (keys.size !== candidate.topics.length) issues.push(issue('duplicate_topic_key', 'The graph repeated a topic key; the first definition was kept.', { severity: 'warning', resolution: 'repaired' }));

    // Hierarchy: one parent per topic (by construction), unknown parents detached, cycles rejected.
    const parentOf = new Map();
    for (const t of keys.values()) {
      if (t.parentStableKey && !keys.has(t.parentStableKey)) { issues.push(issue('dangling_parent', `Topic ${t.stableKey} referenced unknown parent ${t.parentStableKey}; attached at the top level.`, { severity: 'warning', resolution: 'repaired' })); parentOf.set(t.stableKey, null); }
      else parentOf.set(t.stableKey, t.parentStableKey === t.stableKey ? null : t.parentStableKey);
    }
    for (const key of keys.keys()) {
      const seen = new Set([key]);
      for (let p = parentOf.get(key); p; p = parentOf.get(p)) {
        if (seen.has(p)) { issues.push(issue('hierarchy_cycle', `Topic hierarchy contains a cycle through ${[...seen].join(' → ')}.`, { severity: 'blocking', resolution: 'needs_review' })); break; }
        seen.add(p);
      }
      if (issues.some(i => i.code === 'hierarchy_cycle')) break;
    }

    const topicIds = new Map();
    for (const key of keys.keys()) {
      let topic = db.findOne('topics', { examId: scope.examId, stableKey: key });
      if (!topic) { topic = { id: newId('top'), scope, createdAt: clock.iso(), stableKey: key, retiredAt: null }; db.insert('topics', topic); }
      else if (topic.retiredAt) db.replace('topics', { ...topic, retiredAt: null });
      topicIds.set(key, topic.id);
    }
    const priorTV = new Map((parent?.topics || []).map(t => [t.topicId, t]));
    const priorObjectives = topicId => (parent?.objectives || []).filter(o => o.topicId === topicId);
    const migrations = [];
    const migration = (kind, fromTopicIds, toTopicIds, objectiveMappings, reason, reassessmentRequired) => {
      const m = { id: newId('mig'), scope, createdAt: clock.iso(), fromKnowledgeManifestId: parent?.manifest.id || null, toKnowledgeManifestId: null, kind, fromTopicIds, toTopicIds, objectiveMappings, reassessmentRequired, evidence: [], buildId: build.id };
      migrations.push(m);
      return m;
    };

    // Objectives: same meaning keeps its version; changed meaning is a new version plus a migration.
    const objectivesByTopic = new Map();
    const objectives = [];
    const validEvidence = ids => ids.filter(id => validAnchors.has(id)).map(id => ({ kind: 'source_anchor', id, detail: null }));
    for (const o of candidate.objectives) {
      const topicId = topicIds.get(o.topicKey);
      if (!topicId) { issues.push(issue('dangling_objective', `Objective for unknown topic ${o.topicKey} was dropped.`, { severity: 'warning', resolution: 'repaired' })); continue; }
      const list = objectivesByTopic.get(topicId) || [];
      const prior = priorObjectives(topicId)[list.length];
      const meaningHash = hashOf({ statement: o.statement.trim(), capabilities: [...o.capabilities].sort(), successCriteria: o.successCriteria });
      const evidence = validEvidence(o.evidenceAnchorIds);
      let examWeight = null;
      if (o.examWeight !== null) {
        const weightEvidence = o.examWeightEvidence.filter(e => e.kind === 'explicit_exam_instruction' ? Boolean(exam.instructions) : validAnchors.has(e.id)).map(e => ({ kind: e.kind, id: e.id, detail: null }));
        if (weightEvidence.length) examWeight = { value: o.examWeight > 1 ? o.examWeight / 100 : o.examWeight, evidence: weightEvidence };
        else issues.push(issue('unsupported_exam_weight', `Exam weight for "${o.statement.slice(0, 60)}" had no explicit exam or syllabus evidence and was removed.`, { severity: 'warning', resolution: 'repaired' }));
      }
      const scopeBasis = o.scopeBasis === 'explicit_exam' && !exam.instructions ? 'source_coverage' : !evidence.length && o.scopeBasis === 'source_coverage' ? 'model_suggestion' : o.scopeBasis;
      let record;
      const sameMeaning = db.find('objective_versions', { topicId, meaningHash }, { scope, order: 'version DESC', limit: 1 })[0];
      if (prior && prior.meaningHash === meaningHash) record = prior;
      else if (sameMeaning) record = sameMeaning; // already created by an earlier round of this build
      else {
        record = { id: newId('objv'), scope, createdAt: clock.iso(), objectiveId: prior?.objectiveId || newId('obj'), version: (prior?.version || 0) + 1, topicId, statement: o.statement.trim(), capabilities: o.capabilities, successCriteria: o.successCriteria, sourceEvidence: evidence, scopeBasis, examWeight, meaningHash, supersedesId: prior?.id || null };
        db.insert('objective_versions', record);
        if (prior) migration('objective_meaning_change', [topicId], [topicId], [{ fromObjectiveVersionId: prior.id, toObjectiveVersionId: record.id, comparability: 'not_comparable', reason: 'The objective statement changed meaning.' }], 'Objective meaning changed.', true);
      }
      list.push(record);
      objectivesByTopic.set(topicId, list);
      objectives.push(record);
    }

    // Topic versions: unchanged content reuses the prior version record; renames/reparents keep the topic ID.
    const titles = distinctTitles([...keys].map(([key, t]) => ({ key, title: t.title, parentKey: parentOf.get(key) || null })));
    const renamed = [...keys].filter(([key, t]) => titles.get(key) !== t.title);
    if (renamed.length) issues.push(issue('duplicate_topic_title', `Topics that shared a title now carry their parent's: ${renamed.map(([key]) => titles.get(key)).join('; ')}.`, { severity: 'info', resolution: 'repaired' }));
    const topicVersions = [];
    for (const [key, t0] of keys) {
      const t = { ...t0, title: titles.get(key) };
      const topicId = topicIds.get(key);
      const parentTopicId = parentOf.get(key) ? topicIds.get(parentOf.get(key)) : null;
      const objectiveVersionIds = (objectivesByTopic.get(topicId) || []).map(o => o.id);
      const prior = priorTV.get(topicId);
      const latest = db.find('topic_versions', { topicId }, { scope, order: 'version DESC', limit: 1 })[0];
      const equal = v => v && v.title === t.title && v.description === t.description && v.parentTopicId === parentTopicId && JSON.stringify(v.objectiveVersionIds) === JSON.stringify(objectiveVersionIds);
      let tv = equal(prior) ? prior : equal(latest) ? latest : null;
      if (!tv) {
        const maxVersion = db.prepare('SELECT MAX(version) AS v FROM topic_versions WHERE topic_id = ?').get(topicId)?.v || 0;
        tv = { id: newId('topv'), scope, createdAt: clock.iso(), topicId, version: maxVersion + 1, title: t.title, description: t.description, parentTopicId, objectiveVersionIds, status: 'active' };
        db.insert('topic_versions', tv);
        if (prior && prior.title !== t.title) migration('rename', [topicId], [topicId], [], `Renamed from "${prior.title}" to "${t.title}".`, false);
        if (prior && prior.parentTopicId !== parentTopicId) migration('reparent', [topicId], [topicId], [], 'Moved in the hierarchy.', false);
      }
      topicVersions.push(tv);
    }

    // Retired topics and provider-declared split/merge migrations.
    const retiredTopicIds = [];
    for (const prior of parent?.topics || []) {
      if ([...topicIds.values()].includes(prior.topicId)) continue;
      const topic = db.get('topics', prior.topicId);
      if (topic && !topic.retiredAt) db.replace('topics', { ...topic, retiredAt: clock.iso() });
      retiredTopicIds.push(prior.topicId);
    }
    for (const m of candidate.migrations) {
      const from = m.fromKeys.map(k => db.findOne('topics', { examId: scope.examId, stableKey: k })?.id).filter(Boolean);
      const to = m.toKeys.map(k => topicIds.get(k)).filter(Boolean);
      if (!from.length && m.kind !== 'merge') continue;
      if (m.kind === 'retire' && retiredTopicIds.some(id => from.includes(id))) { migration('retire', from, [], [], m.reason, false); continue; }
      const mappings = from.flatMap(f => priorObjectives(f).flatMap(po => to.flatMap(t => (objectivesByTopic.get(t) || []).map(no => ({ fromObjectiveVersionId: po.id, toObjectiveVersionId: no.id, comparability: 'not_comparable', reason: `${m.kind}: ${m.reason}` })))));
      migration(m.kind, from, to, mappings, m.reason, ['split', 'merge', 'objective_meaning_change'].includes(m.kind));
    }
    for (const id of retiredTopicIds) if (!migrations.some(m => m.kind === 'retire' && m.fromTopicIds.includes(id)) && !migrations.some(m => ['split', 'merge'].includes(m.kind) && m.fromTopicIds.includes(id))) migration('retire', [id], [], [], 'No longer supported by the current sources.', false);
    for (const m of migrations) db.insert('topic_migrations', { ...m, toKnowledgeManifestId: `pending:${build.id}` });

    // Edges: references must close; "grounded" needs real evidence; prerequisite cycles are flagged, never deleted.
    const edges = [];
    const priorEdges = parent?.edges || [];
    for (const e of candidate.edges) {
      const from = topicIds.get(e.fromKey), to = topicIds.get(e.toKey);
      if (!from || !to || from === to) { issues.push(issue('dangling_edge', `Edge ${e.fromKey} → ${e.toKey} referenced an unknown topic and was dropped.`, { severity: 'warning', resolution: 'repaired' })); continue; }
      const evidence = validEvidence(e.evidenceAnchorIds);
      let support = e.support;
      if (support === 'grounded' && !evidence.length) { support = 'inferred_provisional'; issues.push(issue('ungrounded_edge', `Edge "${e.explanation.slice(0, 80)}" claimed grounding without source evidence; kept as provisional.`, { severity: 'warning', affected: [{ kind: 'topic', id: from, version: null }, { kind: 'topic', id: to, version: null }], resolution: 'accepted_provisional' })); }
      const prior = priorEdges.find(p => p.fromTopicId === from && p.toTopicId === to && p.type === e.type);
      if (prior && prior.explanation === e.explanation && prior.support === support && !prior.prerequisiteCycleIssueId) { edges.push(prior); continue; }
      if (edges.some(x => x.fromTopicId === from && x.toTopicId === to && x.type === e.type)) continue;
      edges.push({ id: newId('edgv'), scope, createdAt: clock.iso(), edgeId: prior?.edgeId || newId('edg'), version: (prior?.version || 0) + 1, fromTopicId: from, toTopicId: to, type: e.type, evidence, support, explanation: e.explanation, prerequisiteCycleIssueId: null });
    }
    // Strongly connected prerequisite components (Tarjan).
    const prereq = edges.filter(e => e.type === 'prerequisite');
    const adj = new Map();
    for (const e of prereq) adj.set(e.fromTopicId, [...(adj.get(e.fromTopicId) || []), e.toTopicId]);
    let index = 0; const stack = [], on = new Set(), idx = new Map(), low = new Map(), sccs = [];
    const strong = v => {
      idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
      for (const w of adj.get(v) || []) {
        if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      }
      if (low.get(v) === idx.get(v)) { const comp = []; let w; do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) sccs.push(comp); }
    };
    for (const v of adj.keys()) if (!idx.has(v)) strong(v);
    sccs.forEach((comp, n) => {
      const code = `prerequisite_cycle_${n + 1}`;
      issues.push(issue('prerequisite_cycle', `Prerequisite cycle among ${comp.length} topics; kept as provisional context, never a study gate.`, { severity: 'warning', affected: comp.map(id => ({ kind: 'topic', id, version: null })), resolution: 'needs_review' }));
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.type !== 'prerequisite' || !comp.includes(e.fromTopicId) || !comp.includes(e.toTopicId) || e.prerequisiteCycleIssueId === code) continue;
        // A stored edge record is immutable: flagging it means a new version.
        edges[i] = db.get('graph_edges', e.id) ? { ...e, id: newId('edgv'), version: e.version + 1, prerequisiteCycleIssueId: code } : { ...e, prerequisiteCycleIssueId: code };
      }
    });
    // Reuse an identical edge record from an earlier round instead of minting duplicates.
    const stored = db.find('graph_edges', { examId: scope.examId }, { scope });
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (db.get('graph_edges', e.id)) continue;
      const same = stored.find(x => x.fromTopicId === e.fromTopicId && x.toTopicId === e.toTopicId && x.type === e.type && x.explanation === e.explanation && x.support === e.support && x.prerequisiteCycleIssueId === e.prerequisiteCycleIssueId);
      if (same) edges[i] = same;
      else if (stored.some(x => x.edgeId === e.edgeId && x.version >= e.version)) edges[i] = { ...e, version: Math.max(...stored.filter(x => x.edgeId === e.edgeId).map(x => x.version)) + 1 };
    }
    for (const e of edges) if (!db.get('graph_edges', e.id)) db.insert('graph_edges', e);

    // Evidence links (many-to-many) only to faithful anchors of build sources.
    const links = [];
    for (const l of candidate.evidenceLinks) {
      const topicId = topicIds.get(l.topicKey);
      if (!topicId || !validAnchors.has(l.anchorId)) { issues.push(issue('dangling_evidence_link', `Evidence link ${l.topicKey} → ${l.anchorId} did not resolve and was dropped.`, { severity: 'info', resolution: 'repaired' })); continue; }
      if (links.some(x => x.topicId === topicId && x.sourceAnchorId === l.anchorId)) continue;
      const link = { id: newId('tel'), scope, createdAt: clock.iso(), topicId, objectiveVersionId: (objectivesByTopic.get(topicId) || [])[0]?.id || null, sourceAnchorId: l.anchorId, interpretationId: null, relation: l.relation };
      links.push(link);
    }

    // Bind interpretations to topics through shared anchors; bind personal proposals to topics.
    const titleToTopic = new Map([...keys].map(([key, t]) => [t.title.toLowerCase(), topicIds.get(key)]));
    const interpretations = [];
    const replaced = new Map();
    for (const interp of interps) {
      const anchorsOfInterp = new Set([...interp.claims.flatMap(c => c.evidence.map(e => e.id)), ...interp.concepts.flatMap(c => c.anchorIds)]);
      const bound = [...new Set(links.filter(l => anchorsOfInterp.has(l.sourceAnchorId)).map(l => l.topicId))];
      const proposals = interp.proposedPersonalExplanations.map(p => ({ ...p, topicIds: [titleToTopic.get(p.conceptName.toLowerCase()) || links.find(l => p.exampleAnchorIds.includes(l.sourceAnchorId))?.topicId].filter(Boolean) }));
      if (JSON.stringify([...bound].sort()) === JSON.stringify([...interp.topicIds].sort()) && JSON.stringify(proposals) === JSON.stringify(interp.proposedPersonalExplanations)) { interpretations.push(interp); continue; }
      const next = { ...interp, id: newId('interp'), version: interp.version + 1, supersedesId: interp.id, topicIds: bound, proposedPersonalExplanations: proposals, createdAt: clock.iso(), bindingOf: interp.id };
      db.insert('base_interpretations', next);
      db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)').run('source_version', next.sourceVersionId, 'base_interpretation', next.id, scope.examId);
      interpretations.push(next);
      replaced.set(interp.id, next.id);
    }
    for (const link of links) {
      link.interpretationId = interpretations.find(i => i.concepts.some(c => c.anchorIds.includes(link.sourceAnchorId)))?.id || null;
      db.insert('topic_evidence_links', link);
      db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)').run('source_version', validAnchors.get(link.sourceAnchorId).sourceVersionId, 'topic', link.topicId, scope.examId);
    }
    const affectedInterpretationIds = [...new Set(candidate.affectedInterpretationIds.map(id => replaced.get(id) || id).filter(id => interpretations.some(i => i.id === id)))];
    return { topicVersions, objectives, edges, links, migrations, interpretations, issues, affectedInterpretationIds, retiredTopicIds };
  }

  // ---------- refine_knowledge (bounded rounds) ----------

  jobs.register('refine_knowledge', guarded(async ({ buildId, round }, ctx) => {
    const build = currentBuild(ctx, buildId);
    if (!build) return { state: 'stale' };
    const scope = build.scope;
    const exam = db.get('exams', scope.examId);
    const c = build.candidate;
    const graphContext = { manifestId: null, topics: db.find('topic_versions', { id: c.topicVersionIds }, { scope }), edges: db.find('graph_edges', { id: c.edgeVersionIds }, { scope }), objectives: db.find('objective_versions', { id: c.objectiveVersionIds }, { scope }) };
    const learnerIn = learnerInputs(scope, graphContext.topics.map(t => t.topicId));
    const interps = db.find('base_interpretations', { id: c.interpretationIds }, { scope });
    const changed = [], reports = [], refinementIssues = [];
    for (const id of c.affectedInterpretationIds) {
      const prior = interps.find(i => i.id === id);
      if (!prior) continue;
      const sv = db.get('source_versions', prior.sourceVersionId, scope), artifact = db.get('extraction_artifacts', prior.extractionArtifactId, scope);
      const anchors = new Map(db.find('source_anchors', { id: artifact.anchorIds }, { scope }).filter(a => a.disposition === 'faithful').map(a => [a.id, a]));
      const cited = [...new Set(prior.claims.flatMap(cl => cl.evidence.map(e => e.id)))].slice(0, 60);
      spend(build);
      const request = { mode: 'graph_refinement', segmentInterpretations: [], work: workIdentity({ scope, idempotencyKey: `refine:${buildId}:${round}:${id}`, input: id, clock, budget: build.budget }), sourceVersionId: sv.id, extraction: artifact, sourceEvidence: cited.filter(a => anchors.has(a)).map(a => ({ anchor: anchors.get(a), excerpt: anchorExcerpt(anchors.get(a), scope) })), priorInterpretation: prior, segments: [], declaredCoverage: prior.coverage, relatedSegmentSummaries: [], graphContext, ...learnerIn };
      const result = await call(input => app.providers.interpreter.interpret(input), request, { valueSchema: INTERPRETATION, what: 'graph refinement' });
      if (result.outcome !== 'ok') {
        if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError(result.error.code, result.error.message, { retryable: true });
        refinementIssues.push(issue('refinement_failed', `Could not refine an interpretation: ${result.error?.message}`, { affected: [{ kind: 'base_interpretation', id, version: prior.version }], resolution: 'accepted_provisional' }));
        continue;
      }
      const next = toInterpretation(result.value, { scope, kind: 'source', allowed: anchors, sv, artifact, segmentIds: prior.sourceSegmentIds, runs: result.providerRuns, version: prior.version + 1, supersedesId: prior.id, topicIds: prior.topicIds, extra: { coverage: prior.coverage, refinementOf: prior.id, proposedPersonalExplanations: prior.proposedPersonalExplanations } });
      next.proposedPersonalExplanations = prior.proposedPersonalExplanations;
      if (next.semanticHash === prior.semanticHash) continue;
      const report = await validateCandidate(ctx, { scope, responsibility: 'source_fidelity', candidate: { kind: 'base_interpretation', id: next.id, version: next.version }, payload: { claims: next.claims }, anchorIds: next.claims.flatMap(cl => cl.evidence.map(e => e.id)) });
      reports.push(report);
      if (BLOCKING.has(report.disposition)) { refinementIssues.push(issue('refinement_rejected', 'A refined interpretation failed source checks; the previous version stays.', { affected: [{ kind: 'base_interpretation', id: prior.id, version: prior.version }], evidence: report.issues.flatMap(i => i.evidence), resolution: 'repaired' })); continue; }
      next.status = 'validated';
      next.validationReportIds = [...prior.validationReportIds, report.id];
      changed.push({ prior, next });
    }
    if (!changed.length) {
      ctx.commit(() => {
        for (const r of reports) storeReport(r);
        const b = db.get('revision_builds', buildId);
        db.update('revision_builds', { ...b, round, consumedCalls: build.consumedCalls, refinement: [...b.refinement, { round, changedInterpretationIds: [], reason: 'Converged: graph context produced no material semantic change.' }], issues: [...b.issues, ...refinementIssues], updatedAt: clock.iso() });
        jobs.enqueue({ scope, type: 'publish_knowledge', idempotencyKey: `publish:${buildId}`, payload: { buildId }, priority: 8 });
      });
      return { resultRefs: [] };
    }
    // Patch the graph with the revised interpretations.
    const updated = interps.map(i => changed.find(x => x.prior.id === i.id)?.next || i);
    ctx.commit(() => { for (const { next } of changed) { db.insert('base_interpretations', next); db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)').run('source_version', next.sourceVersionId, 'base_interpretation', next.id, scope.examId); } for (const r of reports) storeReport(r); });
    const finalPartition = db.get('synthesis_partitions', c.finalPartitionId, scope);
    const parent = build.parentManifestId ? reader().view(scope, build.parentManifestId) : null;
    const graph = await finalizeGraph(ctx, build, { mode: 'finalize_graph', work: workIdentity({ scope, idempotencyKey: `graph:${build.id}:r${round}`, input: round, clock, budget: build.budget }), parentManifest: parent?.manifest || null, interpretations: updated.map(graphInput), sourceEvidence: [], synthesisPartitions: [finalPartition], partitionContents: [JSON.parse(blobs.readText(finalPartition.output, scope))], declaredCoverage: updated.map(i => i.coverage), existingTopics: parent?.topics || [], existingObjectives: parent?.objectives || [], existingEdges: parent?.edges || [], examInstructions: exam.instructions, explicitScopeEvidence: [], ...learnerIn, existingTopicKeys: (parent?.topics || []).map(t => db.get('topics', t.topicId)?.stableKey).filter(Boolean) }, 'refinement patch');
    const applied = ctx.commit(() => applyGraph(scope, exam, build, graph, updated, parent));
    const settled = settleEdges(applied, await validateCandidate(ctx, { scope, responsibility: 'graph_integrity', candidate: { kind: 'graph_candidate', id: `${build.id}:r${round}`, version: round }, payload: graphPayload(applied), anchorIds: graphAnchors(applied) }));
    ctx.commit(() => {
      for (const r of settled.reports) storeReport(r);
      const b = db.get('revision_builds', buildId);
      const candidate = { ...candidateOf(settled.applied), finalPartitionId: c.finalPartitionId, partitionIds: c.partitionIds, graphReportIds: [...c.graphReportIds, settled.reports.at(-1).id] };
      // Only interpretations changed this round need another look next round.
      candidate.affectedInterpretationIds = changed.map(x => x.next.id).map(id => applied.interpretations.find(i => i.id === id || i.bindingOf === id)?.id).filter(Boolean);
      const last = round >= config.refinementRounds;
      db.update('revision_builds', { ...b, round, consumedCalls: build.consumedCalls, candidate, refinement: [...b.refinement, { round, changedInterpretationIds: changed.map(x => x.next.id), reason: last ? 'Refinement round limit reached; remaining changes accepted after validation.' : 'Graph context changed interpretations; patched graph.' }], issues: [...b.issues, ...refinementIssues, ...applied.issues.filter(i => !b.issues.some(x => x.message === i.message)), ...settled.issues], updatedAt: clock.iso() });
      events.emit({ scope, eventType: 'knowledge.candidate_changed', aggregateType: 'revision_build', aggregateId: buildId, aggregateVersion: round, payload: { buildId, changedRefs: changed.map(x => ({ kind: 'base_interpretation', id: x.next.id, version: x.next.version })), round }, idempotencyKey: `candidate_changed:${buildId}:${round}` });
      if (!last && !applied.issues.some(i => i.severity === 'blocking')) jobs.enqueue({ scope, type: 'refine_knowledge', idempotencyKey: `refine:${buildId}:${round + 1}`, payload: { buildId, round: round + 1 }, priority: 8 });
      else jobs.enqueue({ scope, type: 'publish_knowledge', idempotencyKey: `publish:${buildId}`, payload: { buildId }, priority: 8 });
    });
    return { resultRefs: changed.map(x => ({ kind: 'base_interpretation', id: x.next.id, version: x.next.version })) };
  }));

  // ---------- publish_knowledge ----------

  jobs.register('publish_knowledge', guarded(async ({ buildId }, ctx) => {
    const build = currentBuild(ctx, buildId);
    if (!build) return { state: 'stale' };
    const scope = build.scope;
    const c = build.candidate;
    const graphReports = db.find('validation_reports', { id: c.graphReportIds }, { scope });
    // Sandbox only (the user's decision, 8 Oct 2026): with PLATO_PUBLISH_WARNING_REVIEWS=provisional, a needs_review report
    // whose issues are all warnings doesn't block; its warnings stay on the manifest as unresolved issues. The live app
    // leaves the setting off, so every needs_review report still blocks there.
    const warningOnly = r => !!config.publishWarningOnlyReviews && r.disposition === 'needs_review' && r.issues?.length > 0 && r.issues.every(i => i.severity !== 'blocking');
    const blocks = r => BLOCKING.has(r.disposition) && !warningOnly(r);
    const provisional = graphReports.filter(warningOnly);
    const blocking = [...build.issues.filter(i => i.severity === 'blocking'), ...graphReports.filter(blocks).flatMap(r => r.issues.length ? r.issues : [issue('graph_validation', 'Graph validation did not pass.', { severity: 'blocking' })])];
    const interps = db.find('base_interpretations', { id: c.interpretationIds }, { scope });
    for (const i of interps) {
      const reports = db.find('validation_reports', { id: i.validationReportIds }, { scope });
      provisional.push(...reports.filter(warningOnly));
      if (!reports.length || reports.some(blocks)) blocking.push(issue('unvalidated_interpretation', `Interpretation ${i.id} lacks passing validation.`, { severity: 'blocking', affected: [{ kind: 'base_interpretation', id: i.id, version: i.version }] }));
    }
    // Every referenced artifact must exist and match its checksum.
    const sources = db.find('source_versions', { id: build.sourceVersionIds }, { scope });
    const extractions = interps.map(i => db.get('extraction_artifacts', i.extractionArtifactId, scope));
    const links = db.find('topic_evidence_links', { id: c.topicEvidenceLinkIds }, { scope });
    const anchors = db.find('source_anchors', { id: links.map(l => l.sourceAnchorId) }, { scope });
    const partitions = db.find('synthesis_partitions', { id: c.partitionIds }, { scope });
    const refs = [...sources.map(s => s.original), ...interps.map(i => i.explanation), ...extractions.map(e => e.markdown), ...anchors.map(a => a.evidenceArtifact), ...partitions.map(p => p.output)];
    const missing = refs.filter(ref => !blobs.verify(ref, scope));
    if (missing.length) blocking.push(issue('missing_artifact', `${missing.length} referenced artifact(s) are missing or failed checksum verification.`, { severity: 'blocking', affected: missing.map(m => ({ kind: 'blob', id: m.blobId, version: null })) }));
    if (blocking.length) {
      ctx.commit(() => {
        const b = db.get('revision_builds', buildId);
        db.update('revision_builds', { ...b, state: 'needs_review', issues: [...b.issues, ...blocking.filter(x => !b.issues.some(i => i.code === x.code && i.message === x.message))], updatedAt: clock.iso() });
        const exam = db.get('exams', scope.examId);
        if (!exam.publishedKnowledgeManifestId) db.update('exams', { ...exam, status: 'needs_review', updatedAt: clock.iso() });
      });
      return { state: 'needs_review' };
    }

    const files = db.find('source_files', { examId: scope.examId }).filter(f => f.currentSourceVersionId && f.status !== 'deleted');
    const coverage = files.map(f => {
      const interp = interps.find(i => i.sourceVersionId === f.currentSourceVersionId);
      if (interp) return interp.coverage;
      const latest = latestSourceInterp(scope, f.currentSourceVersionId);
      const extraction = db.find('extraction_artifacts', { sourceVersionId: f.currentSourceVersionId }, { scope }).at(-1);
      return { sourceVersionId: f.currentSourceVersionId, extractionArtifactId: extraction?.id || null, allSegmentIds: latest?.coverage?.allSegmentIds || [], interpretedSegmentIds: [], validatedSegmentIds: [], excluded: [{ segmentId: null, anchorIds: [], reason: f.error?.message || 'Source not eligible for this build.', disposition: f.status === 'failed' ? (f.error?.code === 'unsupported_format' ? 'unsupported' : 'failed') : 'needs_review' }], status: 'unavailable' };
    });
    const nonBlocking = [...build.issues.filter(i => i.severity !== 'blocking'), ...provisional.flatMap(r => r.issues),
      ...(provisional.length ? [issue('provisional_publication', `Published provisionally: ${provisional.length} validation report(s) had warnings only (sandbox setting).`, { severity: 'warning' })] : [])];
    const topicVersions = db.find('topic_versions', { id: c.topicVersionIds }, { scope });
    const allReports = [...new Set([...interps.flatMap(i => i.validationReportIds), ...c.graphReportIds])];
    const parent = build.parentManifestId ? db.get('knowledge_manifests', build.parentManifestId, scope) : null;
    const replacedVersions = new Set(build.changedRefs.filter(r => r.kind === 'source_version').map(r => r.id));
    const parentLinks = parent ? db.find('topic_evidence_links', { id: parent.topicEvidenceLinkIds }, { scope }) : [];
    const parentAnchorSource = new Map(db.find('source_anchors', { id: parentLinks.map(l => l.sourceAnchorId) }, { scope }).map(a => [a.id, a.sourceVersionId]));
    const migrations = db.find('topic_migrations', { id: c.migrationIds }, { scope });
    const incompatibleTopicIds = [...new Set([
      ...c.retiredTopicIds,
      ...migrations.filter(m => ['split', 'merge', 'objective_meaning_change', 'retire'].includes(m.kind)).flatMap(m => m.fromTopicIds),
      ...parentLinks.filter(l => replacedVersions.has(parentAnchorSource.get(l.sourceAnchorId))).map(l => l.topicId),
    ])];

    const published = ctx.commit(() => {
      const exam = db.get('exams', scope.examId);
      if (exam.desiredBuildGeneration !== build.generation) { const b = db.get('revision_builds', buildId); db.update('revision_builds', { ...b, state: 'stale', updatedAt: clock.iso() }); return null; }
      const version = (db.prepare('SELECT MAX(version) AS v FROM knowledge_manifests WHERE exam_id = ?').get(scope.examId)?.v || 0) + 1;
      const manifest = {
        id: newId('km'), scope, createdAt: clock.iso(), version, parentManifestId: exam.publishedKnowledgeManifestId, buildId, status: 'published',
        sourceVersionIds: build.sourceVersionIds, extractionArtifactIds: [...new Set(extractions.map(e => e.id))], interpretationIds: c.interpretationIds,
        topicVersionIds: c.topicVersionIds, objectiveVersionIds: c.objectiveVersionIds, edgeVersionIds: c.edgeVersionIds, topicEvidenceLinkIds: c.topicEvidenceLinkIds,
        validationReportIds: allReports, unresolvedIssues: nonBlocking, contentHash: hashOf({ i: c.interpretationIds, t: c.topicVersionIds, o: c.objectiveVersionIds, e: c.edgeVersionIds, l: c.topicEvidenceLinkIds }),
        coverage, coverageStatus: coverage.every(e => e.status === 'complete') ? 'complete' : 'partial', synthesisPartitionIds: c.partitionIds,
        eligibleForTutoring: topicVersions.length > 0 && c.interpretationIds.length > 0, publishedAt: clock.iso(),
      };
      db.insert('knowledge_manifests', manifest);
      for (const m of migrations) db.replace('topic_migrations', { ...m, toKnowledgeManifestId: manifest.id, fromKnowledgeManifestId: exam.publishedKnowledgeManifestId });
      db.update('exams', { ...exam, publishedKnowledgeManifestId: manifest.id, status: 'ready', updatedAt: clock.iso() });
      const b = db.get('revision_builds', buildId);
      db.update('revision_builds', { ...b, state: 'published', targetManifestId: manifest.id, coverage, updatedAt: clock.iso() });
      events.emit({ scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: scope.examId, aggregateVersion: version, payload: { examId: scope.examId, oldManifestId: exam.publishedKnowledgeManifestId, newManifestId: manifest.id, migrationIds: migrations.map(m => m.id), changedDependencyRefs: build.changedRefs, topicIds: topicVersions.map(t => t.topicId), objectiveVersionIds: c.objectiveVersionIds, incompatibleTopicIds }, idempotencyKey: `knowledge.published:${manifest.id}` });
      return manifest;
    });
    return published ? { resultRefs: [{ kind: 'knowledge_manifest', id: published.id, version: published.version }] } : { state: 'stale' };
  }));

  // ---------- invalidate_dependencies ----------

  jobs.register('invalidate_dependencies', async ({ replacedSourceVersionId, buildId }, ctx) => {
    const scope = ctx.job.scope;
    const deps = db.prepare('SELECT dependent_kind AS kind, dependent_id AS id FROM dependency_index WHERE ref_kind = ? AND ref_id = ?').all('source_version', replacedSourceVersionId);
    const refs = [{ kind: 'source_version', id: replacedSourceVersionId, version: null }, ...deps.map(d => ({ kind: d.kind, id: d.id, version: null }))];
    ctx.commit(() => {
      const b = db.get('revision_builds', buildId);
      if (b) db.update('revision_builds', { ...b, changedRefs: [...b.changedRefs, ...refs.filter(r => !b.changedRefs.some(x => x.kind === r.kind && x.id === r.id))], updatedAt: clock.iso() });
      events.emit({ scope, eventType: 'knowledge.candidate_changed', aggregateType: 'revision_build', aggregateId: buildId, aggregateVersion: 0, payload: { buildId, changedRefs: refs, round: 0, reason: 'source replaced' }, idempotencyKey: `invalidated:${replacedSourceVersionId}` });
    });
    return { resultRefs: refs };
  });

  /**
   * Accept a file the quality check blocked (the learner's call, 11 Oct: a checker objecting to a lecture's own example or a
   * solution's edge case kept it out of the course): its interpretation is used, the checker's objections kept as warnings.
   */
  function acceptSource(principal, examId, sourceFileId) {
    const exam = app.auth.requireExam(principal, examId), scope = app.auth.examScope(exam);
    return db.tx(() => {
      const file = db.must('source_files', sourceFileId, scope, 'Source file'), sv = file.currentSourceVersionId && db.get('source_versions', file.currentSourceVersionId), source = sv && latestSourceInterp(scope, sv.id);
      if (!source || source.status !== 'needs_review') throw new AppError('invalid_input', 'This file has nothing waiting for review.');
      const done = source.coverage?.interpretedSegmentIds || [];
      const accepted = { ...source, id: newId('interp'), version: source.version + 1, supersedesId: source.id, createdAt: clock.iso(), status: 'validated', acceptedAt: clock.iso(),
        issues: source.issues.map(i => i.severity === 'blocking' ? { ...i, severity: 'warning', resolution: 'accepted_by_learner' } : i),
        coverage: { ...source.coverage, validatedSegmentIds: done, status: done.length === source.coverage.allSegmentIds.length && !source.coverage.excluded.length ? 'complete' : 'partial' } };
      db.insert('base_interpretations', accepted); // append-only: a new version supersedes the blocked one
      const dep = db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)');
      dep.run('source_version', sv.id, 'base_interpretation', accepted.id, scope.examId);
      if (source.coverage?.extractionArtifactId) dep.run('extraction_artifact', source.coverage.extractionArtifactId, 'base_interpretation', accepted.id, scope.examId);
      settleSource(scope, sv, accepted);
      newBuild(exam.id, `accepted ${file.filename}`, []);
      return { status: db.get('source_files', file.id).status };
    });
  }

  return { newBuild, maybeAdvance, acceptSource };
}
