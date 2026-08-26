import {
  FormRow, FormWithStats, SubmissionRow, SubmissionWithContext,
  WebhookRow, WebhookWithContext, DeliveryRow, DashboardStats,
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
  fields: { name: string; redirect_url?: string; notify_email?: string }
): Promise<FormRow> {
  const row: FormRow = {
    id: randomId(10),
    name: fields.name,
    redirect_url: fields.redirect_url ?? "",
    notify_email: fields.notify_email ?? "",
    auto_reply: 0,
    archived: 0,
    created_at: Date.now(),
  };
  await db
    .prepare("INSERT INTO forms (id, name, redirect_url, notify_email, auto_reply, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.name, row.redirect_url, row.notify_email, row.auto_reply, row.archived, row.created_at)
    .run();
  return row;
}

export async function duplicateForm(db: D1Database, source: FormRow): Promise<FormRow> {
  return createForm(db, { name: `${source.name} (copy)`, redirect_url: source.redirect_url });
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
  data: Record<string, string>,
  ip: string,
  userAgent: string,
  referer: string,
  isSpam: boolean
): Promise<number | null> {
  const result = await db
    .prepare("INSERT INTO submissions (form_id, data, ip, user_agent, referer, is_spam, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(formId, JSON.stringify(data), ip, userAgent, referer, isSpam ? 1 : 0, Date.now())
    .run();
  return result.meta?.last_row_id ?? null;
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
  await db.prepare("UPDATE submissions SET is_spam = ? WHERE id = ?").bind(isSpam ? 1 : 0, id).run();
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
