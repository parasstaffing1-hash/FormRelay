/**
 * Cross-isolate rate limiting.
 *
 * The previous limiter lived in a module-level `Map` inside `api.ts`. That map is per
 * isolate: Cloudflare runs many isolates per colo and recycles them freely, so a caller
 * could exceed the limit simply by being routed to a fresh one, and every isolate restart
 * silently forgave the whole window. It throttled honest clients and no one else.
 *
 * The counter now lives in D1, which every isolate shares, so the limit is global.
 *
 * Fixed windows, not a sliding log. A fixed window admits at most 2x the limit across a
 * window boundary, which is the standard trade; storing one row per caller instead of one
 * row per request is worth that. The alternative — a Durable Object per key — is stricter
 * still, but it costs a paid-plan binding this project deliberately does not require.
 *
 * Pure decisions are separated from the single D1 statement so the arithmetic is testable
 * without a database, matching `retry.ts`.
 */

/** Where the fixed window containing `now` begins. Windows are aligned to the epoch. */
export function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export type RateVerdict = {
  allowed: boolean;
  /** Requests still available in this window; never negative. */
  remaining: number;
  /** When the current window expires and the count resets. */
  resetAt: number;
  /** Whole seconds until reset, floored at 1 — the value for `Retry-After`. */
  retryAfter: number;
};

/**
 * Turns a post-increment count into a verdict. `count` is the number of requests made in
 * this window *including* the one being decided, so the limit is reached when it exceeds
 * `limit` — a limit of 60 admits counts 1..60 and rejects 61.
 */
export function verdictFor(count: number, limit: number, windowStart: number, windowMs: number, now: number): RateVerdict {
  const resetAt = windowStart + windowMs;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/** Headers describing the verdict, using the widely-supported `X-RateLimit-*` convention. */
export function rateLimitHeaders(limit: number, verdict: RateVerdict): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(Math.floor(verdict.resetAt / 1000)),
  };
  if (!verdict.allowed) headers["Retry-After"] = String(verdict.retryAfter);
  return headers;
}

/**
 * Counts one request against `bucket` and returns the verdict.
 *
 * The increment is a single UPSERT so two concurrent requests cannot both read the old
 * count and write the same new one. `RETURNING` hands back the post-increment value in the
 * same statement, which is what makes it race-free — a separate SELECT would reintroduce
 * the gap. When the stored window has rolled over, the CASE resets the count to 1 rather
 * than adding to a stale window.
 *
 * Fails **open**: if D1 is unavailable the request is allowed. A limiter that fails closed
 * turns a transient database blip into a total API outage, which is the worse failure for
 * a self-hosted form backend. The caller cannot distinguish it, so this is deliberate.
 */
export async function consume(
  db: D1Database,
  bucket: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): Promise<RateVerdict> {
  const start = windowStartFor(now, windowMs);
  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_counters (bucket, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET
           count = CASE WHEN rate_counters.window_start = ? THEN rate_counters.count + 1 ELSE 1 END,
           window_start = ?
         RETURNING count`
      )
      .bind(bucket, start, start, start)
      .first<{ count: number }>();
    const count = row?.count ?? 1;
    return verdictFor(count, limit, start, windowMs, now);
  } catch {
    return verdictFor(1, limit, start, windowMs, now);
  }
}

/**
 * Drops counters whose window has already closed. Called from the existing five-minute
 * cron; without it the table grows one permanent row per caller that ever appeared.
 * Rows from the current window are kept, so a sweep never forgives a live limit.
 */
export async function sweepRateCounters(db: D1Database, windowMs: number, now: number = Date.now()): Promise<void> {
  await db.prepare("DELETE FROM rate_counters WHERE window_start < ?").bind(windowStartFor(now, windowMs)).run();
}
