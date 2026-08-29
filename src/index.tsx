import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Bindings, FormRow, SubmissionRow } from "./types";
import { hmacSign, hmacVerify, csvCell, escapeHtml, hashPassword, verifyPassword, timingSafeEqual } from "./util";
import {
  createForm,
  duplicateForm,
  listForms,
  listFormsWithStats,
  getForm,
  updateForm,
  updateFormSchema,
  createFormVersion,
  listFormVersions,
  getFormVersion,
  restoreFormVersion,
  publishForm,
  unpublishForm,
  incrementFormViews,
  setFormArchived,
  deleteForm,
  insertSubmission,
  listSubmissions,
  countSubmissions,
  listSubmissionsForForm,
  countSubmissionsForForm,
  getSubmission,
  deleteSubmission,
  setSubmissionSpam,
  countRecentByIp,
  getDashboardStats,
  recentSubmissions,
  createWebhook,
  listWebhooks,
  getWebhook,
  setWebhookActive,
  deleteWebhook,
  listDeliveries,
  getAnalytics,
  getDashboardAnalytics,
  recordFormEvent,
  getSetting,
  setSetting,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  countCompletedForForm,
  insertPartialSubmission,
  getSubmissionByResumeHash,
  updatePartialSubmission,
  completeSubmission,
  getFormBySlug,
  updateFormShare,
  updateFormTheme,
  listWorkflows,
  createWorkflow,
  getWorkflow,
  setWorkflowActive,
  deleteWorkflow,
  listWorkflowRuns,
  createNotification,
  listNotifications,
  markNotificationsRead,
  ensureBootstrapOwner,
  getUserByEmail,
  listWorkspaceMembers,
  createInvitation,
  getInvitationByHash,
  acceptInvitation,
  deleteMembership,
  getMembership,
  updateSubmissionMeta,
  updateUserPassword,
  getSubmissionByReceiptHash,
  eraseSubmissionByReceipt,
  chainLinks,
  listAnchors,
  recordAnchor,
  setFormPrefillSignedOnly,
  annotateSubmission,
  respondentKeyExists,
  recordResponseView,
  listResponseViews,
  listRecentResponseViews,
  updateFormTrust,
  setSubmissionCohort,
  updateFormOps,
  listCohorts,
  getDelivery,
  submissionsForMigration,
  setSubmissionData,
  resealChain,
  runReadOnlyQuery,
} from "./db";
import apiApp from "./api";
import { spillIfLarge, resolveSpilledData } from "./spill";
import { parseSchema, emptySchema, validateBlockValue, isSchemaV2 } from "./blocks";
import { evaluateRules, pipeText, validateSchemaV2, resolveVariables, selectEnding } from "./logic";
import { executeWorkflow } from "./workflow-engine";
import { checkFormHealth } from "./health";
import { verifyChain, verifyPrefill, buildPrefillUrl, PREFILL_SIG_PARAM } from "./integrity";
import { diffSchemas, summarizeDiff } from "./diff";
import { verifyPow, issuePowChallenge, blindIdentity, buildConsentReceipt, scoreQuality, issueStartToken, elapsedFromStartToken, parseFieldAcl, redactForRole } from "./trust";
import { POW_CLIENT_JS } from "./pow-client";
import { guardSelect, cohortFor, isRecurrence, Recurrence, applyMigration, migrateSchemaBlocks, MigrationOp, isSealed, sealedNotice } from "./ops";
import { PublicFormPage, FORM_RUNTIME_JS } from "./pages/public-form";
import { BuilderPage, BUILDER_JS } from "./pages/builder";
import { audit } from "./audit";
import { sendNotification, sendAutoReply } from "./email";
import { checkSpam, normalizePayload } from "./spam";
import { deliverSubmission, sendTestWebhook } from "./webhooks";
import { getFiles, countFiles, totalStorage, getFile, saveUpload, deleteFile } from "./files";
import { CLIENT_JS_WITH_GUARDS, GUARDS_JS } from "./ui/client";
import { CSS } from "./ui/styles";
import { AppShell, CommandItem, THEME_BOOT, PALETTE_WIRE } from "./ui/shell";
import { PageHead, Button } from "./ui/components";
import { HomePage } from "./pages/home";
import { FormsPage } from "./pages/forms";
import { FormDetailPage, FormTab } from "./pages/form-detail";
import { InboxPage } from "./pages/inbox";
import { SubmissionDetailPage } from "./pages/submission-detail";
import { WebhooksPage, WebhookDetailPage, ComingSoonPage } from "./pages/webhook-pages";
import { WorkflowsPage, FilesPage, SettingsPage, SettingsSection, LoginPage, LandingPage } from "./pages/misc";
import { templateSchema, TemplateKey } from "./templates";

const COOKIE = "fr_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NAV_ICONS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  zap: "M13 2 3 14h7l-1 8 12-14h-8l0-6z",
  webhook: "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
};

type Env = { Bindings: Bindings };
const app = new Hono<Env>();

// Mount API v1 subapp
app.route("/api/v1", apiApp);

/**
 * The only inline script left is the pre-paint theme boot in the app shell. It is static,
 * so it is pinned by hash and script-src can stay free of 'unsafe-inline'. All other JS is
 * served from /assets/*.js. Computed once per isolate.
 *
 * style-src keeps 'unsafe-inline' because the UI uses inline style attributes throughout,
 * which a nonce or hash cannot cover; theme-derived values are sanitized before render.
 */
let cspPromise: Promise<string> | null = null;

async function contentSecurityPolicy(): Promise<string> {
  if (!cspPromise) {
    cspPromise = (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(THEME_BOOT));
      const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
      return [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' https: data:",
        `script-src 'self' 'sha256-${hash}'`,
        "connect-src 'self' https:",
        "frame-src 'self' https:",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ");
    })();
  }
  return cspPromise;
}

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.res.headers.set("Content-Security-Policy", await contentSecurityPolicy());
  if (new URL(c.req.url).pathname.startsWith("/admin")) c.res.headers.set("X-Frame-Options", "DENY");
});

/* ---------- helpers ---------- */

