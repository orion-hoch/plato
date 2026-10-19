-- Learner loop: profiles, evidence, two-stage assessment, mastery projection/history, personalization. Spec §4.3–4.4.

CREATE TABLE learner_profile_heads(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL UNIQUE,
  current_snapshot_id TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE learner_profile_snapshots(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(learner_id, version)
);
CREATE TABLE profile_snapshots(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, version)
);

CREATE TABLE assessment_policies(
  id TEXT PRIMARY KEY, version TEXT NOT NULL UNIQUE, data TEXT NOT NULL
);

CREATE TABLE learner_topic_states(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, state_version INTEGER NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, topic_id)
);

CREATE TABLE interaction_evidence(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, turn_id TEXT NOT NULL, response_id TEXT, question_id TEXT, evidence_status TEXT NOT NULL,
  supersedes_evidence_id TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(response_id)
);
CREATE TABLE feedback_evidence(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT,
  semantic_key TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);

CREATE TABLE local_answer_assessments(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  interaction_evidence_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(interaction_evidence_id, version)
);
CREATE TABLE learner_assessments(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, applied_key TEXT, disposition TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(applied_key)
);
CREATE TABLE mastery_projections(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, projection_version INTEGER NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, topic_id)
);
CREATE TABLE mastery_history_points(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, sequence INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, topic_id, sequence)
);

CREATE TABLE learner_changes(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  sequence INTEGER NOT NULL, semantic_key TEXT NOT NULL, status TEXT NOT NULL, batch_id TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, semantic_key)
);
CREATE TABLE personal_batches(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  state TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE personal_explanations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  version INTEGER NOT NULL, knowledge_manifest_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE personal_map_edges(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  edge_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(edge_id, version)
);
CREATE TABLE personal_manifests(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  version INTEGER NOT NULL, knowledge_manifest_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, version)
);
CREATE TABLE personal_revision_decisions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  disposition TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
