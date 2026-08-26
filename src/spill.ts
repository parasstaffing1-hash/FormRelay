import { Bindings } from "./types";

export async function spillIfLarge(env: Bindings, text: string): Promise<string> {
  if (text.length <= 10000 || !env.FILES) return text;
  const key = `spill/${crypto.randomUUID()}.json`;
  await env.FILES.put(key, text, { httpMetadata: { contentType: "application/json" } });
  return `r2://${key}`;
}

export async function resolveSpilledData(env: Bindings, raw: string): Promise<string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  const spilled = parsed["_spilled"];
  if (typeof spilled !== "string" || !spilled.startsWith("r2://")) return raw;
  if (!env.FILES) return raw;
  const key = spilled.slice(5);
  try {
    const obj = await env.FILES.get(key);
    if (!obj) return raw;
    const text = await obj.text();
    // Validate that fetched content is JSON; if valid, optionally preserve _labels from pointer wrapper
    try {
      const original = JSON.parse(text) as Record<string, unknown>;
      const labels = parsed["_labels"];
      if (labels && typeof original === "object" && original !== null && !("_labels" in original)) {
        (original as Record<string, unknown>)["_labels"] = labels;
      }
      return JSON.stringify(original);
    } catch {
      return text;
    }
  } catch {
    return raw;
  }
}