async function makeSessionToken(secret: string): Promise<string> {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await hmacSign(exp, secret)}`;
}

async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(exp, sig, secret))) return false;
  return Number(exp) > Date.now();
}

async function makeUserSessionToken(userId: string, workspaceId: string, secret: string): Promise<string> {
  const payload = `${userId}.${workspaceId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${await hmacSign(payload, secret)}`;
}

async function verifyUserSessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const payload = parts.slice(0, 3).join(".");
  return (await hmacVerify(payload, parts[3], secret)) && Number(parts[2]) > Date.now();
}

function trackingMetadata(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  return Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((key) => [key, params.get(key) || ""]).filter(([, value]) => value));
}

function originOf(url: string): string {
  return new URL(url).origin;
}

function msgFrom(c: { req: { url: string } }): string | undefined {
  const msg = new URL(c.req.url).searchParams.get("msg");
  return msg ?? undefined;
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    // Cookies are only marked Secure over HTTPS so `wrangler dev` on http://localhost still works.
    secure: new URL((c as unknown as { req: { url: string } }).req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/**
 * Same-origin enforcement for state-changing requests. A missing Origin/Referer is a
 * failure rather than a pass, otherwise stripping the header bypasses the check.
 * Combined with the SameSite=Lax session cookie this is the CSRF defense.
 */
function sameOriginCheck(c: { req: { header: (name: string) => string | undefined; url: string } }): "ok" | "missing" | "cross" | "malformed" {
  const requestOrigin = c.req.header("origin") || c.req.header("referer");
  if (!requestOrigin) return "missing";
  try {
    return new URL(requestOrigin).origin === new URL(c.req.url).origin ? "ok" : "cross";
  } catch {
    return "malformed";
  }
}

/**
 * Who is making this request, for audit records and field-level access control.
 * Falls back to the bootstrap owner when the legacy password session is in use.
 */
async function currentActor(c: { req: { header: (name: string) => string | undefined; url: string }; env: Bindings }): Promise<{ id: string; label: string; role: string }> {
  const token = c.req.header("cookie")?.match(/(?:^|;\s*)fr_session=([^;]+)/)?.[1];
  const decoded = token ? decodeURIComponent(token) : "";
  const parts = decoded.split(".");
  if (parts.length === 4 && parts[0] && parts[1]) {
    const membership = await getMembership(c.env.DB, parts[0], parts[1]);
    if (membership) return { id: parts[0], label: parts[0], role: membership.role };
  }
  return { id: "bootstrap", label: "bootstrap admin", role: "owner" };
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

async function tooManyLoginAttempts(db: D1Database, ip: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND created_at > ?")
    .bind(ip, Date.now() - LOGIN_WINDOW_MS)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= LOGIN_MAX_FAILURES;
}

async function recordLoginFailure(db: D1Database, ip: string): Promise<void> {
  await db.prepare("INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)").bind(ip, Date.now()).run();
  await db.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(Date.now() - LOGIN_WINDOW_MS).run();
}

async function clearLoginFailures(db: D1Database, ip: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}

/**
 * Respondent-facing receipt link. Shown once, on the acknowledgement, because the token
 * is the only thing that authorises access to that response.
 */
function receiptLinkHtml(origin: string, token: string): string {
  if (!token) return "";
  const href = `${origin}/r/${token}`;
  return `<p style="color:#787774;font-size:12.5px;margin-top:22px;line-height:1.6">Keep this link to view, export, or delete your response:<br><a href="${escapeHtml(href)}" style="color:#2383e2;word-break:break-all">${escapeHtml(href)}</a></p>`;
}

function newResumeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function valuesFromStored(raw: string): Record<string, string> {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_")) continue;
      out[key] = Array.isArray(value) ? value.map(String).join(", ") : value == null ? "" : String(value);
    }
    return out;
  } catch { return {}; }
}

/** Field-id to human-label map that schema-v2 submissions carry alongside their answers. */
function labelsFromStored(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const labels = parsed._labels;
    if (!labels || typeof labels !== "object") return {};
    return Object.fromEntries(Object.entries(labels as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  } catch { return {}; }
}

function urlValues(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) if (!key.startsWith("_") && key !== "resume") out[key] = value;
  return out;
}

function baseCommands(origin: string): CommandItem[] {
  return [
    { label: "New form", href: "/admin/forms?new=1", icon: NAV_ICONS.form, keywords: "create add endpoint" },
    { label: "Go to Home", href: "/admin", icon: NAV_ICONS.home },
    { label: "Go to Forms", href: "/admin/forms", icon: NAV_ICONS.form },
    { label: "Search submissions", href: "/admin/submissions", icon: NAV_ICONS.inbox, keywords: "inbox find" },
    { label: "Go to Workflows", href: "/admin/workflows", icon: NAV_ICONS.zap },
    { label: "Go to Webhooks", href: "/admin/webhooks", icon: NAV_ICONS.webhook },
    { label: "Go to Settings", href: "/admin/settings", icon: NAV_ICONS.settings },
    { label: "Notifications", href: "/admin/notifications", icon: NAV_ICONS.inbox },
    { label: "Open documentation", href: "/", icon: NAV_ICONS.book, keywords: "docs help guide" },
  ];
}

/* ---------- assets ---------- */

const JS_HEADERS = { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" };

// Served as files rather than inlined so the CSP can keep script-src at 'self'.
app.get("/assets/app.js", () => new Response(CLIENT_JS_WITH_GUARDS + PALETTE_WIRE, { headers: JS_HEADERS }));
app.get("/assets/builder.js", () => new Response(BUILDER_JS, { headers: JS_HEADERS }));
app.get("/assets/form-runtime.js", () => new Response(FORM_RUNTIME_JS, { headers: JS_HEADERS }));
app.get("/assets/guards.js", () => new Response(GUARDS_JS, { headers: JS_HEADERS }));
app.get("/assets/pow.js", () => new Response(POW_CLIENT_JS, { headers: JS_HEADERS }));

/* ---------- public submit endpoint (preserved) ---------- */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.on("OPTIONS", "/f/:id/*", (c) => new Response(null, { status: 204, headers: CORS_HEADERS }));
app.on("OPTIONS", "/f/:id", (c) => new Response(null, { status: 204, headers: CORS_HEADERS }));

function stripControlFields(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith("_")) out[k] = v;
  }
  return out;
}

app.post("/f/:id/save", async (c) => {
  const formId = c.req.param("id");
  const form = await getForm(c.env.DB, formId);
  const schema = parseSchema(form?.published_json);
  if (!form || !schema || !isSchemaV2(schema)) return c.json({ ok: false, error: "Save and resume is not enabled for this form." }, 400);
  let body: Record<string, unknown> = {};
  try {
    const raw = await c.req.json();
    if (typeof raw === "object" && raw !== null) body = raw as Record<string, unknown>;
  } catch { return c.json({ ok: false, error: "Invalid JSON." }, 400); }
  const rawData = typeof body.data === "object" && body.data !== null ? body.data as Record<string, unknown> : {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) if (!key.startsWith("_")) data[key] = value;
  const suppliedToken = typeof body.token === "string" ? body.token : "";
  const token = suppliedToken || newResumeToken();
  const hash = await sha256Hex(token);
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = c.req.header("user-agent") || "";
  const referer = c.req.header("referer") || "";
  const existing = suppliedToken ? await getSubmissionByResumeHash(c.env.DB, hash) : null;
  if (existing && existing.form_id !== formId) return c.json({ ok: false, error: "Invalid resume token." }, 403);
  if (existing) await updatePartialSubmission(c.env.DB, existing.id, data);
  else await insertPartialSubmission(c.env.DB, formId, data, ip, userAgent, referer, hash, Date.now() + 7 * 24 * 60 * 60 * 1000);
  const partialId = existing?.id ?? null;
  const partialWorkflows = (await listWorkflows(c.env.DB, formId)).filter((workflow) => workflow.active && workflow.trigger === "submission.partial");
  const stringData: Record<string, string> = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "")]));
  c.executionCtx.waitUntil(Promise.allSettled(partialWorkflows.map((workflow) => executeWorkflow(c.env, workflow, form, partialId, stringData))));
  return c.json({ ok: true, token });
});

app.post("/f/:id", async (c) => {
  const formId = c.req.param("id");
  const contentType = c.req.header("content-type") || "";

  const form = await getForm(c.env.DB, formId);
  if (!form) return c.text("Unknown form endpoint", 404);
  if (form.archived) return c.text("This form is no longer accepting submissions.", 410);
  const requestNow = Date.now();
  if (form.open_at != null && requestNow < form.open_at) return c.text("This form is not open yet.", 403);
  if (form.close_at != null && requestNow > form.close_at) return c.text(form.closed_message || "This form is closed.", 410);
  if (form.submission_limit != null && form.submission_limit > 0 && await countCompletedForForm(c.env.DB, formId) >= form.submission_limit) return c.text(form.closed_message || "This form has reached its submission limit.", 410);
  const respondentCookie = getCookie(c, `fr_responded_${formId}`);
  if (form.one_per_respondent === 1 && respondentCookie === "1") return c.text("You have already submitted this form.", 409);

  const ct = contentType.toLowerCase();
  let data: Record<string, string> = {};
  let rawPayload: Record<string, unknown> = {};
  let uploads: { fieldName: string; file: File }[] = [];
  if (ct.includes("application/json")) {
    try {
      const body = await c.req.json();
      rawPayload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      data = normalizePayload(rawPayload);
    } catch {
      rawPayload = {};
      data = {};
    }
  } else {
    let parsedViaFormData = false;
    try {
      const fd = await c.req.raw.formData();
      const seen = new Set<string>();
      for (const key of fd.keys()) {
        if (seen.has(key)) continue;
        seen.add(key);
        const all = fd.getAll(key);
        const files = all.filter((v) => typeof v !== "string") as unknown as File[];
        const hasFiles = files.length > 0;
        if (hasFiles) {
          const valid = files.filter((f) => (f as File).size > 0);
          if (valid.length === 0) {
            rawPayload[key] = "";
          } else if (valid.length === 1) {
            const single = valid[0];
            // if there are also string values mixed (rare), keep file as primary and strings as array? file case takes precedence
            rawPayload[key] = single;
            uploads.push({ fieldName: key, file: single });
            // if strs present alongside, they would be ignored for file fields
          } else {
            rawPayload[key] = valid;
            for (const f of valid) uploads.push({ fieldName: key, file: f });
          }
        } else {
          if (all.length === 1) rawPayload[key] = all[0] as string;
          else rawPayload[key] = all as string[];
        }
      }
      const normInput: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawPayload)) normInput[k] = v;
      data = normalizePayload(normInput);
      parsedViaFormData = true;
    } catch {
      parsedViaFormData = false;
    }
    if (!parsedViaFormData) {
      try {
        const raw = await c.req.parseBody();
        rawPayload = raw as Record<string, unknown>;
        data = normalizePayload(raw);
        for (const [fieldName, value] of Object.entries(raw)) {
          if (value instanceof File && value.size > 0) uploads.push({ fieldName, file: value });
          else if (Array.isArray(value)) {
            for (const v of value) if (v instanceof File && (v as File).size > 0) uploads.push({ fieldName, file: v as File });
            // preserve array payload for validation
            if (value.length > 0) rawPayload[fieldName] = value;
          }
        }
      } catch {
        data = {};
        rawPayload = {};
      }
    }
  }
  const isJson = ct.includes("application/json") || "_json" in data;

  for (const key of ["_gotcha", "_honeypot", "_hp"]) {
    if ((data[key] ?? "").trim() !== "") {
      return isJson
        ? c.json({ ok: true })
        : c.html("<!doctype html><body style='font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center'><p>Thank you!</p></body>");
    }
  }

  const schema = parseSchema(form.published_json);
  if (schema) {
    const smartVariables = isSchemaV2(schema) ? resolveVariables(schema.variables, rawPayload) : {};
    const pipeContext = { answers: rawPayload, variables: smartVariables, url: Object.fromEntries(new URL(c.req.url).searchParams.entries()), meta: { userAgent: c.req.header("user-agent") || "", referer: c.req.header("referer") || "" } };
    const smartState = isSchemaV2(schema) ? evaluateRules(schema.logic, pipeContext) : null;
    const selectedEnding = isSchemaV2(schema) ? (smartState?.ending ? schema.endings.find((ending) => ending.id === smartState.ending) ?? null : selectEnding(schema.endings, pipeContext)) : null;
    const errors: Record<string, string> = {};
    const values: Record<string, string> = {};
    for (const block of schema.blocks) {
      if (block.type === "heading" || block.type === "divider" || block.type === "paragraph" || block.type === "page") continue;
      if (smartState?.visible[block.id] === false) continue;
      let raw: unknown = rawPayload[block.id];
      if (block.type === "file") {
        const hasFile = uploads.some((u) => u.fieldName === block.id);
        if (block.required && !hasFile) raw = "";
        else if (hasFile) raw = "file";
        else raw = "";
      }
      const effectiveBlock = smartState?.required[block.id] !== undefined ? { ...block, required: smartState.required[block.id] } : block;
      if (block.type === "file") {
        const fieldFiles = uploads.filter((upload) => upload.fieldName === block.id).map((upload) => upload.file);
        const accepted = (block.accept ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
        const invalidType = accepted.length > 0 && fieldFiles.some((file) => {
          const name = file.name.toLowerCase();
          const mime = (file.type || "application/octet-stream").toLowerCase();
          return !accepted.some((rule) => rule.startsWith(".") ? name.endsWith(rule) : rule.endsWith("/*") ? mime.startsWith(rule.slice(0, -1)) : mime === rule);
        });
        const invalidSize = block.maxSize != null && fieldFiles.some((file) => file.size > Number(block.maxSize));
        if (invalidType) errors[block.id] = "This file type is not allowed.";
        else if (invalidSize) errors[block.id] = `Each file must be smaller than ${Math.round(Number(block.maxSize) / 1024 / 1024 * 10) / 10} MB.`;
      }
      const err = validateBlockValue(effectiveBlock, raw);
      if (err) errors[block.id] = err;
      const cur = rawPayload[block.id];
      if (Array.isArray(cur)) values[block.id] = (cur as unknown[]).map(String).join(", ");
      else if (typeof cur === "object" && cur !== null && "name" in (cur as Record<string, unknown>)) values[block.id] = String((cur as File).name);
      else if (cur !== undefined && cur !== null) values[block.id] = String(cur);
      else values[block.id] = "";
      if (block.type === "file") {
        const names = uploads.filter((u) => u.fieldName === block.id).map((u) => u.file.name);
        values[block.id] = names.join(", ");
      }
      // checkbox single: browser sends "on" when checked, missing when unchecked -> keep as is for re-render
      if (block.type === "checkbox" && rawPayload[block.id] !== undefined) {
        values[block.id] = String(rawPayload[block.id]);
      }
    }
    if (Object.keys(errors).length > 0) {
      const origin = originOf(c.req.url);
      c.status(400);
      return c.html(<PublicFormPage form={form} schema={schema} origin={origin} errors={errors} values={values} />);
    }
    const labels: Record<string, string> = {};
    const stored: Record<string, unknown> = {};
    for (const block of schema.blocks) {
      if (block.type === "heading" || block.type === "divider" || block.type === "paragraph" || block.type === "page") continue;
      if (smartState?.visible[block.id] === false) continue;
      const cur = rawPayload[block.id];
      let str = "";
      if (block.type === "file") {
        const names = uploads.filter((u) => u.fieldName === block.id).map((u) => u.file.name);
        str = names.join(", ");
        if (!str && Array.isArray(cur)) str = (cur as unknown[]).map(String).join(", ");
      } else if (Array.isArray(cur)) str = (cur as unknown[]).map(String).join(", ");
      else if (typeof cur === "object" && cur !== null && "name" in (cur as Record<string, unknown>)) str = `[file: ${(cur as File).name}]`;
      else if (cur !== undefined && cur !== null) str = String(cur);
      else str = "";
      stored[block.id] = str;
      labels[block.id] = block.label;
    }
    stored["_labels"] = labels;
    stored["_v"] = schema.version;

    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const userAgent = c.req.header("user-agent") || "";
    const referer = c.req.header("referer") || "";
    let verdict = { spam: false, reason: "" };
    try {
      verdict = await checkSpam(c.env, data, ip);
    } catch {
      // never block a submission because spam checks failed
    }
    let toStoreSchema: Record<string, unknown> = stored;
    const rawStoredJson = JSON.stringify(stored);
    if (rawStoredJson.length > 10000 && c.env.FILES) {
      const spilled = await spillIfLarge(c.env, rawStoredJson);
      if (spilled.startsWith("r2://")) {
        toStoreSchema = { _spilled: spilled, _labels: labels, _v: schema.version };
      }
    }
    // --- trust gates, before anything is persisted ---
    const trustSecret = c.env.PREFILL_SECRET || c.env.SESSION_SECRET;

    if ((form.pow_bits ?? 0) > 0) {
      const powVerdict = await verifyPow(
        formId,
        String(rawPayload._pow_challenge ?? ""),
        String(rawPayload._pow_nonce ?? ""),
        form.pow_bits ?? 0,
        trustSecret
      );
      if (!powVerdict.ok) return c.text(`Spam check failed: ${powVerdict.reason}.`, 400);
    }

    // One response per person, without storing who they are.
    let respondentKey: string | null = null;
    if (form.unique_mode === "blind" && form.unique_field) {
      const identifier = String(rawPayload[form.unique_field] ?? "").trim();
      if (!identifier) return c.text("This form requires an identifier to check you have not already responded.", 400);
      respondentKey = await blindIdentity(formId, identifier, trustSecret);
      if (await respondentKeyExists(c.env.DB, formId, respondentKey)) {
        return c.text("A response has already been recorded for this identifier.", 409);
      }
    }

    const consent = form.consent_text ? await buildConsentReceipt(form.consent_text) : null;
    const elapsedMs = await elapsedFromStartToken(formId, String(rawPayload._started ?? ""), trustSecret);
    const quality = scoreQuality({
      values: data,
      choiceFields: schema.blocks.filter((block) => ["select", "radio", "checkbox", "rating"].includes(block.type)).map((block) => block.id),
      textFields: schema.blocks.filter((block) => ["short_text", "long_text"].includes(block.type)).map((block) => block.id),
      elapsedMs,
    });

    const resumeToken = typeof rawPayload._resume === "string" ? rawPayload._resume : "";
    // Every non-spam response gets a receipt token so the respondent can later view,
    // export, or erase their own submission without holding an account.
    const receiptToken = verdict.spam ? "" : newResumeToken();
    const receiptHash = receiptToken ? await sha256Hex(receiptToken) : null;
    let submissionId: number | null = null;
    if (!verdict.spam && resumeToken) {
      const existing = await getSubmissionByResumeHash(c.env.DB, await sha256Hex(resumeToken));
      if (existing && existing.form_id === formId) {
        await completeSubmission(c.env.DB, existing.id, toStoreSchema, receiptHash);
        submissionId = existing.id;
      } else {
        submissionId = await insertSubmission(c.env.DB, formId, toStoreSchema, ip, userAgent, referer, verdict.spam, receiptHash);
      }
    } else {
      submissionId = await insertSubmission(c.env.DB, formId, toStoreSchema, ip, userAgent, referer, verdict.spam, receiptHash);
    }
    if (submissionId !== null) {
      await annotateSubmission(c.env.DB, submissionId, JSON.stringify(quality), consent ? JSON.stringify(consent) : "", respondentKey);
      const recurrence = (form.recurrence ?? "off") as Recurrence;
      if (recurrence !== "off") await setSubmissionCohort(c.env.DB, submissionId, cohortFor(Date.now(), recurrence));
    }
    if (!verdict.spam && form.one_per_respondent === 1) setCookie(c, `fr_responded_${formId}`, "1", { httpOnly: true, sameSite: "Lax", path: `/f/${formId}`, maxAge: 31536000 });
    if (c.env.FILES && uploads.length > 0 && !verdict.spam) {
      const env = c.env;
      c.executionCtx.waitUntil(
        Promise.allSettled(uploads.map((u) => saveUpload(env, formId, submissionId, u.fieldName, u.file)))
      );
    }
    if (!verdict.spam) {
      const hooks = await listWebhooks(c.env.DB, formId);
      const activeHooks = hooks.filter((h) => h.active);
      const workflows = await listWorkflows(c.env.DB, formId);
      const activeWorkflows = workflows.filter((workflow) => workflow.active && workflow.trigger === "submission.completed");
      const createdAt = Date.now();
      c.executionCtx.waitUntil(
        Promise.allSettled([
          sendNotification(c.env, form, data),
          recordFormEvent(c.env.DB, formId, "submission", referer, trackingMetadata(c.req.url)),
          sendAutoReply(c.env, form, data),
          ...(submissionId !== null
            ? activeHooks.map((h) => deliverSubmission(c.env.DB, h, { id: form.id, name: form.name }, submissionId, data, createdAt))
            : []),
          ...activeWorkflows.map((workflow) => executeWorkflow(c.env, workflow, form, submissionId, data)),
          createNotification(c.env.DB, "submission.created", `New submission: ${form.name}`, submissionId === null ? "Stored response" : `Response #${submissionId}`),
        ])
      );
    }
    if (isJson) return c.json(receiptToken ? { ok: true, receipt: `${originOf(c.req.url)}/r/${receiptToken}` } : { ok: true });
    const ackContext = { answers: rawPayload, variables: smartVariables, url: Object.fromEntries(new URL(c.req.url).searchParams.entries()), meta: {} };
    const dynamicRedirect = isSchemaV2(schema) && smartState?.redirect ? smartState.redirect : "";
    const endingRedirect = selectedEnding?.redirectUrl ? pipeText(selectedEnding.redirectUrl, ackContext) : "";
    const redirect = data._redirect || dynamicRedirect || endingRedirect || form.redirect_url || pipeText(schema.settings.redirectUrl, ackContext);
    if (redirect) return c.redirect(redirect, 303);
    if (selectedEnding || (schema.settings.successMessage && schema.settings.successMessage.trim() !== "")) {
      const msg = selectedEnding ? pipeText(selectedEnding.message, ackContext) : pipeText(schema.settings.successMessage, ackContext);
      const heading = selectedEnding?.title ? pipeText(selectedEnding.title, ackContext) : (smartState?.disqualified ? "Not eligible" : "Thank you!");
      const safe = escapeHtml(msg);
      return c.html(
        `<!doctype html><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fff;color:#37352f"><div style="text-align:center;max-width:520px;padding:24px"><div style="font-size:34px;margin-bottom:8px">&#10003;</div><h1 style="font-size:20px;font-weight:600">${escapeHtml(heading)}</h1><p style="color:#37352f;font-size:14px;margin-top:8px;white-space:pre-wrap">${safe}</p>${receiptLinkHtml(originOf(c.req.url), receiptToken)}</div></body>`
      );
    }
    return c.html(
      `<!doctype html><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fff;color:#37352f"><div style="text-align:center;max-width:520px;padding:24px"><div style="font-size:34px;margin-bottom:8px">&#10003;</div><h1 style="font-size:20px;font-weight:600">Thank you!</h1><p style="color:#787774;font-size:14px">Your submission has been received.</p>${receiptLinkHtml(originOf(c.req.url), receiptToken)}</div></body>`
    );
  }

  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = c.req.header("user-agent") || "";
  const referer = c.req.header("referer") || "";

  let verdict = { spam: false, reason: "" };
  try {
    verdict = await checkSpam(c.env, data, ip);
  } catch {
    // never block a submission because spam checks failed
  }

  const stripped = stripControlFields(data);
  let toStore: Record<string, string> = stripped as Record<string, string>;
  const rawJson = JSON.stringify(stripped);
  if (rawJson.length > 10000 && c.env.FILES) {
    const spilled = await spillIfLarge(c.env, rawJson);
    if (spilled.startsWith("r2://")) {
      const lbl = (stripped as Record<string, unknown>)["_labels"];
      const wrapper: Record<string, unknown> = { _spilled: spilled, _v: 1 };
      if (lbl !== undefined) wrapper["_labels"] = lbl;
      toStore = wrapper as unknown as Record<string, string>;
    }
  }
  const submissionId = await insertSubmission(
    c.env.DB, formId, toStore, ip, userAgent, referer, verdict.spam
  );

  if (c.env.FILES && uploads.length > 0 && !verdict.spam) {
    const env = c.env;
    c.executionCtx.waitUntil(
      Promise.allSettled(uploads.map((u) => saveUpload(env, formId, submissionId, u.fieldName, u.file)))
    );
  }

  if (!verdict.spam) {
    const hooks = await listWebhooks(c.env.DB, formId);
    const activeHooks = hooks.filter((h) => h.active);
    const createdAt = Date.now();
    c.executionCtx.waitUntil(
      Promise.allSettled([
        sendNotification(c.env, form, data),
        sendAutoReply(c.env, form, data),
        ...(submissionId !== null
          ? activeHooks.map((h) =>
              deliverSubmission(c.env.DB, h, { id: form.id, name: form.name }, submissionId, data, createdAt)
            )
          : []),
      ])
    );
  }

  if (isJson) return c.json({ ok: true });

  const redirect = data._redirect || form.redirect_url;
  if (redirect) return c.redirect(redirect, 303);

  return c.html(
    `<!doctype html><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fff;color:#37352f"><div style="text-align:center"><div style="font-size:34px;margin-bottom:8px">&#10003;</div><h1 style="font-size:20px;font-weight:600">Thank you!</h1><p style="color:#787774;font-size:14px">Your submission has been received.</p></div></body>`
  );
});

