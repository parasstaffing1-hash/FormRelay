import { Hono } from "hono";
import type { Bindings, ApiKeyRow } from "./types";
import {
  listForms,
  getForm,
  createForm,
  countSubmissionsForForm,
  getSubmission,
  deleteSubmission,
} from "./db";
import { findApiKeyByHash, touchApiKey } from "./db";
import { audit } from "./audit";

// In-memory per-key rate limit — Caveat: this Map is per isolate / Worker instance,
// not shared across edge isolates or restarts. It provides best-effort throttling
// (approx 60 req/min per key) but is not a global distributed limiter. For strict
// enforcement a Durable Object or KV-based counter would be needed.

const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ApiEnv = { Bindings: Bindings; Variables: { apiKey: ApiKeyRow } };

const api = new Hono<ApiEnv>();

api.use("*", async (c, next) => {
  const auth = c.req.header("Authorization") ?? c.req.header("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const hash = await sha256Hex(token);
  const key = await findApiKeyByHash(c.env.DB, hash);
  if (!key) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const now = Date.now();
  const entry = rateLimit.get(key.id);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(key.id, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    if (entry.count >= RATE_MAX) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    entry.count += 1;
  }
  try {
    await touchApiKey(c.env.DB, key.id);
  } catch {
    // best-effort
  }
  c.set("apiKey", key);
  await next();
});

api.get("/forms", async (c) => {
  const forms = await listForms(c.env.DB);
  return c.json({ ok: true, forms });
});

api.post("/forms", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const obj = body as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) {
    return c.json({ error: "name required" }, 400);
  }
  const schemaVal = (obj as Record<string, unknown>).schema;
  let schemaJson: string | null = null;
  if (schemaVal !== undefined && schemaVal !== null) {
    if (typeof schemaVal !== "object" || Array.isArray(schemaVal)) {
      // allow object only
      if (typeof schemaVal !== "object") {
        return c.json({ error: "schema must be object" }, 400);
      }
    }
    try {
      schemaJson = JSON.stringify(schemaVal);
    } catch {
      return c.json({ error: "invalid schema" }, 400);
    }
  }
  const form = await createForm(c.env.DB, { name, schemaJson });
  await audit(c.env.DB, "form.created", form.id, name);
  return c.json({ ok: true, form }, 201);
});

api.get("/forms/:id", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, form });
});

api.get("/forms/:id/responses", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.json({ error: "Not found" }, 404);
  const url = new URL(c.req.url);
  const pageRaw = url.searchParams.get("page");
  const perPageRaw = url.searchParams.get("per_page") ?? url.searchParams.get("perPage");
  let page = pageRaw ? Number(pageRaw) : 1;
  if (!Number.isInteger(page) || page < 1) page = 1;
  let perPage = perPageRaw ? Number(perPageRaw) : 50;
  if (!Number.isInteger(perPage) || perPage < 1) perPage = 50;
  perPage = Math.min(perPage, 50);
  const total = await countSubmissionsForForm(c.env.DB, id);
  const offset = (page - 1) * perPage;
  const { results } = await c.env.DB
    .prepare("SELECT * FROM submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(id, perPage, offset)
    .all();
  const responses = results ?? [];
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return c.json({ ok: true, responses, page, per_page: perPage, total, total_pages: totalPages });
});

api.get("/responses/:id", async (c) => {
  const raw = c.req.param("id");
  const num = Number(raw);
  if (!Number.isInteger(num)) return c.json({ error: "Not found" }, 404);
  const sub = await getSubmission(c.env.DB, num);
  if (!sub) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, response: sub });
});

api.delete("/responses/:id", async (c) => {
  const raw = c.req.param("id");
  const num = Number(raw);
  if (!Number.isInteger(num)) return c.json({ error: "Not found" }, 404);
  const sub = await getSubmission(c.env.DB, num);
  if (!sub) return c.json({ error: "Not found" }, 404);
  await deleteSubmission(c.env.DB, num);
  await audit(c.env.DB, "response.deleted", String(num), sub.form_id ?? "");
  return c.json({ ok: true });
});

export default api;
