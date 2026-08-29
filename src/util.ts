export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function randomToken(len = 10): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function hmacVerify(payload: string, sig: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const rounded = i === 0 ? String(value) : value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[i]}`;
}

export function relTime(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 45_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

export function submissionRef(id: number): string {
  return `FRA-${String(id).padStart(5, "0")}`;
}

/* ---------- password hashing ---------- */

// PBKDF2-SHA256. Iterations are deliberately modest so a login stays inside the
// Cloudflare Workers free-tier CPU budget; raise PASSWORD_ITERATIONS on paid plans.
const PASSWORD_ITERATIONS = 50_000;

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

/** Returns a self-describing `pbkdf2$<iterations>$<salt>$<hash>` string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies against a PBKDF2 hash, or against a legacy unsalted SHA-256 hex digest.
 * `needsUpgrade` is true for legacy hashes so callers can transparently re-hash on login.
 */
export async function verifyPassword(
  password: string,
  stored: string,
  legacySha256: (input: string) => Promise<string>
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (stored.startsWith("pbkdf2$")) {
    const [, rawIterations, rawSalt, rawHash] = stored.split("$");
    const iterations = Number(rawIterations);
    if (!Number.isInteger(iterations) || iterations < 1 || !rawSalt || !rawHash) return { ok: false, needsUpgrade: false };
    try {
      const hash = await pbkdf2(password, unb64(rawSalt), iterations);
      return { ok: timingSafeEqual(b64(hash), rawHash), needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  const ok = timingSafeEqual(await legacySha256(password), stored);
  return { ok, needsUpgrade: ok };
}

/** Escapes `<` so a JSON payload can be safely inlined inside a <script> element. */
export function escapeScriptJson(json: string): string {
  return json.replace(/</g, "\\u003c");
}
