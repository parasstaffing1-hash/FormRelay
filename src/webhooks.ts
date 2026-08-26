import { WebhookRow } from "./types";
import { recordDelivery } from "./db";

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

async function postPayload(
  db: D1Database,
  hook: DeliveryTarget,
  event: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number | null; detail: string }> {
  const payload = JSON.stringify({ event, sent_at: new Date().toISOString(), ...body });
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

export async function deliverSubmission(
  db: D1Database,
  hook: DeliveryTarget,
  form: { id: string; name: string },
  submissionId: number,
  data: Record<string, string>,
  createdAt: number
): Promise<void> {
  const result = await postPayload(db, hook, "submission.created", {
    form: { id: form.id, name: form.name },
    submission: { id: submissionId, data, created_at: createdAt },
  });
  await recordDelivery(db, hook.id, "submission.created", result.status, result.ok, result.detail);
}

export async function sendTestWebhook(db: D1Database, hook: DeliveryTarget): Promise<{ ok: boolean; detail: string }> {
  const result = await postPayload(db, hook, "webhook.test", {
    form: { id: "test", name: "Test form" },
    submission: {
      id: 0,
      data: { name: "Test Person", email: "test@example.com", message: "This is a test delivery from FormRelay." },
      created_at: Date.now(),
    },
  });
  await recordDelivery(db, hook.id, "webhook.test", result.status, result.ok, result.detail);
  return { ok: result.ok, detail: result.detail };
}
