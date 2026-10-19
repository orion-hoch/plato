# Voice study backend: implementation specification

> **Status (11 Oct 2026): the original backend spec, partly superseded.** The storage, jobs, knowledge pipeline and HTTP contracts still hold. The planner, context packets, voice adapters, the §7 plan → context → speak loop and the §10 `topic`/`interrupt`/`voice-*` routes were replaced in v10 by the director and actor (`director-actor.md`). The schedule was removed in v11. `backend/CONTRACTS.md` records each departure, and `system-spec.md` is the current design.

Version: 1.0. Specification date: 2026-10-04. Status: implementation handoff.

This file is the complete implementation brief. A coding agent must be able to implement the backend and its mock-provider integration tests without reading a conversation, another document, or the architecture visualization. This is a design specification, not a claim that the system has been built or that its mastery estimates have been scientifically validated.

## 1. Product intent, requirements, and boundaries

A student creates a test/exam workspace, uploads many heterogeneous files, and studies by speaking with a tutor. The system preserves and understands the source material, organizes it into fine-grained topics, adapts explanations and connections to the student, and records the student's changing understanding of each subtopic. The source knowledge and learner state are distinct, persistent systems with active feedback loops.

The strong reasoning role is called **Astra** in this specification. Astra diagnoses uncertainty, decides what teaching purpose is useful, selects or requests questions, reasons over evidence, and decides whether explanations or the personal study map should change. A fast **speaking role** handles conversational delivery. A cheap reliable extraction role is called **Luna**. These names describe responsibilities; they are not selected production model IDs. One provider/model may implement several roles, and a role may combine deterministic code with model calls.

### 1.1 Accepted product requirements

- A per-exam L0 → L1 → L2 → L3 knowledge pipeline: original files, faithful anchored Markdown, deeper per-source interpretations, and an exam topic graph.
- Bottom-up construction followed by bounded, source-checked refinement from graph context back to affected interpretations.
- Persistent learner profile and per-subtopic mastery estimates with append-only evidence and chronological history.
- Meaningful learner evidence actively queues reconsideration of personalized explanations and map connections. Saving a profile for a future prompt alone does not satisfy this requirement.
- Adaptive tutoring controlled by a strong reasoner, with fast voice delivery, bounded asynchronous planning, context management, and reliable interruption handling.
- A small background question supply and a separate on-demand question path. The tutor remains free to teach, diagnose, switch topics, or request a different question.
- Student-facing projection limited to essential exam/upload setup, a topic/subtopic list with current mastery beside each item, and voice interaction.

### 1.2 Proposed v1 engineering defaults

The following choices make the implementation concrete but are configurable rather than product claims:

- A relational database such as PostgreSQL stores typed rows, relationships, immutable version references, JSON payloads, transactions, and an outbox. No graph database is required.
- Object storage holds original files and large immutable artifacts. Text may be in the database or object storage provided hashes and version references remain consistent.
- A durable, at-least-once queue, including a database-backed queue, runs resumable jobs. Stateless HTTP/event handlers and workers implement the services below.
- Retrieval combines explicit source anchors, graph relationships, lexical search, and optionally embeddings. A vector database is not required.
- One exam belongs to one learner in v1. A tenant may own many learners, but material is exam-scoped by default. Do not introduce a global shared corpus.
- Service boundaries are modules and contracts, not a requirement to deploy many microservices. One application plus worker processes is sufficient.
- The configuration defaults in §12 are initial engineering settings, not measured performance guarantees or validated learning thresholds.
- Framework, implementation language, cloud host, production models, ASR/TTS/voice provider, and credentials are external configuration. Implement typed adapters and mocks first. TypeScript-like contracts below describe semantics; they do not mandate TypeScript.

### 1.3 Non-goals and UI boundary

Do not implement cameras, iPad whiteboards, handwriting, visual learning-type diagnosis, a rigid lesson plan, or a mandatory external assessor. Do not expose a source viewer, graph viewer, diagnostic panel, confidence panel, question buffer, or mastery-history dashboard to the student. Internally, source evidence must be retrievable, diagnostic records inspectable through authorized admin/debug APIs, and mastery history plottable. UI construction is outside this backend brief; implement the minimal student projection in §10.

Do not equate confident speech, tone, speed, hesitation, or a preference for a teaching style with demonstrated ability. Do not infer exam weight from file length or mention count. A generated explanation or model consensus is not source truth. Question correctness alone does not establish general mastery.

## 2. Architecture and the two feedback loops

### 2.1 Knowledge loop: new material → graph → reinterpretation

1. Preserve an accepted upload byte-for-byte as L0, after capability and parser-bound checks.
2. Choose the cheapest reliable extractor for that file. Produce L1 Markdown with immutable anchors, uncertain regions, formulas, and diagram references. Escalate unresolved math/visual regions; never substitute plausible invented content.
3. Interpret each source at L2: concepts, explanations, assumptions, examples, implications, and evidence-backed connections. Provide relevant learner profile/topic state, including in the initial pass when available. Produce grounded base interpretations separately from personal overlays.
4. Build L3: a hierarchy for navigation plus typed connections/prerequisites and objective-to-evidence links. Many files may support one topic and one file may support many topics.
5. Use the proposed graph context to revisit affected L2 interpretations and possibly patch L3. Source-fidelity, reasoning/math, analogy, graph, and question validators have distinct responsibilities. Their findings require evidence and may remain unresolved.
6. Publish a consistent immutable manifest atomically. Continue serving the previous published version while a candidate is incomplete. Stop refinement at configured bounds; publish only eligible material, or retain the previous version and record a needs-review result.

### 2.2 Learner loop: new evidence → learner state → personal material → teaching

1. Commit the question/purpose actually delivered and the student's finalized response or explicit feedback.
2. Assess relevant objective capabilities, update provisional diagnoses and profile evidence, and append a mastery-history point where there is eligible assessment evidence.
3. In the same logical transaction, emit a semantic learner-change event. The personalization coordinator determines impacted topics, explanations, and personal map edges and queues Astra to reconsider them.
4. Astra returns a validated personal patch or an explicit reasoned no-op. Persist the decision, triggering evidence, dependencies, and a new personal manifest when needed.
5. Publish a consistent personal view referencing a compatible base manifest. At a safe turn boundary, subsequent retrieval adopts it and supplies the revised explanation/map context to teaching.

Both loops preserve historical evidence, use immutable artifacts and versioned manifests, and converge under a budget. A learner's misconception never rewrites a source fact. Canonical graph prerequisites describe content relationships; personal readiness/emphasis/prerequisite suggestions describe this student's current study needs and are separately attributed.

### 2.3 Empty-exam and first-session bootstrap

Creating an exam atomically creates/selects the same-learner `LearnerProfileHead`, resolves its current snapshot with optional setup goals/preferences, creates an exam-scoped `ProfileSnapshot`, and sets `Exam.currentProfileSnapshotId`. If no facts are known, use explicit immutable version-0 empty snapshots. Current snapshots are obtained from these persisted heads, never by selecting the greatest timestamp. Profile mutation commits a new snapshot plus CAS update of its head/pointer and the associated change/outbox records; a conflict retries resolution against the new head. Before any material is published, `/topics` returns an empty list with `knowledgeVersion=null`; session start returns `409 content_not_ready` with upload/build status. It must not fabricate a graph or an ungrounded tutoring context. Initial ingestion uses the profile snapshot even when empty. Once graph topic IDs are stable, bind proposed initial personal explanations to those topics, validate them, and publish the first personal manifest compatible with the first base manifest. An empty personal manifest is a valid explicit initial view when no adaptation is justified. Initialize each fine-grained topic's mastery as unknown and its resume state as absent. Session start then retrieves that published pair and the latest relevant profile/state. No prior session or learner-change event is required to bootstrap the first personalized retrieval.

## 3. Shared contract conventions

All IDs are opaque strings; examples beginning `syn_` are synthetic. Timestamps are UTC RFC 3339. Integer versions are positive except an explicit zero/empty snapshot. `null` means unknown or inapplicable, never zero mastery. All fractions, confidence values, and display indices must satisfy their declared ranges. Every persisted record includes a scope and timestamps either directly or through an inherited interface.

Contracts are normative shapes and validation rules, not executable OpenAPI or a complete language SDK. An implementation must provide actual schema validation, database migrations, and endpoint definitions. No unspecified field may silently stand in for a required dependency or ownership check.

```ts
type Id = string;
type UTC = string;
type Hash = string; // SHA-256 of canonical bytes/JSON; include canonicalization version.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Version = number;
type Fraction = number; // finite, 0..1
type DisplayIndex = number; // finite, 0..100; not a probability
type Capability = "recall" | "explanation" | "application" | "transfer" | "delayed_retention";
type LearnerScope = { tenantId: Id; learnerId: Id };
type Scope = LearnerScope & { examId: Id };
interface Stored { id: Id; scope: Scope; createdAt: UTC; }
interface MutableStored extends Stored { updatedAt: UTC; rowVersion: Version; }
interface ArtifactRef { blobId: Id; sha256: Hash; mediaType: string; byteLength: number; }
interface RecordRef { kind: string; id: Id; version: Version | null; }
interface Dependency {
  ref: RecordRef;
  hash: Hash;
  relation: "derived_from" | "assessed_with" | "personalized_for" | "validated_against";
}
interface EvidenceRef {
  kind: "source_anchor" | "interaction" | "assessment" | "feedback" | "explicit_exam_instruction";
  id: Id;
  detail: string | null; // source-anchor ID is already version-specific
}
interface ProviderRun {
  adapter: string; modelId: string; modelVersion: string | null;
  promptTemplateVersion: string; configVersion: string;
  requestId: string; startedAt: UTC; finishedAt: UTC;
}
interface Issue {
  code: string; severity: "info" | "warning" | "blocking";
  message: string; affected: RecordRef[]; evidence: EvidenceRef[];
  resolution: "open" | "repaired" | "accepted_provisional" | "needs_review";
}
interface StructuredError {
  code: "unsupported_format" | "quality_gate" | "invalid_input" | "provider_timeout" |
    "provider_unavailable" | "rate_limited" | "stale_dependency" | "budget_exhausted" |
    "ownership_denied" | "content_not_ready" | "version_conflict" | "idempotency_conflict" |
    "cancelled" | "deleted" | "internal_error";
  retryable: boolean; message: string; retryAfterMs: number | null;
  issues: Issue[];
}
interface Uncertainty { reason: string; evidence: EvidenceRef[]; alternatives: string[]; }
interface WorkIdentity {
  scope: Scope; operationId: Id; idempotencyKey: string;
  inputHash: Hash; dependencies: Dependency[]; cancellationGeneration: number;
  deadlineAt: UTC; budget: WorkBudget;
}
interface WorkBudget {
  maxProviderCalls: number; maxInputTokens: number; maxOutputTokens: number;
  maxWallTimeMs: number; maxAttempts: number;
}
interface CallResult<T> {
  outcome: "ok" | "noop" | "needs_review" | "failed" | "stale";
  value: T | null; // required for ok; decision payload required for a semantic noop
  reason: string | null; uncertainties: Uncertainty[]; issues: Issue[];
  providerRuns: ProviderRun[]; error: StructuredError | null;
}
```

Scope is server-derived from authentication plus an authorized exam lookup. Clients, sources, and providers cannot override it. References in any record must resolve within its scope unless they point to approved configuration/policy metadata or an explicitly typed learner-wide profile snapshot for the same tenant/learner. Learner-wide facts may refer to their original same-learner evidence in another exam; source content retrieval remains exam-scoped, and irrelevant cross-exam history must not enter the packet. Provider-run identifiers are opaque audit data and must contain no secrets.

Use distinct version dimensions: immutable source versions; base knowledge manifest versions; profile snapshots; per-topic learner-state versions; personal manifest versions; objective/rubric/policy versions; session epochs; turn sequence numbers; and mutable-row versions. A single global `version` is insufficient. Every async result declares dependencies and its target version; application uses a compare-and-swap (CAS) against the expected state. A stale result may remain as an audit artifact but cannot silently mutate the active session or publication pointer.

## 4. Persisted entities and integrity constraints

### 4.1 Exam, files, extraction, and immutable source anchors

```ts
interface Exam extends MutableStored {
  title: string; status: "setup" | "building" | "ready" | "needs_review" | "deleting" | "deleted";
  instructions: string | null; examDate: UTC | null;
  currentProfileSnapshotId: Id;
  publishedKnowledgeManifestId: Id | null;
  publishedPersonalManifestId: Id | null;
  desiredBuildGeneration: number; deletionGeneration: number;
}
interface SourceFile extends MutableStored {
  filename: string; declaredMime: string; detectedMime: string;
  currentSourceVersionId: Id | null;
  status: "uploading" | "uploaded" | "processing" | "ready" | "needs_review" | "failed" | "deleted";
}
interface SourceVersion extends Stored {
  sourceFileId: Id; version: Version; original: ArtifactRef;
  contentHash: Hash; replacesSourceVersionId: Id | null;
  uploadFinalizedAt: UTC; capabilityProfileVersion: string;
}
interface SourceAnchor extends Stored {
  sourceVersionId: Id; anchorKey: string;
  location: {
    page: number | null; slide: number | null; // one-based
    sheet: string | null; cells: string | null;
    sectionPath: string[]; paragraph: number | null;
    originalByteStart: number | null; originalByteEnd: number | null;
    extractedCharStart: number | null; extractedCharEnd: number | null; // half-open offsets
    bbox: { x: Fraction; y: Fraction; width: Fraction; height: Fraction } | null;
    timeStartMs: number | null; timeEndMs: number | null;
  };
  evidenceArtifact: ArtifactRef; // immutable original/raster/extraction slice
  excerptHash: Hash; extractionArtifactId: Id | null;
}
interface ExtractionArtifact extends Stored {
  sourceVersionId: Id; version: Version; supersedesId: Id | null;
  status: "valid" | "partial" | "needs_review" | "failed";
  markdown: ArtifactRef; anchorIds: Id[]; extractorConfigVersion: string;
  regions: {
    anchorId: Id; kind: "text" | "formula" | "diagram" | "table" | "other";
    disposition: "faithful" | "uncertain" | "unreadable";
    extractedText: string | null; confidence: Fraction | null;
    uncertaintyReason: string | null; originalEvidence: ArtifactRef;
  }[];
  issues: Issue[]; dependencies: Dependency[]; runs: ProviderRun[];
}
```

