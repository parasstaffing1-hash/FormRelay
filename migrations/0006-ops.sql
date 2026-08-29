-- 0006: recurring cohorts, sealed responses, and migration bookkeeping.
-- One-time upgrade; new installs get this shape from schema.sql.

ALTER TABLE submissions ADD COLUMN cohort TEXT NOT NULL DEFAULT '';
ALTER TABLE forms ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'off';
ALTER TABLE forms ADD COLUMN unlock_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_submissions_cohort ON submissions (form_id, cohort);