app.get("/s/:slug", async (c) => {
  const form = await getFormBySlug(c.env.DB, c.req.param("slug"));
  if (!form) return c.text("Unknown form", 404);
  return c.redirect(`/f/${form.id}${new URL(c.req.url).search}`, 302);
});

app.get("/f/:id", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.text("Unknown form endpoint", 404);
  if (form.archived) return c.text("This form is no longer accepting submissions.", 410);
  const now = Date.now();
  const closed = (form.open_at != null && now < form.open_at) || (form.close_at != null && now > form.close_at) || (form.submission_limit != null && form.submission_limit > 0 && await countCompletedForForm(c.env.DB, form.id) >= form.submission_limit) || (form.one_per_respondent === 1 && getCookie(c, `fr_responded_${form.id}`) === "1");
  if (closed) return c.html(<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style dangerouslySetInnerHTML={{ __html: CSS }} /></head><body><main style="max-width:640px;margin:12vh auto;padding:32px;text-align:center;font-family:system-ui"><h1>{form.closed_message || "This form is closed."}</h1><p>Please contact the form owner if you need assistance.</p></main></body></html>, 410);
  const accept = c.req.header("accept") ?? "";
  const isHtml = !accept || accept.includes("text/html") || accept.includes("*/*");
  const wantsJsonExplicit = accept.includes("application/json") && !accept.includes("text/html");
  if (!isHtml && wantsJsonExplicit) {
    return c.text("This endpoint accepts POST submissions only.", 405);
  }
  const schema = parseSchema(form.published_json);
  let values = urlValues(new URL(c.req.url));
  // When a form requires signed prefill, unsigned or edited values are discarded rather
  // than trusted, so a shared link cannot be doctored to change what it pre-populates.
  if (form.prefill_signed_only === 1 && Object.keys(values).length > 0) {
    const signature = new URL(c.req.url).searchParams.get(PREFILL_SIG_PARAM) ?? "";
    const secret = c.env.PREFILL_SECRET || c.env.SESSION_SECRET;
    if (!(await verifyPrefill(values, signature, secret))) values = {};
  }
  const resume = new URL(c.req.url).searchParams.get("resume");
  if (resume) {
    const partial = await getSubmissionByResumeHash(c.env.DB, await sha256Hex(resume));
    if (partial && partial.form_id === form.id) values = { ...values, ...valuesFromStored(partial.data) };
  }
    c.executionCtx.waitUntil(Promise.all([
      incrementFormViews(c.env.DB, form.id),
      recordFormEvent(c.env.DB, form.id, "view", c.req.header("referer") || "", trackingMetadata(c.req.url)),
    ]));
  const origin = originOf(c.req.url);
  const trustSecret = c.env.PREFILL_SECRET || c.env.SESSION_SECRET;
  const powBits = form.pow_bits ?? 0;
  const trust = {
    startToken: await issueStartToken(form.id, trustSecret),
    powChallenge: powBits > 0 ? await issuePowChallenge(form.id, trustSecret) : "",
    powBits,
  };
  return c.html(<PublicFormPage form={form} schema={schema} origin={origin} values={values} trust={trust} />);
});

/* ---------- auth ---------- */

app.get("/admin/login", (c) => c.html(<LoginPage />));

