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
  one_per_respondent INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug) WHERE slug IS NOT NULL AND slug != '';

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
  updated_at INTEGER
);

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
