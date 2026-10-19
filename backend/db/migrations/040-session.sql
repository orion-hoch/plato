-- Live sessions: epochs, turns, responses, actual delivery, plans, context packets, resume state, server events. Spec §4.6, §7.

CREATE TABLE sessions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  status TEXT NOT NULL, epoch INTEGER NOT NULL, row_version INTEGER NOT NULL, client_session_request_id TEXT,
  created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, client_session_request_id)
);
CREATE TABLE turns(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, sequence INTEGER NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);
CREATE TABLE finalized_responses(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, client_response_id TEXT NOT NULL, input_hash TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(session_id, client_response_id)
);
CREATE TABLE delivery_events(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, output_id TEXT NOT NULL, sequence INTEGER NOT NULL, semantic_unit_id TEXT NOT NULL,
  question_id TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX delivery_unit ON delivery_events(session_id, semantic_unit_id, sequence);
CREATE INDEX delivery_question ON delivery_events(session_id, question_id);
CREATE TABLE output_units(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, output_id TEXT NOT NULL, epoch INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX output_units_output ON output_units(output_id);
CREATE TABLE teaching_plans(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE context_packets(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE topic_resume_states(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, topic_id, version)
);
CREATE TABLE voice_event_receipts(
  session_id TEXT NOT NULL, client_event_id TEXT NOT NULL, input_hash TEXT NOT NULL, client_sequence INTEGER NOT NULL, received_at TEXT NOT NULL,
  PRIMARY KEY(session_id, client_event_id)
);
-- Monotonically sequenced control/state events per session for streaming and reconnect.
CREATE TABLE session_server_events(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  session_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);
