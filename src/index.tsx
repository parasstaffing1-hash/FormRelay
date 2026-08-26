import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Bindings, FormRow, SubmissionRow } from "./types";
import { hmacSign, hmacVerify, csvCell } from "./util";
import {
  createForm,
  duplicateForm,
  listForms,
  listFormsWithStats,
  getForm,
  updateForm,
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
} from "./db";
import { sendNotification, sendAutoReply } from "./email";
import { checkSpam, normalizePayload } from "./spam";
import { deliverSubmission, sendTestWebhook } from "./webhooks";
import { getFiles, countFiles, totalStorage, getFile, saveUpload, deleteFile } from "./files";
import { CLIENT_JS } from "./ui/client";
import type { CommandItem } from "./ui/shell";
import { HomePage } from "./pages/home";
import { FormsPage } from "./pages/forms";
import { FormDetailPage, FormTab } from "./pages/form-detail";
import { InboxPage } from "./pages/inbox";
import { SubmissionDetailPage } from "./pages/submission-detail";
import { WebhooksPage, WebhookDetailPage, ComingSoonPage } from "./pages/webhook-pages";
import { WorkflowsPage, FilesPage, SettingsPage, SettingsSection, LoginPage, LandingPage } from "./pages/misc";

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

function baseCommands(origin: string): CommandItem[] {
  return [
    { label: "New form", href: "/admin/forms?new=1", icon: NAV_ICONS.form, keywords: "create add endpoint" },
    { label: "Go to Home", href: "/admin", icon: NAV_ICONS.home },
    { label: "Go to Forms", href: "/admin/forms", icon: NAV_ICONS.form },
    { label: "Search submissions", href: "/admin/submissions", icon: NAV_ICONS.inbox, keywords: "inbox find" },
    { label: "Go to Workflows", href: "/admin/workflows", icon: NAV_ICONS.zap },
    { label: "Go to Webhooks", href: "/admin/webhooks", icon: NAV_ICONS.webhook },
    { label: "Go to Settings", href: "/admin/settings", icon: NAV_ICONS.settings },
    { label: "Open documentation", href: "/", icon: NAV_ICONS.book, keywords: "docs help guide" },
  ];
}

/* ---------- assets ---------- */

app.get("/assets/app.js", (c) =>
  new Response(CLIENT_JS, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" },
  })
);

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

app.post("/f/:id", async (c) => {
  const formId = c.req.param("id");
  const contentType = c.req.header("content-type") || "";

  const form = await getForm(c.env.DB, formId);
  if (!form) return c.text("Unknown form endpoint", 404);
  if (form.archived) return c.text("This form is no longer accepting submissions.", 410);

  const ct = contentType.toLowerCase();
  let data: Record<string, string>;
  let uploads: { fieldName: string; file: File }[] = [];
  if (ct.includes("application/json")) {
    try {
      const body = await c.req.json();
      data = normalizePayload(typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {});
    } catch {
      data = {};
    }
  } else {
    const raw = await c.req.parseBody();
    data = normalizePayload(raw);
    for (const [fieldName, value] of Object.entries(raw)) {
      if (value instanceof File && value.size > 0) uploads.push({ fieldName, file: value });
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

  const submissionId = await insertSubmission(
    c.env.DB, formId, stripControlFields(data), ip, userAgent, referer, verdict.spam
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

app.get("/f/:id", (c) => c.text("This endpoint accepts POST submissions only.", 405));

/* ---------- auth ---------- */

app.get("/admin/login", (c) => c.html(<LoginPage />));

app.post("/admin/login", async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  if (!c.env.ADMIN_PASSWORD || password !== c.env.ADMIN_PASSWORD) {
    return c.html(<LoginPage error="Wrong password. Try again." />);
  }
  setCookie(c, COOKIE, await makeSessionToken(c.env.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.redirect("/admin");
});

app.get("/admin/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.redirect("/admin/login");
});

/* ---------- admin auth gate ---------- */

app.use("/admin/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login" || path === "/admin/logout") return next();
  const token = getCookie(c, COOKIE);
  if (!(await verifySessionToken(token, c.env.SESSION_SECRET))) {
    return c.redirect("/admin/login");
  }
  await next();
});

/* ---------- home / dashboard ---------- */

app.get("/admin", async (c) => {
  const stats = await getDashboardStats(c.env.DB);
  const forms = await listFormsWithStats(c.env.DB);
  const recent = await recentSubmissions(c.env.DB, 8);
  return c.html(
    <HomePage
      path={new URL(c.req.url).pathname}
      stats={stats}
      forms={forms}
      recent={recent}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
    />
  );
});

app.get("/dashboard", (c) => c.redirect("/admin"));

/* ---------- forms ---------- */

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
  const row = await createForm(c.env.DB, { name });
  return c.redirect(`/admin/forms/${row.id}?tab=setup&created=1&msg=Form+created`);
});

app.get("/admin/forms/:id", async (c) => {
  const url = new URL(c.req.url);
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const tabParam = url.searchParams.get("tab");
  const tab = (["submissions", "setup", "notifications", "webhooks", "settings"] as const).includes(tabParam as never)
    ? (tabParam as FormTab)
    : "submissions";
  const subsPage = parsePage(url.searchParams.get("page"));
  const [subs, subsTotal, hooks, stats] = await Promise.all([
    listSubmissionsForForm(c.env.DB, form.id, { page: subsPage }),
    countSubmissionsForForm(c.env.DB, form.id),
    listWebhooks(c.env.DB, form.id),
    getDashboardStats(c.env.DB),
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

app.post("/admin/forms/:id/duplicate", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const copy = await duplicateForm(c.env.DB, form);
  return c.redirect(`/admin/forms/${copy.id}?created=1&tab=setup&msg=Form+duplicated`);
});

app.post("/admin/forms/:id/archive", async (c) => {
  await setFormArchived(c.env.DB, c.req.param("id"), true);
  return c.redirect("/admin/forms?msg=Form+archived");
});

app.post("/admin/forms/:id/unarchive", async (c) => {
  await setFormArchived(c.env.DB, c.req.param("id"), false);
  return c.redirect("/admin/forms?msg=Form+restored");
});

app.post("/admin/forms/:id/delete", async (c) => {
  await deleteForm(c.env.DB, c.req.param("id"));
  return c.redirect("/admin/forms?msg=Form+deleted");
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
  const sub = await getSubmission(c.env.DB, Number(c.req.param("id")));
  if (!sub) return c.notFound();
  const back =
    url.searchParams.get("back") === "form" && sub.form_id
      ? `/admin/forms/${sub.form_id}`
      : "/admin/submissions";
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
  if (Number.isInteger(id)) await deleteSubmission(c.env.DB, id);
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
  const stats = await getDashboardStats(c.env.DB);
  return c.html(
    <WorkflowsPage
      path="/admin/workflows"
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
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
  const [stats, forms] = await Promise.all([getDashboardStats(c.env.DB), listForms(c.env.DB)]);
  return c.html(
    <SettingsPage
      path={url.pathname}
      section={section}
      workspaceName={c.env.WORKSPACE_NAME || "My workspace"}
      stats={stats}
      formsWithNotify={forms}
      toastMsg={msgFrom(c)}
      commands={baseCommands(originOf(c.req.url))}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
    />
  );
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
