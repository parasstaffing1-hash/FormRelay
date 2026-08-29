-- 0005: proof-of-work gate, blind uniqueness, consent receipts, quality scoring,
-- field-level access control, and response view auditing.
--
-- One-time upgrade: SQLite ALTER TABLE ... ADD COLUMN is not idempotent. New installs
-- get the current shape from schema.sql and do not need to run this.

-- Advisory quality signals (speeding, straightlining, low-effort text).
ALTER TABLE submissions ADD COLUMN quality_json TEXT NOT NULL DEFAULT '{}';

-- Exactly which consent wording this respondent agreed to, and when.
ALTER TABLE submissions ADD COLUMN consent_json TEXT NOT NULL DEFAULT '';

-- HMAC of the respondent's identifier. The raw identifier is never stored, so duplicates
-- collide without the database learning who anyone is.
ALTER TABLE submissions ADD COLUMN respondent_key TEXT;

-- Difficulty in leading zero bits; 0 disables the proof-of-work gate.
ALTER TABLE forms ADD COLUMN pow_bits INTEGER NOT NULL DEFAULT 0;

-- 'off' | 'blind' — whether one-response-per-person is enforced via a blinded identifier.
ALTER TABLE forms ADD COLUMN unique_mode TEXT NOT NULL DEFAULT 'off';
ALTER TABLE forms ADD COLUMN unique_field TEXT NOT NULL DEFAULT '';

-- Consent wording presented by this form, if any.
ALTER TABLE forms ADD COLUMN consent_text TEXT NOT NULL DEFAULT '';

-- { "<blockId>": ["owner","editor"] } — roles permitted to see each field.
ALTER TABLE forms ADD COLUMN field_acl_json TEXT NOT NULL DEFAULT '{}';

-- One response per blinded identity, per form.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_respondent
  ON submissions (form_id, respondent_key) WHERE respondent_key IS NOT NULL;

-- Who looked at which response. Answers "who in the team read this" for regulated intake.
CREATE TABLE IF NOT EXISTS response_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'view',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_views_submission ON response_views (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_views_created ON response_views (created_at DESC);