Original bytes cannot be overwritten. A replacement is a new `SourceVersion`. Old anchors always refer to old bytes, even if pagination changes. Refining an extraction creates new extraction artifacts and anchors for changed spans, with traceable supersession; never edit old anchor meaning. Artifact ID and checksum must be verified before a manifest is published. Half-open ranges must be valid; bounding boxes fit within the normalized page/slide bounds. At least one useful location component is required per anchor.

The v1 capability configuration must explicitly list supported MIME/extension combinations, maximum file/expanded size, pages, sheets, parser runtime, and available fallback adapters. Suggested first implementations: UTF-8 text/Markdown; text-bearing PDF; scanned PDF/images with configured OCR; DOCX; PPTX; and CSV/XLSX when a safe table extractor is installed. This is a capability matrix, not a promise all formats work out of the box. An unavailable OCR or formula adapter yields `needs_review`; an unsupported format yields a visible failed source with a structured error. Do not drop a failed file from exam status.

Extraction fidelity requires source order, headings, page/slide markers, table structure when meaningful, mathematical notation or an explicit unresolved reference, and diagram references. Preserve `[UNCERTAIN: reason; anchor=…]` markers in L1. A parser may complete without a model. OCR/model extraction must not treat instructions inside an uploaded file as system instructions. Parser sandboxes/bounds prevent archive expansion and malformed-document resource exhaustion. Password-protected files require a supported configuration or an explicit failure.

### 4.2 Base interpretations, objectives, graph, and manifest

```ts
type ClaimKind = "source_statement" | "derived_explanation" | "assumption" |
  "example" | "implication" | "connection";
interface GroundedClaim {
  claimId: Id; kind: ClaimKind; text: string;
  evidence: EvidenceRef[];
  support: "direct" | "derived" | "provisional";
  derivation: string | null; // concise inspectable justification, not hidden chain of thought
  uncertainties: Uncertainty[];
}
interface SourceSegment extends Stored {
  sourceVersionId: Id; extractionArtifactId: Id; segmentIndex: number;
  anchorIds: Id[]; overlapAnchorIds: Id[]; contentHash: Hash;
  estimatedTokens: number; segmentationPolicyVersion: string;
}
interface CoverageEntry {
  sourceVersionId: Id; extractionArtifactId: Id | null;
  allSegmentIds: Id[]; interpretedSegmentIds: Id[]; validatedSegmentIds: Id[];
  excluded: { segmentId: Id | null; anchorIds: Id[]; reason: string;
    disposition: "pending" | "unsupported" | "unreadable" | "failed" | "needs_review" }[];
  status: "complete" | "partial" | "unavailable";
}
interface SynthesisPartition extends Stored {
  buildId: Id; level: number; partitionIndex: number;
  inputInterpretationIds: Id[]; inputPartitionIds: Id[];
  coveredSegmentIds: Id[]; sourceAnchorIds: Id[];
  output: ArtifactRef; dependencies: Dependency[]; issues: Issue[];
}
interface BaseInterpretation extends Stored {
  sourceVersionId: Id; extractionArtifactId: Id; version: Version;
  supersedesId: Id | null; topicIds: Id[]; sourceSegmentIds: Id[];
  explanation: ArtifactRef; claims: GroundedClaim[];
  assumptions: string[]; examples: GroundedClaim[];
  graphContextManifestId: Id | null;
  status: "candidate" | "validated" | "needs_review" | "superseded";
  dependencies: Dependency[]; validationReportIds: Id[]; runs: ProviderRun[];
}
interface Topic extends Stored { stableKey: string; retiredAt: UTC | null; }
interface TopicVersion extends Stored {
  topicId: Id; version: Version; title: string; description: string;
  parentTopicId: Id | null; objectiveVersionIds: Id[];
  status: "active" | "retired" | "provisional";
}
interface ObjectiveVersion extends Stored {
  objectiveId: Id; version: Version; topicId: Id;
  statement: string; capabilities: Capability[];
  successCriteria: string[]; sourceEvidence: EvidenceRef[];
  scopeBasis: "explicit_exam" | "explicit_syllabus" | "source_coverage" | "model_suggestion";
  examWeight: { value: Fraction; evidence: EvidenceRef[] } | null;
  meaningHash: Hash; supersedesId: Id | null;
}
interface GraphEdge extends Stored {
  edgeId: Id; version: Version; fromTopicId: Id; toTopicId: Id;
  type: "prerequisite" | "related" | "application_of" | "contrasts_with" | "supports";
  evidence: EvidenceRef[]; support: "grounded" | "inferred_provisional";
  explanation: string; prerequisiteCycleIssueId: Id | null;
}
interface TopicEvidenceLink extends Stored {
  topicId: Id; objectiveVersionId: Id | null;
  sourceAnchorId: Id; interpretationId: Id | null; relation: "defines" | "explains" | "exemplifies" | "assesses";
}
interface ValidationReport extends Stored {
  candidateRef: RecordRef; responsibility: ValidationResponsibility;
  disposition: "pass" | "repair_required" | "needs_review" | "provisional_allowed";
  checks: { check: string; passed: boolean | null; evidence: EvidenceRef[]; note: string }[];
  issues: Issue[]; dependencies: Dependency[]; runs: ProviderRun[];
}
type ValidationResponsibility = "source_fidelity" | "math_and_reasoning" | "analogy_suitability" |
  "graph_integrity" | "personalization_grounding" | "question_answerability";
interface KnowledgeManifest extends Stored {
  version: Version; parentManifestId: Id | null; buildId: Id;
  status: "candidate" | "validated" | "published" | "rejected";
  sourceVersionIds: Id[]; extractionArtifactIds: Id[]; interpretationIds: Id[];
  topicVersionIds: Id[]; objectiveVersionIds: Id[]; edgeVersionIds: Id[]; topicEvidenceLinkIds: Id[];
  validationReportIds: Id[]; unresolvedIssues: Issue[]; contentHash: Hash;
  coverage: CoverageEntry[]; coverageStatus: "complete" | "partial";
  synthesisPartitionIds: Id[];
  eligibleForTutoring: boolean; publishedAt: UTC | null;
}
interface TopicMigration extends Stored {
  fromKnowledgeManifestId: Id; toKnowledgeManifestId: Id;
  kind: "rename" | "reparent" | "split" | "merge" | "objective_meaning_change" | "retire";
  fromTopicIds: Id[]; toTopicIds: Id[];
  objectiveMappings: { fromObjectiveVersionId: Id; toObjectiveVersionId: Id;
    comparability: "equivalent" | "partial" | "not_comparable"; reason: string }[];
  reassessmentRequired: boolean; evidence: EvidenceRef[];
}
```

Use an explicit many-to-many link table for evidence; do not encode “one topic per file.” Topic IDs survive rename/reparent operations. A hierarchy must have one parent per topic within a manifest and no cycles; ordinary crosslinks may cycle. Detect prerequisite strongly connected components and flag their edges for review. Do not silently delete edges to force a prerequisite DAG. Unresolved prerequisites may be retrieved as provisional context but may not become enforced study gates.

An objective is a assessable statement such as “explain why QR's columns are orthonormal and apply projection to construct them,” not just a topic label. Its meaning changes require a new objective version, migration record, and comparability decision. Exam weights must have explicit exam/syllabus evidence. Model suggestions carry their provenance and may remain unweighted. Students can study any published topic without following prerequisites in order.

A manifest is immutable after publication apart from administrative status metadata. Its referenced records/content must not change. Publication is one transaction that validates exact dependencies, changes the exam's pointer by CAS, and emits `knowledge.published`. A concurrent older build cannot replace a newer desired generation. A source can remain visible in `needs_review` while a manifest publishes unaffected sources, provided the manifest reports the excluded/unusable regions and does not teach claims depending on them. The student projection may show processing/failure status, without exposing an internal review panel.

### 4.3 Learner profile, evidence, assessments, mastery history

```ts
interface ProfileFact {
  factId: Id; applicability: { level: "learner" | "exam"; examId: Id | null };
  kind: "goal" | "preference" | "correction" | "teaching_observation" | "context";
  key: string; value: Json;
  origin: "explicit_user" | "inferred";
  durability: "until_revoked" | "session" | "reviewable";
  evidence: EvidenceRef[]; counterEvidence: EvidenceRef[];
  status: "active" | "superseded" | "retracted"; confidence: Fraction | null;
  validFrom: UTC; expiresAt: UTC | null; supersedesFactId: Id | null;
}
interface LearnerProfileHead {
  id: Id; scope: LearnerScope; createdAt: UTC; updatedAt: UTC; rowVersion: Version;
  currentSnapshotId: Id; currentSnapshotVersion: number;
}
interface LearnerProfileSnapshot {
  id: Id; scope: LearnerScope; createdAt: UTC;
  version: number; parentSnapshotId: Id | null;
  facts: ProfileFact[]; contentHash: Hash;
}
interface ProfileSnapshot extends Stored {
  learnerProfileSnapshotId: Id; // resolved learner-wide preferences plus relevant exam facts
  version: Version; parentSnapshotId: Id | null; facts: ProfileFact[];
  contentHash: Hash; // empty profile is version 0 with facts=[] and known ID
}
interface Diagnosis {
  diagnosisId: Id; statement: string; status: "provisional" | "supported" | "contradicted" | "resolved";
  evidence: EvidenceRef[]; alternativeExplanations: string[];
  confidence: Fraction | null; supersedesDiagnosisId: Id | null;
}
interface LearnerTopicState extends MutableStored {
  topicId: Id; stateVersion: Version; profileSnapshotId: Id;
  diagnoses: Diagnosis[]; latestAssessmentIds: Id[]; masteryProjectionId: Id;
  resumeStateId: Id | null; lastMeaningfulEvidenceAt: UTC | null;
}
interface AssistanceDelivered {
  questionId: Id | null; semanticUnitId: Id;
  kind: "hint" | "worked_step" | "answer_reveal" | "clarification" | "scaffolding";
  text: string; deliveryEventIds: Id[];
  extent: "complete" | "partial" | "uncertain"; recordedAt: UTC;
}
interface InteractionEvidence extends Stored {
  sessionId: Id; turnId: Id; responseId: Id | null;
  questionId: Id | null; questionVersion: Version | null;
  promptSnapshot: string; promptDeliveryEventIds: Id[];
  finalizedAnswer: string | null; answerArtifact: ArtifactRef | null;
  asr: { finalized: boolean; confidence: Fraction | null; ambiguousSpans: string[] } | null;
  assistance: AssistanceDelivered[];
  evidenceStatus: "eligible" | "ambiguous" | "incomplete_prompt" | "delivery_uncertain" | "prompt_drift" | "withdrawn";
  promptRenderingId: Id | null; promptCompatibility: "approved" | "material_drift" | "unknown";
  objectiveVersionIds: Id[]; rubricVersionId: Id | null;
  knowledgeManifestId: Id; personalManifestId: Id | null; profileSnapshotId: Id;
  responseAt: UTC; observedFacts: string[];
  supersedesEvidenceId: Id | null;
}
interface FeedbackEvidence extends Stored {
  sessionId: Id | null; turnId: Id | null; topicIds: Id[];
  text: string; type: "preference" | "correction" | "difficulty" | "material_feedback" | "other";
  explicit: boolean; applicability: { level: "learner" | "exam"; examId: Id | null };
  supersedesFeedbackId: Id | null;
}
interface RubricVersion extends Stored {
  rubricId: Id; version: Version; objectiveVersionIds: Id[];
  expectedAnswer: string; acceptableAlternatives: string[];
  criteria: { criterionId: Id; objectiveVersionId: Id; text: string; capability: Capability; evidence: EvidenceRef[] }[];
  misconceptionChecks: string[]; assistanceInterpretation: string;
  dependencies: Dependency[]; policyVersion: string; meaningHash: Hash;
}
interface Estimate {
  status: "unknown" | "estimated";
  displayIndex: DisplayIndex | null;
  ordinal: "emerging" | "developing" | "secure" | null;
  distribution: { label: string; mass: Fraction }[] | null;
  uncertainty: "high" | "medium" | "low" | "unknown";
  basis: string; // short evidence-based assessment rationale
}
interface CapabilityEstimate { capability: Capability; estimate: Estimate; evidenceIds: Id[]; }
interface ObjectiveAnswerFinding {
  objectiveVersionId: Id; topicId: Id; criterionId: Id; capability: Capability;
  outcome: "supported" | "contradicted" | "insufficient";
  observed: string; answerSpan: { start: number; end: number } | null;
  assistanceLevel: "independent" | "assisted" | "revealed" | "uncertain";
  evidence: EvidenceRef[];
}
interface LocalAnswerAssessment extends Stored {
  version: Version; supersedesId: Id | null;
  interactionEvidenceId: Id; questionId: Id; questionVersion: Version;
  rubricVersionId: Id; policyVersion: string;
  findings: ObjectiveAnswerFinding[];
  disposition: "assessed" | "insufficient_evidence" | "needs_clarification" | "failed";
  uncertainty: Uncertainty[]; dependencies: Dependency[]; runs: ProviderRun[];
}
interface LearnerAssessment extends Stored {
  version: Version; supersedesAssessmentId: Id | null;
  topicId: Id; objectiveVersionIds: Id[]; interactionEvidenceIds: Id[]; localAnswerAssessmentIds: Id[];
  rubricVersionId: Id | null; assessmentPolicyVersion: string;
  priorProjectionId: Id; priorProjectionVersion: Version;
  findings: { objectiveVersionId: Id; criterionId: Id | null; observed: string;
    outcome: "supported" | "contradicted" | "insufficient";
    assistanceLevel: "independent" | "assisted" | "revealed" | "uncertain";
    evidence: EvidenceRef[] }[];
  estimate: Estimate; capabilities: CapabilityEstimate[];
  diagnoses: Diagnosis[]; uncertainty: Uncertainty[];
  disposition: "applied" | "insufficient_evidence" | "needs_clarification" | "superseded" | "failed";
  comparabilitySegmentId: Id; dependencies: Dependency[]; runs: ProviderRun[];
}
interface MasteryProjection extends MutableStored {
  topicId: Id; projectionVersion: Version; currentAssessmentId: Id | null;
  estimate: Estimate; capabilities: CapabilityEstimate[];
  objectiveVersionIds: Id[]; assessmentPolicyVersion: string;
  comparabilitySegmentId: Id; lastEvidenceAt: UTC | null;
}
interface MasteryHistoryPoint extends Stored {
  topicId: Id; sequence: number; assessmentId: Id | null;
  projectionVersion: Version; estimate: Estimate; capabilities: CapabilityEstimate[];
  effectiveEvidenceAt: UTC; recordedAt: UTC;
  kind: "assessment" | "correction" | "policy_transition" | "objective_transition";
  comparabilitySegmentId: Id; supersedesHistoryPointId: Id | null;
}
interface AssessmentPolicy {
  version: string; allowedCapabilities: Capability[];
  estimationMode: "reasoner_estimate" | "configured_numeric";
  displayMapping: Json; evidenceEligibilityRules: string[];
  updateRules: string[]; assistanceRules: string[];
  publishedAt: UTC; validationStatus: "engineering_unvalidated" | "externally_validated";
}
```

