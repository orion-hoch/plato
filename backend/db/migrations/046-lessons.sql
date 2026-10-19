-- Prepared lessons (v7): one per session goal, keyed by what the goal is (and the knowledge manifest), so a goal that
-- comes back in a new plan version keeps its lesson. The material lesson is stored at once; Astra's replaces it.
CREATE TABLE lessons(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX lessons_exam ON lessons(exam_id);