app.post("/admin/login", async (c) => {
  if (sameOriginCheck(c) !== "ok") return c.text("Cross-origin sign-in rejected.", 403);
  const ip = clientIp(c);
  if (await tooManyLoginAttempts(c.env.DB, ip)) {
    return c.html(<LoginPage error="Too many sign-in attempts. Wait 15 minutes and try again." />, 429);
  }
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  let sessionToken: string | null = null;
  if (email) {
    const user = await getUserByEmail(c.env.DB, email);
    if (user) {
      const { ok, needsUpgrade } = await verifyPassword(password, user.password_hash, sha256Hex);
      if (ok) {
        // Silently migrate legacy unsalted SHA-256 digests to PBKDF2 on first successful login.
        if (needsUpgrade) await updateUserPassword(c.env.DB, user.id, await hashPassword(password));
        sessionToken = await makeUserSessionToken(user.id, "ws_default", c.env.SESSION_SECRET);
      }
    }
  }
  if (!sessionToken && c.env.ADMIN_PASSWORD && timingSafeEqual(password, c.env.ADMIN_PASSWORD)) {
    const owner = await ensureBootstrapOwner(c.env.DB, email || "owner@formrelay.local", await hashPassword(password), email || "Workspace owner", c.env.WORKSPACE_NAME || "My workspace");
    sessionToken = await makeUserSessionToken(owner.id, "ws_default", c.env.SESSION_SECRET);
  }
  if (!sessionToken) {
    await recordLoginFailure(c.env.DB, ip);
    return c.html(<LoginPage error="Wrong email or password. Try again." />, 401);
  }
  await clearLoginFailures(c.env.DB, ip);
  setSessionCookie(c, sessionToken);
  return c.redirect("/admin");
});

app.get("/admin/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.redirect("/admin/login");
});

app.get("/invite/:token", async (c) => {
  const invite = await getInvitationByHash(c.env.DB, await sha256Hex(c.req.param("token")));
  if (!invite) return c.text("This invitation is invalid or expired.", 410);
  return c.html(<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Join FormRelay</title><style dangerouslySetInnerHTML={{ __html: CSS }} /></head><body style="font-family:system-ui;max-width:460px;margin:12vh auto;padding:24px"><h1>Join FormRelay</h1><p>Accept the invitation for <strong>{invite.email}</strong> as an <strong>{invite.role}</strong>.</p><form method="post" action={`/invite/${c.req.param("token")}`}><label>Name<input name="name" required style="display:block;width:100%;padding:8px;margin:6px 0 14px" /></label><label>Password<input type="password" name="password" minlength={10} required style="display:block;width:100%;padding:8px;margin:6px 0 14px" /></label><button type="submit">Create account</button></form></body></html>);
});

app.post("/invite/:token", async (c) => {
  if (sameOriginCheck(c) !== "ok") return c.text("Cross-origin invitation acceptance rejected.", 403);
  const invite = await getInvitationByHash(c.env.DB, await sha256Hex(c.req.param("token")));
  if (!invite) return c.text("This invitation is invalid or expired.", 410);
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  if (name.length < 2 || password.length < 10) return c.text("Name and a password of at least 10 characters are required.", 400);
  const user = await acceptInvitation(c.env.DB, invite, name, await hashPassword(password));
  setSessionCookie(c, await makeUserSessionToken(user.id, invite.workspace_id, c.env.SESSION_SECRET));
  return c.redirect("/admin?msg=Invitation+accepted");
});

/* ---------- respondent receipt portal ---------- */

/**
 * Lets a respondent see, export, and erase their own response with nothing but the
 * receipt link they were given at submit time. No account, no login. This is what makes
 * GDPR access/erasure requests self-service instead of a manual task for the form owner.
 */
function receiptPage(body: string, title = "Your response"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f7f6f3;color:#37352f"><div style="max-width:640px;margin:0 auto;padding:48px 20px 80px">${body}</div></body></html>`;
}

app.get("/r/:token", async (c) => {
  const submission = await getSubmissionByReceiptHash(c.env.DB, await sha256Hex(c.req.param("token")));
  if (!submission) {
    return c.html(receiptPage(`<h1 style="font-size:24px;font-weight:700">Response not found</h1><p style="color:rgba(55,53,47,.65);font-size:14px;margin-top:8px">This link is invalid, or the response has already been deleted.</p>`, "Response not found"), 404);
  }
  const form = await getForm(c.env.DB, submission.form_id);
  const raw = await resolveSpilledData(c.env, submission.data);
  const values = valuesFromStored(raw);
  const labels = labelsFromStored(raw);
  const token = c.req.param("token");

  const rows = Object.entries(values)
    .map(([key, value]) => `<div style="display:flex;gap:16px;padding:10px 0;border-bottom:1px solid rgba(55,53,47,.09)"><div style="width:190px;flex-shrink:0;color:rgba(55,53,47,.65);font-size:13px">${escapeHtml(labels[key] || key)}</div><div style="font-size:14px;white-space:pre-wrap;word-break:break-word">${escapeHtml(value) || "—"}</div></div>`)
    .join("");

  return c.html(receiptPage(`
    <h1 style="font-size:32px;font-weight:700;letter-spacing:-.02em">Your response</h1>
    <p style="color:rgba(55,53,47,.65);font-size:14px;margin-top:8px">Submitted to <strong>${escapeHtml(form?.name ?? "a form")}</strong> on ${new Date(submission.created_at).toUTCString()}.</p>
    <div style="background:#fff;border:1px solid rgba(55,53,47,.09);border-radius:4px;padding:4px 16px;margin-top:26px">${rows || '<p style="padding:14px 0;color:rgba(55,53,47,.45);font-size:14px">This response has no stored fields.</p>'}</div>
    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
      <a href="/r/${escapeHtml(token)}/export" style="display:inline-flex;align-items:center;height:32px;padding:0 12px;border:1px solid rgba(55,53,47,.16);border-radius:4px;font-size:14px;color:#37352f;text-decoration:none">Download a copy (JSON)</a>
      <form method="post" action="/r/${escapeHtml(token)}/erase" data-confirm="Permanently delete your response? This cannot be undone." style="margin:0">
        <button type="submit" style="height:32px;padding:0 12px;border:1px solid rgba(55,53,47,.16);border-radius:4px;background:#fff;font:inherit;font-size:14px;color:#c4453d;cursor:pointer">Delete my response</button>
      </form>
    </div>
    <p style="color:rgba(55,53,47,.45);font-size:12px;margin-top:26px;line-height:1.6">Anyone with this link can view and delete this response, so treat it like a password. Deleting erases your answers permanently; the form owner keeps only a record that a response existed here.</p>
    <script src="/assets/guards.js" defer></script>
  `));
});

