-- 0003: security hardening.
-- Adds brute-force tracking for the admin sign-in form. Safe to re-run.
--
-- Password hashing moved from unsalted SHA-256 to salted PBKDF2-SHA256. No data
-- migration is required: existing `password_hash` values are still accepted and are
-- transparently re-hashed to PBKDF2 the next time each user signs in successfully.

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip, created_at DESC);