The v1 default is a reasoner-produced estimate under a versioned rubric/policy, with optional normalized display index, ordinal, uncertainty, and supporting evidence. Do not impose a fabricated arithmetic equation or a rigid recall-to-transfer hierarchy. If a distribution is returned, masses sum to 1 and labels have policy-defined semantics; do not label them calibrated probabilities without separate validation. Numeric output must be finite and bounded. An unknown estimate has `displayIndex=null`, `ordinal=null`, and no fabricated distribution. The initial topic projection is unknown. Mock indices are illustrative only.

Store current mastery by `(tenant, learner, exam, topic)`, not just by learner. Keep assessments/history append-only; mutable current projections point to the latest applicable result. Corrections create new evidence/assessment/history records linked by supersession. Do not retroactively erase the old question, answer, rubric, policy, estimate, or delivered assistance. Store both event time and processing time so delayed jobs and corrections are interpretable. Internal history queries support chronological plotting and comparability segments; never silently draw a comparable “learning curve” across a changed objective or scoring policy.

An answer after a delivered hint is assisted even if a planned hint was more extensive. Merely generating or queuing a hint is not assistance. If audio delivery is uncertain, do not award unassisted evidence; clarify or mark evidence insufficient. An ambiguous transcript cannot trigger an incorrect-answer penalty. A brief hesitation is not evidence against capability. Slow progress prompts examination of prerequisites, question wording/difficulty, and assistance rather than automatic escalation to harder tasks.

Learner-wide preferences/goals persist in `LearnerProfileSnapshot` under `LearnerProfileHead`; each exam-scoped `ProfileSnapshot` resolves the relevant global facts plus exam-specific goals/context with provenance. Facts explicitly declare applicability: learner-wide requires `examId=null`; exam-specific requires the current exam ID. Exam-specific goals or an explicit current-session instruction take precedence within their scope; an inferred preference cannot override an explicit current user instruction. Changing applicability requires a new fact/snapshot with provenance. Exam-specific corrections do not become global traits automatically.

Explicit preferences can persist until revoked; inferred teaching observations remain reviewable. “I like examples” may immediately affect delivery preference, but “examples improve this learner's performance” requires later performance evidence and can be contradicted. Do not convert one answer into a permanent learner trait. Facts such as notation confusion are diagnoses with alternatives until supported. Preferences must not change the correctness criteria of the same objective/rubric.

On provider failure, retain the previous estimate or unknown, write a failed/insufficient assessment attempt, and choose clarification or routine diagnosis. Do not invent a mastery update. Independent evidence may raise or lower an estimate. Rename/reparent preserves topic IDs/history. Split/merge or changed objective meaning creates mapping records and a new comparability segment; new topics begin unknown unless an explicitly justified compatible evidence reassessment is performed. Copying a parent/merged score is prohibited.

### 4.4 Personal explanations, study map, and revision decisions

```ts
interface LearnerContextRef {
  profileSnapshotId: Id; profileVersion: number;
  topicStates: { topicId: Id; stateVersion: Version; masteryProjectionId: Id; projectionVersion: Version }[];
  selectedFactIds: Id[]; selectedEvidenceIds: Id[];
  emptyProfile: boolean;
}
interface PersonalExplanation extends Stored {
  version: Version; supersedesId: Id | null; topicIds: Id[];
  baseInterpretationIds: Id[]; knowledgeManifestId: Id;
  explanation: ArtifactRef; selectedExamples: GroundedClaim[];
  learnerContext: LearnerContextRef;
  reasons: string[]; triggerEvidence: EvidenceRef[];
  dependencies: Dependency[]; validationReportIds: Id[];
}
interface PersonalMapEdge extends Stored {
  edgeId: Id; version: Version; fromTopicId: Id; toTopicId: Id;
  type: "suggested_revisit" | "personal_prerequisite" | "helpful_connection" | "contrast_to_clarify";
  explanation: string; evidence: EvidenceRef[]; provisional: boolean;
  supersedesId: Id | null;
}
interface PersonalTopicEmphasis {
  topicId: Id; purpose: string; priority: "suggested" | "normal" | "deemphasized";
  reason: string; evidence: EvidenceRef[];
}
interface PersonalManifest extends Stored {
  version: Version; parentManifestId: Id | null;
  knowledgeManifestId: Id; learnerContext: LearnerContextRef;
  explanationIds: Id[]; personalMapEdgeIds: Id[]; emphasis: PersonalTopicEmphasis[];
  revisionDecisionIds: Id[]; dependencies: Dependency[]; contentHash: Hash;
  status: "candidate" | "validated" | "published" | "rejected";
  publishedAt: UTC | null;
}
interface LearnerChange extends Stored {
  sequence: number; semanticKey: string; topicIds: Id[];
  kind: "meaningful_answer" | "explicit_feedback" | "correction" | "diagnosis_contradiction" |
    "preference_change" | "delayed_performance";
  evidence: EvidenceRef[]; previousContext: LearnerContextRef; nextContext: LearnerContextRef;
  status: "pending" | "coalesced" | "decided"; decisionId: Id | null;
}
interface PersonalRevisionDecision extends Stored {
  changeIds: Id[]; targetKnowledgeManifestId: Id; priorPersonalManifestId: Id | null;
  targetLearnerContext: LearnerContextRef;
  affectedInterpretationIds: Id[]; affectedTopicIds: Id[]; affectedPersonalEdgeIds: Id[];
  disposition: "revise" | "noop" | "needs_review" | "stale" | "failed";
  reason: string; evidence: EvidenceRef[];
  outputPersonalManifestId: Id | null; dependencies: Dependency[]; runs: ProviderRun[];
}
```

An empty initial learner context is explicit, not omitted. If profile/topic state is known, pass the relevant snapshot and selected facts/evidence to every learner-specific interpreter, graph adaptation, planner, assessor, and personal/custom question generator. Also include it in the initial per-source interpretation and exam-map construction request so relevant goals and known state are available. Base claims remain source-grounded. A generic question refill can use canonical material without personal information; it must declare itself generic.

The active personalization coordinator is mandatory. Emit a learner change for a meaningful finalized answer with diagnostic content, explicit preference/material feedback, corrected answer/transcript, contradicted diagnosis, or delayed performance. Ignore ASR partials, acknowledgments, and repeated identical feedback as semantic duplicates. Semantic eligibility is a deterministic front gate plus structured assessor/feedback output; store exclusion reasons in the event audit. Every eligible change must reach a revision decision, including a reasoned no-op.

Scope revision using dependencies from changed facts/diagnoses/objectives to active explanations and personal edges, then nearby relevant graph nodes. Empty `topicIds` does not mean “affects nothing.” For an exam-wide preference or unlocalized material feedback, inspect all active personal explanations/emphasis and relevant source/topic summaries in bounded batches, prioritizing the current topic; record whether each inspected area needs change. For a learner-wide preference, update the learner head and enqueue a durable per-exam profile-resolution/change job for every nondeleted exam owned by that learner. Those jobs create new exam snapshots and schedule reconsideration in each applicable exam, without copying source content between exams. A later-created exam resolves the current learner head during bootstrap. Scope selection can narrow based on declared dependencies, but must record the complete targeted/excluded set and reasons; a zero-topic no-op without inspection is invalid.

If no knowledge manifest exists, persist a pending personalization batch against the exam generation and wake it after the first base publication. Initial interpretation uses the latest snapshot; the pending batch verifies that the resulting first personal manifest covers the changes, then records a revise or explicit no-op decision. If a profile change races with initial publication, snapshot/CAS checks force rebase/reconsideration. A failed base build leaves the change explicitly waiting for material rather than silently decided. Coalesce pending changes over the configured short window and at most the configured batch size. Explicit correction of a currently taught misconception has high priority. A new event during a revision creates or merges into a subsequent batch; do not discard it. A generated overlay does not emit fresh learner evidence. This prevents self-triggering loops.

Astra decides whether material changes. For example, “the student already understands projection but confuses the meaning of `qᵢᵀaⱼ`” should reconsider an explanation that assumes a projection misconception, remove unsupported remedial emphasis, and add a notation-to-projection connection. Persist the trigger and reason. A no-op such as “the present explanation already contains exactly this clarification; only the pace preference changed” is allowed, but it must be a recorded decision after scheduling and inspection.

A personal manifest only references one compatible knowledge manifest. Publish it with CAS against expected base pointer/personal pointer and declared profile/topic versions. If profile has advanced, re-evaluate the semantic conflict: preserve an old candidate for audit and enqueue a fresh decision; do not overwrite newer personal state. If a new base manifest has published, build/rebase a compatible personal view. Retrieval can continue the old consistent pair while this is pending. When switching to a new base without a compatible personal view, use an explicitly empty personal view plus current profile and mark personalization pending; never mix an old incompatible overlay with new base text.

### 4.5 Questions, validation, reservations, and exposure

```ts
type QuestionState = "queued" | "generating" | "validating" | "ready" | "reserved" |
  "asked" | "invalidated" | "failed";
interface QuestionRecord extends MutableStored {
  version: Version; origin: "generic_hopper" | "personalized_custom";
  topicId: Id; objectiveVersionIds: Id[]; narrowTarget: string | null;
  objectiveTargets: { objectiveVersionId: Id; topicId: Id;
    role: "assessed" | "context_only"; criterionIds: Id[]; capabilities: Capability[] }[];
  knowledgeManifestId: Id; personalManifestId: Id | null;
  learnerContext: LearnerContextRef | null; // null only for explicitly generic content
  semanticFamilyId: Id; semanticFingerprint: Hash;
  intendedDifficulty: "basic_diagnostic" | "application" | "transfer";
  difficultyNote: string; // intended, not calibrated
  prompt: string; voiceForm: string; approvedRenderingIds: Id[];
  choices: { id: string; text: string }[] | null;
  expectedAnswer: string; rubricVersionId: Id;
  hints: { hintId: Id; order: number; text: string; revealsAnswer: boolean }[];
  sourceEvidence: EvidenceRef[]; dependencies: Dependency[];
  validationReportIds: Id[]; state: QuestionState;
  generationRequestId: Id; failure: StructuredError | null;
}
interface QuestionRendering extends Stored {
  questionId: Id; questionVersion: Version; rubricVersionId: Id;
  text: string; textHash: Hash;
  equivalence: "exact_approved" | "validated_equivalent";
  validationReportIds: Id[]; dependencies: Dependency[];
}
interface QuestionReservation extends MutableStored {
  questionId: Id; questionVersion: Version; sessionId: Id; turnId: Id; sessionEpoch: number;
  leaseExpiresAt: UTC; state: "active" | "delivered" | "released" | "expired" | "invalidated";
  deliveryEventIds: Id[];
}
interface ExposureRecord extends Stored {
  questionId: Id; semanticFamilyId: Id; sessionId: Id; turnId: Id;
  kind: "question_played" | "partial_prompt" | "hint_played" | "answer_delivered" | "worked_example_delivered";
  deliveryEventIds: Id[]; evidenceId: Id | null;
}
interface QuestionSupply extends MutableStored {
  topicId: Id; knowledgeManifestId: Id;
  slot: "basic" | "challenging";
  targetReadyCount: number; activeGenerationJobId: Id | null;
  nextEligibleRefillAt: UTC; pausedReason: string | null;
}
```

For each active published exam subtopic, target roughly one basic diagnostic and one challenging application/transfer READY question. A reserved item no longer counts as ready; its reservation triggers refill subject to in-flight and total-supply bounds. Do not fill unlimited questions when consumers are absent. The scheduler sleeps/event-waits when targets are met and resumes on consumption, reservation, invalidation, new content, or bounded lease expiry. On-demand custom requests have higher queue priority than refill.

State transitions are `queued → generating → validating → ready → reserved → asked`. Generation/validation failures retry the stage within the job budget, then `failed`. Any no-longer-eligible item becomes `invalidated`. Release/lease expiry may move `reserved → ready` only if nothing was delivered, the dependencies remain valid, and the reservation is still owned by that session epoch. A question with any audible prompt is `asked` and has an exposure record; incomplete delivery is retained but does not qualify as a complete assessable prompt. Do not recycle it as unseen. Reservation and question-state change occur in one transaction with row locking/conditional update; only one active reservation per question. Delivery wins over a racing release using the durable delivery ledger and CAS.

The v1 speaking path renders the approved question wording/choice content exactly; natural transitions may surround it. A natural paraphrase is permitted only after semantic-equivalence validation against the question's conditions, numeric values, meaning, and rubric, persisted as `QuestionRendering`. Include the rendering ID/hash in the speaking packet and delivery ledger. Before playback, check each question semantic unit against its authorized rendering. Prevent materially changed numbers/conditions from playing as the approved prompt. If drift is detected after playback, preserve the actual words/segments and exposure, mark evidence `prompt_drift`, and do not apply the original rubric. Clarify/reissue a validated prompt or generate/validate a new question/rubric for the actual wording before assessing. IDs alone do not establish equivalence. `InteractionEvidence.promptSnapshot` is the reconstructed actual delivered prompt, with incomplete/unknown spans explicitly marked, not a copy of the planned text.

