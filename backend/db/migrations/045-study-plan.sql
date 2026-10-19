-- Study plans (v5): one row per version of a learner's plan for an exam; the newest version is the plan.
CREATE TABLE study_plans(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  version INTEGER NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, version)
);
