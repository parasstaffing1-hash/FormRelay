import { WebhookRow } from "./types";
import { recordDelivery, scheduleRetry, settleDelivery, claimDueDeliveries } from "./db";
import { isRetryable, nextAttemptAt, MAX_ATTEMPTS } from "./retry";

export { isRetryable, nextAttemptAt, MAX_ATTEMPTS } from "./retry";

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type DeliveryTarget = Pick<WebhookRow, "id" | "url" | "secret">;

/** How many due deliveries one cron tick will drain. Bounded to stay inside CPU limits. */
const SWEEP_BATCH = 50;

async function postPayload(
  hook: DeliveryTarget,
  payload: string,
  event: string
): Promise<{ ok: boolean; status: number | null; detail: string }> {
  const headers: Record<string, string> = { "content-type": "application/json", "X-FormRelay-Event": event };
  if (hook.secret) {
    headers["X-FormRelay-Signature"] = "sha256=" + (await hmacHex(payload, hook.secret));
  }
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? "delivered" : `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: null, detail: msg.slice(0, 200) || "request failed" };
  }
}

function buildPayload(
  event: string,
  form: { id: string; name: string },
  submissionId: number,
  data: Record<string, string>,
  createdAt: number
): string {
  return JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    form: { id: form.id, name: form.name },
    submission: { id: submissionId, data, created_at: createdAt },
  });
}

export async function deliverSubmission(
  db: D1Database,
  hook: DeliveryTarget,
  form: { id: string; name: string },
  submissionId: number,
  data: Record<string, string>,
  createdAt: number
): Promise<void> {
  const event = "submission.created";
  const payload = buildPayload(event, form, submissionId, data, createdAt);
  const result = await postPayload(hook, payload, event);

  // Hold the payload only while a retry is still owed; a delivered or dead row keeps
  // just the status line, so submission data does not accumulate a second home here.
  const retryAt = result.ok || !isRetryable(result.status) ? null : nextAttemptAt(1, Date.now());
  await recordDelivery(db, {
    webhookId: hook.id,
    event,
    statusCode: result.status,
    ok: result.ok,
    detail: result.ok ? result.detail : `${result.detail} (attempt 1/${MAX_ATTEMPTS})`,
    submissionId,
    payload: retryAt == null ? null : payload,
    nextAttemptAt: retryAt,
  });
}

export async function sendTestWebhook(db: D1Database, hook: DeliveryTarget): Promise<{ ok: boolean; detail: string }> {
  const event = "webhook.test";
  const payload = buildPayload(
    event,
    { id: "test", name: "Test form" },
    0,
    { name: "Test Person", email: "test@example.com", message: "This is a test delivery from FormRelay." },
    Date.now()
  );
  const result = await postPayload(hook, payload, event);
  // Never queued: a manual test is a question about right now, not a promise to deliver.
  await recordDelivery(db, {
    webhookId: hook.id,
    event,
    statusCode: result.status,
    ok: result.ok,
    detail: result.detail,
    submissionId: null,
    payload: null,
    nextAttemptAt: null,
  });
  return { ok: result.ok, detail: result.detail };
}

export type SweepReport = { claimed: number; delivered: number; requeued: number; exhausted: number };

/**
 * Drain due retries. Called from the cron trigger. Each row is re-posted with the exact
 * payload captured at submission time, so a receiver that recovers gets what it was
 * originally owed rather than a re-read of possibly-since-edited data.
 */
export async function sweepRetries(db: D1Database, now = Date.now()): Promise<SweepReport> {
  const due = await claimDueDeliveries(db, now, SWEEP_BATCH);
  const report: SweepReport = { claimed: due.length, delivered: 0, requeued: 0, exhausted: 0 };

  for (const row of due) {
    if (!row.payload || !row.url) {
      await settleDelivery(db, row.id, null, false, "dropped: webhook or payload no longer available");
      report.exhausted++;
      continue;
    }
    const attempt = row.attempts + 1;
    const result = await postPayload({ id: row.webhook_id, url: row.url, secret: row.secret ?? "" }, row.payload, row.event);

    if (result.ok) {
      await settleDelivery(db, row.id, result.status, true, `delivered on attempt ${attempt}`);
      report.delivered++;
      continue;
    }
    const retryAt = isRetryable(result.status) ? nextAttemptAt(attempt, now) : null;
    if (retryAt == null) {
      await settleDelivery(db, row.id, result.status, false, `${result.detail} — gave up after ${attempt} attempts`);
      report.exhausted++;
    } else {
      await scheduleRetry(db, row.id, attempt, retryAt, result.status, `${result.detail} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      report.requeued++;
    }
  }
  return report;
}
