-- Webhook delivery retries.
--
-- Deliveries used to be fire-once: a receiver that was down for ten seconds lost the
-- submission permanently, even though the UI promised retries. A failed row now carries
-- the payload it still owes plus a schedule, and the cron sweeper drains the backlog.
--
-- payload is dropped the moment a delivery succeeds or exhausts its attempts, so the
-- table never becomes a second, longer-lived copy of submission data. Erasure clears it
-- too -- see clearQueuedPayloadsForSubmission in db.ts.

ALTER TABLE webhook_deliveries ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhook_deliveries ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE webhook_deliveries ADD COLUMN payload TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN submission_id INTEGER;

-- The sweeper's hot query: due retries, oldest first.
CREATE INDEX IF NOT EXISTS idx_deliveries_due
  ON webhook_deliveries (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

-- Erasure needs to find queued payloads by submission without scanning.
CREATE INDEX IF NOT EXISTS idx_deliveries_submission
  ON webhook_deliveries (submission_id)
  WHERE submission_id IS NOT NULL;
