import { s } from '../core/shape.mjs';

// Provider value shapes for the knowledge loop. Models cannot mint record IDs or artifact refs,
// so providers return candidates keyed by anchor IDs and topic stable keys; the pipeline turns
// them into the spec entities (ExtractionArtifact, BaseInterpretation, GraphPatch) and validates
// every reference deterministically.

const support = s.enum(['direct', 'derived', 'provisional']);
const ids = () => s.array(s.string({ max: 200 }), { max: 200 });

export const EXTRACT_READING = s.object({
  regions: s.array(s.object({
    anchorKey: s.string({ max: 200 }), kind: s.enum(['text', 'formula', 'diagram', 'table', 'other']),
    disposition: s.enum(['faithful', 'uncertain', 'unreadable']), extractedText: s.nullable(s.string({ max: 30_000 })),
    confidence: s.nullable(s.fraction()), uncertaintyReason: s.nullable(s.string({ max: 1000 })),
  }), { max: 500 }),
  escalation: s.array(s.object({ anchorKeys: s.array(s.string({ max: 200 })), requiredCapability: s.string({ max: 200 }), reason: s.string({ max: 1000 }) }), { max: 100 }),
});

// v8: one PDF page transcribed from its image (knowledge/pages.mjs).
export const PAGE_TRANSCRIPT = s.object({ markdown: s.string({ max: 60_000 }), legible: s.bool(), confidence: s.fraction() });

const claim = s.object({
  kind: s.enum(['source_statement', 'derived_explanation', 'assumption', 'example', 'implication', 'connection']),
  text: s.string({ min: 1, max: 4000 }), evidenceAnchorIds: ids(), support,
  derivation: s.nullable(s.string({ max: 2000 })),
  uncertainties: s.array(s.object({ reason: s.string({ max: 1000 }), alternatives: s.array(s.string({ max: 500 }), { max: 10 }) }), { max: 10 }),
});

export const INTERPRETATION = s.object({
  explanation: s.string({ min: 1, max: 60_000 }),
  claims: s.array(claim, { max: 400 }),
  assumptions: s.array(s.string({ max: 1000 }), { max: 50 }),
  examples: s.array(claim, { max: 100 }),
  concepts: s.array(s.object({ name: s.string({ min: 1, max: 200 }), parentName: s.nullable(s.string({ max: 200 })), summary: s.string({ max: 2000 }), claimIndexes: s.array(s.int({ min: 0 }), { max: 400 }), anchorIds: ids() }), { max: 200 }),
  proposedPersonalExplanations: s.array(s.object({ conceptName: s.string({ max: 200 }), text: s.string({ min: 1, max: 4000 }), reasons: s.array(s.string({ max: 1000 }), { max: 10 }), exampleAnchorIds: ids() }), { max: 100 }),
  proposedConnections: s.array(s.object({ fromConcept: s.string({ max: 200 }), toConcept: s.string({ max: 200 }), evidenceAnchorIds: ids(), support: s.enum(['grounded', 'provisional']), reason: s.string({ max: 1000 }) }), { max: 200 }),
  unresolvedQuestions: s.array(s.string({ max: 1000 }), { max: 50 }),
});

const CAPABILITY = s.enum(['recall', 'explanation', 'application', 'transfer', 'delayed_retention']);
const STABLE_KEY = s.string({ min: 1, max: 120, pattern: '^[a-z0-9][a-z0-9-]*$' });
const SCOPE_BASIS = s.enum(['explicit_exam', 'explicit_syllabus', 'source_coverage', 'model_suggestion']);
// examWeight is a fraction; a percentage (0–100) is normalized by the pipeline.
const EXAM_WEIGHT = s.nullable(s.number({ min: 0, max: 100 }));
const WEIGHT_EVIDENCE = s.array(s.object({ kind: s.enum(['source_anchor', 'explicit_exam_instruction']), id: s.string({ max: 200 }) }), { max: 10 });
const EDGE = s.object({ fromKey: s.string({ max: 120 }), toKey: s.string({ max: 120 }), type: s.enum(['prerequisite', 'related', 'application_of', 'contrasts_with', 'supports']), explanation: s.string({ min: 1, max: 1000 }), evidenceAnchorIds: ids(), support: s.enum(['grounded', 'inferred_provisional']) });
const MIGRATIONS = s.array(s.object({ kind: s.enum(['rename', 'reparent', 'split', 'merge', 'objective_meaning_change', 'retire']), fromKeys: s.array(s.string({ max: 120 })), toKeys: s.array(s.string({ max: 120 })), reason: s.string({ max: 1000 }) }), { max: 200 });
const REASONS = s.array(s.string({ max: 1000 }), { max: 50 });

