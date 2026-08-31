-- 0011: shared API rate-limit counters.
-- One-time upgrade; new installs get this shape from schema.sql.

-- The API limiter previously counted in isolate memory, so the limit reset on every
-- isolate recycle and was never shared between them. This table makes the counter global.
CREATE TABLE IF NOT EXISTS rate_counters (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_counters_window ON rate_counters (window_start);
