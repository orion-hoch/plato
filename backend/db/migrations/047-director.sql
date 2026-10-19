-- The director (v9, cards mode): move cards per session, the director's state per session (current card, student model
-- per concept, place in the lesson), and misconception follow-up cards cached per concept for reuse across sessions.
CREATE TABLE director_cards(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL, session_id TEXT, cache_key TEXT,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX director_cards_session ON director_cards(session_id);
CREATE INDEX director_cards_cache ON director_cards(exam_id, cache_key);
CREATE TABLE director_state(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, exam_id TEXT NOT NULL,
  row_version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
