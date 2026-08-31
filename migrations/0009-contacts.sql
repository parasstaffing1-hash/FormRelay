-- 0009: contacts, deduplication, lead status and lead scoring.
-- One-time upgrade; new installs get this shape from schema.sql.

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  -- Deterministic identity: email:<addr> or phone:<e164>. Never a name.
  dedupe_key TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  submission_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  lead_score INTEGER NOT NULL DEFAULT 0,
  score_breakdown TEXT NOT NULL DEFAULT '[]',
  score_version TEXT NOT NULL DEFAULT '',
  source_form TEXT NOT NULL DEFAULT '',
  utm_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_dedupe ON contacts (workspace_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts (lead_score DESC);

-- Link submissions to the contact they belong to, plus per-submission lead data.
ALTER TABLE submissions ADD COLUMN contact_id TEXT;
ALTER TABLE submissions ADD COLUMN lead_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN score_breakdown TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_submissions_contact ON submissions (contact_id, created_at DESC);

-- Per-form scoring rules; empty means the workspace defaults apply.
ALTER TABLE forms ADD COLUMN score_rules_json TEXT NOT NULL DEFAULT '';