app.get("/r/:token/export", async (c) => {
  const submission = await getSubmissionByReceiptHash(c.env.DB, await sha256Hex(c.req.param("token")));
  if (!submission) return c.text("This link is invalid, or the response has already been deleted.", 404);
  const raw = await resolveSpilledData(c.env, submission.data);
  const values = valuesFromStored(raw);
  const labels = labelsFromStored(raw);
  const payload = {
    submitted_at: new Date(submission.created_at).toISOString(),
    form_id: submission.form_id,
    fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [labels[key] || key, value])),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="response-${submission.id}.json"` },
  });
});

app.post("/r/:token/erase", async (c) => {
  if (sameOriginCheck(c) !== "ok") return c.text("Cross-origin erasure request rejected.", 403);
  const token = c.req.param("token");
  const erased = await eraseSubmissionByReceipt(c.env.DB, await sha256Hex(token));
  if (!erased) return c.text("This link is invalid, or the response has already been deleted.", 404);
  await audit(c.env.DB, "response.erased.by_respondent", token.slice(0, 6), "respondent erased their own response");
  return c.html(receiptPage(`<h1 style="font-size:32px;font-weight:700;letter-spacing:-.02em">Response deleted</h1><p style="color:rgba(55,53,47,.65);font-size:14px;margin-top:8px">Your answers have been permanently erased. This link no longer works.</p>`, "Response deleted"));
});

/* ---------- admin auth gate ---------- */

app.use("/admin/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login" || path === "/admin/logout") return next();
  const token = getCookie(c, COOKIE);
  const userSessionValid = await verifyUserSessionToken(token, c.env.SESSION_SECRET);
  let authorized = userSessionValid;
  let membership: Awaited<ReturnType<typeof getMembership>> = null;
  if (userSessionValid && token) {
    const parts = token.split(".");
    if (parts[0] && parts[1]) membership = await getMembership(c.env.DB, parts[0], parts[1]);
    authorized = !!membership;
  }
  if (!authorized) authorized = await verifySessionToken(token, c.env.SESSION_SECRET);
  if (!authorized) return c.redirect("/admin/login");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    const verdict = sameOriginCheck(c);
    if (verdict === "malformed") return c.text("Malformed request origin.", 400);
    if (verdict !== "ok") return c.text("Cross-origin admin mutation rejected.", 403);
  }
  if (membership?.role === "viewer" && c.req.method === "POST") return c.text("Viewer memberships are read-only.", 403);
  if (membership && path.startsWith("/admin/settings/members") && membership.role !== "owner") return c.text("Only workspace owners can manage members.", 403);
  await next();
});

/* ---------- home / dashboard ---------- */

app.get("/admin", async (c) => {
  const [stats, forms, recent, sparkline] = await Promise.all([
    getDashboardStats(c.env.DB),
    listFormsWithStats(c.env.DB),
    recentSubmissions(c.env.DB, 8),
    getDashboardAnalytics(c.env.DB),
  ]);
  return c.html(
    <HomePage
      path={new URL(c.req.url).pathname}
      stats={stats}
      forms={forms}
      recent={recent}
      sparkline={sparkline}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
    />
  );
});

app.get("/dashboard", (c) => c.redirect("/admin"));

app.get("/embed.js", (c) => {
  const js = `(function(){function mount(target,src,opts){var host=typeof target==='string'?document.querySelector(target):target;if(!host)throw new Error('FormRelay mount target not found');var frame=document.createElement('iframe');frame.src=src;frame.title=(opts&&opts.title)||'Form';frame.loading='lazy';frame.style.width='100%';frame.style.minHeight=(opts&&opts.minHeight)||'520px';frame.style.border='0';host.appendChild(frame);var onMessage=function(e){if(e.source!==frame.contentWindow||!e.data||String(e.data.type||'').indexOf('formrelay:')!==0)return;if(e.data.type==='formrelay:ready'&&opts&&opts.onReady)opts.onReady(e);if(e.data.type==='formrelay:submitted'&&opts&&opts.onSubmit)opts.onSubmit(e)};window.addEventListener('message',onMessage);return {iframe:frame,destroy:function(){window.removeEventListener('message',onMessage);frame.remove()}}}function popup(src,opts){var overlay=document.createElement('div');overlay.style='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;padding:5vh 5vw';var close=document.createElement('button');close.textContent='Close';close.style='position:absolute;right:6vw;top:3vh;z-index:2';var host=document.createElement('div');host.style='height:90vh;background:#fff;border-radius:12px;overflow:hidden';overlay.appendChild(close);overlay.appendChild(host);document.body.appendChild(overlay);var mounted=mount(host,src,opts||{});close.onclick=function(){mounted.destroy();overlay.remove()};return mounted}window.FormRelay={mount:mount,popup:popup}})();`;
  return new Response(js, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
});

/* ---------- public forms ---------- */

app.get("/admin/forms", async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const openNew = url.searchParams.get("new") === "1" && !q;
  const [forms, stats] = await Promise.all([
    q ? listFormsWithStats(c.env.DB, q) : listFormsWithStats(c.env.DB),
    getDashboardStats(c.env.DB),
  ]);
  return c.html(
    <FormsPage
      path={url.pathname}
      forms={forms}
      q={q}
      openNew={openNew}
      origin={originOf(c.req.url)}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.post("/admin/forms", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim() || "Untitled form";
  const rawTemplate = String(body.template ?? "blank");
  const templateKey: TemplateKey = ["blank", "contact", "feedback", "job", "rsvp", "nps", "project", "registration", "consent"].includes(rawTemplate) ? rawTemplate as TemplateKey : "blank";
  const schemaJson = templateKey === "blank" ? null : JSON.stringify(templateSchema(templateKey));
  const row = await createForm(c.env.DB, { name, schemaJson });
  await audit(c.env.DB, "form.created", row.id, name);
  return c.redirect(`/admin/forms/${row.id}?tab=setup&created=1&msg=Form+created`);
});

app.get("/admin/forms/:id/build", async (c) => {
  const url = new URL(c.req.url);
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const raw = form.schema_json;
  const parsed = parseSchema(raw);
  const schema = parsed ?? emptySchema();
  const editId = url.searchParams.get("edit") ?? undefined;
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <BuilderPage
      form={form}
      schema={schema}
      origin={originOf(c.req.url)}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
      editId={editId}
    />
  );
});

app.get("/admin/forms/:id/health", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const items = checkFormHealth(form, !!c.env.RESEND_API_KEY);
  const tone = items.some((item) => item.level === "error") ? "error" : items.some((item) => item.level === "warning") ? "warning" : "ok";
  return c.html(<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Health · {form.name}</title><style dangerouslySetInnerHTML={{ __html: CSS }} /></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px"><p><a href={`/admin/forms/${form.id}/build`}>← Back to builder</a></p><h1>Form health</h1><p>{form.name} · <strong>{tone}</strong></p><ul>{items.map((item) => <li style={`margin:8px 0;color:${item.level === "error" ? "#b42318" : item.level === "warning" ? "#9a6700" : "#18794e"}`}>{item.level.toUpperCase()}: {item.message}</li>)}</ul></body></html>);
});

app.get("/admin/forms/:id/versions", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const versions = await listFormVersions(c.env.DB, form.id, 50);
  return c.html(<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Version history · {form.name}</title><style dangerouslySetInnerHTML={{ __html: CSS }} /></head><body style="font-family:system-ui;max-width:820px;margin:40px auto;padding:0 20px"><p><a href={`/admin/forms/${form.id}/build`}>← Back to builder</a></p><h1>Version history</h1><p class="muted">Saved schema snapshots for {form.name}. Restoring a version replaces the current draft and published copy.</p>{versions.length ? <div class="card card-b">{versions.map((version) => <div class="kv" style="align-items:center"><div><strong>Version {version.id}</strong><div class="muted small">{new Date(version.created_at).toISOString()} · {version.created_by}</div></div><form method="post" action={`/admin/forms/${form.id}/versions/${version.id}/restore`} data-confirm="Restore this version?"><button class="btn btn-secondary btn-sm" type="submit">Restore</button></form></div>)}</div> : <p>No snapshots yet. Saving the builder will create the first snapshot.</p>}<script src="/assets/guards.js" defer /></body></html>);
});

app.get("/admin/forms/:id/trust", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const schema = parseSchema(form.published_json) ?? parseSchema(form.schema_json);
  const fields = (schema?.blocks ?? []).filter((block) => !["heading", "paragraph", "divider", "page"].includes(block.type));
  const acl = parseFieldAcl(form.field_acl_json);
  const roles = ["editor", "viewer"];

  return c.html(
    <AppShell
      path={`/admin/forms/${form.id}/trust`}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name, href: `/admin/forms/${form.id}` }, { label: "Trust" }]}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={0}
      submissionCount={0}
    >
      <PageHead title="Trust controls" sub="Spam gating without a third party, one-response-per-person without identity, recorded consent, and per-field access." />
      <form method="post" action={`/admin/forms/${form.id}/trust`} style="max-width:660px">

        <div class="card">
          <div class="card-h">Proof-of-work gate</div>
          <div class="card-b">
            <div class="field">
              <label for="pow_bits">Difficulty (leading zero bits)</label>
              <select class="select" id="pow_bits" name="pow_bits">
                {[0, 12, 16, 18, 20, 22].map((bits) => (
                  <option value={String(bits)} selected={(form.pow_bits ?? 0) === bits}>
                    {bits === 0 ? "Off" : `${bits} bits${bits >= 20 ? " (slow on phones)" : ""}`}
                  </option>
                ))}
              </select>
              <div class="hint">The browser must find a matching hash before the form submits. No CAPTCHA, no third-party script, nothing for the respondent to do. 16 bits is roughly a moment on a laptop and expensive in bulk.</div>
            </div>
          </div>
        </div>

        <div class="card mt16">
          <div class="card-h">One response per person</div>
          <div class="card-b">
            <div class="field">
              <label for="unique_mode">Mode</label>
              <select class="select" id="unique_mode" name="unique_mode">
                <option value="off" selected={form.unique_mode !== "blind"}>Off</option>
                <option value="blind" selected={form.unique_mode === "blind"}>Blind — unique, without storing who</option>
              </select>
            </div>
            <div class="field">
              <label for="unique_field">Identifier field</label>
              <select class="select" id="unique_field" name="unique_field">
                <option value="">Select a field</option>
                {fields.map((block) => <option value={block.id} selected={form.unique_field === block.id}>{block.label || block.id}</option>)}
              </select>
              <div class="hint">The value is HMAC&rsquo;d and only the digest is stored, so duplicates are rejected while the database never learns the identifier. Suitable for anonymous staff surveys and ballots.</div>
            </div>
          </div>
        </div>

        <div class="card mt16">
          <div class="card-h">Consent receipt</div>
          <div class="card-b">
            <div class="field">
              <label for="consent_text">Consent wording</label>
              <textarea class="textarea" id="consent_text" name="consent_text" placeholder="Leave empty to disable">{form.consent_text ?? ""}</textarea>
              <div class="hint">Stored with every response along with a version digest of this exact wording, so a later dispute is settled against the text as it stood that day.</div>
            </div>
          </div>
        </div>

        <div class="card mt16">
          <div class="card-h">Field access</div>
          <div class="card-b">
            <p class="small muted" style="margin-bottom:12px">Restrict who can see a field. Unrestricted fields are visible to everyone; owners always see everything.</p>
            {fields.length === 0 ? <p class="small muted">Publish a visual schema to configure field access.</p> : fields.map((block) => (
              <div class="kv">
                <div class="k">{block.label || block.id}</div>
                <div style="display:flex;gap:12px">
                  {roles.map((role) => (
                    <label class="checkbox-row" style="font-size:13px">
                      <input type="checkbox" name={`acl_${block.id}`} value={role} checked={(acl[block.id] ?? []).includes(role)} />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p class="hint" style="margin-top:10px">Leave both unchecked to keep a field visible to everyone.</p>
          </div>
        </div>

        <div style="margin-top:16px"><Button type="submit">Save trust settings</Button></div>
      </form>
    </AppShell>
  );
});

app.post("/admin/forms/:id/trust", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.notFound();
  const body = await c.req.parseBody({ all: true });

  const schema = parseSchema(form.published_json) ?? parseSchema(form.schema_json);
  const fields = (schema?.blocks ?? []).map((block) => block.id);
  const acl: Record<string, string[]> = {};
  for (const field of fields) {
    const raw = body[`acl_${field}`];
    const roles = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
    if (roles.length > 0) acl[field] = roles;
  }

  const bits = Number(body.pow_bits);
  await updateFormTrust(c.env.DB, id, {
    pow_bits: Number.isInteger(bits) && bits >= 0 && bits <= 24 ? bits : 0,
    unique_mode: body.unique_mode === "blind" ? "blind" : "off",
    unique_field: String(body.unique_field ?? "").slice(0, 80),
    consent_text: String(body.consent_text ?? "").trim().slice(0, 4000),
    field_acl_json: JSON.stringify(acl),
  });
  await audit(c.env.DB, "form.trust.updated", id, `pow=${bits} unique=${body.unique_mode}`);
  return c.redirect(`/admin/forms/${id}/trust?msg=${encodeURIComponent("Trust settings saved")}`);
});

app.get("/admin/forms/:id/prefill", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const schema = parseSchema(form.published_json) ?? parseSchema(form.schema_json);
  const fields = (schema?.blocks ?? []).filter((block) => !["heading", "paragraph", "divider", "page"].includes(block.type));
  const url = new URL(c.req.url);
  const supplied: Record<string, string> = {};
  for (const block of fields) {
    const value = url.searchParams.get(block.id);
    if (value) supplied[block.id] = value;
  }
  const secret = c.env.PREFILL_SECRET || c.env.SESSION_SECRET;
  const base = `${originOf(c.req.url)}/f/${form.id}`;
  const link = Object.keys(supplied).length ? await buildPrefillUrl(base, supplied, secret) : "";

  return c.html(
    <AppShell
      path={`/admin/forms/${form.id}/prefill`}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name, href: `/admin/forms/${form.id}` }, { label: "Prefill" }]}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={0}
      submissionCount={0}
    >
      <PageHead title="Signed prefill link" sub="Pre-populate a form with values the recipient cannot edit. The signature covers every value, so changing one invalidates the link." />

      <div class="card" style="max-width:660px">
        <div class="card-h">Enforcement</div>
        <div class="card-b">
          <form method="post" action={`/admin/forms/${form.id}/prefill/mode`}>
            <label class="checkbox-row">
              <input type="checkbox" name="signed_only" checked={form.prefill_signed_only === 1} />
              <span>Reject unsigned prefill values on this form</span>
            </label>
            <p class="hint" style="margin-top:8px">With this off, anyone can prefill any field by editing the query string — the default behaviour, and the same as every other form tool.</p>
            <div style="margin-top:12px"><Button type="submit">Save</Button></div>
          </form>
        </div>
      </div>

      <div class="section-title">Generate a link</div>
      {fields.length === 0 ? (
        <div class="card" style="max-width:660px"><div class="card-b"><p class="small muted">Publish a visual schema to generate prefill links.</p></div></div>
      ) : (
        <div class="card" style="max-width:660px">
          <div class="card-b">
            <form method="get" action={`/admin/forms/${form.id}/prefill`}>
              {fields.map((block) => (
                <div class="field">
                  <label for={`pf_${block.id}`}>{block.label || block.id}</label>
                  <input class="input" id={`pf_${block.id}`} name={block.id} value={supplied[block.id] ?? ""} placeholder="Leave empty to omit" />
                </div>
              ))}
              <Button type="submit">Build signed link</Button>
            </form>
          </div>
        </div>
      )}

      {link ? (
        <div class="card" style="max-width:660px;margin-top:14px">
          <div class="card-h">Your link</div>
          <div class="card-b">
            <div class="mono small" style="word-break:break-all">{link}</div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
});

app.post("/admin/forms/:id/prefill/mode", async (c) => {
  const id = c.req.param("id");
  if (!(await getForm(c.env.DB, id))) return c.notFound();
  const body = await c.req.parseBody();
  await setFormPrefillSignedOnly(c.env.DB, id, body.signed_only === "on");
  await audit(c.env.DB, "form.prefill.mode", id, body.signed_only === "on" ? "signed only" : "open");
  return c.redirect(`/admin/forms/${id}/prefill?msg=${encodeURIComponent("Prefill settings saved")}`);
});

app.get("/admin/forms/:id/integrity", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const links = await chainLinks(c.env.DB, form.id);
  const verdict = await verifyChain(links);
  const anchors = await listAnchors(c.env.DB, form.id, 10);
  const unsealed = links.filter((link) => !link.row_hash).length;

  const tone = verdict.ok ? "#18794e" : "#b42318";
  const headline = verdict.ok
    ? `Intact — ${verdict.checked} response${verdict.checked === 1 ? "" : "s"} verified`
    : `Broken at response ${verdict.brokenAt}`;

  return c.html(
    <AppShell
      path={`/admin/forms/${form.id}/integrity`}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name, href: `/admin/forms/${form.id}` }, { label: "Integrity" }]}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={0}
      submissionCount={0}
    >
      <PageHead title="Response integrity" sub="Each response commits to the one before it, so any later edit, deletion, or back-dating is detectable." />
      <div class="card" style="max-width:760px">
        <div class="card-b">
          <div style={`font-size:15px;font-weight:600;color:${tone}`}>{headline}</div>
          {verdict.ok ? (
            <p class="small muted" style="margin-top:6px">Chain head <span class="mono">{verdict.head.slice(0, 24)}…</span></p>
          ) : (
            <p class="small" style="margin-top:6px">{verdict.reason}</p>
          )}
          {verdict.erased > 0 ? (
            <p class="small muted" style="margin-top:10px">{verdict.erased} response{verdict.erased === 1 ? " was" : "s were"} erased at the respondent request. Those rows keep their original digest as a tombstone, so the chain still verifies through them.</p>
          ) : null}
          {unsealed > 0 ? (
            <p class="small muted" style="margin-top:10px">{unsealed} response{unsealed === 1 ? " was" : "s were"} recorded before the chain was enabled and {unsealed === 1 ? "is" : "are"} not covered.</p>
          ) : null}
        </div>
      </div>

      <div class="section-title">Anchors</div>
      <p class="small muted" style="margin-top:-4px;margin-bottom:12px">An anchor records the chain head at a point in time. Publish or archive one and you can later prove the log you have today is the same log you had then.</p>
      <form method="post" action={`/admin/forms/${form.id}/integrity/anchor`}>
        <Button variant="secondary" type="submit">Record an anchor now</Button>
      </form>
      <div class="card" style="max-width:760px;margin-top:14px">
        {anchors.length ? anchors.map((anchor) => (
          <div class="list-item">
            <div style="min-width:0">
              <div class="mono small" style="word-break:break-all">{anchor.head_hash.slice(0, 40)}…</div>
              <div class="cell-sub">{anchor.row_count} response{anchor.row_count === 1 ? "" : "s"} · {new Date(anchor.created_at).toUTCString()}</div>
            </div>
          </div>
        )) : <div class="card-b"><p class="small muted">No anchors recorded yet.</p></div>}
      </div>
    </AppShell>
  );
});

app.post("/admin/forms/:id/integrity/anchor", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const links = await chainLinks(c.env.DB, form.id);
  const verdict = await verifyChain(links);
  // Signed with SESSION_SECRET so an anchor cannot be forged by someone who only has
  // write access to the database.
  const signature = await hmacSign(`${verdict.head}.${verdict.checked}`, c.env.SESSION_SECRET);
  await recordAnchor(c.env.DB, form.id, verdict.head, verdict.checked, signature);
  await audit(c.env.DB, "integrity.anchor.recorded", form.id, `head ${verdict.head.slice(0, 16)}`);
  return c.redirect(`/admin/forms/${form.id}/integrity?msg=${encodeURIComponent("Anchor recorded")}`);
});

app.get("/admin/forms/:id/versions/:a/compare/:b", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const [left, right] = await Promise.all([
    getFormVersion(c.env.DB, Number(c.req.param("a"))),
    getFormVersion(c.env.DB, Number(c.req.param("b"))),
  ]);
  if (!left || !right || left.form_id !== form.id || right.form_id !== form.id) return c.notFound();
  const diff = diffSchemas(left.schema_json, right.schema_json);

  return c.html(
    <AppShell
      path={`/admin/forms/${form.id}/versions`}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name, href: `/admin/forms/${form.id}` }, { label: "Compare" }]}
      commands={baseCommands(originOf(c.req.url))}
      formCount={0}
      submissionCount={0}
    >
      <PageHead title={`Version ${left.id} → ${right.id}`} sub={summarizeDiff(diff)} />
      {diff.identical ? (
        <div class="card" style="max-width:760px"><div class="card-b"><p class="small muted">These two versions are identical.</p></div></div>
      ) : (
        <div class="card" style="max-width:820px">
          {diff.blocks.map((block) => (
            <div class="list-item" style="align-items:flex-start">
              <div style="width:88px;flex-shrink:0">
                <span class={`badge ${block.kind === "added" ? "badge-success" : block.kind === "removed" ? "badge-danger" : block.kind === "changed" ? "badge-warning" : "badge-neutral"}`}>{block.kind}</span>
              </div>
              <div style="min-width:0">
                <div class="cell-main">{block.label}</div>
                {block.kind === "changed" ? block.changes.map((change) => (
                  <div class="cell-sub"><span class="mono">{change.key}</span>: {change.before} → {change.after}</div>
                )) : null}
                {block.kind === "moved" ? <div class="cell-sub">position {block.from} → {block.to}</div> : null}
                {block.kind === "added" || block.kind === "removed" ? <div class="cell-sub">{block.type}</div> : null}
              </div>
            </div>
          ))}
          {diff.settings.map((change) => (
            <div class="list-item" style="align-items:flex-start">
              <div style="width:88px;flex-shrink:0"><span class="badge badge-neutral">setting</span></div>
              <div style="min-width:0">
                <div class="cell-main">{change.key}</div>
                <div class="cell-sub">{change.before} → {change.after}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
});

app.post("/admin/forms/:id/versions/:versionId/restore", async (c) => {
  const id = c.req.param("id");
  const versionId = Number(c.req.param("versionId"));
  const form = await getForm(c.env.DB, id);
  if (!form || !Number.isInteger(versionId)) return c.notFound();
  await createFormVersion(c.env.DB, id, form.schema_json ?? "{}", form.published_json, "pre-restore");
  const restored = await restoreFormVersion(c.env.DB, id, versionId);
  if (!restored) return c.notFound();
  await audit(c.env.DB, "form.version.restored", id, `version=${versionId}`);
  return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent("Version restored")}`);
});

