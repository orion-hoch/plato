-- Lessons are retired from teaching (v12, 2026-10-08): the teaching engine teaches from the course model
-- (backend/understanding), and backend/lessons is archived in archive/v12-removed. Their table goes, and lesson jobs
-- still waiting are cancelled: with no handler left, such a job at the head of the queue would hold back every job behind it.
UPDATE jobs SET state = 'cancelled', data = json_set(data, '$.state', 'cancelled') WHERE type = 'prepare_lesson' AND state IN ('queued', 'retry_wait', 'running');
DROP TABLE IF EXISTS lessons;