Candidates must pass grounded answerability, objective alignment, acceptable-answer coverage, math/reasoning, voice comprehensibility, and dependency checks before `ready`. Simple choices are optional; open answers are supported. Keep the expected answer, rubric, and hints available to the assessor/planner, but do not inadvertently insert the answer into the speaking packet before its teaching purpose allows it.

Avoid both exact repeats and semantically identical families already exposed. An answer explained in a worked example cannot be presented as novel transfer by changing only names/numbers. Use an exposure ledger plus semantic-family comparison during selection/validation. A deliberate revisit is permitted with an explicit `revisit` purpose and recorded rationale; it is not independent novel evidence.

A question may assess several objectives. Every assessable target must map to rubric criteria and the evidence it could elicit. Context-only objectives have no mastery credit. The local assessor returns objective-specific findings, and broader mastery estimation applies only to topics/objectives with attributable findings. Merely retrieving a connected topic or mentioning it in a prompt never gives that topic equal mastery credit.

A custom question may target “interpret the transpose in `qᵢᵀaⱼ`” within QR factorization. This does not create a permanent new graph node. It uses the same question record, rubric, validation, reservation, delivery, and evidence lifecycle as a hopper question. Personalized generation must include learner context/dependencies. If unavailable, the planner can select an existing appropriate validated question, explain, ask a grounded clarification, or wait conversationally. It cannot invent a supposedly READY question or block indefinitely on refill.

### 4.6 Sessions, actual delivery, context, and resumable topics

```ts
interface Session extends MutableStored {
  status: "active" | "disconnected" | "ended";
  epoch: number; activeTopicId: Id | null; currentTurnId: Id | null;
  activeQuestionId: Id | null; activeReservationId: Id | null;
  pinnedKnowledgeManifestId: Id; pinnedPersonalManifestId: Id | null;
  activePlanId: Id | null; activeContextPacketId: Id | null;
  nextTurnSequence: number; lastClientEventSequence: number;
  lastAcknowledgedServerEventSequence: number;
}
interface Turn extends MutableStored {
  sessionId: Id; sequence: number; epoch: number; topicId: Id | null;
  state: "listening" | "response_committed" | "planning" | "speaking" | "interrupted" | "complete";
  questionId: Id | null; planId: Id | null; contextPacketId: Id | null;
  finalizedResponseId: Id | null;
}
interface FinalizedResponse extends Stored {
  sessionId: Id; turnId: Id; epoch: number; clientResponseId: string;
  replyToQuestionId: Id | null; text: string; audio: ArtifactRef | null;
  transcriptVersion: Version; supersedesResponseId: Id | null;
  confidence: Fraction | null; ambiguousSpans: string[];
  committedAt: UTC;
}
interface DeliveryEvent extends Stored {
  sessionId: Id; turnId: Id; epoch: number; outputId: Id; sequence: number;
  questionId: Id | null; reservationId: Id | null; semanticUnitId: Id;
  questionRenderingId: Id | null;
  kind: "prompt" | "hint" | "worked_step" | "answer" | "explanation" | "transition" | "acknowledgment";
  text: string; textSpan: { start: number; end: number } | null;
  audioStartMs: number | null; audioEndMs: number | null;
  stage: "generated" | "queued" | "playback_started" | "played" | "cancelled" | "delivery_unknown";
  confirmedBy: "client_playback_ack" | "adapter_playback_ack" | "none";
  isPartial: boolean; occurredAt: UTC;
}
interface TopicResumeState extends Stored {
  topicId: Id; version: Version; sessionId: Id;
  knowledgeManifestId: Id; personalManifestId: Id | null;
  objectiveVersionIds: Id[]; unfinishedQuestionId: Id | null;
  unfinishedProblem: string | null; learnerReasoning: string[];
  assistance: AssistanceDelivered[]; nextSuggestedStep: string | null;
  recentEvidenceIds: Id[]; activeDiagnosisIds: Id[];
  reservationId: Id | null; // may be released/asked; revalidate before reuse
}
interface SessionOverview {
  examId: Id; activeTopicId: Id | null; objectiveVersionIds: Id[];
  currentDirection: string; profileSnapshotId: Id;
  topicStatePointers: { topicId: Id; stateVersion: Version; resumeStateId: Id | null }[];
}
interface ContextVersion {
  sessionId: Id; sessionEpoch: number; turnId: Id; turnSequence: number;
  knowledgeManifestId: Id; personalManifestId: Id | null;
  profileSnapshotId: Id; topicStateVersions: { topicId: Id; stateVersion: Version }[];
  objectiveVersionIds: Id[]; questionIds: Id[];
}
interface ContextPacket extends Stored {
  version: ContextVersion; overview: SessionOverview;
  activeTopicId: Id; teachingPurpose: TeachingPurpose;
  learnerDeliveryContext: {
    sourceContext: LearnerContextRef;
    preferences: { factId: Id; key: string; value: Json }[];
    currentGoals: string[]; knownUnderstanding: string[];
    uncertaintiesToClarify: string[]; wordingGuidance: string[];
    evidenceIds: Id[];
  }; // bounded selected context; private diagnostic labels/rationales are not student-facing speech
  baseInterpretationIds: Id[]; personalExplanationIds: Id[];
  excerpts: { anchorId: Id; text: string; sourceVersionId: Id; relevanceReason: string }[];
  explanations: { interpretationId: Id; text: string; personal: boolean }[];
  objectives: ObjectiveVersion[];
  nearbyConcepts: { topicId: Id; edgeIds: Id[]; explanation: string; provisional: boolean }[];
  recentDialogue: { turnId: Id; speaker: "student" | "tutor"; text: string; evidenceIds: Id[] }[];
  resumeState: TopicResumeState | null;
  question: SpeakingQuestion | null;
  allowedClaims: GroundedClaim[]; withheldContentRefs: RecordRef[];
  tokenAccounting: { tokenizerId: string; maxInput: number; used: number;
    outputReserve: number; safetyReserve: number; trimmedRefs: RecordRef[] };
  dependencies: Dependency[]; expiresAt: UTC;
}
interface SpeakingQuestion {
  questionId: Id; version: Version; reservationId: Id;
  renderingId: Id; renderingHash: Hash;
  voiceForm: string; choices: { id: string; text: string }[] | null;
  allowedHintIds: Id[]; allowedHintTexts: { hintId: Id; text: string }[];
  answerReveal: string | null;
}
type TeachingPurpose = "explain" | "probe" | "hint" | "independent_practice" | "transfer" |
  "revisit" | "switch" | "clarify" | "acknowledge";
interface TeachingPlan extends Stored {
  forContext: ContextVersion; basedOnEvidenceIds: Id[];
  purpose: TeachingPurpose; topicId: Id; objectiveVersionIds: Id[];
  rationale: string; diagnosisAlternatives: string[];
  retrievalRequests: RetrievalNeed[];
  questionAction: { kind: "none" | "select_ready" | "request_custom" | "continue_current";
    questionId: Id | null; customTarget: string | null; intendedDifficulty: string | null };
  allowedMicroturns: ("acknowledge" | "repeat_prompt" | "clarify_audio" | "deliver_authorized_content")[];
  forbiddenReveals: string[]; expiresAt: UTC;
  status: "candidate" | "active" | "consumed" | "expired" | "superseded";
}
interface RetrievalNeed {
  topicIds: Id[]; objectiveVersionIds: Id[]; anchorIds: Id[];
  query: string | null; relationTypes: string[]; reason: string; maxTokens: number;
}
```

`ContextPacket`, `TeachingPlan`, and `TopicResumeState` are persisted audit artifacts; their runtime delivery payloads may be compact subsets, but exact serialized inputs must be recoverable under retention policy. They are not replacements for canonical entities. A packet contains one active focus unless its purpose explicitly requires a bounded cross-topic comparison. The overview may retain multiple goals/objectives.

Save a topic resume record when switching away or disconnecting: unfinished problem, actual learner reasoning, delivered hints, current question, evidence, and next step. Restore it when returning; revalidate source/objective/question compatibility and explain a natural transition. Do not erase the previous topic's work or grade its pending answer against the new topic. Disconnection changes the session epoch, saves state, and cancels streaming output. Reconnection recovers durable state; it does not replay unacknowledged tutoring audio as though it had already been delivered.

## 5. Service and provider contracts

All worker/provider contracts take `WorkIdentity`; idempotency keys identify a logical operation, while attempts get separate audit IDs. Required context is explicit below. Every provider returns structured validated data wrapped in `CallResult<T>`. A malformed provider response is a failed attempt, never an implicit empty success. Adapters do not write directly to database projections, publish manifests, or control ownership. Services validate and commit results.

### 5.1 Extraction, interpretation, graph building, and checking

```ts
interface ExtractRequest {
  work: WorkIdentity; sourceVersion: SourceVersion;
  originalAccess: ArtifactRef; capabilityProfileVersion: string;
  strategy: "deterministic" | "ocr" | "model_assisted";
  unresolvedAnchorIds: Id[]; priorExtractionId: Id | null;
}
interface ExtractOutput {
  artifact: ExtractionArtifact; anchors: SourceAnchor[];
  escalation: { anchorIds: Id[]; requiredCapability: string; reason: string }[];
}
interface InterpretationRequest {
  mode: "segment" | "source_merge" | "graph_refinement";
  segmentInterpretations: BaseInterpretation[]; // bounded inputs for source_merge; empty for a first segment
  work: WorkIdentity; sourceVersionId: Id; extraction: ExtractionArtifact;
  sourceEvidence: { anchor: SourceAnchor; excerpt: string }[];
  priorInterpretation: BaseInterpretation | null;
  segments: SourceSegment[]; declaredCoverage: CoverageEntry;
  relatedSegmentSummaries: { interpretationId: Id; coveredSegmentIds: Id[]; text: string }[];
  graphContext: { manifestId: Id | null; topics: TopicVersion[]; edges: GraphEdge[]; objectives: ObjectiveVersion[] };
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  selectedTopicStates: LearnerTopicState[];
}
interface InterpretationOutput {
  base: BaseInterpretation;
  proposedPersonalExplanations: PersonalExplanation[];
  proposedConnections: { fromConcept: string; toConcept: string; evidence: EvidenceRef[];
    support: "grounded" | "provisional"; reason: string }[];
  unresolvedQuestions: string[];
}
interface GraphBuildRequest {
  mode: "partition" | "merge_partitions" | "finalize_graph";
  work: WorkIdentity; parentManifest: KnowledgeManifest | null;
  interpretations: BaseInterpretation[]; sourceEvidence: TopicEvidenceLink[];
  synthesisPartitions: SynthesisPartition[]; declaredCoverage: CoverageEntry[];
  existingTopics: TopicVersion[]; existingObjectives: ObjectiveVersion[]; existingEdges: GraphEdge[];
  examInstructions: string | null; explicitScopeEvidence: EvidenceRef[];
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  selectedTopicStates: LearnerTopicState[];
}
interface GraphPatch {
  topics: TopicVersion[]; objectives: ObjectiveVersion[]; edges: GraphEdge[];
  evidenceLinks: TopicEvidenceLink[]; retiredTopicIds: Id[]; removedEdgeIds: Id[];
  migrations: TopicMigration[];
  affectedInterpretationIds: Id[]; reasons: string[];
}
interface GraphBuildOutput {
  patch: GraphPatch; producedPartitions: SynthesisPartition[]; coverage: CoverageEntry[];
  noChangeReason: string | null;
}
interface ValidateRequest {
  work: WorkIdentity; responsibility: ValidationResponsibility;
  candidate: RecordRef; candidatePayload: Json;
  originalEvidence: { anchor: SourceAnchor; excerpt: string | null; artifact: ArtifactRef }[];
  manifestId: Id | null; objectiveVersions: ObjectiveVersion[];
  learnerContext: LearnerContextRef | null; selectedProfileFacts: ProfileFact[];
  policyVersion: string;
}
interface ValidateOutput {
  report: ValidationReport;
  repairInstructions: { target: RecordRef; instruction: string; evidence: EvidenceRef[] }[];
}
interface Extractor { extract(input: ExtractRequest): Promise<CallResult<ExtractOutput>>; }
interface Interpreter { interpret(input: InterpretationRequest): Promise<CallResult<InterpretationOutput>>; }
interface GraphBuilder { buildOrPatch(input: GraphBuildRequest): Promise<CallResult<GraphBuildOutput>>; }
interface Validator { validate(input: ValidateRequest): Promise<CallResult<ValidateOutput>>; }
```

Extraction outputs are candidates until schema/source checks pass. Source-fidelity validation compares L1/claims with anchored original evidence, including uncertain math/diagram regions. Math/reasoning validation checks derivations and examples rather than merely restating a conclusion. Analogy validation checks whether a simplification teaches a false relationship or hides an assumption. Graph integrity uses deterministic checks for reference closure, hierarchy cycles, and objective links, plus reasoning checks for unsupported connections. Question validation checks whether the prompt is answerable as spoken from available knowledge and whether its rubric accepts equivalent correct answers.

Multiple checkers means explicit responsibilities and reports. They may use deterministic tools, the same model, or different models suited to the task. Agreement is not proof. A checker must point to evidence, a derivation, or a concrete unresolved issue. Unsupported generated connections are provisional and labeled accordingly; they cannot be laundered into source facts by later iterations.

### 5.2 Learner assessment and active personal revision

