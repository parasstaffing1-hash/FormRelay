import {
  FormRow, FormWithStats, SubmissionRow, SubmissionWithContext,
  WebhookRow, WebhookWithContext, DeliveryRow, DashboardStats,
  ApiKeyRow, WorkflowRow, WorkflowRunRow, WorkflowStepRow, UserRow, MembershipRow, InvitationRow,
} from "./types";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

function randomId(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function randomSecret(): string {
  return "whsec_" + randomId(32);
}

/* ================= forms ================= */

export async function createForm(
  db: D1Database,
  fields: { name: string; redirect_url?: string; notify_email?: string; schemaJson?: string | null; slug?: string | null }
): Promise<FormRow> {
  const row: FormRow = {
    id: randomId(10),
    name: fields.name,
    redirect_url: fields.redirect_url ?? "",
    notify_email: fields.notify_email ?? "",
    auto_reply: 0,
    archived: 0,
    schema_json: fields.schemaJson ?? null,
    published_json: null,
    status: "draft",
    views: 0,
    created_at: Date.now(),
    slug: fields.slug ?? null,
    theme_json: null,
    open_at: null,
    close_at: null,
    submission_limit: null,
    closed_message: "",
    one_per_respondent: 0,
  };
  await db
    .prepare("INSERT INTO forms (id, name, redirect_url, notify_email, auto_reply, archived, schema_json, published_json, status, views, created_at, slug, theme_json, open_at, close_at, submission_limit, closed_message, one_per_respondent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.name, row.redirect_url, row.notify_email, row.auto_reply, row.archived, row.schema_json, row.published_json, row.status, row.views, row.created_at, row.slug ?? null, row.theme_json ?? null, row.open_at ?? null, row.close_at ?? null, row.submission_limit ?? null, row.closed_message ?? "", row.one_per_respondent ?? 0)
    .run();
  return row;
}

export async function duplicateForm(db: D1Database, source: FormRow): Promise<FormRow> {
  return createForm(db, { name: `${source.name} (copy)`, redirect_url: source.redirect_url, schemaJson: source.schema_json });
}

export async function getFormBySlug(db: D1Database, slug: string): Promise<FormRow | null> {
  return await db.prepare("SELECT * FROM forms WHERE slug = ? AND archived = 0").bind(slug).first<FormRow>();
}

export async function updateFormShare(db: D1Database, id: string, fields: { slug: string; open_at: number | null; close_at: number | null; submission_limit: number | null; closed_message: string; one_per_respondent: number }): Promise<void> {
  await db.prepare("UPDATE forms SET slug = ?, open_at = ?, close_at = ?, submission_limit = ?, closed_message = ?, one_per_respondent = ? WHERE id = ?")
    .bind(fields.slug || null, fields.open_at, fields.close_at, fields.submission_limit, fields.closed_message, fields.one_per_respondent, id).run();
}

export async function updateFormTheme(db: D1Database, id: string, themeJson: string): Promise<void> {
  await db.prepare("UPDATE forms SET theme_json = ? WHERE id = ?").bind(themeJson, id).run();
}
export async function updateFormSchema(db: D1Database, id: string, schemaJson: string): Promise<void> {
  await db.prepare("UPDATE forms SET schema_json = ? WHERE id = ?").bind(schemaJson, id).run();
}
export async function publishForm(db: D1Database, id: string): Promise<void> {
  const row = await getForm(db, id);
  if (!row) return;
  await db.prepare("UPDATE forms SET published_json = schema_json, status = 'published' WHERE id = ?").bind(id).run();
}
export async function unpublishForm(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE forms SET status = 'draft' WHERE id = ?").bind(id).run();
}
export async function incrementFormViews(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE forms SET views = views + 1 WHERE id = ?").bind(id).run();
}
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare("SELECT value FROM settings_kv WHERE key = ?").bind(key).first<{ value:string }>();
  return r?.value ?? null;
}
export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO settings_kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value).run();
}

export async function listForms(db: D1Database): Promise<FormRow[]> {
  const { results } = await db.prepare("SELECT * FROM forms ORDER BY created_at DESC").all<FormRow>();
  return results ?? [];
}

