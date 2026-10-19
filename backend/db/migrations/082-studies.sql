-- Studies (backend/understanding, v11): the director's own understanding of one topic, one row per topic of an exam
-- (id std_<topicId>), rebuilt in place when its passages or prompts change; an older Study stays readable meanwhile.
CREATE TABLE studies(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, knowledge_manifest_id TEXT, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX studies_exam ON studies(exam_id);
