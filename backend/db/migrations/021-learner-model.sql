-- The learner model's evidence stream (v10): one row per observation of a concept or topic (the director's classified
-- answers, rubric-graded answers). θ/σ are folded from it; mastery_projections are projected from that.
CREATE TABLE learner_observations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX learner_observations_exam ON learner_observations(exam_id, created_at);