export async function listFormsWithStats(db: D1Database, q?: string): Promise<FormWithStats[]> {
  const filter = q ? "WHERE f.name LIKE ?" : "";
  const { results } = await db
    .prepare(
      `SELECT f.*, COUNT(s.id) AS submission_count, MAX(s.created_at) AS last_submission_at
       FROM forms f LEFT JOIN submissions s ON s.form_id = f.id
       ${filter}
       GROUP BY f.id ORDER BY f.created_at DESC`
    )
    .bind(...(q ? [`%${q}%`] : []))
    .all<FormWithStats>();
  return results ?? [];
}

export async function getForm(db: D1Database, id: string): Promise<FormRow | null> {
  return await db.prepare("SELECT * FROM forms WHERE id = ?").bind(id).first<FormRow>();
}

export async function updateForm(
  db: D1Database,
  id: string,
  fields: { name: string; redirect_url: string; notify_email: string; auto_reply: number }
): Promise<void> {
  await db
    .prepare("UPDATE forms SET name = ?, redirect_url = ?, notify_email = ?, auto_reply = ? WHERE id = ?")
    .bind(fields.name, fields.redirect_url, fields.notify_email, fields.auto_reply, id)
    .run();
}

export async function setFormArchived(db: D1Database, id: string, archived: boolean): Promise<void> {
  await db.prepare("UPDATE forms SET archived = ? WHERE id = ?").bind(archived ? 1 : 0, id).run();
}

export async function deleteForm(db: D1Database, id: string): Promise<void> {
  const hooks = await listWebhooks(db, id);
  for (const h of hooks) await deleteWebhook(db, h.id);
  await db.prepare("DELETE FROM submissions WHERE form_id = ?").bind(id).run();
  await db.prepare("DELETE FROM forms WHERE id = ?").bind(id).run();
}

/* ================= submissions ================= */

export async function insertSubmission(
  db: D1Database,
  formId: string,
  data: Record<string, unknown>,
  ip: string,
  userAgent: string,
  referer: string,
  isSpam: boolean
): Promise<number | null> {
  const now = Date.now();
  const result = await db
    .prepare("INSERT INTO submissions (form_id, data, ip, user_agent, referer, is_spam, created_at, status, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(formId, JSON.stringify(data), ip, userAgent, referer, isSpam ? 1 : 0, now, isSpam ? "spam" : "completed", isSpam ? null : now, now)
    .run();
  return result.meta?.last_row_id ?? null;
}

export async function insertPartialSubmission(
  db: D1Database,
  formId: string,
  data: Record<string, unknown>,
  ip: string,
  userAgent: string,
  referer: string,
  tokenHash: string,
  expiresAt: number,
): Promise<number | null> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO submissions (form_id, data, ip, user_agent, referer, is_spam, created_at, status, resume_token_hash, resume_expires_at, resume_revoked, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'partial', ?, ?, 0, ?)"
  ).bind(formId, JSON.stringify(data), ip, userAgent, referer, now, tokenHash, expiresAt, now).run();
  return result.meta?.last_row_id ?? null;
}

export async function getSubmissionByResumeHash(db: D1Database, tokenHash: string): Promise<SubmissionRow | null> {
  return await db.prepare("SELECT * FROM submissions WHERE resume_token_hash = ? AND resume_revoked = 0 AND resume_expires_at > ? AND status = 'partial'")
    .bind(tokenHash, Date.now()).first<SubmissionRow>();
}

export async function updatePartialSubmission(db: D1Database, id: number, data: Record<string, unknown>): Promise<void> {
  await db.prepare("UPDATE submissions SET data = ?, updated_at = ? WHERE id = ? AND status = 'partial' AND resume_revoked = 0")
    .bind(JSON.stringify(data), Date.now(), id).run();
}

export async function completeSubmission(db: D1Database, id: number, data: Record<string, unknown>): Promise<void> {
  const now = Date.now();
  await db.prepare("UPDATE submissions SET data = ?, status = 'completed', completed_at = ?, updated_at = ?, resume_revoked = 1 WHERE id = ? AND status = 'partial' AND resume_revoked = 0")
    .bind(JSON.stringify(data), now, now, id).run();
}

export async function countCompletedForForm(db: D1Database, formId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND status = 'completed' AND is_spam = 0").bind(formId).first<{ n: number }>();
  return row?.n ?? 0;
}

export const SUBMISSIONS_PAGE_SIZE = 25;

export type SubmissionFilter = { formId?: string; spamOnly?: boolean; limit?: number; page?: number };