/** A partition's graph content, and the full candidate the pipeline assembles for applyGraph. */
export const GRAPH_CANDIDATE = s.object({
  topics: s.array(s.object({ stableKey: STABLE_KEY, title: s.string({ min: 1, max: 200 }), description: s.string({ max: 2000 }), parentStableKey: s.nullable(s.string({ max: 120 })) }), { max: 500 }),
  objectives: s.array(s.object({
    topicKey: s.string({ max: 120 }), statement: s.string({ min: 1, max: 1000 }), capabilities: s.array(CAPABILITY, { min: 1, max: 5 }),
    successCriteria: s.array(s.string({ max: 1000 }), { max: 10 }), evidenceAnchorIds: ids(),
    scopeBasis: SCOPE_BASIS, examWeight: EXAM_WEIGHT, examWeightEvidence: WEIGHT_EVIDENCE,
  }), { max: 1000 }),
  edges: s.array(EDGE, { max: 2000 }),
  evidenceLinks: s.array(s.object({ topicKey: s.string({ max: 120 }), anchorId: s.string({ max: 200 }), relation: s.enum(['defines', 'explains', 'exemplifies', 'assesses']), interpretationId: s.nullable(s.string({ max: 200 })) }), { max: 5000 }),
  migrations: MIGRATIONS,
  affectedInterpretationIds: ids(),
  reasons: REASONS,
  noChangeReason: s.nullable(s.string({ max: 1000 })),
});

// Merge levels and finalize return decisions, never the graph again: re-emitting every objective and
// evidence link does not fit one call (§6). The pipeline assembles the content (build.mjs `assemble`).
// One topic decision: `key` absorbs `mergedKeys` (same idea); null title/description keep the current wording.
const TOPIC_DECISION = s.object({ key: STABLE_KEY, mergedKeys: s.array(s.string({ max: 120 }), { max: 50 }), title: s.nullable(s.string({ min: 1, max: 200 })), description: s.nullable(s.string({ max: 2000 })), parentKey: s.nullable(s.string({ max: 120 })) });

/** merge_partitions: groups of keys from different partitions that are one idea, and new cross-partition edges. */
export const MERGE_DECISIONS = s.object({ topics: s.array(TOPIC_DECISION, { max: 500 }), edges: s.array(EDGE, { max: 300 }), reasons: REASONS });

/** finalize_graph: the topic hierarchy, extra edges, exam-scope edits by objective position (null = all of the topic's), migrations. */
export const GRAPH_OUTLINE = s.object({
  topics: s.array(TOPIC_DECISION, { max: 1500 }),
  edges: s.array(EDGE, { max: 500 }),
  objectiveEdits: s.array(s.object({ topicKey: s.string({ max: 120 }), objectiveIndex: s.nullable(s.int({ min: 0, max: 1000 })), scopeBasis: SCOPE_BASIS, examWeight: EXAM_WEIGHT, examWeightEvidence: WEIGHT_EVIDENCE }), { max: 500 }),
  migrations: MIGRATIONS,
  affectedInterpretationIds: ids(),
  reasons: REASONS,
  noChangeReason: s.nullable(s.string({ max: 1000 })),
});

export const VALIDATE_OUTPUT = s.object({ report: s.json(), repairInstructions: s.array(s.json()) });

/** What a model-backed validator returns before the adapter assembles a ValidationReport. */
export const VALIDATOR_VERDICT = s.object({
  disposition: s.enum(['pass', 'repair_required', 'needs_review', 'provisional_allowed']),
  checks: s.array(s.object({ check: s.string({ max: 300 }), passed: s.nullable(s.bool()), evidenceAnchorIds: ids(), note: s.string({ max: 2000 }) }), { max: 100 }),
  issues: s.array(s.object({ code: s.string({ max: 100 }), severity: s.enum(['info', 'warning', 'blocking']), message: s.string({ max: 2000 }), evidenceAnchorIds: ids() }), { max: 100 }),
  repairInstructions: s.array(s.object({ instruction: s.string({ max: 2000 }), evidenceAnchorIds: ids() }), { max: 50 }),
});
