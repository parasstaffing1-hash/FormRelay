-- Run with: npm run db:init  (idempotent — safe to re-run)

-- Existing databases should apply the following once before running this file:
-- ALTER TABLE forms ADD COLUMN schema_json TEXT;
-- ALTER TABLE forms ADD COLUMN published_json TEXT;
-- ALTER TABLE forms ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
-- ALTER TABLE forms ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE forms ADD COLUMN slug TEXT;
-- ALTER TABLE forms ADD COLUMN theme_json TEXT;
-- ALTER TABLE forms ADD COLUMN open_at INTEGER;
-- ALTER TABLE forms ADD COLUMN close_at INTEGER;
-- ALTER TABLE forms ADD COLUMN submission_limit INTEGER;
-- ALTER TABLE forms ADD COLUMN closed_message TEXT NOT NULL DEFAULT '';
-- ALTER TABLE forms ADD COLUMN one_per_respondent INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
-- ALTER TABLE submissions ADD COLUMN resume_token_hash TEXT;
-- ALTER TABLE submissions ADD COLUMN resume_expires_at INTEGER;
-- ALTER TABLE submissions ADD COLUMN resume_revoked INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE submissions ADD COLUMN completed_at INTEGER;
-- ALTER TABLE submissions ADD COLUMN updated_at INTEGER;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_url TEXT NOT NULL DEFAULT '',
  notify_email TEXT NOT NULL DEFAULT '',
  auto_reply INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  schema_json TEXT,
  published_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  slug TEXT,
  theme_json TEXT,
  open_at INTEGER,
  close_at INTEGER,
  submission_limit INTEGER,
  closed_message TEXT NOT NULL DEFAULT '',
  one_per_respondent INTEGER NOT NULL DEFAULT 0,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  prefill_signed_only INTEGER NOT NULL DEFAULT 0,
  pow_bits INTEGER NOT NULL DEFAULT 0,
  unique_mode TEXT NOT NULL DEFAULT 'off',
  unique_field TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL DEFAULT '',
  field_acl_json TEXT NOT NULL DEFAULT '{}',
  recurrence TEXT NOT NULL DEFAULT 'off',
  unlock_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug) WHERE slug IS NOT NULL AND slug != '';

CREATE TABLE IF NOT EXISTS form_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  published_json TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions (form_id, created_at DESC);

CREATE TABLE IF NOT EXISTS form_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  referer TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(form_id) REFERENCES forms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_events_form_time ON form_events (form_id, created_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL,
  data TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  is_spam INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  resume_token_hash TEXT,
  resume_expires_at INTEGER,
  resume_revoked INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  updated_at INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  prev_hash TEXT NOT NULL DEFAULT '',
  row_hash TEXT NOT NULL DEFAULT '',
  receipt_token_hash TEXT,
  erased_at INTEGER,
  quality_json TEXT NOT NULL DEFAULT '{}',
  consent_json TEXT NOT NULL DEFAULT '',
  respondent_key TEXT,
  cohort TEXT NOT NULL DEFAULT ''
);

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
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_form ON webhooks (form_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status_code INTEGER,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_wh ON webhook_deliveries (webhook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  submission_id INTEGER,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  field_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
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
  expires_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  form_id TEXT,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  condition_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_form ON workflows (form_id, active);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  submission_id INTEGER,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs (workflow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps (run_id, step_index);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip, created_at DESC);


CREATE TABLE IF NOT EXISTS chain_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL DEFAULT '',
  head_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  signature TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chain_anchors_form ON chain_anchors (form_id, created_at DESC);


CREATE TABLE IF NOT EXISTS response_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'view',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_views_submission ON response_views (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_views_created ON response_views (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_cohort ON submissions (form_id, cohort);
