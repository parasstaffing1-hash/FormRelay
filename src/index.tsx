import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { Bindings, FormRow } from "./types";
import { hmacSign, hmacVerify } from "./util";
import {
  createForm,
  listForms,
  getForm,
  updateForm,
  deleteForm,
  insertSubmission,
  listSubmissions,
  deleteSubmission,
  setSubmissionSpam,
} from "./db";
import { sendNotification, sendAutoReply } from "./email";
import { checkSpam, normalizePayload } from "./spam";
import { LoginPage, FormsPage, SubmissionsPage, DocsPage } from "./admin";

const COOKIE = "fr_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Env = { Bindings: Bindings };
const app = new Hono<Env>();

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

app.use("/admin/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login" || path === "/admin/logout") return next();

  const token = getCookie(c, COOKIE);
  if (!(await verifySessionToken(token, c.env.SESSION_SECRET))) {
    return c.redirect("/admin/login");
  }
  await next();
});

// ---------- public submit endpoint ----------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.on("OPTIONS", "/f/:id/*", (c) => new Response(null, { status: 204, headers: CORS_HEADERS }));
app.on("OPTIONS", "/f/:id", (c) => new Response(null, { status: 204, headers: CORS_HEADERS }));

async function extractPayload(c: {
  req: { header(n: string): string | undefined; parseBody(): Promise<Record<string, unknown>>; json(): Promise<unknown> };
}): Promise<Record<string, string>> {
  const ct = (c.req.header("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const body = await c.req.json();
      return normalizePayload(typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {});
    } catch {
      return {};
    }
  }
  return normalizePayload(await c.req.parseBody());
}

function wantsJson(contentType: string, data: Record<string, string>): boolean {
  return contentType.includes("application/json") || "_json" in data;
}

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
  if (!form) {
    return c.text("Unknown form endpoint", 404);
  }

  const data = await extractPayload(c);
  const isJson = wantsJson(contentType, data);

  // honeypot hit -> pretend success, store nothing
  for (const key of ["_gotcha", "_honeypot", "_hp"]) {
    if ((data[key] ?? "").trim() !== "") {
      return isJson ? c.json({ ok: true }) : c.html("<h1>Thank you!</h1><p>Your submission has been received.</p>");
    }
  }

  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = c.req.header("user-agent") || "";

  let verdict = { spam: false, reason: "" };
  try {
    verdict = await checkSpam(c.env, data, ip);
  } catch {
    // never block a submission because spam checks failed
  }

  await insertSubmission(c.env.DB, formId, stripControlFields(data), ip, userAgent, verdict.spam);

  if (!verdict.spam) {
    c.executionCtx.waitUntil(
      Promise.allSettled([
        sendNotification(c.env, form, data),
        sendAutoReply(c.env, form, data),
      ])
    );
  }

  if (isJson) return c.json({ ok: true });

  const redirect = data._redirect || form.redirect_url;
  if (redirect) return c.redirect(redirect, 303);

  return c.html(
    `<!doctype html><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0d1117;color:#e6edf3"><div style="text-align:center"><h1>Thank you!</h1><p>Your submission has been received.</p></div></body>`
  );
});

app.get("/f/:id", (c) =>
  c.text("This endpoint accepts POST submissions only.", 405)
);

// ---------- auth ----------

app.get("/admin/login", (c) => c.html(<LoginPage />));

app.post("/admin/login", async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  if (!c.env.ADMIN_PASSWORD || password !== c.env.ADMIN_PASSWORD) {
    return c.html(<LoginPage error="Wrong password." />);
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

// ---------- admin ----------

app.get("/admin", async (c) => {
  const forms = await listForms(c.env.DB);
  const counts: Record<string, number> = {};
  for (const f of forms) {
    const subs = await listSubmissions(c.env.DB, f.id, 1000);
    counts[f.id] = subs.length;
  }
  return c.html(<FormsPage forms={forms} origin={new URL(c.req.url).origin} countFor={counts} />);
});

app.post("/admin/forms", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim() || "Untitled form";
  await createForm(c.env.DB, name);
  return c.redirect("/admin?msg=Form+created");
});

app.get("/admin/forms/:id", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const subs = await listSubmissions(c.env.DB, form.id);
  return c.html(
    <SubmissionsPage form={form} subs={subs} origin={new URL(c.req.url).origin} />
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
  return c.redirect(`/admin/forms/${id}?msg=Settings+saved`);
});

app.post("/admin/forms/:id/delete", async (c) => {
  await deleteForm(c.env.DB, c.req.param("id"));
  return c.redirect("/admin?msg=Form+deleted");
});

app.get("/admin/forms/:id/export", async (c) => {
  const form = await getForm(c.env.DB, c.req.param("id"));
  if (!form) return c.notFound();
  const subs = await listSubmissions(c.env.DB, form.id, 5000);

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

  const escCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["submitted_at", ...keys].map(escCell).join(","),
    ...parsedRows.map((row, i) =>
      [new Date(subs[i].created_at).toISOString(), ...keys.map((k) => row[k] ?? "")].map(escCell).join(",")
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv"`,
    },
  });
});

app.post("/admin/submissions/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  if (Number.isInteger(id)) await deleteSubmission(c.env.DB, id);
  return c.redirect(`/admin/forms/${String(body.form_id ?? "")}`);
});

app.post("/admin/submissions/:id/spam", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  if (Number.isInteger(id)) await setSubmissionSpam(c.env.DB, id, String(body.is_spam) === "1");
  return c.redirect(`/admin/forms/${String(body.form_id ?? "")}`);
});

// ---------- docs / fallback ----------

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.html(<DocsPage origin={origin} />);
});

app.notFound((c) => c.text("Not found", 404));

export default app;
