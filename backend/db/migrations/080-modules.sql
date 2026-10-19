-- Course modules (backend/modules): one row per unit or topic module of an exam, for the published knowledge manifest.
-- The id is the module id (mod_<topicId>), stable across manifests; a rebuild replaces the row.
CREATE TABLE course_modules(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  kind TEXT NOT NULL, unit_id TEXT NOT NULL, knowledge_manifest_id TEXT NOT NULL,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX course_modules_exam ON course_modules(exam_id, kind);
-- Items attached to a module from the student's materials (a pset problem, a definition, an example, a note).
CREATE TABLE module_items(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  module_id TEXT NOT NULL, kind TEXT NOT NULL, source_ref TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, module_id, source_ref, kind)
);