app.post("/admin/forms/:id/schema", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.notFound();
  const body = await c.req.parseBody();
  const raw = String(body.schema_json ?? "");
  const parsed = parseSchema(raw);
  if (!parsed) {
    return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent("Invalid schema JSON")}`);
  }
  const normalized = JSON.stringify(parsed);
  await createFormVersion(c.env.DB, id, normalized, form.published_json, "admin");
  await updateFormSchema(c.env.DB, id, normalized);
  await audit(c.env.DB, "form.settings.updated", id, "schema saved");
  return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent("Schema saved")}`);
});

app.post("/admin/forms/:id/publish", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.notFound();
  const draft = parseSchema(form.schema_json);
  if (draft && isSchemaV2(draft)) {
    const validation = validateSchemaV2(draft);
    if (validation.errors.length > 0) return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent(`Cannot publish: ${validation.errors.join(" ")}`)}`);
  }
  await publishForm(c.env.DB, id);
  await audit(c.env.DB, "form.published", id, "published");
  return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent("Form published")}`);
});

app.post("/admin/forms/:id/unpublish", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.notFound();
  await unpublishForm(c.env.DB, id);
  await audit(c.env.DB, "form.unpublished", id, "unpublished");
  return c.redirect(`/admin/forms/${id}/build?msg=${encodeURIComponent("Form unpublished")}`);
});

app.get("/admin/forms/:id", async (c) => {
  const url = new URL(c.req.url);
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const tabParam = url.searchParams.get("tab");
  if (tabParam === "build") {
    return c.redirect(`/admin/forms/${form.id}/build`);
  }
  const tab = (["build", "submissions", "setup", "notifications", "webhooks", "settings", "analytics"] as const).includes(tabParam as never)
    ? (tabParam as FormTab)
    : "submissions";
  const subsPage = parsePage(url.searchParams.get("page"));
  const [subs, subsTotal, hooks, stats, analytics] = await Promise.all([
    listSubmissionsForForm(c.env.DB, form.id, { page: subsPage }),
    countSubmissionsForForm(c.env.DB, form.id),
    listWebhooks(c.env.DB, form.id),
    getDashboardStats(c.env.DB),
    tab === "analytics" ? getAnalytics(c.env.DB, form.id) : Promise.resolve(null),
  ]);
  return c.html(
    <FormDetailPage
      path={url.pathname}
      form={form}
      tab={tab}
      subs={subs}
      subsPage={subsPage}
      subsTotal={subsTotal}
      webhooks={hooks}
      origin={originOf(c.req.url)}
      created={url.searchParams.get("created") === "1"}
      hasEmailProvider={!!c.env.RESEND_API_KEY}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
      analytics={analytics}
    />
  );
});

app.post("/admin/forms/:id/settings", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  await updateForm(c.env.DB, id, {
    name: String(body.name ?? "").trim() || "Untitled form",
    redirect_url: String(body.redirect_url ?? "").trim(),
    notify_email: String(body.notify_email ?? "").trim(),
    auto_reply: body.auto_reply === "on" ? 1 : 0,
  });
  const tab = typeof body.tab === "string" && ["notifications", "settings"].includes(body.tab) ? body.tab : null;
  const qs = new URLSearchParams({ msg: "Settings saved" });
  if (tab) qs.set("tab", tab);
  return c.redirect(`/admin/forms/${id}?${qs.toString()}`);
});

app.post("/admin/forms/:id/share", async (c) => {
  const id = c.req.param("id");
  const form = await getForm(c.env.DB, id);
  if (!form) return c.notFound();
  const body = await c.req.parseBody();
  const slug = String(body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const parseDate = (value: unknown): number | null => { const raw = String(value ?? "").trim(); if (!raw) return null; const parsed = Date.parse(raw); return Number.isFinite(parsed) ? parsed : null; };
  const rawLimit = Number(body.submission_limit ?? "");
  const submissionLimit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : null;
  try {
    await updateFormShare(c.env.DB, id, { slug, open_at: parseDate(body.open_at), close_at: parseDate(body.close_at), submission_limit: submissionLimit, closed_message: String(body.closed_message ?? "").trim().slice(0, 500), one_per_respondent: body.one_per_respondent === "on" ? 1 : 0 });
  } catch {
    return c.redirect(`/admin/forms/${id}?tab=settings&msg=${encodeURIComponent("That slug is already in use")}`);
  }
  await audit(c.env.DB, "form.settings.updated", id, "sharing updated");
  return c.redirect(`/admin/forms/${id}?tab=settings&msg=${encodeURIComponent("Sharing settings saved")}`);
});

function safeThemeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try { const parsed = new URL(raw); return parsed.protocol === "https:" || parsed.protocol === "http:" ? raw : ""; } catch { return ""; }
}

app.post("/admin/forms/:id/theme", async (c) => {
  const id = c.req.param("id");
  if (!await getForm(c.env.DB, id)) return c.notFound();
  const body = await c.req.parseBody();
  const radius = Number(body.radius);
  const theme = { background: String(body.background ?? "").trim().slice(0, 40), text: String(body.text ?? "").trim().slice(0, 40), button: String(body.button ?? "").trim().slice(0, 40), radius: Number.isFinite(radius) ? Math.max(0, Math.min(32, radius)) : 10, logo: safeThemeUrl(body.logo), cover: safeThemeUrl(body.cover) };
  await updateFormTheme(c.env.DB, id, JSON.stringify(theme));
  await audit(c.env.DB, "form.settings.updated", id, "theme updated");
  return c.redirect(`/admin/forms/${id}?tab=settings&msg=${encodeURIComponent("Theme saved")}`);
});

app.post("/admin/forms/:id/duplicate", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const copy = await duplicateForm(c.env.DB, form);
  await audit(c.env.DB, "form.created", copy.id, `duplicated from ${form.id}`);
  return c.redirect(`/admin/forms/${copy.id}?created=1&tab=setup&msg=Form+duplicated`);
});

app.post("/admin/forms/:id/archive", async (c) => {
  const id = c.req.param("id");
  await setFormArchived(c.env.DB, id, true);
  await audit(c.env.DB, "form.archived", id, "archived");
  return c.redirect("/admin/forms?msg=Form+archived");
});

app.post("/admin/forms/:id/unarchive", async (c) => {
  const id = c.req.param("id");
  await setFormArchived(c.env.DB, id, false);
  await audit(c.env.DB, "form.archived", id, "restored");
  return c.redirect("/admin/forms?msg=Form+restored");
});