```ts
interface LocalAssessRequest {
  work: WorkIdentity; interaction: InteractionEvidence; question: QuestionRecord;
  rubric: RubricVersion; objectives: ObjectiveVersion[];
  sourceEvidence: { anchor: SourceAnchor; excerpt: string }[];
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  policy: AssessmentPolicy;
}
interface LocalAssessOutput { assessment: LocalAnswerAssessment; }
interface AssessRequest {
  work: WorkIdentity; topicId: Id;
  localAssessments: LocalAnswerAssessment[]; relevantInteractions: InteractionEvidence[];
  rubricVersions: RubricVersion[];
  objectives: ObjectiveVersion[]; priorProjection: MasteryProjection;
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  relevantPriorEvidence: InteractionEvidence[]; diagnoses: Diagnosis[];
  policy: AssessmentPolicy;
}
interface AssessOutput {
  assessment: LearnerAssessment;
  profileChanges: { upsert: ProfileFact[]; retractFactIds: Id[]; reason: string };
  topicDiagnosisChanges: Diagnosis[];
  semanticChange: { eligible: boolean; reason: string; kinds: LearnerChange["kind"][]; affectedTopicIds: Id[] };
  nextDiagnosticSuggestion: string | null;
}
interface PersonalRevisionRequest {
  work: WorkIdentity; changes: LearnerChange[];
  knowledge: KnowledgeManifest; priorPersonal: PersonalManifest | null;
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  selectedTopicStates: LearnerTopicState[]; triggeringEvidence: (InteractionEvidence | FeedbackEvidence)[];
  affectedBaseInterpretations: BaseInterpretation[];
  priorExplanations: PersonalExplanation[]; priorPersonalEdges: PersonalMapEdge[];
  nearbyTopics: TopicVersion[]; nearbyEdges: GraphEdge[];
  originalEvidence: { anchor: SourceAnchor; excerpt: string }[];
}
interface PersonalRevisionOutput {
  decision: PersonalRevisionDecision;
  explanations: PersonalExplanation[]; mapEdges: PersonalMapEdge[];
  removedExplanationIds: Id[]; removedPersonalEdgeIds: Id[];
  emphasis: PersonalTopicEmphasis[];
  // arrays may be empty for a recorded noop; reasons/evidence remain required
}
interface LocalAnswerAssessor { assessAnswer(input: LocalAssessRequest): Promise<CallResult<LocalAssessOutput>>; }
interface LearnerAssessor { assess(input: AssessRequest): Promise<CallResult<AssessOutput>>; }
interface PersonalReviser { reconsider(input: PersonalRevisionRequest): Promise<CallResult<PersonalRevisionOutput>>; }
```

Assessment has two explicit stages, which may share a provider but must remain separately stored and testable. `LocalAnswerAssessor` judges the actual question/response against its versioned rubric and actual assistance. Its request contains no historical mastery estimate; profile is available for interpreting notation or accessibility context but cannot alter correctness. It emits criterion/objective/capability findings, not a new overall mastery score. `LearnerAssessor` is the broader history estimator: it receives those findings, relevant prior evidence, diagnoses, and the prior projection for one topic, then proposes a versioned mastery estimate and learner-state changes. It cannot treat context-only objectives as assessed or average equal credit across all linked topics. One multi-objective question can produce findings for several topics, but each topic estimator receives only attributable findings plus explicitly justified dependencies.

The assessment service first builds evidence from delivery/response ledgers. The model cannot declare an undelivered hint played, choose a different question, or alter scope/versions. For ordinary explanation turns without an assessment objective, record useful learner evidence and diagnoses without forcing a numeric score. Feedback may update profile and queue personalization without an answer assessment. Apply profile/state/projection changes and their outbox events in one transaction. On concurrent assessments, the later commit must reassess against the latest projection or append evidence for a serialized topic worker; never overwrite a newer estimate using a stale prior projection.

Personal revision candidates pass personalization-grounding, source/math, and graph checks appropriate to changed content. A personal edge may change study emphasis, but cannot fabricate a prerequisite or delete contradictory source evidence. Per-change decisions remain queryable after coalescing. A failure or timeout leaves changes pending/retryable or explicitly needs-review; it is not a semantic no-op.

### 5.3 Planning and context building

```ts
interface PlanRequest {
  work: WorkIdentity; contextVersion: ContextVersion;
  userRequest: string | null; finalizedResponse: FinalizedResponse | null;
  lastDeliveredEvidence: InteractionEvidence[]; feedback: FeedbackEvidence[];
  learnerContext: LearnerContextRef; selectedProfileFacts: ProfileFact[];
  selectedTopicStates: LearnerTopicState[];
  overview: SessionOverview; objectives: ObjectiveVersion[];
  resumeState: TopicResumeState | null;
  knowledgeManifest: KnowledgeManifest; personalManifest: PersonalManifest | null;
  relevantInterpretations: BaseInterpretation[]; relevantPersonalExplanations: PersonalExplanation[];
  availableQuestions: { questionId: Id; topicId: Id; intendedDifficulty: string; objectiveVersionIds: Id[];
    exposed: boolean; dependencyCompatible: boolean }[];
}
interface PlanOutput { plan: TeachingPlan; needsMoreEvidence: RetrievalNeed[]; }
interface BuildContextRequest {
  work: WorkIdentity; expectedContext: ContextVersion; plan: TeachingPlan;
  overview: SessionOverview; learnerContext: LearnerContextRef;
  selectedProfileFacts: ProfileFact[]; resumeStateId: Id | null;
  reservationId: Id | null; retrieval: RetrievalNeed[];
  budget: ContextBudget;
}
interface ContextBudget {
  modelContextTokens: number; systemAndToolReserve: number;
  maxOutputTokens: number; safetyReserveTokens: number;
  maxRetrievedTokens: number; maxRecentDialogueTokens: number;
  tokenizerId: string; maxGraphHops: number;
}
interface BuildContextOutput { packet: ContextPacket; unmetNeeds: RetrievalNeed[]; }
interface Planner { plan(input: PlanRequest): Promise<CallResult<PlanOutput>>; }
interface ContextBuilder { build(input: BuildContextRequest): Promise<CallResult<BuildContextOutput>>; }
```

Planning is meaningful reasoning over actual student evidence and material. Do not replace it with a fixed “score below X → easier, above X → harder” script. The reasoner selects a purpose and gives a short inspectable rationale, such as distinguishing notation uncertainty from lack of projection understanding. It may revisit a prerequisite, explain, probe, request practice, switch topics, or ask the student to clarify. Rationale fields request decision summaries, not hidden chain-of-thought transcripts.

Context construction resolves anchors and graph neighbors under the pinned manifest, then searches source/interpretation indices scoped to that manifest. Prefer relevant current-task evidence over similarity alone. Retrieve personal explanations alongside their grounded bases. Populate `learnerDeliveryContext` with bounded relevant explicit delivery preferences, goals, and carefully worded summaries of demonstrated understanding/uncertainty. The speaking role receives this payload through `SpeakRequest.packet`; retaining profile IDs alone is insufficient. Internal diagnostic hypotheses are not disclosed as facts about the learner, and the packet must not expose withheld answer keys through these summaries. The packet must identify unsupported/provisional relationships. Do not load every source or the entire learner history.

Compute `availableInput = modelContextTokens - systemAndToolReserve - maxOutputTokens - safetyReserveTokens`. All values must be nonnegative and measured with the configured provider tokenizer or a conservative adapter estimate. Budget priorities are: required system/ownership/provenance instructions; current task/question and delivered assistance; local objectives and essential grounded evidence; relevant profile and resume state; personal/base explanations; nearby concepts; recent dialogue; older chat. Trim/summarize expendable old chat first. Essential current question/rubric support cannot be silently truncated: return a budget error and produce a smaller plan or clarification. Summaries retain source/evidence IDs and uncertainty. Store what was trimmed and actual token counts. Answer/rubric content is selectively withheld from the speaking role while remaining available to the assessor/planner.

### 5.4 Speaking and transport adapters

```ts
interface SpeakRequest {
  work: WorkIdentity; sessionEpoch: number; outputId: Id;
  plan: TeachingPlan; packet: ContextPacket;
  deliveryConstraints: { allowedHintIds: Id[]; mayRevealAnswer: boolean; maxUtteranceMs: number };
}
interface VoiceInputEvent {
  sessionId: Id; turnId: Id | null; epoch: number; clientEventId: string; clientSequence: number;
  type: "asr_partial" | "asr_final" | "barge_in" | "playback_ack" | "disconnect";
  responseId: string | null; text: string | null;
  replyToQuestionId: Id | null; confidence: Fraction | null; ambiguousSpans: string[];
  outputId: Id | null; semanticUnitId: Id | null;
  playedThroughMs: number | null; occurredAt: UTC;
}
interface VoiceOutputEvent {
  sessionId: Id; epoch: number; outputId: Id; eventId: Id; sequence: number;
  type: "semantic_unit" | "audio_chunk" | "complete" | "cancel_ack" | "error";
  semanticUnitId: Id | null;
  semanticKind: DeliveryEvent["kind"] | null;
  questionId: Id | null; hintId: Id | null; questionRenderingId: Id | null;
  text: string | null; audio: ArtifactRef | null;
  audioStartMs: number | null; audioEndMs: number | null;
  error: StructuredError | null;
}
interface VoiceAdapter {
  speak(input: SpeakRequest, emit: (event: VoiceOutputEvent) => Promise<void>): Promise<CallResult<{ outputId: Id }>>;
  cancel(input: { sessionId: Id; epoch: number; outputId: Id; reason: string }): Promise<void>;
  normalizeInput(raw: Json): Promise<VoiceInputEvent>;
}
```

The adapter contract is vendor-neutral. It may integrate ASR + a speaking model + TTS or a realtime multimodal API. A mock must emit deterministic semantic units/audio acknowledgments and support delayed cancellation. It must distinguish generated, queued, and actually played output. Playback acknowledgment from the client or a transport with reliable playback semantics records what was rendered/played, not proof that the learner heard or understood it; “sent to the socket” is not playback. Store acknowledged segments as delivered, partially delivered, interrupted, or delivery-unknown. If the learner disputes hearing an acknowledged hint, preserve both the transport fact and the reported uncertainty rather than asserting cognitive exposure. If only chunk-level playback is available, mark the finest known span and uncertainty. Unknown mid-chunk exposure must be conservative for assisted/independent assessment.

The authenticated client sends normalized `VoiceInputEvent` messages over `POST /v1/sessions/{sessionId}/voice-events` or an equivalent authenticated bidirectional WebSocket bound to that session. Provider callbacks enter through `/v1/voice/callbacks/{adapter}` with verified provider/session authentication, then normalize to the same coordinator event path. Neither a callback nor a client may supply a different owner. Validate the route session, transport-bound session, event session, active/known turn, output, semantic unit, question, and sender capability before accepting an event. Client playback acknowledgments may confirm only output sent to that session. Provider generation-complete callbacks cannot assert client playback unless the adapter explicitly guarantees playback semantics.

Deduplicate by session and `clientEventId`; enforce monotonic sequence with a bounded reordering window and resynchronization on gaps. Contradictory reuse of an event ID is a conflict. ASR-final requires a non-null response ID and turn ID and maps to the same idempotent response-commit path as `/responses`; partials never do. Current-epoch control events can mutate active session state. Historical-epoch playback receipts can append facts about known old output, and a historically attributable finalized response can be committed under §7.2, but neither can reactivate old output or overwrite the active topic. Disconnect events save state and advance the epoch. Store transport receipt time separately from sender timestamp; do not trust client time for ordering or authorization.

The speaking role follows purpose, grounded packet, allowed hints, and disclosure bounds. It can provide acknowledgments, repeat an active prompt, clarify audio, and deliver authorized explanation without waiting for a new Astra call for every chunk. It can request a custom question or replanning through the coordinator, but it does not fabricate a validated question or update mastery. Any new diagnostic/teaching direction outside the current plan requires a fresh plan. The fast model's fluent improvisation is not a substitute for grounding.

### 5.5 Hopper and custom question generation

```ts
interface GenerateQuestionRequest {
  work: WorkIdentity; origin: QuestionRecord["origin"];
  generationRequestId: Id; topic: TopicVersion; objectives: ObjectiveVersion[];
  intendedDifficulty: QuestionRecord["intendedDifficulty"]; narrowTarget: string | null;
  knowledgeManifest: KnowledgeManifest; personalManifest: PersonalManifest | null;
  interpretations: BaseInterpretation[]; personalExplanations: PersonalExplanation[];
  sourceEvidence: { anchor: SourceAnchor; excerpt: string }[];
  learnerContext: LearnerContextRef | null; selectedProfileFacts: ProfileFact[];
  exposureFamilies: Id[]; exposureNotes: string[];
  rubricPolicyVersion: string;
}
interface GenerateQuestionOutput { question: QuestionRecord; rubric: RubricVersion; }
interface QuestionGenerator { generate(input: GenerateQuestionRequest): Promise<CallResult<GenerateQuestionOutput>>; }
interface ReserveQuestionRequest {
  work: WorkIdentity; sessionId: Id; epoch: number; turnId: Id;
  compatibleKnowledgeManifestId: Id; topicId: Id; objectiveVersionIds: Id[];
  preferredQuestionId: Id | null; purpose: TeachingPurpose;
  allowExposedForRevisit: boolean; revisitReason: string | null;
}
interface ReserveQuestionOutput { question: QuestionRecord; reservation: QuestionReservation; }
```

The generator returns a candidate in `validating`, never a ready item by assertion. The question service runs validators, confirms current dependencies, persists the rubric, and atomically makes it ready. Selection filters exposure, compatibility, scope, and desired objectives before reservation. A custom request may complete after a topic switch; keep the validated question under its original target/dependencies if still useful, but do not inject it into the new topic's turn.

## 6. Ingestion, refinement, publication, and invalidation

Large sources must be segmented before bounded model calls. Create immutable `SourceSegment` records along page/slide/section boundaries with anchor ranges, content hashes, and small declared overlap where context crosses a boundary. Keep every extracted region in the coverage inventory, including tables/formulas and failed regions. Segment work must fit the configured model budget; a limit cannot silently discard the tail of a file. Segment-level interpretations merge into a per-source interpretation with deduplicated claim IDs and preserved anchor/segment provenance.

Cross-source synthesis is also bounded: cluster eligible per-source/segment outputs by candidate concepts, produce `SynthesisPartition` artifacts, and merge partitions in bounded levels. Each partition declares its input interpretations/partitions and exact covered segment IDs; summaries are navigation/index material, while validators/reasoners fetch original evidence for claims. Merge stable topic candidates using grounded definitions and evidence, not title equality alone. Conflicting meanings remain distinct or provisional. Each level's coverage is the union of its declared inputs, never an implied review of omitted material. Stop under the same build call/token/refinement budget; remaining partitions stay pending or needs-review.

