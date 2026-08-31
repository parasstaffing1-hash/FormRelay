-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/pg-schema.mjs from schema.sql. Re-run after changing schema.sql:
--   node scripts/pg-schema.mjs
--
-- SQLite -> PostgreSQL mappings applied:
--   AUTOINCREMENT -> BIGSERIAL: 14
--   INTEGER -> BIGINT (epoch-ms overflows int4): 93
--
-- Deliberately unchanged: TEXT, CHECK constraints, partial indexes (WHERE clauses) and
-- IF NOT EXISTS are all valid Postgres and mean the same thing in both engines.

-- Run with: npm run db:init  (idempotent — safe to re-run)

-- Existing databases should apply the following once before running this file:
-- ALTER TABLE forms ADD COLUMN schema_json TEXT;
-- ALTER TABLE forms ADD COLUMN published_json TEXT;
-- ALTER TABLE forms ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
-- ALTER TABLE forms ADD COLUMN views BIGINT NOT NULL DEFAULT 0;
-- ALTER TABLE forms ADD COLUMN slug TEXT;
-- ALTER TABLE forms ADD COLUMN theme_json TEXT;
-- ALTER TABLE forms ADD COLUMN open_at BIGINT;
-- ALTER TABLE forms ADD COLUMN close_at BIGINT;
-- ALTER TABLE forms ADD COLUMN submission_limit BIGINT;
-- ALTER TABLE forms ADD COLUMN closed_message TEXT NOT NULL DEFAULT '';
-- ALTER TABLE forms ADD COLUMN one_per_respondent BIGINT NOT NULL DEFAULT 0;
-- ALTER TABLE submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
-- ALTER TABLE submissions ADD COLUMN resume_token_hash TEXT;
-- ALTER TABLE submissions ADD COLUMN resume_expires_at BIGINT;
-- ALTER TABLE submissions ADD COLUMN resume_revoked BIGINT NOT NULL DEFAULT 0;
-- ALTER TABLE submissions ADD COLUMN completed_at BIGINT;
-- ALTER TABLE submissions ADD COLUMN updated_at BIGINT;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  -- TOTP secrets cannot be hashed: verification needs the original value. This makes the
  -- users table more sensitive than it was, which is the trade a second factor always
  -- makes -- and why recovery codes are hashed instead.
  totp_secret TEXT,
  totp_enabled BIGINT NOT NULL DEFAULT 0,
  totp_enrolled_at BIGINT
);

-- Single-use recovery codes so a lost phone does not mean a lost workspace. Hashed like
-- passwords; a used code keeps its row so the audit trail survives.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes (user_id) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  accepted_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_url TEXT NOT NULL DEFAULT '',
  notify_email TEXT NOT NULL DEFAULT '',
  auto_reply BIGINT NOT NULL DEFAULT 0,
  archived BIGINT NOT NULL DEFAULT 0,
  schema_json TEXT,
  published_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  views BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  slug TEXT,
  theme_json TEXT,
  open_at BIGINT,
  close_at BIGINT,
  submission_limit BIGINT,
  closed_message TEXT NOT NULL DEFAULT '',
  one_per_respondent BIGINT NOT NULL DEFAULT 0,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  prefill_signed_only BIGINT NOT NULL DEFAULT 0,
  pow_bits BIGINT NOT NULL DEFAULT 0,
  unique_mode TEXT NOT NULL DEFAULT 'off',
  unique_field TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL DEFAULT '',
  field_acl_json TEXT NOT NULL DEFAULT '{}',
  recurrence TEXT NOT NULL DEFAULT 'off',
  unlock_at BIGINT,
  spam_rules_json TEXT NOT NULL DEFAULT '',
  score_rules_json TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug) WHERE slug IS NOT NULL AND slug != '';