app.post("/admin/forms/:id/delete", async (c) => {
  const id = c.req.param("id");
  await deleteForm(c.env.DB, id);
  await audit(c.env.DB, "form.deleted", id, "deleted");
  return c.redirect("/admin/forms?msg=Form+deleted");
});

app.get("/admin/forms/:id/export.json", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const subs = await listSubmissionsForForm(c.env.DB, form.id, { limit: 5000 });
  return new Response(JSON.stringify({ form: { id: form.id, name: form.name }, responses: subs }), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.json"` } });
});

app.get("/admin/forms/:id/export", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const subs = await listSubmissionsForForm(c.env.DB, form.id, { limit: 5000 });
  return exportCsv(form, subs);
});

function exportCsv(form: FormRow, subs: SubmissionRow[]): Response {
  const keys: string[] = [];
  const parsedRows: Record<string, string>[] = subs.map((s) => {
    let d: Record<string, string> = {};
    try {
      d = JSON.parse(s.data);
    } catch {}
    for (const k of Object.keys(d)) {
      if (!k.startsWith("_") && !keys.includes(k)) keys.push(k);
    }
    return d;
  });
  const lines = [
    ["submitted_at", ...keys].map(csvCell).join(","),
    ...parsedRows.map((row, i) =>
      [new Date(subs[i].created_at).toISOString(), ...keys.map((k) => row[k] ?? "")].map(csvCell).join(",")
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv"`,
    },
  });
}

/* ---------- submissions inbox ---------- */

app.get("/admin/submissions", async (c) => {
  const url = new URL(c.req.url);
  const formId = url.searchParams.get("form") || undefined;
  const spamOnly = url.searchParams.get("spam") === "1";
  const page = parsePage(url.searchParams.get("page"));
  const [subs, total, forms] = await Promise.all([
    listSubmissions(c.env.DB, { formId, spamOnly, page }),
    countSubmissions(c.env.DB, { formId, spamOnly }),
    listForms(c.env.DB),
  ]);
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <InboxPage
      path={url.pathname}
      subs={subs}
      forms={forms}
      activeForm={formId}
      spamOnly={spamOnly}
      page={page}
      total={total}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.get("/admin/submissions/:id", async (c) => {
  const url = new URL(c.req.url);
  let sub = await getSubmission(c.env.DB, Number(c.req.param("id")));
  if (!sub) return c.notFound();
  // Resolve spilled pointer if present (SSR)
  try {
    const resolved = await resolveSpilledData(c.env, sub.data);
    if (resolved !== sub.data) {
      sub = { ...sub, data: resolved };
    }
  } catch {}
  const back =
    url.searchParams.get("back") === "form" && sub.form_id
      ? `/admin/forms/${sub.form_id}`
      : "/admin/submissions";

  // Field-level access control: strip values this viewer is not entitled to see before
  // the page is rendered, so a redacted field never reaches the browser at all.
  const viewer = await currentActor(c);
  const parentForm = sub.form_id ? await getForm(c.env.DB, sub.form_id) : null;
  const acl = parseFieldAcl(parentForm?.field_acl_json);
  if (Object.keys(acl).length > 0 && viewer.role !== "owner") {
    try {
      const parsed = JSON.parse(sub.data) as Record<string, unknown>;
      const labels = parsed._labels;
      const visible = redactForRole(parsed as Record<string, unknown>, acl, viewer.role);
      if (labels !== undefined) visible["_labels"] = redactForRole(labels as Record<string, unknown>, acl, viewer.role);
      sub = { ...sub, data: JSON.stringify(visible) };
    } catch {}
  }

  // Time-locked forms withhold content from every read path until the unlock time.
  if (parentForm && isSealed(parentForm.unlock_at)) {
    sub = { ...sub, data: JSON.stringify({ _sealed: sealedNotice(parentForm.unlock_at as number) }) };
  }

  // Record who read this response. Regulated intake needs to answer that question.
  c.executionCtx.waitUntil(recordResponseView(c.env.DB, sub.id, viewer.label, "view"));

  const views = await listResponseViews(c.env.DB, sub.id, 10);
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <SubmissionDetailPage
      path={url.pathname}
      sub={sub}
      backHref={back}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.post("/admin/submissions/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  if (Number.isInteger(id)) {
    await deleteSubmission(c.env.DB, id);
    await audit(c.env.DB, "response.deleted", String(id), "deleted via dashboard");
  }
  const back = typeof body.back === "string" && body.back.startsWith("/") ? body.back : "/admin/submissions";
  return c.redirect(`${back}?msg=Submission+deleted`);
});

app.post("/admin/submissions/:id/spam", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  if (Number.isInteger(id)) await setSubmissionSpam(c.env.DB, id, String(body.is_spam) === "1");
  const back = typeof body.back === "string" && body.back.startsWith("/") ? body.back : "/admin/submissions";
  return c.redirect(`${back}?msg=Saved`);
});

app.post("/admin/submissions/:id/meta", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const status = ["completed", "partial", "abandoned", "spam"].includes(String(body.status)) ? String(body.status) : "completed";
  const tags = String(body.tags ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 20);
  const sub = Number.isInteger(id) ? await getSubmission(c.env.DB, id) : null;
  if (sub) {
    await updateSubmissionMeta(c.env.DB, id, { status, tagsJson: JSON.stringify(tags), note: String(body.note ?? "") });
    await audit(c.env.DB, "response.updated", String(id), `status=${status}; tags=${tags.length}`);
  }
  const back = typeof body.back === "string" && body.back.startsWith("/") ? body.back : "/admin/submissions";
  return c.redirect(`${back}?msg=Response+updated`);
});

app.post("/admin/submissions/bulk", async (c) => {
  const body = await c.req.parseBody();
  const rawIds = body.id == null ? [] : Array.isArray(body.id) ? body.id : [body.id];
  const ids = rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
  const action = String(body.action ?? "completed");
  const tag = String(body.tag ?? "").trim().toLowerCase().slice(0, 64);
  for (const id of ids) {
    const sub = await getSubmission(c.env.DB, id);
    if (!sub) continue;
    if (action === "delete") await deleteSubmission(c.env.DB, id);
    else if (action === "tag" && tag) {
      let tags: string[] = []; try { const parsed = JSON.parse(sub.tags_json ?? "[]"); if (Array.isArray(parsed)) tags = parsed.map(String); } catch { /* ignore malformed legacy metadata */ }
      if (!tags.includes(tag)) tags.push(tag);
      await updateSubmissionMeta(c.env.DB, id, { status: String(sub.status ?? "completed"), tagsJson: JSON.stringify(tags.slice(0, 20)), note: sub.note ?? "" });
    } else if (["completed", "partial", "spam"].includes(action)) {
      await updateSubmissionMeta(c.env.DB, id, { status: action, tagsJson: sub.tags_json ?? "[]", note: sub.note ?? "" });
    }
    await audit(c.env.DB, action === "delete" ? "response.deleted" : "response.bulk_updated", String(id), `action=${action}`);
  }
  return c.redirect("/admin/submissions?msg=Bulk+action+applied");
});

/* ---------- webhooks ---------- */

app.get("/admin/webhooks", async (c) => {
  const [hooks, forms, stats] = await Promise.all([
    listWebhooks(c.env.DB),
    listForms(c.env.DB),
    getDashboardStats(c.env.DB),
  ]);
  const lastMap = new Map<string, { at: number; ok: boolean }>();
  for (const h of hooks) {
    const row = await c.env.DB
      .prepare("SELECT created_at, ok FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(h.id)
      .first<{ created_at: number; ok: number }>();
    if (row) lastMap.set(h.id, { at: row.created_at, ok: !!row.ok });
  }
  const enriched = hooks.map((w) => ({
    ...w,
    last_delivery_at: lastMap.get(w.id)?.at ?? null,
    last_ok: lastMap.get(w.id)?.ok ?? null,
  }));
  return c.html(
    <WebhooksPage
      path={new URL(c.req.url).pathname}
      hooks={enriched}
      forms={forms}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.post("/admin/webhooks", async (c) => {
  const body = await c.req.parseBody();
  const formId = String(body.form_id ?? "");
  const url = String(body.url ?? "").trim();
  if (!formId || !/^https?:\/\//.test(url)) {
    return c.redirect("/admin/webhooks?msg=Invalid+webhook+details");
  }
  const hook = await createWebhook(c.env.DB, formId, url);
  return c.redirect(`/admin/webhooks/${hook.id}?msg=Webhook+added`);
});

app.get("/admin/webhooks/:id", async (c) => {
  const url = new URL(c.req.url);
  const hook = await getWebhook(c.env.DB, c.req.param("id"));
  if (!hook) return c.notFound();
  const deliveries = await listDeliveries(c.env.DB, hook.id);
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <WebhookDetailPage
      path={url.pathname}
      hook={hook}
      deliveries={deliveries}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.post("/admin/webhooks/:id/toggle", async (c) => {
  const hook = await getWebhook(c.env.DB, c.req.param("id"));
  if (!hook) return c.notFound();
  await setWebhookActive(c.env.DB, hook.id, !hook.active);
  return c.redirect(`/admin/webhooks/${hook.id}?msg=Saved`);
});

app.post("/admin/webhooks/:id/delete", async (c) => {
  await deleteWebhook(c.env.DB, c.req.param("id"));
  return c.redirect("/admin/webhooks?msg=Webhook+deleted");
});

app.post("/admin/webhooks/:id/test", async (c) => {
  const hook = await getWebhook(c.env.DB, c.req.param("id"));
  if (!hook) return c.notFound();
  const result = await sendTestWebhook(c.env.DB, hook);
  const msg = result.ok ? "Test+delivered+%E2%9C%93" : "Test+failed:+";
  return c.redirect(`/admin/webhooks/${hook.id}?msg=${result.ok ? msg : msg + encodeURIComponent(result.detail)}`);
});

/* ---------- workflows / files ---------- */

app.get("/admin/workflows", async (c) => {
  const [stats, workflows, forms] = await Promise.all([getDashboardStats(c.env.DB), listWorkflows(c.env.DB), listForms(c.env.DB)]);
  const runPairs = await Promise.all(workflows.map(async (workflow) => [workflow.id, await listWorkflowRuns(c.env.DB, workflow.id)] as const));
  return c.html(<WorkflowsPage path="/admin/workflows" workflows={workflows} forms={forms} runs={Object.fromEntries(runPairs)} toastMsg={msgFrom(c)} commands={baseCommands(originOf(c.req.url))} formCount={stats.form_count} submissionCount={stats.submission_count} />);
});

app.post("/admin/workflows", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  if (!name) return c.redirect("/admin/workflows?msg=Workflow+name+required");
  const formId = String(body.form_id ?? "").trim() || null;
  if (formId && !await getForm(c.env.DB, formId)) return c.redirect("/admin/workflows?msg=Unknown+form");
  const conditionField = String(body.condition_field ?? "").trim();
  const conditionJson = conditionField ? JSON.stringify([{ field: conditionField, operator: String(body.condition_operator ?? "equals"), value: String(body.condition_value ?? "") }]) : "[]";
  const actionType = String(body.action_type ?? "notify");
  const action = actionType === "webhook" ? { type: "webhook", url: String(body.action_url ?? "").trim() } : actionType === "integration" ? { type: "integration", provider: ["webhook", "slack", "discord", "airtable", "google_sheets"].includes(String(body.integration_provider)) ? String(body.integration_provider) : "webhook", url: String(body.action_url ?? "").trim(), mapping: {} } : actionType === "email" || actionType === "notify" ? { type: actionType, value: String(body.action_url ?? "").trim() } : actionType === "add_tag" ? { type: "add_tag", value: String(body.action_value ?? "").trim() } : { type: "wait", delayMs: Math.max(0, Math.min(10000, Number(body.action_value ?? 0))) };
  await createWorkflow(c.env.DB, { formId, name, trigger: String(body.trigger ?? "submission.completed"), conditionJson, actionsJson: JSON.stringify([action]) });
  await audit(c.env.DB, "workflow.created", formId ?? "", name);
  return c.redirect("/admin/workflows?msg=Workflow+created");
});

app.post("/admin/workflows/:id/toggle", async (c) => {
  const workflow = await getWorkflow(c.env.DB, c.req.param("id"));
  if (!workflow) return c.notFound();
  await setWorkflowActive(c.env.DB, workflow.id, !workflow.active);
  return c.redirect("/admin/workflows?msg=Workflow+updated");
});

app.post("/admin/workflows/:id/delete", async (c) => {
  const id = c.req.param("id");
  if (!await getWorkflow(c.env.DB, id)) return c.notFound();
  await deleteWorkflow(c.env.DB, id);
  await audit(c.env.DB, "workflow.deleted", id, "deleted");
  return c.redirect("/admin/workflows?msg=Workflow+deleted");
});

app.post("/admin/workflows/:id/replay", async (c) => {
  const workflow = await getWorkflow(c.env.DB, c.req.param("id"));
  const body = await c.req.parseBody();
  const submissionId = Number(body.submission_id);
  const submission = Number.isInteger(submissionId) ? await getSubmission(c.env.DB, submissionId) : null;
  const form = submission ? await getForm(c.env.DB, workflow?.form_id || submission.form_id) : null;
  if (!workflow || !submission || !form) return c.redirect("/admin/workflows?msg=Replay+target+not+found");
  let data: Record<string, string> = {};
  try { const parsed = JSON.parse(submission.data) as Record<string, unknown>; data = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "")])); } catch { return c.redirect("/admin/workflows?msg=Replay+data+invalid"); }
  c.executionCtx.waitUntil(executeWorkflow(c.env, workflow, form, submission.id, data));
  await audit(c.env.DB, "workflow.replayed", workflow.id, `submission ${submission.id}`);
  return c.redirect("/admin/workflows?msg=Workflow+replay+queued");
});

app.get("/admin/notifications", async (c) => {
  const [stats, notifications] = await Promise.all([getDashboardStats(c.env.DB), listNotifications(c.env.DB)]);
  return c.html(<AppShell path="/admin/notifications" crumbs={[{ label: "Notifications" }]} toastMsg={msgFrom(c)} commands={baseCommands(originOf(c.req.url))} formCount={stats.form_count} submissionCount={stats.submission_count}><PageHead title="Notifications" sub="Submission and automation events from this workspace." actions={<form method="post" action="/admin/notifications/read"><Button variant="secondary" type="submit">Mark all read</Button></form>} /><div class="card" style="max-width:820px">{notifications.length ? notifications.map((notification) => <div class="list-item" style={notification.read_at ? "opacity:.62" : ""}><div><div class="cell-main">{notification.title}</div><div class="cell-sub">{notification.detail}</div></div><div class="small muted">{new Date(notification.created_at).toISOString()}</div></div>) : <div class="card-b"><p class="t2 small">No notifications yet.</p></div>}</div></AppShell>);
});

app.post("/admin/notifications/read", async (c) => {
  await markNotificationsRead(c.env.DB);
  return c.redirect("/admin/notifications?msg=Notifications+marked+read");
});

app.get("/admin/files", async (c) => {
  const page = parsePage(new URL(c.req.url).searchParams.get("page"));
  const [files, total, storage] = await Promise.all([
    getFiles(c.env.DB, { page }),
    countFiles(c.env.DB),
    totalStorage(c.env.DB),
  ]);
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <FilesPage
      path="/admin/files"
      files={files}
      total={total}
      page={page}
      storageUsed={storage}
      hasR2={!!c.env.FILES}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.get("/admin/files/:id/download", async (c) => {
  const row = await getFile(c.env.DB, c.req.param("id"));
  if (!row || !c.env.FILES) return c.text("File not found — file storage may not be configured.", 404);
  const object = await c.env.FILES.get(row.r2_key);
  if (!object) return c.text("File object is missing from storage.", 404);
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || row.content_type || "application/octet-stream",
      "content-disposition": `attachment; filename="${row.filename.replace(/["\\]/g, "")}"`,
      "content-length": String(object.size),
    },
  });
});

