import { Bindings } from "./types";
import { countRecentByIp } from "./db";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export type SpamVerdict = { spam: boolean; reason: string };

export async function checkSpam(
  env: Bindings,
  data: Record<string, string>,
  ip: string
): Promise<SpamVerdict> {
  const honeypot = data._gotcha ?? data._honeypot ?? data._hp ?? "";
  if (honeypot.trim() !== "") {
    return { spam: true, reason: "honeypot" };
  }

  const recent = await countRecentByIp(env.DB, ip, Date.now() - RATE_WINDOW_MS);
  if (recent >= RATE_LIMIT) {
    return { spam: true, reason: "rate-limit" };
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const token = data["cf-turnstile-response"] ?? "";
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }).toString(),
    });
    const result = (await res.json()) as { success: boolean };
    if (!result.success) {
      return { spam: true, reason: "captcha" };
    }
  }

  return { spam: false, reason: "" };
}

export function normalizePayload(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (rawValue == null) continue;
    let value: string;
    if (typeof File !== "undefined" && rawValue instanceof File) {
      value = rawValue.size > 0 ? `[file: ${rawValue.name}]` : "";
      if (!value) continue;
    } else if (Array.isArray(rawValue)) {
      value = rawValue.map((v) => String(v)).join(", ");
    } else {
      value = String(rawValue);
    }
    out[rawKey] = value;
  }
  return out;
}
