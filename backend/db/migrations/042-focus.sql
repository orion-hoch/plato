-- Student-created focus sections (user override): named sets of topics with a mastery goal. One active per exam.
CREATE TABLE focus_sections(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX focus_sections_exam ON focus_sections(exam_id);
