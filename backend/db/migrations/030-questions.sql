-- Questions: records, rubrics, approved renderings, reservations, exposure, supply. Spec §4.5, §9.

CREATE TABLE rubric_versions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(rubric_id, version)
);
CREATE TABLE question_records(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, origin TEXT NOT NULL, slot TEXT, state TEXT NOT NULL, knowledge_manifest_id TEXT NOT NULL,
  semantic_family_id TEXT NOT NULL, generation_request_id TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX question_records_topic ON question_records(exam_id, topic_id, state);
CREATE TABLE question_renderings(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL, text_hash TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE question_reservations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL, session_id TEXT NOT NULL, state TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
-- Only one active reservation per question.
CREATE UNIQUE INDEX one_active_reservation ON question_reservations(question_id) WHERE state = 'active';
CREATE TABLE exposure_records(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL, semantic_family_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX exposure_family ON exposure_records(exam_id, semantic_family_id);
CREATE TABLE question_supply(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, knowledge_manifest_id TEXT NOT NULL, slot TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, topic_id, knowledge_manifest_id, slot)
);
CREATE TABLE question_generation_requests(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  origin TEXT NOT NULL, state TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
