-- Apply once to an existing FormRelay D1 database after the original schema.
ALTER TABLE forms ADD COLUMN slug TEXT;
ALTER TABLE forms ADD COLUMN theme_json TEXT;
ALTER TABLE forms ADD COLUMN open_at INTEGER;
ALTER TABLE forms ADD COLUMN close_at INTEGER;
ALTER TABLE forms ADD COLUMN submission_limit INTEGER;
ALTER TABLE forms ADD COLUMN closed_message TEXT NOT NULL DEFAULT '';
ALTER TABLE forms ADD COLUMN one_per_respondent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE submissions ADD COLUMN resume_token_hash TEXT;
ALTER TABLE submissions ADD COLUMN resume_expires_at INTEGER;
ALTER TABLE submissions ADD COLUMN resume_revoked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN completed_at INTEGER;
ALTER TABLE submissions ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug) WHERE slug IS NOT NULL AND slug != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_resume_token ON submissions (resume_token_hash) WHERE resume_token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, form_id TEXT, name TEXT NOT NULL, trigger TEXT NOT NULL, condition_json TEXT NOT NULL DEFAULT '{}', actions_json TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_workflows_form ON workflows (form_id, active);
CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, submission_id INTEGER, status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs (workflow_id, started_at DESC);
CREATE TABLE IF NOT EXISTS workflow_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, step_index INTEGER NOT NULL, action_type TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, finished_at INTEGER, retry_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps (run_id, step_index);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', read_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- Workspace identity and member access.
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')), created_at INTEGER NOT NULL, PRIMARY KEY (user_id, workspace_id));
CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')), token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, accepted_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
ALTER TABLE forms ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws_default';
ALTER TABLE submissions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN note TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS form_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  published_json TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions (form_id, created_at DESC);