A manifest includes source-by-source coverage and is `complete` only if all intended segments have been interpreted and required validations accounted for. A partial publication explicitly records pending/excluded segments and reasons; the graph must not present uncovered material as exhaustively mapped. Upload status reports “partially processed” and per-file outcomes as essential setup information. Questions cannot rely on unreviewed/blocked regions. Retrieval can use only eligible material while coverage completes. Acceptance tests must deliberately exceed one model context and verify every input segment is either covered or explicitly excluded.

Each finalized source creates resumable extraction and interpretation jobs; an exam build tracks required sources and their outcomes. The graph stage runs on successful/eligible source interpretations and explicit scope instructions, with failures visibly accounted for. Stages persist outputs before acknowledging the queue; workers can retry from the last durable artifact.

A build runs initial L1/L2, then initial L3, then at most the configured refinement rounds. In each round:

1. Determine changed concepts/edges/objectives and reverse dependencies to affected L2 records.
2. Reinterpret only those records with graph context and original source access.
3. Validate changed claims and patch affected graph sections.
4. Compare semantic hashes and outstanding issues. Stop when there is no material change or budget is exhausted.

Convergence means no material semantic delta requiring further repair and no blocking validation issue in published content. It does not mean “models agree.” Persist the rounds, reasons, issue disposition, and consumed budget. Budget exhaustion with blocking issues yields needs-review/rejected candidate and leaves the prior pointer intact. Nonblocking provisional connections can publish only with their uncertainty tags and cannot support definitive teaching claims or exam weight.

New files/source replacements invalidate the changed source's extraction and derived interpretations, evidence links, affected graph/objectives, dependent questions, relevant personal overlays, and search index entries. Unaffected artifacts may be reused by reference in the new manifest. Objective changes additionally invalidate dependent rubrics/assessments for future comparisons and require migration semantics. An explicit student preference change does not rerun OCR; a source replacement does not blindly erase learner evidence.

Maintain a dependency index from referenced record/version to dependent artifact/job. Invalidation creates new candidates and marks eligibility; it does not edit historic manifests. A session already tutoring under base `K1` can finish an active valid `K1` question while `K2` builds or publishes. At a safe boundary with no unresolved response to an old question, adopt a compatible `K2/P2` pair, rebuild the packet, and increment session epoch. Preserve old evidence's `K1` references.

If a source correction reveals that an active prompt/answer is materially wrong, cancel its remaining output, mark the question/evidence unsuitable for grading, preserve what happened, and clarify/replan. Do not continue teaching known invalid material merely because it is pinned. For ordinary additions or layout replacements, old pinned content remains available until adoption. Job application checks distinguish compatibility from “latest,” so unchanged historical versions remain auditable and intentionally usable.

Publication race example: build A targets generation 8; source upload starts generation 9 and build B. A finishing later fails `desiredBuildGeneration == 8`, records stale, and cannot replace B. Personal publication likewise requires a compatible base and learner snapshot. A missing artifact or failed validator prevents pointer movement even if every other stage succeeded.

## 7. Live session coordinator and event order

The coordinator is the sole authority for active topic, epoch, question, plan, and delivery attribution. Serialize mutations per session using row locks/CAS and monotonic server event sequence numbers. Serialize mastery projection commits per learner/topic. Provider calls run outside database transactions; their results return through freshness checks.

### 7.1 Normal turn

1. Start/resume pins a consistent published base/personal pair and initializes unknown projections for new topics. Restore relevant profile/topic state and resume record.
2. Receive finalized user request/response with client idempotency key, explicit reply-to question, and epoch. ASR partials may drive captions/listening state but never commit graded evidence.
3. Link the response to the question actually delivered using the session's delivery ledger. Reject or hold conflicting question IDs for clarification. Snapshot actual hints/steps, prompt extent, objective/rubric versions, and transcript certainty.
4. Commit evidence and emit assessment/learner-update work. Record explicit feedback directly when applicable. A response whose meaning depends on uncertain transcription becomes `ambiguous`; ask for clarification before any adverse estimate change.
5. Assemble Astra planning input from relevant current state, actual response/evidence, objectives, and published material. Assessment may run before or alongside planning; a plan produced without its result declares that version and cannot assume an assessment already applied.
6. Astra chooses purpose, retrieval needs, and question action. Reserve a compatible ready question or queue custom work as appropriate.
7. Context builder produces a budgeted packet with the plan's exact version tuple. CAS activates it only if the expected session epoch/topic/question/turn remains current.
8. The speaking adapter streams semantic units. The coordinator records generation and playback separately. Client playback acknowledgments update delivery/exposure; the first audible prompt marks a reservation delivered/question asked.
9. Finalized student responses drive the next iteration. Assessment commits append history, update profile/state, and queue mandatory personal revision decisions.

Astra is not a blocking dependency for every audio chunk. While a bounded plan is pending, the fast role may acknowledge, clarify ASR, or repeat authorized material. If planning times out, preserve the current task and ask a grounded clarification or explain within the last valid packet. No new difficult question or invented assessment may be fabricated as a latency workaround.

### 7.2 Epochs, expiration, barge-in, and reconnect

Increment `session.epoch` on barge-in that changes/cancels output, topic switch, reconnect, explicit question abandonment, or content/personal-view adoption. Mark pending plan/output/reservation actions superseded and send cancellation to both generation and playback. Keep already played units; drop queued unplayed units. A cancellation acknowledgment may arrive after extra audio played: reconcile actual playback timestamps/offsets into the ledger rather than assuming cancellation was instantaneous.

Plans have expiration timestamps plus exact context versions. Before plan activation, context activation, reservation presentation, and each outbound semantic unit, check epoch and output authorization. Late model output after cancellation is stored as stale if useful for audit and never played. A plan cannot become valid again just because the student later returns to the same topic; it requires a new freshness check and plan identity.

A finalized response captured during barge-in belongs to the interrupted question if its explicit reply-to and the delivered ledger establish that relationship. Do not discard it solely because its capture epoch precedes the newly incremented epoch. Commit it as an answer to the historical delivered question or request clarification; never reassign it automatically to a newer question. The session response endpoint returns the attribution used.

On topic switch, persist the old resume state before setting the new topic. Release an undelivered reservation only when safe. Preserve an asked question and its partial work for later resumption. A late old-topic assessment may update that topic's projection/history using the correct evidence and current projection CAS; it cannot switch the active topic. A late planner result is ignored for active playback. A late custom question can enter the appropriate pool if dependencies remain useful.

Reconnect requests include the last acknowledged server sequence and a client request ID. Return durable session state and missed control/state events. Do not replay speech automatically. Duplicate playback acknowledgments and finalized response IDs are idempotent. If playback extent is unknown after a connection loss, record uncertainty and ask/restate as needed before claiming independent practice. Audio bytes may be short-lived, but question text, delivered semantic content, and evidence versions must remain available for the retention period.

### 7.3 Assistance and grading race example

A plan contains hints H1 and H2. H1 has played; H2 was generated and queued. The student interrupts with a correct answer before H2 plays. The assessment evidence contains H1 as delivered, H2 as unplayed, and the exact question/rubric version. The answer is assisted by H1, not by H2. If only the first phrase of H1 played, store that phrase/range and mark extent partial. If playback cannot establish whether H1 was delivered, record uncertainty and do not treat the answer as clean independent evidence.

## 8. Durable jobs, events, idempotency, and ownership

```ts
type JobType = "extract_source" | "interpret_source" | "build_graph" | "validate_candidate" |
  "refine_knowledge" | "publish_knowledge" | "assess_answer" | "assess_response" | "update_learner" |
  "refresh_exam_profile" | "reconsider_personal" | "publish_personal" | "refill_question" | "generate_custom_question" |
  "plan_turn" | "build_context" | "invalidate_dependencies" | "delete_exam";
interface DurableJob extends MutableStored {
  type: JobType; idempotencyKey: string; inputHash: Hash;
  payload: Json; dependencies: Dependency[];
  expectedDeletionGeneration: number;
  state: "queued" | "running" | "retry_wait" | "succeeded" | "stale" | "cancelled" | "needs_review" | "dead_letter";
  priority: number; attempt: number; maxAttempts: number;
  availableAt: UTC; leaseOwner: string | null; leaseExpiresAt: UTC | null;
  checkpoint: Json | null; resultRefs: RecordRef[]; lastError: StructuredError | null;
}
interface DomainEvent extends Stored {
  eventType: string; aggregateType: string; aggregateId: Id;
  aggregateVersion: Version; sequence: number; causationId: Id | null; correlationId: Id;
  idempotencyKey: string; payload: Json;
}
interface OutboxRow extends MutableStored {
  event: DomainEvent; state: "pending" | "sent"; attempt: number; nextAttemptAt: UTC;
}
interface RevisionBuild extends MutableStored {
  kind: "knowledge" | "personal"; generation: number;
  parentManifestId: Id | null; targetManifestId: Id | null;
  sourceVersionIds: Id[]; learnerChangeIds: Id[];
  coverage: CoverageEntry[]; pendingSynthesisPartitionIds: Id[];
  state: "queued" | "building" | "validating" | "publishing" | "published" | "needs_review" | "failed" | "stale";
  round: number; budget: WorkBudget; consumedCalls: number;
  changedRefs: RecordRef[]; issues: Issue[];
}
```

Required events and minimum payloads:

| Event | Required payload | Primary consumer |
|---|---|---|
| `source.finalized` | sourceVersionId, exam generation, capability profile | extraction/build coordinator |
| `source.extraction_completed` | extractionArtifactId, anchor IDs, disposition | interpretation coordinator |
| `knowledge.candidate_changed` | buildId, changed refs, round | validators/refinement |
| `knowledge.published` | old/new manifest IDs, migration IDs, changed dependency refs | retrieval index, personal rebase, hopper, sessions |
| `response.finalized` | responseId, turnId, attributed questionId, evidenceId | assessment/planner |
| `delivery.confirmed` | deliveryEventId, outputId, semantic unit, extent, questionId | reservation/exposure/evidence |
| `learner.changed` | changeId, prior/new context, evidence, affected topics | personal revision coordinator |
| `personal.decided` | decisionId, changeIds, disposition/reason | completion tracking |
| `personal.published` | old/new personal manifest, base ID, affected topics | context/session adoption |
| `question.reserved` / `question.asked` / `question.invalidated` | questionId, reservationId if applicable, topic/slot/version | refill scheduler |
| `session.epoch_changed` | sessionId, old/new epoch, reason, cancelled output IDs | voice cancellation/planning |
| `exam.deleted` | examId, deletion generation | all workers/index/storage cleanup |

Event payloads are validated by event-type-specific schemas; `Json` is not permission to omit the listed fields. Outbox writes share the transaction with the state change. Consumers keep `(consumerName,eventId)` receipts; at-least-once delivery cannot double-create evidence, mastery points, reservations, or publications. Unique keys include tenant/learner/exam plus operation identity. A reused idempotency key with a different input hash returns a conflict, not the prior result as though inputs matched.

A worker claims a job with a lease, checkpoints durable output, commits final state/outbox, then acknowledges. Retry transient timeouts/rate limits with exponential backoff and jitter up to the attempt and total-work budget. Do not retry unsupported formats or deterministic validation failures without new input/repair. Exhausted jobs become dead-letter or needs-review, with parent build/source status visible. Lease expiry permits another worker; the original worker cannot commit after losing its lease/CAS. Repeated delivery of a completed job returns existing result references.

Minimum database constraints/indexes:

- Composite scope foreign keys or equivalent enforced checks on every relationship; row-level security may add defense but is not a substitute for application checks.
- Unique source `(sourceFileId, version)`, anchor `(sourceVersionId, extractionArtifactId, anchorKey)`, immutable artifact hashes, and manifest version per exam.
- Unique stable topic identity per exam; one topic version per topic per manifest; parent references resolve within the same manifest.
- One mastery projection per scope/topic; unique projection version and history sequence per topic; unique applied assessment for an evidence set + policy + rubric + correction version.
- Unique finalized `(sessionId, clientResponseId)` and client event IDs; unique output/event sequence; unique active reservation per question.
- Unique logical job idempotency keys; consumer receipts; rowVersion CAS on active session and exam publication pointers.
- A topic state/profile/personal manifest cannot reference another learner's evidence, even within the same tenant.

Ownership filters apply before retrieval candidate selection, graph traversal, blob signing, source access, provider packet construction, and job execution. Never retrieve broadly and rely on the speaking model to filter another student's text. Uploaded text is untrusted data, delimited as source evidence; it cannot change tool access, scope, grading policy, or system instructions. Store provider secrets only in external configuration, never artifacts or prompts.

Deletion marks the exam `deleting`, increments its deletion generation, tombstones its identifiers, cancels queued/running jobs, revokes uploads and source access, and removes active retrieval entries. Every worker checks the generation before external work and before commit; late completion cannot recreate rows or publish. Then remove blobs/derived records according to retention configuration, retaining only a minimal non-content tombstone required for idempotency. A delete endpoint returns asynchronous status. Tenant/learner authorization is enforced for status and deletion too.

## 9. Question supply and personalized material timing

The hopper is independent of conversational progress and cannot dictate the teaching sequence. After initial publication, enqueue fill jobs for eligible active subtopics; cap concurrent work and prioritize topics recently active/explicitly selected without starving the rest. Configure a maximum number of queued fill jobs per exam so a very large graph is processed in bounded batches. A full slot has no periodic generation loop; the scheduler waits for an event or a bounded reconciliation sweep.

A refill first counts READY and generating/validating jobs compatible with its target manifest. Lock the supply row before creating a job to prevent duplicate fill storms. Reserved/asked items trigger refill, but the per-topic total active generation cap still applies. A custom question has a distinct request key and higher priority; it is not blocked behind every background subtopic. Failed custom generation returns a structured status to the planner and retains the last usable teaching plan.

After a personal revision, only profile-dependent questions whose declared facts/diagnoses/overlays changed need invalidation. Generic questions remain usable if their objectives, content, and exposure are compatible. After base publication, retain historical question records for evidence but exclude incompatible ones from new reservations. Compatible unchanged questions can be reused by a checked compatibility mapping; do not rewrite their original manifest/rubric references.

