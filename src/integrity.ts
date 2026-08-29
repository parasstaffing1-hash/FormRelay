import { hmacSign, hmacVerify } from "./util";

/* ---------------------------------------------------------------- hash chain */

/**
 * Tamper-evident response log.
 *
 * Every completed response commits to the one before it, so altering, deleting, or
 * back-dating a stored row breaks the chain from that point onward and the break is
 * detectable without a copy of the original data.
 *
 * The digest deliberately covers only immutable submission facts. Mutable admin
 * metadata (tags, notes, status, spam flag) is excluded so ordinary triage does not
 * invalidate the chain.
 */
export type ChainLink = {
  id: number;
  form_id: string;
  data: string;
  created_at: number;
  prev_hash: string;
  row_hash: string;
  /** Set when the respondent erased their own answers; the row survives as a tombstone. */
  erased_at?: number | null;
};

const GENESIS = "0".repeat(64);

export function genesisHash(): string {
  return GENESIS;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fields join with a unit separator (U+001F) so distinct values cannot run together into one digest. */
export function chainPayload(link: Omit<ChainLink, "row_hash">): string {
  return [link.prev_hash, String(link.id), link.form_id, String(link.created_at), link.data].join("\u001f");
}

export async function computeRowHash(link: Omit<ChainLink, "row_hash">): Promise<string> {
  return sha256Hex(chainPayload(link));
}

export type ChainVerdict =
  | { ok: true; checked: number; erased: number; head: string }
  | { ok: false; checked: number; erased: number; head: string; brokenAt: number; reason: string };

/**
 * Walks a chain in ascending id order. Rows written before the chain existed carry an
 * empty row_hash; they are skipped rather than reported as tampering, and the chain
 * resumes from the first row that has one.
 */
export async function verifyChain(links: ChainLink[]): Promise<ChainVerdict> {
  let expectedPrev: string | null = null;
  let checked = 0;
  let erased = 0;
  let head = GENESIS;

  for (const link of links) {
    if (!link.row_hash) continue;

    if (expectedPrev !== null && link.prev_hash !== expectedPrev) {
      return {
        ok: false,
        checked,
        erased,
        head,
        brokenAt: link.id,
        reason: `response ${link.id} points at ${link.prev_hash.slice(0, 12) || "(empty)"}… but the previous response hashes to ${expectedPrev.slice(0, 12)}…`,
      };
    }

    // An erasure is a disclosed, respondent-authorised deletion, not tampering. The
    // tombstone keeps its original digest so the chain still links through it; only the
    // content check is skipped, because the content is intentionally gone.
    if (link.erased_at) {
      expectedPrev = link.row_hash;
      head = link.row_hash;
      erased += 1;
      continue;
    }

    const recomputed = await computeRowHash({
      id: link.id,
      form_id: link.form_id,
      data: link.data,
      created_at: link.created_at,
      prev_hash: link.prev_hash,
    });

    if (recomputed !== link.row_hash) {
      return {
        ok: false,
        checked,
        erased,
        head,
        brokenAt: link.id,
        reason: `response ${link.id} no longer matches its recorded digest — its stored content changed after it was written`,
      };
    }

    expectedPrev = recomputed;
    head = recomputed;
    checked += 1;
  }

  return { ok: true, checked, erased, head };
}

/* ------------------------------------------------------------- signed prefill */

/**
 * Signed prefill links.
 *
 * Prefill normally comes from plain query parameters, so anyone holding a link can edit
 * what it pre-populates. When a form requires signed prefill, the values must carry an
 * HMAC over the exact key/value set, which makes the link tamper-evident.
 */
export const PREFILL_SIG_PARAM = "_sig";

/** Sorted `key=value` pairs joined by a unit separator (U+001F), so a value containing `=` cannot collide. */
export function prefillPayload(values: Record<string, string>): string {
  return Object.keys(values)
    .filter((key) => key !== PREFILL_SIG_PARAM)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join("\u001f");
}

export async function signPrefill(values: Record<string, string>, secret: string): Promise<string> {
  return hmacSign(prefillPayload(values), secret);
}

export async function verifyPrefill(values: Record<string, string>, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return hmacVerify(prefillPayload(values), signature, secret);
}

/** Builds a shareable prefill URL whose values cannot be edited without detection. */
export async function buildPrefillUrl(base: string, values: Record<string, string>, secret: string): Promise<string> {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  url.searchParams.set(PREFILL_SIG_PARAM, await signPrefill(values, secret));
  return url.toString();
}
