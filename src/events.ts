/**
 * Submission lifecycle events and idempotency.
 *
 * Two halves of the same promise — "one endpoint, every lead captured, nothing lost":
 *
 *  - The event timeline is the answer to "what actually happened to my lead?". Every stage
 *    of the pipeline writes one row, successes included, so a silent failure is visible as
 *    a missing step rather than as nothing at all.
 *  - Idempotency stops a retried or double-clicked submission becoming two leads, without
 *    which "at least once" delivery from a client turns into duplicate rows.
 *
 * Pure helpers only; `db.ts` owns persistence.
 */

export type EventStage =
  | "received"
  | "spam_checked"
  | "validated"
  | "persisted"
  | "notification"
  | "autoresponder"
  | "webhook"
  | "workflow"
  | "integration"
  | "file_stored"
  | "contact_linked";

export type EventStatus = "ok" | "failed" | "skipped" | "retrying";

export type SubmissionEvent = {
  id: number;
  submission_id: number;
  stage: EventStage;
  status: EventStatus;
  detail: string;
  /** HTTP status for outbound calls; null for internal stages. */
  response_status: number | null;
  attempt: number;
  created_at: number;
};

/** Human label for the timeline. Kept beside the type so a new stage cannot be unlabelled. */
export const STAGE_LABELS: Record<EventStage, string> = {
  received: "Submission received",
  spam_checked: "Spam check",
  validated: "Validation",
  persisted: "Submission persisted",
  notification: "Email notification",
  autoresponder: "Autoresponder",
  webhook: "Webhook delivery",
  workflow: "Workflow run",
  integration: "Integration sync",
  file_stored: "File stored",
  contact_linked: "Contact linked",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as EventStage] ?? stage;
}

/* ------------------------------------------------------------ idempotency */

/**
 * Idempotency keys.
 *
 * A client may supply `Idempotency-Key` (or `_idempotency_key` in the body). When it does,
 * a repeat of the same key on the same form returns the original submission instead of
 * creating a second one — the standard behaviour for a POST that a network layer might
 * retry.
 *
 * Keys are scoped per form so two forms cannot collide, and length-capped so a client
 * cannot use the column as storage.
 */
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_FIELD = "_idempotency_key";
const MAX_KEY_LENGTH = 200;

export function readIdempotencyKey(
  header: string | undefined,
  body: Record<string, unknown>
): string {
  const raw = header ?? (typeof body[IDEMPOTENCY_FIELD] === "string" ? String(body[IDEMPOTENCY_FIELD]) : "");
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return "";
  // Control characters would make the stored key unreadable in logs.
  return /^[\x20-\x7e]+$/.test(trimmed) ? trimmed : "";
}

/** Namespaced so the same key used on two forms is two distinct submissions. */
export function idempotencyScope(formId: string, key: string): string {
  return `${formId}:${key}`;
}

/* --------------------------------------------------------- content digest */

/**
 * Stable digest of the answer payload, used for duplicate detection when no idempotency
 * key was supplied. Control fields are excluded so a differing honeypot or token does not
 * make two identical submissions look distinct.
 */
export async function contentFingerprint(formId: string, values: Record<string, unknown>): Promise<string> {
  const canonical = Object.keys(values)
    .filter((key) => !key.startsWith("_"))
    .sort()
    .map((key) => `${key}=${String(values[key] ?? "")}`)
    .join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${formId}${canonical}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