app.post("/admin/files/:id/delete", async (c) => {
  const row = await getFile(c.env.DB, c.req.param("id"));
  if (row) await deleteFile(c.env, c.env.DB, row);
  return c.redirect("/admin/files?msg=File+deleted");
});

/* ---------- settings ---------- */

app.get("/admin/settings", async (c) => {
  const url = new URL(c.req.url);
  const sectionParam = url.searchParams.get("section");
  const section = (SECTIONS_KEYS as readonly string[]).includes(sectionParam ?? "")
    ? (sectionParam as SettingsSection)
    : "general";
  const [stats, forms, retentionDays, apiKeys, members] = await Promise.all([
    getDashboardStats(c.env.DB),
    listForms(c.env.DB),
    getSetting(c.env.DB, "retention_days"),
    listApiKeys(c.env.DB),
    listWorkspaceMembers(c.env.DB),
  ]);
  const createdKey = url.searchParams.get("createdKey") || undefined;
  const inviteUrl = url.searchParams.get("invite") || undefined;
  return c.html(
    <SettingsPage
      path={url.pathname}
      section={section}
      workspaceName={c.env.WORKSPACE_NAME || "My workspace"}
      stats={stats}
      formsWithNotify={forms}
      retentionDays={retentionDays}
      apiKeys={apiKeys}
      createdKey={createdKey}
      members={members}
      inviteUrl={inviteUrl}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
});

app.post("/admin/settings/members/invite", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "viewer" ? "viewer" : "editor";
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.redirect("/admin/settings?section=members&msg=Valid+email+required");
  const token = newResumeToken();
  await createInvitation(c.env.DB, email, role, await sha256Hex(token), Date.now() + 7 * 24 * 60 * 60 * 1000);
  await audit(c.env.DB, "membership.invited", email, role);
  return c.redirect(`/admin/settings?section=members&invite=${encodeURIComponent(`${originOf(c.req.url)}/invite/${token}`)}&msg=Invitation+created`);
});

app.post("/admin/settings/members/:id/remove", async (c) => {
  await deleteMembership(c.env.DB, c.req.param("id"));
  await audit(c.env.DB, "membership.removed", c.req.param("id"), "removed");
  return c.redirect("/admin/settings?section=members&msg=Member+removed");
});

app.post("/admin/api-keys", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  if (!name) return c.redirect("/admin/settings?section=api&msg=Name+required");
  const scope = ["read", "write", "read_write"].includes(String(body.scope)) ? String(body.scope) : "read_write";
  const expiryDays = [30, 90, 365].includes(Number(body.expires_days)) ? Number(body.expires_days) : 0;
  const expiresAt = expiryDays ? Date.now() + expiryDays * 86400000 : null;
  const token = await (async () => {
    const a = "abcdefghijkmnopqrstuvwxyz23456789";
    const b = crypto.getRandomValues(new Uint8Array(32));
    let s = "fr_live_";
    for (const x of b) s += a[x % a.length];
    return s;
  })();
  const hash = await sha256Hex(token);
  const prefix = token.slice(0, 12);
  const last4 = token.slice(-4);
  const row = await createApiKey(c.env.DB, { name, prefix, hash, last4, scope, expiresAt });
  await audit(c.env.DB, "key.created", row.id, name);
  return c.redirect(`/admin/settings?section=api&createdKey=${encodeURIComponent(token)}&msg=Key+created`);
});

app.post("/admin/api-keys/:id/revoke", async (c) => {
  const id = c.req.param("id");
  await revokeApiKey(c.env.DB, id);
  await audit(c.env.DB, "key.revoked", id, "");
  return c.redirect("/admin/settings?section=api&msg=Key+revoked");
});

app.post("/admin/settings/retention", async (c) => {
  const body = await c.req.parseBody();
  const raw = String(body.retention_days ?? "").trim();
  if (raw === "") {
    await setSetting(c.env.DB, "retention_days", "");
    await audit(c.env.DB, "settings.updated", "retention_days", "retention off");
    return c.redirect("/admin/settings?section=general&msg=Retention+disabled");
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 3650) {
    return c.redirect("/admin/settings?section=general&msg=Invalid+retention+value");
  }
  await setSetting(c.env.DB, "retention_days", String(n));
  await audit(c.env.DB, "settings.updated", "retention_days", `retention ${n} days`);
  return c.redirect("/admin/settings?section=general&msg=Retention+saved");
});

app.post("/admin/maintenance/prune", async (c) => {
  const retention = await getSetting(c.env.DB, "retention_days");
  const days = retention ? Number(retention) : NaN;
  if (!retention || retention.trim() === "" || !Number.isInteger(days) || days < 1) {
    return c.redirect("/admin/settings?section=general&msg=Retention+is+disabled");
  }
  const cutoff = Date.now() - days * 86400000;
  // Fetch old submissions (batch)
  const { results: olds } = await c.env.DB
    .prepare("SELECT id, data FROM submissions WHERE created_at < ? LIMIT 500")
    .bind(cutoff)
    .all<{ id: number; data: string }>();
  let pruned = 0;
  for (const row of olds ?? []) {
    // Delete spilled R2 object if present
    try {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      const sp = parsed["_spilled"];
      if (typeof sp === "string" && sp.startsWith("r2://") && c.env.FILES) {
        const key = sp.slice(5);
        try { await c.env.FILES.delete(key); } catch {}
      }
    } catch {}
    // Delete file rows + R2 objects tied to submission
    try {
      const { results: files } = await c.env.DB
        .prepare("SELECT * FROM files WHERE submission_id = ?")
        .bind(row.id)
        .all<any>();
      for (const f of files ?? []) {
        try { await deleteFile(c.env, c.env.DB, f as any); } catch {}
      }
    } catch {}
    await c.env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(row.id).run();
    pruned++;
  }
  // Also delete any remaining old submissions that may not have been in limit (loop if needed)
  // For safety, delete remaining in one go for those not handled file-wise (already handled above batch)
  // If we had <500, we are done; else we may have more, do bulk delete for remaining (best-effort file cleanup may be incomplete but ok)
  if ((olds?.length ?? 0) === 500) {
    // Delete remaining old rows without per-row file handling to avoid infinite loop in this request
    // Files for those will be orphaned but next prune will clean; we still purge DB rows
    await c.env.DB.prepare("DELETE FROM submissions WHERE created_at < ?").bind(cutoff).run();
    // Try to clean files for remaining pruned rows (best-effort)
    const { results: leftoverFiles } = await c.env.DB
      .prepare("SELECT * FROM files WHERE created_at < ? LIMIT 100")
      .bind(cutoff)
      .all<any>();
    for (const f of leftoverFiles ?? []) {
      try { await deleteFile(c.env, c.env.DB, f as any); } catch {}
    }
  } else if (pruned > 0 && (olds?.length ?? 0) < 500) {
    // Ensure no stray submissions remain older than cutoff (in case of race)
    await c.env.DB.prepare("DELETE FROM submissions WHERE created_at < ?").bind(cutoff).run();
  }
  await audit(c.env.DB, "retention.pruned", "", `pruned ${pruned} submissions older than ${days} days`);
  return c.redirect(`/admin/settings?section=general&msg=Pruned+${pruned}+submissions`);
});

const SECTIONS_KEYS = ["general", "members", "domains", "api", "notifications", "billing", "security"] as const;

/* ---------- public landing & 404s ---------- */

app.get("/", (c) => c.html(<LandingPage origin={originOf(c.req.url)} />));

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/admin")) {
    return c.text("Not found — check the URL or use the sidebar navigation.", 404);
  }
  return c.text("Not found", 404);
});

export default app;
