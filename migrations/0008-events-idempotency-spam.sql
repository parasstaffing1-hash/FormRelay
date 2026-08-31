-- 0008: submission event timeline, idempotency, explainable spam scoring.
-- One-time upgrade; new installs get this shape from schema.sql.

-- Every pipeline stage writes a row, successes included, so a stage that silently did
-- not run is visible as a gap rather than as nothing.
CREATE TABLE IF NOT EXISTS submission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  detail TEXT NOT NULL DEFAULT '',
  response_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_events_sub
  ON submission_events (submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submission_events_failed
  ON submission_events (status, created_at DESC) WHERE status = 'failed';

-- Idempotency: a repeated key on the same form returns the original submission.
ALTER TABLE submissions ADD COLUMN idempotency_key TEXT;
ALTER TABLE submissions ADD COLUMN fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotency
  ON submissions (form_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_fingerprint
  ON submissions (form_id, fingerprint) WHERE fingerprint IS NOT NULL;

-- Explainable spam: the score and the reasons behind it, so a decision can be argued with.
ALTER TABLE submissions ADD COLUMN spam_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN spam_signals TEXT NOT NULL DEFAULT '[]';

-- Per-form spam rule overrides (blocked words/emails/domains, threshold, link limit).
ALTER TABLE forms ADD COLUMN spam_rules_json TEXT NOT NULL DEFAULT '';
