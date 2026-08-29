-- 0004: tamper-evident response log, respondent receipts, signed prefill.
--
-- One-time upgrade: SQLite ALTER TABLE ... ADD COLUMN is not idempotent, so this
-- errors on a database that already has these columns. New installs get the
-- current shape from schema.sql and do not need to run this.

-- Tamper-evident log: every completed response hash-chains to the one before it.
ALTER TABLE submissions ADD COLUMN prev_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN row_hash TEXT NOT NULL DEFAULT '';

-- Respondent receipt: lets a submitter view, export, or erase their own response
-- without an account. Only the hash is stored; the token itself is shown once.
ALTER TABLE submissions ADD COLUMN receipt_token_hash TEXT;
ALTER TABLE submissions ADD COLUMN erased_at INTEGER;

-- Signed prefill: when set, the form only accepts prefill values carrying a valid
-- signature, so a link cannot be edited to change what is pre-populated.
ALTER TABLE forms ADD COLUMN prefill_signed_only INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_submissions_receipt ON submissions (receipt_token_hash);

-- Periodic anchors over the chain head, so an operator can prove the log they
-- publish today still matches the log they had yesterday.
CREATE TABLE IF NOT EXISTS chain_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT NOT NULL DEFAULT '',
  head_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  signature TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chain_anchors_form ON chain_anchors (form_id, created_at DESC);
