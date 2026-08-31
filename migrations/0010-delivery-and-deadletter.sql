-- 0010: email delivery logging and ingest dead-letter.
-- One-time upgrade; new installs get this shape from schema.sql.

-- Email sends are recorded like webhook deliveries: a send that failed leaves a row
-- saying so. Previously a failed send left no trace and the timeline claimed success.
CREATE TABLE IF NOT EXISTS email_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER,
  form_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,               -- notification | autoresponder
  recipient TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,             -- sent | failed | skipped
  response_status INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 1,
  next_attempt_at INTEGER,
  payload TEXT,                     -- retained only while a retry is still owed
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_sub ON email_deliveries (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_due ON email_deliveries (next_attempt_at) WHERE next_attempt_at IS NOT NULL;

-- Last resort when the submissions insert itself fails. The raw body is parked here so a
-- database error costs a retry rather than the lead.
CREATE TABLE IF NOT EXISTS dead_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL,
  body TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  recovered_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_open ON dead_letters (created_at DESC) WHERE recovered_at IS NULL;
