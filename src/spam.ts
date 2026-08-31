import { Bindings } from "./types";
import { countRecentByIp } from "./db";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const TURNSTILE_ACTION = "form-submit";

export type SpamVerdict = { spam: boolean; reason: string };

export async function checkSpam(
  env: Bindings,
  data: Record<string, string>,
  ip: string,
  requestHostname = "",
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
    const expectedHostnames = new Set(
      (env.TURNSTILE_HOSTNAMES ?? "")
        .split(",")
        .map((hostname) => hostname.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!token || token.length > 2048 || expectedHostnames.size === 0) {
      throw new Error("Turnstile is enabled but the token or hostname allowlist is missing");
    }
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }).toString(),
    });
    if (!res.ok) throw new Error("Turnstile siteverify returned HTTP " + res.status);
    const result = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    if (
      result.success !== true ||
      result.action !== TURNSTILE_ACTION ||
      !expectedHostnames.has((result.hostname ?? "").toLowerCase()) ||
      (requestHostname !== "" && !expectedHostnames.has(requestHostname.toLowerCase()))
    ) {
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
