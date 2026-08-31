/**
 * Webhook retry policy.
 *
 * Pure decisions only — no database, no fetch — so the schedule and the retry/give-up
 * rules can be tested directly. `webhooks.ts` owns the I/O that acts on them.
 */

/**
 * Backoff, in milliseconds from the failed attempt. Six entries, so a receiver has just
 * over a day to come back before we give up. Deliberately coarse: the cron sweeper only
 * runs every five minutes, so sub-minute precision would be a lie.
 */
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

/** Total tries including the original delivery. */
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** When attempt N should next run, or null once the schedule is exhausted. */
export function nextAttemptAt(attempts: number, now: number): number | null {
  const delay = BACKOFF_MS[attempts - 1];
  return delay == null ? null : now + delay;
}

/**
 * A 4xx other than 408/429 means the receiver read the payload and refused it. Retrying
 * that for a day changes nothing and burns quota, so only transport failures, timeouts,
 * 408, 429, and 5xx are worth another attempt.
 */
export function isRetryable(status: number | null): boolean {
  if (status == null) return true; // network error or timeout
  if (status === 408 || status === 429) return true;
  return status >= 500;
}