The next conversational turn need not wait for every background revision. It must declare the currently pinned personal view and current learner context. A correction affecting factual correctness triggers immediate clarification and cancellation as needed. Ordinary explanatory adaptation can publish asynchronously; a pending revision must be observable internally and later adopted at the next safe boundary. This is eventual, traceable personalization, not optional retrieval that may never run.

## 10. HTTP and streaming API contracts

These are implementation contracts, not machine-valid OpenAPI. Provide equivalent authenticated routes and a versioned schema; `/v1` is the proposed default. Mutations accept `Idempotency-Key`; session mutations also require expected epoch/rowVersion where stated. Responses include `requestId`, scope-safe IDs, status, and structured errors. Never expose expected answers/rubrics, internal diagnoses, source excerpts, or internal confidence fields in the student topic-list endpoint.

| Method and route | Input | Output and semantics |
|---|---|---|
| `POST /v1/exams` | title, optional instructions/date and initial goals/preferences with applicability | examId, setup status |
| `POST /v1/exams/{examId}/uploads` | array of filename, size, declared MIME, optional replacingSourceFileId | bounded upload URLs/tokens and sourceFileIds; reject capability/size mismatch explicitly |
| `POST /v1/exams/{examId}/uploads/{sourceFileId}/finalize` | uploadToken, checksum, uploadedByteLength | sourceVersionId, build generation, accepted/needs-review/failed status; verify server bytes and MIME |
| `PATCH /v1/exams/{examId}` | title, instructions/date, expectedRowVersion | updated exam; changed scope/objectives enqueue selective rebuild and migration checks |
| `POST /v1/exams/{examId}/sources/{sourceFileId}/retry` | expected source version, optional supported extraction strategy | retry job/status; preserves failed attempt and original source |
| `POST /v1/exams/{examId}/feedback` | text, type, topicIds (possibly empty), preference applicability (`exam` default, or explicit `learner`) | feedback/profile change; supports setup preferences before a session |
| `GET /v1/exams/{examId}/status` | none | exam status, per-file processing outcome, actionable short errors, published version and pending-build indicator |
| `GET /v1/exams/{examId}/topics` | optional conditional ETag | minimal topic projection below |
| `POST /v1/exams/{examId}/sessions` | optional topicId, clientSessionRequestId | sessionId, epoch, pinned view IDs, minimal current-topic state, voice transport configuration without secrets |
| `POST /v1/sessions/{sessionId}/responses` | finalized response contract below | responseId, attributed questionId, evidence status, server sequence; async assessment/planning status |
| `POST /v1/sessions/{sessionId}/topic` | topicId, expectedEpoch, expectedRowVersion | new epoch, restored/current topic, transition event |
| `POST /v1/sessions/{sessionId}/feedback` | text, type, topicIds, optional correctionOfResponseId, expectedEpoch | feedbackId, learnerChangeId or explicit duplicate/exclusion reason, revision status |
| `POST /v1/sessions/{sessionId}/interrupt` | outputId, clientEventId, expectedEpoch, played-through position if known | new epoch, cancellation acknowledgment, retained question attribution |
| `POST /v1/sessions/{sessionId}/resume` | clientResumeId, lastAcknowledgedServerSequence | new epoch, durable active state, missed state/control events; no automatic audio replay |
| `POST /v1/sessions/{sessionId}/end` | expectedEpoch | saved resume state, ended status |
| `POST /v1/sessions/{sessionId}/voice-events` | bounded batch of VoiceInputEvent, transport sequence | accepted/deduplicated receipts, last accepted sequence, epoch; ordinary playback/ASR/disconnect ingress |
| `POST /v1/voice/callbacks/{adapter}` | authenticated provider payload bound to session/output | normalized receipt/status; same ownership, version, and attribution validation |
| `GET /v1/sessions/{sessionId}/events` | cursor | authenticated SSE/WebSocket control events, monotonically sequenced; transport may also carry audio |
| `DELETE /v1/exams/{examId}` | expectedRowVersion | accepted deletionId/status; prevents subsequent use immediately |

```ts
interface StudentTopicProjection {
  examId: Id; knowledgeVersion: Version | null; personalVersion: Version | null;
  topics: {
    id: Id; parentId: Id | null; title: string;
    mastery: { status: "unknown" | "estimated"; displayIndex: DisplayIndex | null;
      label: "Not assessed" | "Emerging" | "Developing" | "Secure";
      updatedAt: UTC | null };
  }[];
}
interface SubmitResponseBody {
  clientResponseId: string; captureEpoch: number; turnId: Id;
  replyToQuestionId: Id | null; text: string;
  finalized: true; transcriptVersion: Version;
  confidence: Fraction | null; ambiguousSpans: string[];
  audioArtifactId: Id | null; supersedesResponseId: Id | null;
}
```

A topic-list label/display mapping is controlled by the versioned assessment policy; use `Not assessed` for unknown. The chosen UI may show a label, numeric index, or both, but must not present the index as a true probability or expose detailed internal uncertainty/history. The list's hierarchy and current mastery are sufficient. Essential upload/test status is allowed; do not create new student flows for internal review machinery.

Authenticated internal/admin APIs must support: anchored original/artifact retrieval; build/job/revision status; profile and personal-decision provenance; full assessment/history by topic including supersession/comparability; question validation/exposure/reservations; session delivery/context traces. Keep these separate from student routes and authorized by an explicit admin/debug role. These interfaces enable testing and internal plots; a student diagnostic dashboard is not part of v1.

Example response commit (synthetic):

```json
{
  "clientResponseId": "syn_client_response_7",
  "captureEpoch": 4,
  "turnId": "syn_turn_7",
  "replyToQuestionId": "syn_question_qr_notation",
  "text": "q one transpose a two is their dot product, the coefficient along q one.",
  "finalized": true,
  "transcriptVersion": 1,
  "confidence": null,
  "ambiguousSpans": [],
  "audioArtifactId": null,
  "supersedesResponseId": null
}
```

Example asynchronous event (synthetic; identifiers are not provider credentials):

```json
{
  "id": "syn_event_personal_3",
  "scope": { "tenantId": "syn_tenant", "learnerId": "syn_learner", "examId": "syn_exam" },
  "createdAt": "2026-10-04T19:00:05Z",
  "eventType": "personal.published",
  "aggregateType": "exam_personal_view",
  "aggregateId": "syn_exam",
  "aggregateVersion": 3,
  "sequence": 41,
  "causationId": "syn_change_notation",
  "correlationId": "syn_turn_7",
  "idempotencyKey": "syn_publish_personal_3",
  "payload": {
    "oldPersonalManifestId": "syn_p2",
    "newPersonalManifestId": "syn_p3",
    "knowledgeManifestId": "syn_k1",
    "affectedTopicIds": ["syn_topic_qr"]
  }
}
```

Errors use appropriate HTTP status: 400 invalid input; 401/403 unauthenticated/unauthorized; 404 for inaccessible resource where enumeration must be avoided; 409 idempotency/version/epoch conflict; 413 size bound; 415 unsupported MIME; 422 unresolved semantic validation; 429 configured rate limit; 503 temporary provider unavailability. Async work accepted with 202 is not completed work. Status endpoints distinguish queued, working, failed, needs-review, and published. Return retry guidance where useful, with no secrets/raw provider error leakage.

## 11. Complete synthetic QR walkthrough

This example demonstrates behavior, not real student data or scientifically calibrated scores.

1. Learner `syn_learner` creates exam `syn_exam` and uploads a linear algebra PDF and slide deck. `syn_source_pdf_v1` page 12 defines projections; `syn_source_slides_v1` slide 8 shows QR. Both are preserved as originals. L1 produces immutable anchors `syn_anchor_projection` and `syn_anchor_qr`. A faint formula region is uncertain and is sent to the formula/OCR adapter; the verified extraction contains the correct `rᵢⱼ = qᵢᵀaⱼ` notation, or remains explicitly unresolved.
2. `interpret_source` receives the current profile: the learner prefers examples first; topic state is initially unknown. It writes source-grounded base explanations of projection, orthonormal columns, and QR assumptions, plus a learner-specific example-first overlay. It does not change the mathematical definition to match a preference.
3. `build_graph` creates stable topic IDs for projections and QR factorization, with concrete objective `syn_obj_qr_v1`: interpret the projection coefficient and use it in a QR step. Both files link to QR and projections where supported. A grounded prerequisite edge links projections to QR. Graph context causes the PDF interpretation to add a source-backed QR connection. Validators pass; manifest `syn_k1` publishes atomically. Personal manifest `syn_p1` references it. QR mastery is unknown.
4. The hopper creates `syn_question_qr_basic` and a challenging application item, validates their answers/rubrics, and marks them ready. The basic prompt asks the learner to explain what `q₁ᵀa₂` means. Session `syn_session` pins `K1/P1`, epoch 1. Astra chooses a diagnostic probe and reserves the basic item. The speaking adapter plays the full prompt; delivery acknowledgment marks it asked and records exposure. Refill starts in the background.
5. The learner says, “I know how to take a projection, but I don't know what that q with the little T means.” The finalized response is attached to that prompt and rubric. No hint had yet played. The assessor records insufficient evidence for overall QR application and a provisional notation diagnosis, with an alternative that projection understanding has not yet been demonstrated. It does not mark all QR knowledge as zero. The explicit correction is retained as feedback; the profile preference remains separate.
6. A meaningful learner-change event queues `reconsider_personal`. Astra inspects `P1`, where an earlier tentative explanation overemphasized teaching projection from scratch. It proposes `P2`: explain transpose/dot-product notation first, connect the notation to the learner's stated projection method, and provisionally deemphasize a full projection remedial detour. The reason cites the response; it does not assert that self-report proves mastery. The personal map receives a notation-to-projection helpful connection. Source/math and personalization checks pass; `P2` publishes. Retrieval on the next safe boundary returns `P2` and its base excerpt under `K1`, and the session advances epoch.
7. Astra requests a custom narrow question within `syn_topic_qr`: “With q one equal to (one, zero) and a two equal to (three, four), what is q one transpose a two, and what does that number represent?” The generator uses `K1/P2`, objectives, relevant profile/state, and exposure history. It validates expected answer “3, the coefficient/component along q one,” with equivalent wordings in rubric `syn_rubric_notation_v1`. No new permanent topic is created.
8. The complete custom prompt is played. The student first asks for a reminder of T. Astra authorizes H1, “Transpose turns that column into a row so their product is a dot product.” H1 plays. H2, a worked numeric step, is generated but has not played. The learner interrupts: “It is three, the amount along q one.” Epoch advances; H2 is canceled. The evidence ledger records H1 as delivered and H2 as unplayed. The answer is correct with help. The assessment can update notation explanation/application evidence but cannot claim clean independent mastery or novel transfer.
9. The assessor appends `syn_assessment_qr_1` and a history point, e.g. illustrative display index 42 with high uncertainty under policy `v1_engineering`. A later independent, validated application question may produce 58; later delayed evidence can lower it to 47. These example numbers are not probabilities or required scoring thresholds. The new evidence queues another personal revision. If `P2` already captures the needed explanation, Astra records an explicit no-op with cited evidence. It does not silently skip scheduling.
10. The learner switches to eigenvalues. The coordinator saves the QR question, learner reasoning, H1 delivery, active diagnoses, and next suggested independent step. On returning, it restores QR work and says a natural transition such as “We had connected the transpose notation to a dot product; let's try the next step without a hint.” It chooses an appropriate compatible question and does not replay the taught answer as novel transfer.
11. A corrected source version publishes `K2` while the session is active. A normal compatible addition waits for a safe boundary; the old question remains tied to `K1`. If the correction invalidates the prompt's math, cancel it and mark its assessment unsuitable instead. `K2` and a compatible personal view are adopted together, with all evidence/history retained under their original versions.

## 12. Configuration, observability, and failure behavior

Proposed defaults below make the mock implementation deterministic. Every value is configurable, versioned, and surfaced in internal traces. They are initial engineering limits, not measured SLOs or validated pedagogical thresholds.

| Configuration | Proposed v1 default | Required behavior |
|---|---:|---|
| refinement rounds per knowledge build | 2 after initial graph | stop with explicit disposition; never loop indefinitely |
| personal revision attempts per batch | 3 total attempts | reasoned decision or needs-review/dead-letter; retain changes |
| provider retries per ordinary job | 3 total attempts | bounded exponential backoff + jitter; obey global budget |
| personalization coalescing window | 2 seconds, at most 20 changes | urgent correction can bypass delay; no lost events |
| planner soft/hard wait | 1.5 / 5 seconds | at soft bound allow authorized microturn; at hard bound fallback and invalidate late active result |
| custom-question wait budget in live turn | 3 seconds | continue appropriate existing teaching; generation may finish in background |
| plan lifetime | 20 seconds maximum | shorter on version change/interruption; freshness checks still required |
| question reservation lease | 60 seconds | release only if undelivered and compatible; extend explicitly while active |
| READY supply | 1 basic + 1 challenging per active subtopic | bounded pool and in-flight generation |
| in-flight generic generation per subtopic | 2 | do not create duplicate fill work |
| queued generic jobs per exam | 100 | refill in batches; custom/active topic priority |
| total ready/reserved generic items per subtopic | 4 | avoids reservation churn growing the pool |
| retrieval graph hops | 1, extend to 2 only for explicit need | preserve token budget and relevance |
| context size | adapter-configured, no universal token limit | count input + output/system/safety reserves |
| provider input safety reserve | max(512 tokens, 5% of context limit) | reject impossible budgets; do not silently truncate essentials |
| background reconciliation | every 60 seconds | repair missed scheduling using durable state; no continuous full-pool generation |
| upload/parser limits | capability-specific required config | refuse startup of an enabled parser without explicit bounds |
| original/evidence retention | required deployment config | preserve audit references while retained; deletion semantics take precedence |

Collect operation/correlation IDs across upload, source extraction, interpretation, graph, validators, publication, learner changes, personal decisions, planning, delivery, assessment, and question generation. Log durations, queue latency, retry counts, stale-result drops, token/cost usage when available, candidate issues, manifest hashes, no-op reasons, revision coverage, reserved/ready supply, delivery uncertainty, and assessment fallback rates. Redact sensitive content from ordinary logs; authorized audit records carry necessary content references.

