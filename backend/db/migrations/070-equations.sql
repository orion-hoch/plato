-- The student's equation sheet (backend/equations): their own LaTeX equations per exam, at most 200, in the sheet's order.
CREATE TABLE equations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX equations_exam ON equations(exam_id);
