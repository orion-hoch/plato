-- The study plan was removed (v11, 2026-10-08, by the user's decision: no days, minutes or urgency). Whether the intro is
-- done moves onto the exam record (`introDoneAt`); the plan's table goes.
UPDATE exams SET data = json_set(data, '$.introDoneAt', (
  SELECT json_extract(p.data, '$.introDoneAt') FROM study_plans p
  WHERE p.exam_id = exams.id AND json_extract(p.data, '$.introDoneAt') IS NOT NULL ORDER BY p.version DESC LIMIT 1))
WHERE EXISTS (SELECT 1 FROM study_plans p WHERE p.exam_id = exams.id AND json_extract(p.data, '$.introDoneAt') IS NOT NULL);
DROP TABLE IF EXISTS study_plans;
