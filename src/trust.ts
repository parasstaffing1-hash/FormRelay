import { hmacSign, hmacVerify } from "./util";

async function sha256Bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

async function sha256Hex(input: string): Promise<string> {
  return [...(await sha256Bytes(input))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------ proof of work */

/**
 * Proof-of-work spam gate.
 *
 * An alternative to a CAPTCHA that needs no third party and shows the respondent nothing:
 * the browser must find a nonce whose digest starts with `bits` zero bits before the
 * submission is accepted. Cost is exponential in `bits` for the sender and a single hash
 * for us, which prices out bulk spam without inconveniencing one honest submitter.
 *
 * The challenge is an HMAC over a timestamp, so it needs no server-side storage and
 * cannot be minted by the client.
 */
export const POW_TTL_MS = 30 * 60 * 1000;

export function powChallengePayload(formId: string, issuedAt: number): string {
  return `pow${formId}${issuedAt}`;
}

export async function issuePowChallenge(formId: string, secret: string, now = Date.now()): Promise<string> {
  return `${now}.${await hmacSign(powChallengePayload(formId, now), secret)}`;
}

function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let mask = 0x80; mask > 0; mask >>= 1) {
      if (byte & mask) return bits;
      bits += 1;
    }
    return bits;
  }
  return bits;
}

export async function solutionMeetsDifficulty(challenge: string, nonce: string, bits: number): Promise<boolean> {
  if (bits <= 0) return true;
  return leadingZeroBits(await sha256Bytes(`${challenge}${nonce}`)) >= bits;
}

export type PowVerdict = { ok: boolean; reason?: string };

export async function verifyPow(
  formId: string,
  challenge: string,
  nonce: string,
  bits: number,
  secret: string,
  now = Date.now()
): Promise<PowVerdict> {
  if (bits <= 0) return { ok: true };
  const dot = challenge.indexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed challenge" };
  const issuedAt = Number(challenge.slice(0, dot));
  const signature = challenge.slice(dot + 1);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: "malformed challenge" };
  if (now - issuedAt > POW_TTL_MS) return { ok: false, reason: "challenge expired" };
  // A challenge dated in the future would let a client pre-mine indefinitely.
  if (issuedAt - now > 60_000) return { ok: false, reason: "challenge not yet valid" };
  if (!(await hmacVerify(powChallengePayload(formId, issuedAt), signature, secret))) {
    return { ok: false, reason: "challenge signature invalid" };
  }
  if (!(await solutionMeetsDifficulty(challenge, nonce, bits))) return { ok: false, reason: "insufficient work" };
  return { ok: true };
}

/* --------------------------------------------------- anonymous but unique */

/**
 * One response per person, without learning who they are.
 *
 * The respondent supplies an identifier (staff number, email, membership id). It is
 * HMAC'd with a per-form salt and only the digest is stored, so duplicates collide while
 * the raw identifier never reaches the database. Useful for anonymous staff surveys and
 * ballots, where "one each" and "we cannot tell who said what" are both required.
 */
export async function blindIdentity(formId: string, identifier: string, secret: string): Promise<string> {
  return sha256Hex(`blind${formId}${identifier.trim().toLowerCase()}${secret}`);
}

/* ------------------------------------------------------- consent receipts */

/**
 * A consent receipt records exactly which wording someone agreed to, so a later dispute
 * can be settled against the text as it stood that day rather than as it reads now.
 */
export type ConsentReceipt = {
  text: string;
  version: string;
  accepted_at: number;
};

export async function consentVersion(text: string): Promise<string> {
  return (await sha256Hex(text.trim())).slice(0, 16);
}

export async function buildConsentReceipt(text: string, acceptedAt = Date.now()): Promise<ConsentReceipt> {
  return { text: text.trim(), version: await consentVersion(text), accepted_at: acceptedAt };
}

/* ------------------------------------------------------- quality scoring */

/**
 * Response quality signals for survey and panel work.
 *
 * These are advisory: they flag responses worth a human look, and deliberately never
 * discard anything. Panel fraud and inattentive answering are the usual targets.
 */
export type QualitySignal = "speeding" | "straightlining" | "low_effort_text" | "duplicate_text";

export type QualityReport = {
  score: number;
  signals: QualitySignal[];
  elapsed_ms: number | null;
};

export type QualityInput = {
  values: Record<string, string>;
  /** Field ids whose answers come from a fixed choice list. */
  choiceFields: string[];
  /** Field ids that accept free text. */
  textFields: string[];
  elapsedMs: number | null;
  /** Below this, a response was almost certainly not read. */
  minPlausibleMs?: number;
};

export function scoreQuality(input: QualityInput): QualityReport {
  const signals: QualitySignal[] = [];
  const floor = input.minPlausibleMs ?? 1500 * Math.max(1, input.choiceFields.length + input.textFields.length);

  if (input.elapsedMs !== null && input.elapsedMs < floor) signals.push("speeding");

  const choiceAnswers = input.choiceFields.map((id) => (input.values[id] ?? "").trim()).filter(Boolean);
  if (choiceAnswers.length >= 4 && new Set(choiceAnswers).size === 1) signals.push("straightlining");

  const textAnswers = input.textFields.map((id) => (input.values[id] ?? "").trim()).filter(Boolean);
  const lowEffort = textAnswers.filter((answer) => answer.length < 4 || /^(.)\1*$/.test(answer.replace(/\s/g, "")));
  if (textAnswers.length > 0 && lowEffort.length === textAnswers.length) signals.push("low_effort_text");

  if (textAnswers.length >= 2 && new Set(textAnswers.map((a) => a.toLowerCase())).size === 1) signals.push("duplicate_text");

  // Each signal is worth 25 points off a clean 100.
  const score = Math.max(0, 100 - signals.length * 25);
  return { score, signals, elapsed_ms: input.elapsedMs };
}

/* --------------------------------------------- signed render timestamp */

/**
 * Timing needs a start point the respondent cannot forge, so the render time is signed
 * and echoed back with the submission rather than trusted from the client.
 */
export async function issueStartToken(formId: string, secret: string, now = Date.now()): Promise<string> {
  return `${now}.${await hmacSign(`start${formId}${now}`, secret)}`;
}

export async function elapsedFromStartToken(formId: string, token: string, secret: string, now = Date.now()): Promise<number | null> {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const issuedAt = Number(token.slice(0, dot));
  if (!Number.isFinite(issuedAt)) return null;
  if (!(await hmacVerify(`start${formId}${issuedAt}`, token.slice(dot + 1), secret))) return null;
  const elapsed = now - issuedAt;
  return elapsed >= 0 ? elapsed : null;
}

/* ------------------------------------------------ field-level access control */

export type FieldAcl = Record<string, string[]>;

export function parseFieldAcl(raw: string | null | undefined): FieldAcl {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const acl: FieldAcl = {};
    for (const [field, roles] of Object.entries(parsed)) {
      if (Array.isArray(roles)) acl[field] = roles.map(String);
    }
    return acl;
  } catch {
    return {};
  }
}

/** A field with no rule is visible to everyone; owners always see everything. */
export function canSeeField(acl: FieldAcl, field: string, role: string): boolean {
  if (role === "owner") return true;
  const allowed = acl[field];
  return !allowed || allowed.length === 0 || allowed.includes(role);
}

export function redactForRole<T>(values: Record<string, T>, acl: FieldAcl, role: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [field, value] of Object.entries(values)) {
    if (canSeeField(acl, field, role)) out[field] = value;
  }
  return out;
}
