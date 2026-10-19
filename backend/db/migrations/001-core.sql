-- Core: principals, exams, idempotency, durable jobs, events/outbox, blobs. Spec §3, §8.

CREATE TABLE principals(
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, learner_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('learner','admin')), data TEXT NOT NULL
);

CREATE TABLE exams(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL,
  status TEXT NOT NULL, row_version INTEGER NOT NULL, deletion_generation INTEGER NOT NULL DEFAULT 0,
  desired_build_generation INTEGER NOT NULL DEFAULT 0,
  published_knowledge_manifest_id TEXT, published_personal_manifest_id TEXT,
  created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX exams_owner ON exams(tenant_id, learner_id);

-- HTTP mutation idempotency (Idempotency-Key header), scoped to the principal.
CREATE TABLE idempotency(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT, key TEXT NOT NULL, route TEXT NOT NULL,
  input_hash TEXT NOT NULL, status INTEGER, response TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(tenant_id, learner_id, route, key)
);

CREATE TABLE jobs(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT,
  type TEXT NOT NULL, idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL,
  state TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL,
  available_at INTEGER NOT NULL, lease_owner TEXT, lease_expires_at INTEGER,
  expected_deletion_generation INTEGER NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(tenant_id, learner_id, exam_id, idempotency_key)
);
CREATE INDEX jobs_ready ON jobs(state, available_at, priority);

CREATE TABLE events(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT,
  event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  sequence INTEGER NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(tenant_id, learner_id, idempotency_key)
);
CREATE INDEX events_aggregate ON events(aggregate_type, aggregate_id, sequence);

CREATE TABLE outbox(
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE REFERENCES events(id),
  state TEXT NOT NULL CHECK(state IN ('pending','sent')), attempt INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
  row_version INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE INDEX outbox_pending ON outbox(state, next_attempt_at);

CREATE TABLE consumer_receipts(
  consumer TEXT NOT NULL, event_id TEXT NOT NULL, processed_at TEXT NOT NULL,
  PRIMARY KEY(consumer, event_id)
);

CREATE TABLE blobs(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT,
  sha256 TEXT NOT NULL, media_type TEXT NOT NULL, byte_length INTEGER NOT NULL, path TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX blobs_exam ON blobs(exam_id);

-- Minimal non-content tombstones kept after deletion for idempotency.
CREATE TABLE tombstones(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, kind TEXT NOT NULL,
  deletion_generation INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
