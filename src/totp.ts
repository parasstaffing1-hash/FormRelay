/**
 * Time-based one-time passwords (RFC 6238) and recovery codes.
 *
 * The admin password is the only thing standing between an attacker and every submission
 * this deployment holds -- names, emails, phone numbers, uploaded files. A second factor is
 * the difference between a leaked password being an incident and being a breach.
 *
 * Implemented directly on Web Crypto rather than pulling a library: TOTP is an HMAC and a
 * modulo, the Workers runtime has HMAC-SHA-1 built in, and a dependency that touches
 * authentication is a dependency worth not having.
 *
 * Everything here except `verify` is synchronous and pure, so the encoding and the
 * truncation can be checked against the RFC's published test vectors.
 */

/** RFC 4648 base32 alphabet. Authenticator apps expect secrets in this encoding. */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  // Padding and casing vary between authenticator apps; normalise before decoding.
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new 160-bit secret, the size RFC 4226 recommends for HMAC-SHA-1. */
export function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export const PERIOD_SECONDS = 30;
export const DIGITS = 6;

/** The counter value for a moment in time. Shared by generation and verification. */
export function counterFor(nowMs: number, period = PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / period);
}

/** The 8-byte big-endian counter block RFC 4226 hashes. */
function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  // Split rather than using BigInt shifts: counters stay well inside 2^53 until the year
  // 8.5 million, and this keeps the arithmetic in plain numbers.
  let high = Math.floor(counter / 0x100000000);
  let low = counter >>> 0;
  for (let i = 7; i >= 4; i--) { buf[i] = low & 255; low = low >>> 8; }
  for (let i = 3; i >= 0; i--) { buf[i] = high & 255; high = Math.floor(high / 256); }
  return buf;
}

/** The RFC 4226 dynamic-truncation step: pick 4 bytes by the low nibble, mask the sign. */
export function truncate(hmac: Uint8Array, digits = DIGITS): string {
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Copies bytes into a plain ArrayBuffer.
 *
 * TypeScript 5.7 made Uint8Array generic over its backing buffer, so a Uint8Array that
 * might sit on a SharedArrayBuffer is no longer assignable to BufferSource. Copying is
 * explicit about the intent and costs nothing at these sizes -- 20 bytes of key, 8 of
 * counter -- where a cast would just silence the checker.
 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toBuffer(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, toBuffer(message)));
}

/** The code for a given secret and counter. */
export async function codeForCounter(secret: string, counter: number, digits = DIGITS): Promise<string> {
  return truncate(await hmacSha1(base32Decode(secret), counterBytes(counter)), digits);
}

/** The code a correctly-configured authenticator app shows right now. */
export async function currentCode(secret: string, nowMs = Date.now()): Promise<string> {
  return codeForCounter(secret, counterFor(nowMs));
}

/**
 * Checks a submitted code, allowing for clock skew.
 *
 * `window` is the number of periods accepted either side of now: 1 means the previous,
 * current, and next 30-second step, which is the usual tolerance. Wider windows are a real
 * cost -- each extra step multiplies an attacker's chance of a blind guess -- so this is
 * deliberately not generous.
 *
 * The comparison is length-then-constant-time. A plain `===` on a short numeric string
 * leaks little, but this is the one place where being careless is indefensible.
 */
export async function verify(secret: string, submitted: string, nowMs = Date.now(), window = 1): Promise<boolean> {
  const cleaned = submitted.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = counterFor(nowMs);
  let matched = false;
  for (let offset = -window; offset <= window; offset++) {
    const candidate = await codeForCounter(secret, counter + offset);
    // No early exit: every candidate is compared so the loop takes the same time whether
    // the match is the first step or the last.
    if (timingSafeEqual(candidate, cleaned)) matched = true;
  }
  return matched;
}

/** Constant-time string comparison for equal-length digit strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The otpauth:// URI an authenticator app scans.
 *
 * The issuer appears twice by convention -- as a label prefix and as a parameter -- because
 * older apps read one and newer ones read the other.
 */
export function otpauthUri(secret: string, account: string, issuer = "FormRelay"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------------------------------------------ recovery */

/**
 * Recovery codes exist because a lost phone must not mean a lost workspace. They are
 * single-use and stored as hashes, exactly like passwords -- a database copy must not hand
 * over a working second factor.
 */
export const RECOVERY_CODE_COUNT = 10;

/** Ambiguous characters are excluded: these get written down and read back by humans. */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const body = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    codes.push(`${body.slice(0, 5)}-${body.slice(5, 10)}`);
  }
  return codes;
}

/** Normalises before hashing so case and stray dashes do not defeat a valid code. */
export function normaliseRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}
