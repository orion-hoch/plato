-- Tutor outputs (one speak call): epoch/turn/plan binding and cancellation state. Units live in output_units.
CREATE TABLE session_outputs(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, epoch INTEGER NOT NULL, state TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX session_outputs_session ON session_outputs(session_id, state);
CREATE INDEX output_units_unit ON output_units(session_id, id);
