-- Questions: lookup columns used by the supply scheduler.
ALTER TABLE question_supply ADD COLUMN active_generation_job_id TEXT;
ALTER TABLE question_generation_requests ADD COLUMN topic_id TEXT;
ALTER TABLE question_generation_requests ADD COLUMN slot TEXT;
CREATE INDEX question_generation_topic ON question_generation_requests(exam_id, topic_id, state);
