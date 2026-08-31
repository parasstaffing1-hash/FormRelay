-- 0012: two-factor authentication for admin accounts.
-- One-time upgrade; new installs get this shape from schema.sql.

-- Second factor for admin accounts. The secret is stored in plain form because TOTP
-- verification needs the original value -- unlike a password, it cannot be hashed. That
-- makes the users table more sensitive than before, which is the trade a second factor
-- always makes; it is why recovery codes ARE hashed below.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_enrolled_at INTEGER;

-- Single-use recovery codes, hashed exactly like passwords: a database copy must not hand
-- over a working second factor. A used code keeps its row so the audit trail survives.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes (user_id) WHERE used_at IS NULL;