CREATE TABLE IF NOT EXISTS form_versions (
  id BIGSERIAL PRIMARY KEY,
  form_id TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  published_json TEXT,
  created_at BIGINT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions (form_id, created_at DESC);

CREATE TABLE IF NOT EXISTS form_events (
  id BIGSERIAL PRIMARY KEY,
  form_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  referer TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_events_form_time ON form_events (form_id, created_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  form_id TEXT NOT NULL,
  data TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  is_spam BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  resume_token_hash TEXT,
  resume_expires_at BIGINT,
  resume_revoked BIGINT NOT NULL DEFAULT 0,
  completed_at BIGINT,
  updated_at BIGINT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  prev_hash TEXT NOT NULL DEFAULT '',
  row_hash TEXT NOT NULL DEFAULT '',
  receipt_token_hash TEXT,
  erased_at BIGINT,
  quality_json TEXT NOT NULL DEFAULT '{}',
  consent_json TEXT NOT NULL DEFAULT '',
  respondent_key TEXT,
  cohort TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  fingerprint TEXT,
  spam_score BIGINT NOT NULL DEFAULT 0,
  spam_signals TEXT NOT NULL DEFAULT '[]',
  contact_id TEXT,
  lead_score BIGINT NOT NULL DEFAULT 0,
  score_breakdown TEXT NOT NULL DEFAULT '[]',
  lead_status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_submissions_contact ON submissions (contact_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotency
  ON submissions (form_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_fingerprint
  ON submissions (form_id, fingerprint) WHERE fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_respondent
  ON submissions (form_id, respondent_key) WHERE respondent_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_receipt ON submissions (receipt_token_hash);

CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_ip_time ON submissions (ip, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_resume_token ON submissions (resume_token_hash) WHERE resume_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT '',
  active BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_form ON webhooks (form_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status_code BIGINT,
  ok BIGINT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  -- Retry state. payload is held only while a delivery is still owed, then dropped.
  attempts BIGINT NOT NULL DEFAULT 1,
  next_attempt_at BIGINT,
  payload TEXT,
  submission_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_due
  ON webhook_deliveries (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_submission
  ON webhook_deliveries (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_wh ON webhook_deliveries (webhook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  submission_id BIGINT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  size BIGINT NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  field_name TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_form ON files (form_id);

CREATE TABLE IF NOT EXISTS settings_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read_write',
  expires_at BIGINT,
  last_used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  form_id TEXT,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  condition_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  active BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_form ON workflows (form_id, active);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  submission_id BIGINT,
  status TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs (workflow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index BIGINT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  retry_count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps (run_id, step_index);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  read_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip, created_at DESC);


CREATE TABLE IF NOT EXISTS chain_anchors (
  id BIGSERIAL PRIMARY KEY,
  form_id TEXT NOT NULL DEFAULT '',
  head_hash TEXT NOT NULL,
  row_count BIGINT NOT NULL,
  signature TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chain_anchors_form ON chain_anchors (form_id, created_at DESC);


CREATE TABLE IF NOT EXISTS response_views (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'view',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_views_submission ON response_views (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_views_created ON response_views (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_cohort ON submissions (form_id, cohort);


CREATE TABLE IF NOT EXISTS submission_events (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  detail TEXT NOT NULL DEFAULT '',
  response_status BIGINT,
  attempt BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_events_sub ON submission_events (submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submission_events_failed ON submission_events (status, created_at DESC) WHERE status = 'failed';


CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  dedupe_key TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  submission_count BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  lead_score BIGINT NOT NULL DEFAULT 0,
  score_breakdown TEXT NOT NULL DEFAULT '[]',
  score_version TEXT NOT NULL DEFAULT '',
  source_form TEXT NOT NULL DEFAULT '',
  utm_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_dedupe ON contacts (workspace_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts (lead_score DESC);


CREATE TABLE IF NOT EXISTS email_deliveries (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT,
  form_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  response_status BIGINT,
  detail TEXT NOT NULL DEFAULT '',
  attempts BIGINT NOT NULL DEFAULT 1,
  next_attempt_at BIGINT,
  payload TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_sub ON email_deliveries (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_due ON email_deliveries (next_attempt_at) WHERE next_attempt_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS dead_letters (
  id BIGSERIAL PRIMARY KEY,
  form_id TEXT NOT NULL,
  body TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  recovered_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_open ON dead_letters (created_at DESC) WHERE recovered_at IS NULL;

-- Shared API rate-limit counters. One row per caller per fixed window; the cron sweeper
-- deletes rows once their window closes. Lives in D1 rather than isolate memory so the
-- limit holds across isolates.
CREATE TABLE IF NOT EXISTS rate_counters (
  bucket TEXT PRIMARY KEY,
  window_start BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_counters_window ON rate_counters (window_start);