function submissionWhere(filter: SubmissionFilter): { where: string; binds: (string | number)[] } {
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  if (filter.formId) { clauses.push("s.form_id = ?"); binds.push(filter.formId); }
  if (filter.spamOnly) clauses.push("s.is_spam = 1");
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", binds };
}

function pageOffset(page: number): number {
  return Math.max(1, Math.floor(page)) - 1;
}

export async function listSubmissions(db: D1Database, filter: SubmissionFilter = {}): Promise<SubmissionWithContext[]> {
  const { where, binds } = submissionWhere(filter);
  const p = filter.page;
  const sql =
    `SELECT s.*, f.name AS form_name FROM submissions s
     LEFT JOIN forms f ON f.id = s.form_id
     ${where} ORDER BY s.created_at DESC LIMIT ?${p !== undefined ? " OFFSET ?" : ""}`;
  const pagingBinds: (string | number)[] =
    p !== undefined
      ? [SUBMISSIONS_PAGE_SIZE, pageOffset(p) * SUBMISSIONS_PAGE_SIZE]
      : [filter.limit ?? 100];
  const { results } = await db.prepare(sql).bind(...binds, ...pagingBinds).all<SubmissionWithContext>();
  return results ?? [];
}

export async function countSubmissions(db: D1Database, filter: SubmissionFilter = {}): Promise<number> {
  const { where, binds } = submissionWhere(filter);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM submissions s ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type FormSubmissionsOptions = { page?: number; limit?: number };

export async function listSubmissionsForForm(
  db: D1Database,
  formId: string,
  opts: FormSubmissionsOptions = {}
): Promise<SubmissionRow[]> {
  let sql = "SELECT * FROM submissions WHERE form_id = ? ORDER BY created_at DESC";
  const params: (string | number)[] = [formId];
  if (opts.page !== undefined) {
    sql += " LIMIT ? OFFSET ?";
    params.push(SUBMISSIONS_PAGE_SIZE, pageOffset(opts.page) * SUBMISSIONS_PAGE_SIZE);
  } else if (opts.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const { results } = await db.prepare(sql).bind(...params).all<SubmissionRow>();
  return results ?? [];
}

export async function countSubmissionsForForm(db: D1Database, formId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?")
    .bind(formId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getSubmission(db: D1Database, id: number): Promise<SubmissionWithContext | null> {
  return await db
    .prepare("SELECT s.*, f.name AS form_name FROM submissions s LEFT JOIN forms f ON f.id = s.form_id WHERE s.id = ?")
    .bind(id)
    .first<SubmissionWithContext>();
}

export async function deleteSubmission(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM submissions WHERE id = ?").bind(id).run();
}

export async function setSubmissionSpam(db: D1Database, id: number, isSpam: boolean): Promise<void> {
  await db.prepare("UPDATE submissions SET is_spam = ?, status = ?, updated_at = ? WHERE id = ?").bind(isSpam ? 1 : 0, isSpam ? "spam" : "completed", Date.now(), id).run();
}

export async function countRecentByIp(db: D1Database, ip: string, sinceMs: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at > ?")
    .bind(ip, sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* ================= dashboard ================= */

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export async function getDashboardStats(db: D1Database): Promise<DashboardStats> {
  const [forms, subs, month] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM forms WHERE archived = 0").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM submissions").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE created_at >= ?").bind(startOfMonth()).first<{ n: number }>(),
  ]);
  return {
    form_count: forms?.n ?? 0,
    submission_count: subs?.n ?? 0,
    month_count: month?.n ?? 0,
  };
}

export async function recentSubmissions(db: D1Database, limit = 8): Promise<SubmissionWithContext[]> {
  return listSubmissions(db, { limit });
}

/* ================= analytics ================= */

export type AnalyticsDaily = { date: string; count: number };
export type FormAnalytics = {
  daily: AnalyticsDaily[];
  dailyViews: AnalyticsDaily[];
  views: number;
  total: number;
  spam: number;
  referrers: { referer: string; count: number }[];
  campaigns: { source: string; medium: string; campaign: string; count: number }[];
};
export type DashboardAnalytics = { daily: AnalyticsDaily[] };

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fillDaily(days: number): AnalyticsDaily[] {
  const out: AnalyticsDaily[] = [];
  const today = new Date();
  // Use UTC midnight to align with SQLite unixepoch date
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(base.getTime() - i * 86400000);
    out.push({ date: dateKey(dt), count: 0 });
  }
  return out;
}

export async function recordFormEvent(db: D1Database, formId: string, kind: "view" | "submission", referer: string, metadata: Record<string, string> = {}): Promise<void> {
  await db.prepare("INSERT INTO form_events (form_id, kind, created_at, referer, metadata_json) VALUES (?, ?, ?, ?, ?)").bind(formId, kind, Date.now(), referer.slice(0, 500), JSON.stringify(metadata)).run();
}

export async function getAnalytics(db: D1Database, formId: string): Promise<FormAnalytics> {
  const form = await getForm(db, formId);
  const views = form?.views ?? 0;
  const cutoff = Date.now() - 30 * 86400000;
  const [dailyRows, totalRow, spamRow, refRows] = await Promise.all([
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) AS d, COUNT(*) AS c
         FROM submissions WHERE form_id = ? AND created_at >= ? GROUP BY d ORDER BY d`
      )
      .bind(formId, cutoff)
      .all<{ d: string; c: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?").bind(formId).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND is_spam = 1").bind(formId).first<{ n: number }>(),
    db
      .prepare(
        `SELECT referer, COUNT(*) AS count FROM submissions
         WHERE form_id = ? AND referer != '' GROUP BY referer ORDER BY count DESC LIMIT 5`
      )
      .bind(formId)
      .all<{ referer: string; count: number }>(),
  ]);

  const daily = fillDaily(30);
  const map = new Map<string, number>();
  for (const r of dailyRows.results ?? []) map.set(r.d, r.c);
  for (const bucket of daily) {
    const v = map.get(bucket.date);
    if (v !== undefined) bucket.count = v;
  }

  const eventRows = await db.prepare("SELECT strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) AS d, COUNT(*) AS c FROM form_events WHERE form_id = ? AND kind = 'view' AND created_at >= ? GROUP BY d ORDER BY d").bind(formId, cutoff).all<{ d: string; c: number }>();
  const dailyViews = fillDaily(30);
  const viewMap = new Map<string, number>();
  for (const row of eventRows.results ?? []) viewMap.set(row.d, row.c);
  for (const bucket of dailyViews) bucket.count = viewMap.get(bucket.date) ?? 0;
  const campaignRows = await db.prepare("SELECT json_extract(metadata_json, '$.utm_source') AS source, json_extract(metadata_json, '$.utm_medium') AS medium, json_extract(metadata_json, '$.utm_campaign') AS campaign, COUNT(*) AS count FROM form_events WHERE form_id = ? AND kind = 'view' GROUP BY source, medium, campaign ORDER BY count DESC LIMIT 10").bind(formId).all<{ source: string | null; medium: string | null; campaign: string | null; count: number }>();
  return {
    daily,
    dailyViews,
    views,
    total: totalRow?.n ?? 0,
    spam: spamRow?.n ?? 0,
    referrers: refRows.results ?? [],
    campaigns: (campaignRows.results ?? []).filter((row) => row.source || row.medium || row.campaign).map((row) => ({ source: row.source ?? "(direct)", medium: row.medium ?? "—", campaign: row.campaign ?? "—", count: row.count })),
  };
}

export async function getDashboardAnalytics(db: D1Database): Promise<DashboardAnalytics> {
  const cutoff = Date.now() - 14 * 86400000;
  const rows = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) AS d, COUNT(*) AS c
       FROM submissions WHERE created_at >= ? GROUP BY d ORDER BY d`
    )
    .bind(cutoff)
    .all<{ d: string; c: number }>();
  const daily = fillDaily(14);
  const map = new Map<string, number>();
  for (const r of rows.results ?? []) map.set(r.d, r.c);
  for (const b of daily) {
    const v = map.get(b.date);
    if (v !== undefined) b.count = v;
  }
  return { daily };
}

/* ================= webhooks ================= */

export async function createWebhook(db: D1Database, formId: string, url: string): Promise<WebhookRow> {
  const row: WebhookRow = {
    id: `wh_${randomId(12)}`,
    form_id: formId,
    url,
    secret: randomSecret(),
    active: 1,
    created_at: Date.now(),
  };
  await db
    .prepare("INSERT INTO webhooks (id, form_id, url, secret, active, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.form_id, row.url, row.secret, row.active, row.created_at)
    .run();
  return row;
}

export async function listWebhooks(db: D1Database, formId?: string): Promise<WebhookWithContext[]> {
  const { results } = formId
    ? await db
        .prepare("SELECT w.*, f.name AS form_name FROM webhooks w LEFT JOIN forms f ON f.id = w.form_id WHERE w.form_id = ? ORDER BY w.created_at DESC")
        .bind(formId)
        .all<WebhookWithContext>()
    : await db
        .prepare("SELECT w.*, f.name AS form_name FROM webhooks w LEFT JOIN forms f ON f.id = w.form_id ORDER BY w.created_at DESC")
        .all<WebhookWithContext>();
  return results ?? [];
}

export async function getWebhook(db: D1Database, id: string): Promise<WebhookWithContext | null> {
  return await db
    .prepare("SELECT w.*, f.name AS form_name FROM webhooks w LEFT JOIN forms f ON f.id = w.form_id WHERE w.id = ?")
    .bind(id)
    .first<WebhookWithContext>();
}

export async function setWebhookActive(db: D1Database, id: string, active: boolean): Promise<void> {
  await db.prepare("UPDATE webhooks SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
}

export async function deleteWebhook(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").bind(id).run();
  await db.prepare("DELETE FROM webhooks WHERE id = ?").bind(id).run();
}

export async function recordDelivery(
  db: D1Database,
  webhookId: string,
  event: string,
  statusCode: number | null,
  ok: boolean,
  detail: string
): Promise<void> {
  await db
    .prepare("INSERT INTO webhook_deliveries (webhook_id, event, status_code, ok, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(webhookId, event, statusCode, ok ? 1 : 0, detail.slice(0, 500), Date.now())
    .run();
}

export async function listDeliveries(db: D1Database, webhookId: string, limit = 25): Promise<DeliveryRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(webhookId, limit)
    .all<DeliveryRow>();
  return results ?? [];
}

/* ================= api_keys (additive) ================= */

export async function createApiKey(
  db: D1Database,
  params: { name: string; prefix: string; hash: string; last4: string; scope?: string; expiresAt?: number | null }
): Promise<ApiKeyRow> {
  const row: ApiKeyRow = {
    id: `ak_${randomId(12)}`,
    name: params.name,
    prefix: params.prefix,
    hash: params.hash,
    last4: params.last4,
    scope: params.scope || "read_write",
    expires_at: params.expiresAt ?? null,
    last_used_at: null,
    created_at: Date.now(),
  };
  await db
    .prepare("INSERT INTO api_keys (id, name, prefix, hash, last4, scope, expires_at, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.name, row.prefix, row.hash, row.last4, row.scope || "read_write", row.expires_at ?? null, row.last_used_at, row.created_at)
    .run();
  return row;
}

export async function listApiKeys(db: D1Database): Promise<ApiKeyRow[]> {
  const { results } = await db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all<ApiKeyRow>();
  return results ?? [];
}

export async function findApiKeyByHash(db: D1Database, hash: string): Promise<ApiKeyRow | null> {
  return await db.prepare("SELECT * FROM api_keys WHERE hash = ?").bind(hash).first<ApiKeyRow>();
}

export async function touchApiKey(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), id).run();
}

export async function revokeApiKey(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
}

/* ================= workflows ================= */

export async function createWorkflow(db: D1Database, fields: { formId: string | null; name: string; trigger: string; conditionJson: string; actionsJson: string }): Promise<WorkflowRow> {
  const now = Date.now();
  const row: WorkflowRow = { id: `wf_${randomId(10)}`, form_id: fields.formId, name: fields.name, trigger: fields.trigger, condition_json: fields.conditionJson, actions_json: fields.actionsJson, active: 1, created_at: now, updated_at: now };
  await db.prepare("INSERT INTO workflows (id, form_id, name, trigger, condition_json, actions_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind(row.id, row.form_id, row.name, row.trigger, row.condition_json, row.actions_json, now, now).run();
  return row;
}

export async function listWorkflows(db: D1Database, formId?: string): Promise<WorkflowRow[]> {
  const query = formId ? db.prepare("SELECT * FROM workflows WHERE form_id = ? ORDER BY created_at DESC").bind(formId) : db.prepare("SELECT * FROM workflows ORDER BY created_at DESC");
  const { results } = await query.all<WorkflowRow>();
  return results ?? [];
}

export async function getWorkflow(db: D1Database, id: string): Promise<WorkflowRow | null> {
  return await db.prepare("SELECT * FROM workflows WHERE id = ?").bind(id).first<WorkflowRow>();
}

export async function setWorkflowActive(db: D1Database, id: string, active: boolean): Promise<void> {
  await db.prepare("UPDATE workflows SET active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, Date.now(), id).run();
}

export async function deleteWorkflow(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM workflows WHERE id = ?").bind(id).run();
}

export async function createWorkflowRun(db: D1Database, workflowId: string, submissionId: number | null): Promise<WorkflowRunRow> {
  const row: WorkflowRunRow = { id: `run_${randomId(12)}`, workflow_id: workflowId, submission_id: submissionId, status: "running", started_at: Date.now(), finished_at: null, error: "" };
  await db.prepare("INSERT INTO workflow_runs (id, workflow_id, submission_id, status, started_at, finished_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.workflow_id, row.submission_id, row.status, row.started_at, null, "").run();
  return row;
}

export async function finishWorkflowRun(db: D1Database, id: string, status: "succeeded" | "failed", error = ""): Promise<void> {
  await db.prepare("UPDATE workflow_runs SET status = ?, finished_at = ?, error = ? WHERE id = ?").bind(status, Date.now(), error.slice(0, 500), id).run();
}

export async function createWorkflowStep(db: D1Database, runId: string, index: number, actionType: string): Promise<number | null> {
  const result = await db.prepare("INSERT INTO workflow_steps (run_id, step_index, action_type, status, detail, started_at) VALUES (?, ?, ?, 'running', '', ?)")
    .bind(runId, index, actionType, Date.now()).run();
  return result.meta?.last_row_id ?? null;
}

export async function finishWorkflowStep(db: D1Database, id: number, status: "succeeded" | "failed", detail: string): Promise<void> {
  await db.prepare("UPDATE workflow_steps SET status = ?, detail = ?, finished_at = ? WHERE id = ?").bind(status, detail.slice(0, 500), Date.now(), id).run();
}

export async function listWorkflowRuns(db: D1Database, workflowId: string): Promise<WorkflowRunRow[]> {
  const { results } = await db.prepare("SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 100").bind(workflowId).all<WorkflowRunRow>();
  return results ?? [];
}

export async function listWorkflowSteps(db: D1Database, runId: string): Promise<WorkflowStepRow[]> {
  const { results } = await db.prepare("SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY step_index").bind(runId).all<WorkflowStepRow>();
  return results ?? [];
}

/* ================= notifications ================= */

export async function createNotification(db: D1Database, kind: string, title: string, detail = ""): Promise<void> {
  await db.prepare("INSERT INTO notifications (kind, title, detail, created_at) VALUES (?, ?, ?, ?)").bind(kind, title, detail.slice(0, 500), Date.now()).run();
}

export async function listNotifications(db: D1Database): Promise<import("./types").NotificationRow[]> {
  const { results } = await db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all<import("./types").NotificationRow>();
  return results ?? [];
}

export async function markNotificationsRead(db: D1Database): Promise<void> {
  await db.prepare("UPDATE notifications SET read_at = ? WHERE read_at IS NULL").bind(Date.now()).run();
}

/* ================= workspace users ================= */

export async function ensureBootstrapOwner(db: D1Database, email: string, passwordHash: string, name: string, workspaceName: string): Promise<UserRow> {
  const existing = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  const workspace = await db.prepare("SELECT id FROM workspaces WHERE id = 'ws_default'").first<{ id: string }>();
  if (!workspace) await db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES ('ws_default', ?, ?)").bind(workspaceName, Date.now()).run();
  if (existing) {
    await db.prepare("INSERT OR IGNORE INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, 'ws_default', 'owner', ?)").bind(existing.id, Date.now()).run();
    return existing;
  }
  const user: UserRow = { id: `usr_${randomId(12)}`, email, name, password_hash: passwordHash, created_at: Date.now() };
  await db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, user.email, user.name, user.password_hash, user.created_at).run();
  await db.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, 'ws_default', 'owner', ?)").bind(user.id, Date.now()).run();
  return user;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return await db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").bind(email).first<UserRow>();
}

export async function listWorkspaceMembers(db: D1Database, workspaceId = "ws_default"): Promise<(UserRow & { role: string })[]> {
  const { results } = await db.prepare("SELECT u.*, m.role FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.workspace_id = ? ORDER BY u.created_at").bind(workspaceId).all<UserRow & { role: string }>();
  return results ?? [];
}

export async function createInvitation(db: D1Database, email: string, role: "editor" | "viewer", tokenHash: string, expiresAt: number, workspaceId = "ws_default"): Promise<InvitationRow> {
  const row: InvitationRow = { id: `inv_${randomId(12)}`, workspace_id: workspaceId, email, role, token_hash: tokenHash, expires_at: expiresAt, accepted_at: null, created_at: Date.now() };
  await db.prepare("INSERT INTO invitations (id, workspace_id, email, role, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(row.id, row.workspace_id, row.email, row.role, row.token_hash, row.expires_at, row.created_at).run();
  return row;
}

export async function getInvitationByHash(db: D1Database, tokenHash: string): Promise<InvitationRow | null> {
  return await db.prepare("SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?").bind(tokenHash, Date.now()).first<InvitationRow>();
}

export async function acceptInvitation(db: D1Database, invitation: InvitationRow, name: string, passwordHash: string): Promise<UserRow> {
  const existing = await getUserByEmail(db, invitation.email);
  const user = existing ?? { id: `usr_${randomId(12)}`, email: invitation.email, name, password_hash: passwordHash, created_at: Date.now() };
  if (!existing) await db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, user.email, user.name, user.password_hash, user.created_at).run();
  await db.prepare("INSERT OR REPLACE INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)").bind(user.id, invitation.workspace_id, invitation.role, Date.now()).run();
  await db.prepare("UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").bind(Date.now(), invitation.id).run();
  return user;
}

export async function deleteMembership(db: D1Database, userId: string, workspaceId = "ws_default"): Promise<void> {
  await db.prepare("DELETE FROM memberships WHERE user_id = ? AND workspace_id = ? AND role != 'owner'").bind(userId, workspaceId).run();
}

export async function getMembership(db: D1Database, userId: string, workspaceId: string): Promise<MembershipRow | null> {
  return await db.prepare("SELECT * FROM memberships WHERE user_id = ? AND workspace_id = ?").bind(userId, workspaceId).first<MembershipRow>();
}

export async function updateSubmissionMeta(db: D1Database, id: number, fields: { status: string; tagsJson: string; note: string }): Promise<void> {
  await db.prepare("UPDATE submissions SET status = ?, tags_json = ?, note = ?, updated_at = ? WHERE id = ?").bind(fields.status, fields.tagsJson, fields.note.slice(0, 4000), Date.now(), id).run();
}

export async function createFormVersion(db: D1Database, formId: string, schemaJson: string, publishedJson: string | null, createdBy = "system"): Promise<number | null> {
  const result = await db.prepare("INSERT INTO form_versions (form_id, schema_json, published_json, created_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(formId, schemaJson, publishedJson, Date.now(), createdBy).run();
  return result.meta.last_row_id ?? null;
}

export async function listFormVersions(db: D1Database, formId: string, limit = 25): Promise<import("./types").FormVersionRow[]> {
  const { results } = await db.prepare("SELECT * FROM form_versions WHERE form_id = ? ORDER BY created_at DESC LIMIT ?").bind(formId, Math.min(100, Math.max(1, limit))).all<import("./types").FormVersionRow>();
  return results ?? [];
}

export async function getFormVersion(db: D1Database, id: number): Promise<import("./types").FormVersionRow | null> {
  return await db.prepare("SELECT * FROM form_versions WHERE id = ?").bind(id).first<import("./types").FormVersionRow>();
}

export async function restoreFormVersion(db: D1Database, formId: string, versionId: number): Promise<boolean> {
  const version = await getFormVersion(db, versionId);
  if (!version || version.form_id !== formId) return false;
  await db.prepare("UPDATE forms SET schema_json = ?, published_json = ?, status = CASE WHEN ? IS NULL THEN 'draft' ELSE 'published' END WHERE id = ?").bind(version.schema_json, version.published_json ?? null, version.published_json ?? null, formId).run();
  return true;
}

export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
}
