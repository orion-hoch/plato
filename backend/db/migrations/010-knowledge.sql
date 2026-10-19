-- Knowledge loop: L0 originals, L1 anchored extraction, L2 interpretations, L3 graph, manifests. Spec §4.1–4.2, §6.

CREATE TABLE upload_tokens(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, state TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);

CREATE TABLE source_files(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  status TEXT NOT NULL, current_source_version_id TEXT, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX source_files_exam ON source_files(exam_id);

CREATE TABLE source_versions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(source_file_id, version)
);

CREATE TABLE extraction_artifacts(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(source_version_id, version)
);

CREATE TABLE source_anchors(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL, extraction_artifact_id TEXT, anchor_key TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(source_version_id, extraction_artifact_id, anchor_key)
);
CREATE INDEX source_anchors_version ON source_anchors(source_version_id);

CREATE TABLE source_segments(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL, extraction_artifact_id TEXT NOT NULL, segment_index INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(extraction_artifact_id, segment_index)
);

CREATE TABLE base_interpretations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL, extraction_artifact_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
  kind TEXT NOT NULL, -- segment | source
  created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX base_interpretations_source ON base_interpretations(source_version_id, kind);

CREATE TABLE synthesis_partitions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  build_id TEXT NOT NULL, level INTEGER NOT NULL, partition_index INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(build_id, level, partition_index)
);

CREATE TABLE topics(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  stable_key TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, stable_key)
);

CREATE TABLE topic_versions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(topic_id, version)
);

CREATE TABLE objective_versions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  objective_id TEXT NOT NULL, version INTEGER NOT NULL, topic_id TEXT NOT NULL, meaning_hash TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(objective_id, version)
);

CREATE TABLE graph_edges(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  edge_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(edge_id, version)
);

CREATE TABLE topic_evidence_links(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, source_anchor_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX topic_evidence_topic ON topic_evidence_links(topic_id);

CREATE TABLE validation_reports(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  candidate_kind TEXT NOT NULL, candidate_id TEXT NOT NULL, responsibility TEXT NOT NULL, disposition TEXT NOT NULL,
  created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX validation_reports_candidate ON validation_reports(candidate_kind, candidate_id);

CREATE TABLE knowledge_manifests(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, build_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, version)
);

CREATE TABLE topic_migrations(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  to_knowledge_manifest_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);

CREATE TABLE revision_builds(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  kind TEXT NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL, row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
  UNIQUE(exam_id, kind, generation)
);

-- Reverse dependency index: referenced record → dependent artifact/job (§6 invalidation).
CREATE TABLE dependency_index(
  ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL, dependent_kind TEXT NOT NULL, dependent_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  PRIMARY KEY(ref_kind, ref_id, dependent_kind, dependent_id)
);