Track measured p50/p95 planning, first playable output, custom-question wait, upload-to-publish, and learner-change-to-personal-publication latency. Define deployment SLOs after measurement; do not claim these example budgets are achieved. Alert internally on eligible learner changes without a terminal decision, sources stuck without a state, publishing failures, cross-version context mismatches, and failed cancellation/playback reconciliation.

Provider failure behavior must be specific: extraction failure exposes source status; interpretation failure retains prior knowledge; validation failure prevents eligibility; planner failure uses bounded safe microturn/clarification; assessor failure preserves previous/unknown mastery; personal revision failure retains the pinned overlay and pending issue; question failure leaves the tutor free to explain/use another validated item. No subsystem may convert an unavailable provider into fabricated successful content.

## 13. Acceptance scenarios

Implement these as integration scenarios using deterministic synthetic adapters plus database/queue/storage behavior. They are behavioral acceptance requirements, not merely unit tests mirroring implementation details. Test real concurrency and retry boundaries where specified.

### A01 — Heterogeneous batch and many-to-many grounding

Given an exam with a PDF, slides, and text notes containing overlapping projection/QR material, when finalized and processed, then originals remain retrievable internally, L1 preserves page/slide anchors, L2 contains explanations/assumptions/examples beyond summaries, and one QR topic has evidence from multiple files while one source supports multiple topics. The initial interpreter receives known profile context, or an explicit empty profile. A failed member of the batch remains visible in status. Use inputs larger than a single context: anchored segment coverage and bounded synthesis must account for every region, with explicit partial publication if work remains. Empty-exam setup and the first personal manifest must bootstrap without any previous tutoring session.

### A02 — Unsupported format and uncertain formula

Given an unsupported binary and a scanned formula that a cheap extractor cannot read, when ingestion runs, then the first is explicitly unsupported and the formula region escalates or remains needs-review with original evidence and uncertainty. No invented formula may appear as faithful L1 or a definitive downstream claim. Unaffected valid material may publish under explicit eligibility rules.

### A03 — Bounded graph refinement and validation

Given a new graph connection that improves an earlier per-source explanation, refinement revises only affected L2 artifacts and source-checks the connection. A hierarchy cycle is rejected; a crosslink cycle is permitted; a prerequisite cycle is flagged. If two validators agree on an unsupported statement, it remains unsupported. At configured round exhaustion, the result is published only if eligible, otherwise needs-review with previous publication intact. A converged build records a no-change reason and stops.

### A04 — Source update while tutoring a pinned version

Given an active `K1/P1` question and a new source version, when `K2` builds/publishes, then current retrieval/evidence remains internally consistent under `K1/P1` until safe adoption. New turns adopt compatible `K2/P2` or explicit empty personal view. Historical anchors remain resolvable. A materially incorrect old prompt is canceled and not scored. A late generation-1 build cannot replace generation 2.

### A05 — Active QR personalization is observable in subsequent retrieval

Given a personal explanation assuming projection misunderstanding, when the learner meaningfully says and then demonstrates that projection is understood but notation is unclear, then committed learner changes queue the coordinator, Astra records a revision decision, a validated personal overlay/map connection publishes, and a subsequent context packet contains the notation clarification and correct base evidence. Assert trigger IDs, profile/topic dependencies, new personal version, publication, adoption, and retrieved text. Passing only a changed profile into a later prompt without revising/reconsidering material fails this test.

### A06 — Preferences affect teaching, not correctness

Given identical question/rubric/answer evidence for two profile snapshots differing only in “examples first” and pace, planning/delivery can differ while correctness criteria and assistance interpretation remain equal. Liking an explanation alone does not increase mastery or create a permanent “learning style.” A later poor performance can contradict an inferred teaching observation without deleting its history. A question assessing QR notation while merely referencing projections produces only the mapped objective findings; retrieved/mentioned topics receive no automatic equal credit. The local assessment does not consume a prior mastery estimate; the broader estimator consumes its findings and versioned history separately.

### A07 — Duplicate answer and correction

Given the same finalized client response delivered twice, only one evidence record, applied assessment, and mastery history update result. Reusing the idempotency key with different text conflicts. A transcript correction creates a superseding response/evidence/assessment/history record, keeps the originals, and adjusts the current projection once. Concurrent assessments cannot overwrite a newer projection with a stale prior.

### A08 — Barge-in and actual assistance

Given full prompt playback, H1 played, H2 generated but queued, and student interruption before H2, then only H1 counts as delivered assistance. A partial hint stores its played span; unknown playback marks uncertainty. Correct-after-help differs from independent evidence. The audio adapter can emit a late chunk/cancel acknowledgment without playing obsolete output or losing actual late playback acknowledgments.

### A09 — Stale planner and ASR ambiguity

Given planning for epoch 3 and a topic switch to epoch 4, a late plan cannot become active or reserve/present a question in epoch 4. ASR partials never generate assessments. A finalized transcript with material ambiguity asks clarification and does not lower mastery. A barge-in answer attributable to a historically delivered question is preserved under that question despite epoch change.

### A10 — Topic switching and reconnect

Given an unfinished QR question with delivered hints, switching to another topic saves a resume record. Returning restores the learner's reasoning, hints, next step, and compatible question without treating it as unseen. Reconnect is idempotent, advances epoch, returns missed state events, and does not replay audio automatically. A late QR assessment updates QR history only, not the active other topic.

### A11 — Hopper reservation race, refill, and bounded work

Given one ready basic question and two concurrent sessions trying to reserve it, exactly one obtains it. Reservation triggers bounded refill; a full pool stops generating. Repeated events do not create fill storms. Releasing an undelivered valid reservation can restore readiness; a delivered/partially delivered question remains asked/exposed. Invalidation and lease expiry cannot make a stale question ready. On-demand work is scheduled before refill.

### A12 — Custom narrow question and exposure

Given the notation issue within QR, a custom question includes correct objectives, sources, learner dependencies, expected answer/rubric/hints, and validation before readiness. It creates no permanent topic. A family whose answer was taught cannot be selected as novel transfer. If generation times out, the tutor explains or asks an existing appropriate validated question, without fabricating readiness.

### A13 — Unknown mastery, nonmonotonic estimate, and provider fallback

A new topic returns `unknown` and null index, not zero. Eligible independent evidence can raise an estimate; later contradictory/delayed evidence can lower it. Assisted answers remain distinguishable. A provider failure preserves the last estimate/unknown and records failed/insufficient assessment, without fake numeric movement. All illustrative normalized indices are bounded and associated with a policy version.

### A14 — Objective migration and comparability

Renaming/reparenting a topic preserves stable identity/history. Splitting QR into two new assessable objectives creates explicit mappings, new comparability segments, and reassessment requirements; it does not copy mastery to both. A changed rubric/policy/meaning cannot masquerade as learning improvement. Internal chronological history exposes segment boundaries and supersession.

### A15 — Scope enforcement and deletion race

Given two learners in the same tenant and overlapping topic names, retrieval, signed blobs, jobs, questions, sessions, and profile inputs never include the other's records. Forged IDs return authorization/not-found errors. Uploaded prompt-injection text cannot change scope or policies. Delete an exam while a worker is running: tombstone/generation checks prevent its completion from restoring content or publishing; retries remain canceled/deleted.

### A16 — Worker crash and atomic publication

Crash after artifact persistence but before queue acknowledgment, retry, and verify artifacts/jobs/events are deduplicated. Crash between outbox insert and delivery, then verify delivery eventually occurs once logically. A manifest with one missing or unvalidated referenced artifact cannot publish. The prior published manifest remains usable. A stale lease holder cannot commit over the new worker. Exhausted attempts end visibly in needs-review/dead-letter.

### A17 — Personal no-op, coalescing, and version races

Several semantically related learner events coalesce into one reconsideration while each receives a traceable decision. A no-op contains reasons and trigger evidence. A new change arriving during revision remains pending for the next batch. Generated personal material never triggers itself as learner evidence. A candidate based on an obsolete profile/base cannot overwrite a newer personal view. Every eligible change is eventually decided, or explicitly pending/needs-review with a retryable failure; silent omission fails.

### A18 — Context budget and minimal student projection

With large sources/history, the context builder prioritizes active task, objective, actual assistance, facts, and current profile/resume state; drops expendable old chat; stays within configured input/output reserves; and preserves provenance in compaction. Essential material that cannot fit returns a recoverable budget error. The student topics endpoint contains only hierarchy/current mastery plus exam/version identifiers. It exposes no source viewer, graph, diagnoses, history, confidence panel, or question-buffer data.

### A19 — Bootstrap, global preferences, and profile head races

Create a learner's first exam with no prior data: explicit version-0 profile snapshots exist, `/topics` is empty, and session start is content-not-ready. Provide an examples-first preference during setup; initial L2 receives it, the first compatible personal view publishes, and the first speaking packet contains the relevant preference. Change a learner-wide pace preference with empty topic IDs: each applicable exam receives a resolved profile snapshot and bounded reconsideration, while source content remains isolated. A second learner's exam is untouched. If no base is published, the change remains pending and is reconciled after initial publication. Concurrent profile updates use head CAS and do not lose either explicit fact.

### A20 — Playback ingress and spoken-question integrity

Send ordinary playback acknowledgments through the authenticated ingress and verify that actual delivery/assistance updates without requiring an interruption. Duplicate/reordered events reconcile idempotently; wrong-session output IDs and unauthorized callbacks fail. A known historical-epoch receipt records past delivery without reactivating old speech. If the voice model changes a question's “three” to “four” or drops a condition, block playback or record material prompt drift; do not grade the actual response under the original rubric. Exact approved wording or a validated equivalent rendering remains eligible. Playback records rendered audio, not proof the student heard or understood it.

## 14. Implementation order and completion definition

Implement in this order, with integration tests added as each boundary becomes executable:

1. Create schema validation, scoped database entities/constraints, immutable artifact storage, configuration, authentication ownership checks, outbox, durable jobs, idempotency, and deletion-generation checks.
2. Implement deterministic/mock provider adapters and fixture artifacts, including controllable failures, latency, stale responses, ambiguous ASR, partial playback, and cancellation races. No production credentials are required for this step.
3. Implement uploads/capability matrix, L0/L1 extraction, anchored evidence retrieval, L2 interpretation, L3 graph, validation reports, bounded refinement, selective invalidation, and atomic knowledge manifests.
4. Implement profiles, interaction/delivery evidence, rubric/policy versioning, assessments, unknown/current mastery projection, append-only history, and topic/objective migration semantics.
5. Implement the mandatory learner-change coordinator, affected-dependency selection, personal revision/no-op contracts, validation, personal publication, compatible-view adoption, and the A05 retrieval proof.
6. Implement question generation/validation, supply scheduler, custom priority path, atomic reservations, exposure ledger, and refill/invalidation behavior.
7. Implement session coordinator, planning/context builder, voice adapter callbacks, epochs, bounded microturns, response attribution, actual delivery, interruption/reconnect, and topic resume state.
8. Implement the minimal student endpoints and authorized internal audit/history endpoints. Run every acceptance scenario through the integrated database, workers, storage, and mock transports.
9. Add production provider adapters behind the same contracts only when credentials/model IDs are configured. Run contract tests for schema validity, token counting, cancellation semantics, errors, provider-version recording, and source grounding. Document provider limitations explicitly.

MVP is complete when a synthetic upload-to-voice-to-answer-to-mastery-to-personal-revision-to-next-retrieval flow works through persisted services and queues, all acceptance scenarios pass, and a worker/session restart preserves state. A pile of interfaces, unit stubs, static sample responses, or an API server that never schedules active personalization is not complete. Production deployment is a separate environment task. Research on pedagogical effectiveness, calibration, and real learning outcomes is separate from software correctness and must not be implied by passing these tests.

## 15. Requirement-to-contract-to-acceptance traceability

| Requirement | Main entities/contracts | Acceptance |
|---|---|---|
| Original preservation and faithful cheap extraction | SourceVersion, SourceAnchor, ExtractionArtifact, Extractor | A01, A02 |
| Deep per-source interpretation and graph feedback | Interpreter, GraphBuilder, ValidationReport, KnowledgeManifest | A01, A03 |
| Fine-grained hierarchy/objectives/many-to-many evidence | TopicVersion, ObjectiveVersion, TopicEvidenceLink, GraphEdge | A01, A03, A14 |
| Source-checked atomic version publication/invalidation | RevisionBuild, Dependency, KnowledgeManifest, outbox/CAS | A04, A16 |
| Persistent profile separate from facts and mastery | LearnerProfileHead, ProfileSnapshot, LearnerTopicState, LearnerContextRef | A05, A06, A13, A19 |
| Active personal material/map revision after evidence | LearnerChange, PersonalReviser, PersonalRevisionDecision, PersonalManifest | A05, A17 |
| Current mastery plus full evidence/history | InteractionEvidence, LocalAnswerAssessor, LearnerAssessor, MasteryProjection, MasteryHistoryPoint | A07, A08, A13, A14 |
| Adaptive strong reasoning and fast voice | Planner, TeachingPlan, VoiceAdapter, coordinator | A08, A09, A20 |
| Budgeted deep context and topic resumption | ContextBuilder, ContextPacket, TopicResumeState | A10, A18 |
| Actual prompt/hint attribution and streaming safety | DeliveryEvent, FinalizedResponse, Session epochs | A07, A08, A09, A10 |
| Independent bounded hopper plus custom questions | QuestionGenerator, QuestionSupply, QuestionReservation, ExposureRecord | A11, A12 |
| Minimal student projection | StudentTopicProjection and §10 routes | A18 |
| Async reliability, ownership, and deletion | DurableJob, OutboxRow, WorkIdentity, scoped constraints | A15, A16 |
| Both loops terminate traceably without mandatory rewrite | RevisionBuild, PersonalRevisionDecision, bounded budgets | A03, A17 |

The implementer may choose equivalent storage or transport mechanics while preserving these contracts and acceptance behaviors. External provider IDs, credentials, deployment limits, and retention policy remain configuration. Critical runtime semantics—what is stored, when it changes, what counts as evidence, how versions publish, what is played, and what happens on failure—are defined here and must not be deferred to informal prompting.
