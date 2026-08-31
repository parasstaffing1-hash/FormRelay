import {
  FormRow, FormWithStats, SubmissionRow, SubmissionWithContext,
  WebhookRow, WebhookWithContext, DeliveryRow, DashboardStats,
  ApiKeyRow, WorkflowRow, WorkflowRunRow, WorkflowStepRow, UserRow, MembershipRow, InvitationRow,
} from "./types";
import { ChainLink, computeRowHash, genesisHash } from "./integrity";
import { SubmissionEvent } from "./events";

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

export type AllowedDomainsConfig = {
  enforced: boolean;
  domains: string[];
};

export async function getAllowedDomains(db: D1Database): Promise<AllowedDomainsConfig> {
  const raw = await getSetting(db, "allowed_domains");
  if (!raw) return { enforced: false, domains: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<AllowedDomainsConfig>;
    return {
      enforced: !!parsed.enforced,
      domains: Array.isArray(parsed.domains)
        ? parsed.domains.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim().toLowerCase())
        : [],
    };
  } catch {
    return { enforced: false, domains: [] };
  }
}

export async function saveAllowedDomains(db: D1Database, config: AllowedDomainsConfig): Promise<void> {
  await setSetting(
    db,
    "allowed_domains",
    JSON.stringify({
      enforced: config.enforced,
      domains: config.domains.map((d) => d.trim().toLowerCase()).filter(Boolean),
    })
  );
}

export function isOriginAllowed(originOrReferer: string | null | undefined, config: AllowedDomainsConfig): boolean {
  if (!config.enforced || config.domains.length === 0) return true;
  if (!originOrReferer) return false;
  try {
    let urlString = originOrReferer.trim();
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = `http://${urlString}`;
    }
    const parsed = new URL(urlString);
    const host = parsed.host.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    for (const pattern of config.domains) {
      const p = pattern.trim().toLowerCase();
      if (p === "*" || p === host || p === hostname) return true;
      if (p.startsWith("*.")) {
        const root = p.slice(2);
        if (hostname === root || hostname.endsWith(`.${root}`)) return true;
      }
      if (p.startsWith(".")) {
        const root = p.slice(1);
        if (hostname === root || hostname.endsWith(`.${root}`)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
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

export async function chainHead(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT row_hash FROM submissions WHERE row_hash != '' ORDER BY id DESC LIMIT 1")
    .first<{ row_hash: string }>();
  return row?.row_hash || genesisHash();
}

/**
 * Seals a freshly inserted row into the tamper-evident chain. The id is only known
 * after the insert, so the digest is written back in a second statement.
 */
async function sealSubmission(db: D1Database, id: number, formId: string, data: string, createdAt: number, prevHash: string): Promise<void> {
  const rowHash = await computeRowHash({ id, form_id: formId, data, created_at: createdAt, prev_hash: prevHash });
  await db.prepare("UPDATE submissions SET prev_hash = ?, row_hash = ? WHERE id = ?").bind(prevHash, rowHash, id).run();
}

export async function insertSubmission(
  db: D1Database,
  formId: string,
  data: Record<string, unknown>,
  ip: string,
  userAgent: string,
  referer: string,
  isSpam: boolean,
  receiptTokenHash: string | null = null
): Promise<number | null> {
  const now = Date.now();
  const payload = JSON.stringify(data);
  const prevHash = await chainHead(db);
  const result = await db
    .prepare("INSERT INTO submissions (form_id, data, ip, user_agent, referer, is_spam, created_at, status, completed_at, updated_at, receipt_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(formId, payload, ip, userAgent, referer, isSpam ? 1 : 0, now, isSpam ? "spam" : "completed", isSpam ? null : now, now, receiptTokenHash)
    .run();
  const id = result.meta?.last_row_id ?? null;
  if (id !== null) await sealSubmission(db, id, formId, payload, now, prevHash);
  return id;
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

export async function completeSubmission(db: D1Database, id: number, data: Record<string, unknown>, receiptTokenHash: string | null = null): Promise<void> {
  const now = Date.now();
  const payload = JSON.stringify(data);
  const prevHash = await chainHead(db);
  const result = await db.prepare("UPDATE submissions SET data = ?, status = 'completed', completed_at = ?, updated_at = ?, resume_revoked = 1, receipt_token_hash = COALESCE(?, receipt_token_hash) WHERE id = ? AND status = 'partial' AND resume_revoked = 0")
    .bind(payload, now, now, receiptTokenHash, id).run();
  // A partial only joins the chain once it is completed, so its digest is written here.
  if (result.meta?.changes) {
    const row = await db.prepare("SELECT form_id, created_at FROM submissions WHERE id = ?").bind(id).first<{ form_id: string; created_at: number }>();
    if (row) await sealSubmission(db, id, row.form_id, payload, row.created_at, prevHash);
  }
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
  // Same reasoning as erasure: drop any retry still holding this payload.
  await clearQueuedPayloadsForSubmission(db, id);
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

export async function rotateWebhookSecret(db: D1Database, id: string, newSecret?: string): Promise<string> {
  const secret = newSecret || randomSecret();
  await db.prepare("UPDATE webhooks SET secret = ? WHERE id = ?").bind(secret, id).run();
  return secret;
}

export async function deleteWebhook(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").bind(id).run();
  await db.prepare("DELETE FROM webhooks WHERE id = ?").bind(id).run();
}

export type DeliveryRecord = {
  webhookId: string;
  event: string;
  statusCode: number | null;
  ok: boolean;
  detail: string;
  submissionId: number | null;
  /** Retained only while a retry is still owed; null once delivered or exhausted. */
  payload: string | null;
  nextAttemptAt: number | null;
};

export async function recordDelivery(db: D1Database, rec: DeliveryRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO webhook_deliveries (webhook_id, event, status_code, ok, detail, created_at, attempts, next_attempt_at, payload, submission_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"
    )
    .bind(
      rec.webhookId,
      rec.event,
      rec.statusCode,
      rec.ok ? 1 : 0,
      rec.detail.slice(0, 500),
      Date.now(),
      rec.nextAttemptAt,
      rec.payload,
      rec.submissionId
    )
    .run();
}

export type DueDelivery = {
  id: number;
  webhook_id: string;
  event: string;
  attempts: number;
  payload: string | null;
  url: string | null;
  secret: string | null;
};

/**
 * Due retries, joined to their webhook so the sweeper has somewhere to POST. A hook
 * that was deleted or disabled since the failure yields a null url and gets dropped
 * rather than retried forever.
 */
export async function claimDueDeliveries(db: D1Database, now: number, limit: number): Promise<DueDelivery[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.webhook_id, d.event, d.attempts, d.payload,
              CASE WHEN w.active = 1 THEN w.url ELSE NULL END AS url,
              w.secret AS secret
         FROM webhook_deliveries d
         LEFT JOIN webhooks w ON w.id = d.webhook_id
        WHERE d.next_attempt_at IS NOT NULL AND d.next_attempt_at <= ?
        ORDER BY d.next_attempt_at ASC
        LIMIT ?`
    )
    .bind(now, limit)
    .all<DueDelivery>();
  return results ?? [];
}

/** Terminal state: delivered or out of attempts. Drops the stored payload either way. */
export async function settleDelivery(
  db: D1Database,
  id: number,
  statusCode: number | null,
  ok: boolean,
  detail: string
): Promise<void> {
  await db
    .prepare(
      "UPDATE webhook_deliveries SET ok = ?, status_code = ?, detail = ?, next_attempt_at = NULL, payload = NULL WHERE id = ?"
    )
    .bind(ok ? 1 : 0, statusCode, detail.slice(0, 500), id)
    .run();
}

/** Failed again, but attempts remain: bump the counter and push the schedule out. */
export async function scheduleRetry(
  db: D1Database,
  id: number,
  attempts: number,
  nextAt: number,
  statusCode: number | null,
  detail: string
): Promise<void> {
  await db
    .prepare(
      "UPDATE webhook_deliveries SET attempts = ?, next_attempt_at = ?, status_code = ?, detail = ? WHERE id = ?"
    )
    .bind(attempts, nextAt, statusCode, detail.slice(0, 500), id)
    .run();
}

/**
 * Erasure hook. A queued retry still holds a verbatim copy of the submission, so an
 * erasure that ignored it would leave the data alive in the delivery queue for up to
 * a day -- and then hand it to a third party.
 */
export async function clearQueuedPayloadsForSubmission(db: D1Database, submissionId: number): Promise<void> {
  await db
    .prepare(
      "UPDATE webhook_deliveries SET payload = NULL, next_attempt_at = NULL, detail = 'cancelled: submission erased' WHERE submission_id = ? AND next_attempt_at IS NOT NULL"
    )
    .bind(submissionId)
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

/* ---------- tamper-evident chain ---------- */

export async function chainLinks(db: D1Database, formId?: string): Promise<ChainLink[]> {
  const { results } = formId
    ? await db.prepare("SELECT id, form_id, data, created_at, prev_hash, row_hash, erased_at FROM submissions WHERE form_id = ? ORDER BY id ASC").bind(formId).all<ChainLink>()
    : await db.prepare("SELECT id, form_id, data, created_at, prev_hash, row_hash, erased_at FROM submissions ORDER BY id ASC").all<ChainLink>();
  return results ?? [];
}

export async function recordAnchor(db: D1Database, formId: string, headHash: string, rowCount: number, signature: string): Promise<void> {
  await db.prepare("INSERT INTO chain_anchors (form_id, head_hash, row_count, signature, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(formId, headHash, rowCount, signature, Date.now()).run();
}

export async function listAnchors(db: D1Database, formId = "", limit = 10): Promise<{ id: number; form_id: string; head_hash: string; row_count: number; signature: string; created_at: number }[]> {
  const { results } = await db.prepare("SELECT * FROM chain_anchors WHERE form_id = ? ORDER BY created_at DESC LIMIT ?").bind(formId, limit).all<any>();
  return results ?? [];
}

/* ---------- respondent receipts ---------- */

export async function getSubmissionByReceiptHash(db: D1Database, tokenHash: string): Promise<SubmissionRow | null> {
  return await db.prepare("SELECT * FROM submissions WHERE receipt_token_hash = ? AND erased_at IS NULL").bind(tokenHash).first<SubmissionRow>();
}

/**
 * Respondent-initiated erasure (GDPR art. 17). The row is kept as a tombstone so the
 * hash chain stays verifiable; only the answer content is destroyed.
 */
export async function eraseSubmissionByReceipt(db: D1Database, tokenHash: string): Promise<boolean> {
  const now = Date.now();
  // Resolve the id first: a queued webhook retry holds a verbatim copy of this
  // submission, and erasing only the row would leave that copy alive in the queue --
  // and then hand it to a third party on the next sweep.
  const target = await db
    .prepare("SELECT id FROM submissions WHERE receipt_token_hash = ? AND erased_at IS NULL")
    .bind(tokenHash)
    .first<{ id: number }>();
  const result = await db.prepare(
    "UPDATE submissions SET data = '{}', ip = '', user_agent = '', referer = '', note = '', tags_json = '[]', erased_at = ?, updated_at = ? WHERE receipt_token_hash = ? AND erased_at IS NULL"
  ).bind(now, now, tokenHash).run();
  const erased = !!result.meta?.changes;
  if (erased && target) await clearQueuedPayloadsForSubmission(db, target.id);
  return erased;
}

export async function setFormPrefillSignedOnly(db: D1Database, formId: string, on: boolean): Promise<void> {
  await db.prepare("UPDATE forms SET prefill_signed_only = ? WHERE id = ?").bind(on ? 1 : 0, formId).run();
}

/* ---------- trust controls ---------- */

export async function recordResponseView(db: D1Database, submissionId: number, actor: string, action = "view"): Promise<void> {
  try {
    await db.prepare("INSERT INTO response_views (submission_id, actor, action, created_at) VALUES (?, ?, ?, ?)")
      .bind(submissionId, actor.slice(0, 200), action, Date.now()).run();
  } catch {
    // Auditing must never block the read it is recording.
  }
}

export async function listResponseViews(db: D1Database, submissionId: number, limit = 25): Promise<{ id: number; submission_id: number; actor: string; action: string; created_at: number }[]> {
  const { results } = await db.prepare("SELECT * FROM response_views WHERE submission_id = ? ORDER BY created_at DESC LIMIT ?").bind(submissionId, limit).all<any>();
  return results ?? [];
}

export async function listRecentResponseViews(db: D1Database, limit = 100): Promise<{ id: number; submission_id: number; actor: string; action: string; created_at: number }[]> {
  const { results } = await db.prepare("SELECT * FROM response_views ORDER BY created_at DESC LIMIT ?").bind(limit).all<any>();
  return results ?? [];
}

export async function respondentKeyExists(db: D1Database, formId: string, key: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS n FROM submissions WHERE form_id = ? AND respondent_key = ? LIMIT 1").bind(formId, key).first<{ n: number }>();
  return !!row;
}

export async function annotateSubmission(db: D1Database, id: number, qualityJson: string, consentJson: string, respondentKey: string | null): Promise<void> {
  await db.prepare("UPDATE submissions SET quality_json = ?, consent_json = ?, respondent_key = COALESCE(?, respondent_key) WHERE id = ?")
    .bind(qualityJson, consentJson, respondentKey, id).run();
}

export async function updateFormTrust(
  db: D1Database,
  formId: string,
  patch: { pow_bits: number; unique_mode: string; unique_field: string; consent_text: string; field_acl_json: string }
): Promise<void> {
  await db.prepare("UPDATE forms SET pow_bits = ?, unique_mode = ?, unique_field = ?, consent_text = ?, field_acl_json = ? WHERE id = ?")
    .bind(patch.pow_bits, patch.unique_mode, patch.unique_field, patch.consent_text, patch.field_acl_json, formId).run();
}

/* ---------- ops ---------- */

export async function setSubmissionCohort(db: D1Database, id: number, cohort: string): Promise<void> {
  if (!cohort) return;
  await db.prepare("UPDATE submissions SET cohort = ? WHERE id = ?").bind(cohort, id).run();
}

export async function updateFormOps(db: D1Database, formId: string, recurrence: string, unlockAt: number | null): Promise<void> {
  await db.prepare("UPDATE forms SET recurrence = ?, unlock_at = ? WHERE id = ?").bind(recurrence, unlockAt, formId).run();
}

export async function listCohorts(db: D1Database, formId: string): Promise<{ cohort: string; count: number }[]> {
  const { results } = await db.prepare(
    "SELECT cohort, COUNT(*) AS count FROM submissions WHERE form_id = ? AND cohort != '' GROUP BY cohort ORDER BY cohort DESC LIMIT 52"
  ).bind(formId).all<{ cohort: string; count: number }>();
  return results ?? [];
}

export async function getDelivery(db: D1Database, id: number): Promise<DeliveryRow | null> {
  return await db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").bind(id).first<DeliveryRow>();
}

/** Rows for a schema migration: id plus raw stored payload. */
export async function submissionsForMigration(db: D1Database, formId: string): Promise<{ id: number; data: string }[]> {
  const { results } = await db.prepare("SELECT id, data FROM submissions WHERE form_id = ? ORDER BY id").bind(formId).all<{ id: number; data: string }>();
  return results ?? [];
}

export async function setSubmissionData(db: D1Database, id: number, data: string): Promise<void> {
  await db.prepare("UPDATE submissions SET data = ?, updated_at = ? WHERE id = ?").bind(data, Date.now(), id).run();
}

/**
 * Re-seals every response into a fresh chain. Needed after a disclosed rewrite such as a
 * field migration, which necessarily changes stored digests.
 */
export async function resealChain(db: D1Database): Promise<{ count: number; head: string }> {
  const links = await chainLinks(db);
  let prev = genesisHash();
  let count = 0;
  for (const link of links) {
    if (link.erased_at) continue;
    const rowHash = await computeRowHash({ id: link.id, form_id: link.form_id, data: link.data, created_at: link.created_at, prev_hash: prev });
    await db.prepare("UPDATE submissions SET prev_hash = ?, row_hash = ? WHERE id = ?").bind(prev, rowHash, link.id).run();
    prev = rowHash;
    count += 1;
  }
  return { count, head: prev };
}

export async function runReadOnlyQuery(db: D1Database, sql: string): Promise<Record<string, unknown>[]> {
  const { results } = await db.prepare(sql).all<Record<string, unknown>>();
  return results ?? [];
}

/**
 * Rows behind the insights page. Spam and erased submissions are excluded: spam would
 * invent drop-off from bots that never intended to finish, and an erased row has an
 * empty payload that would read as abandonment at the first question.
 *
 * Capped rather than unbounded — the funnel is computed in the Worker, and a form with a
 * million responses should not try to load them all into an isolate.
 */
export async function getInsightRows(
  db: D1Database,
  formId: string,
  sinceMs: number,
  limit = 5000
): Promise<{ status: string; data: string; created_at: number; completed_at: number | null; user_agent: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT status, data, created_at, completed_at, user_agent
         FROM submissions
        WHERE form_id = ? AND created_at >= ? AND is_spam = 0 AND erased_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .bind(formId, sinceMs, limit)
    .all<{ status: string; data: string; created_at: number; completed_at: number | null; user_agent: string }>();
  return results ?? [];
}

/* ---------- submission event timeline ---------- */

/**
 * Records one pipeline stage. Never throws: an audit write must not be able to fail the
 * request it is describing.
 */
export async function recordEvent(
  db: D1Database,
  submissionId: number,
  stage: string,
  status: string,
  detail = "",
  responseStatus: number | null = null,
  attempt = 1
): Promise<void> {
  try {
    await db.prepare(
      "INSERT INTO submission_events (submission_id, stage, status, detail, response_status, attempt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(submissionId, stage, status, detail.slice(0, 600), responseStatus, attempt, Date.now()).run();
  } catch {}
}

export async function listEvents(db: D1Database, submissionId: number): Promise<SubmissionEvent[]> {
  const { results } = await db
    .prepare("SELECT * FROM submission_events WHERE submission_id = ? ORDER BY created_at ASC, id ASC")
    .bind(submissionId).all<SubmissionEvent>();
  return results ?? [];
}

export async function listFailedEvents(db: D1Database, limit = 50): Promise<(SubmissionEvent & { form_id: string })[]> {
  const { results } = await db.prepare(
    `SELECT e.*, s.form_id FROM submission_events e
     JOIN submissions s ON s.id = e.submission_id
     WHERE e.status = 'failed' ORDER BY e.created_at DESC LIMIT ?`
  ).bind(limit).all<SubmissionEvent & { form_id: string }>();
  return results ?? [];
}

/* ---------- idempotency + duplicate detection ---------- */

export async function findByIdempotencyKey(db: D1Database, formId: string, key: string): Promise<SubmissionRow | null> {
  if (!key) return null;
  return await db.prepare("SELECT * FROM submissions WHERE form_id = ? AND idempotency_key = ?")
    .bind(formId, key).first<SubmissionRow>();
}

/** Recent identical payload, used to flag duplicates when no idempotency key was sent. */
export async function findRecentByFingerprint(db: D1Database, formId: string, fingerprint: string, windowMs = 10 * 60 * 1000): Promise<SubmissionRow | null> {
  if (!fingerprint) return null;
  return await db.prepare("SELECT * FROM submissions WHERE form_id = ? AND fingerprint = ? AND created_at > ? LIMIT 1")
    .bind(formId, fingerprint, Date.now() - windowMs).first<SubmissionRow>();
}

export async function setSubmissionIngestMeta(
  db: D1Database,
  id: number,
  idempotencyKey: string,
  fingerprint: string,
  spamScore: number,
  spamSignals: string
): Promise<void> {
  await db.prepare(
    "UPDATE submissions SET idempotency_key = COALESCE(NULLIF(?, ''), idempotency_key), fingerprint = ?, spam_score = ?, spam_signals = ? WHERE id = ?"
  ).bind(idempotencyKey, fingerprint, spamScore, spamSignals, id).run();
}

export async function updateFormSpamRules(db: D1Database, formId: string, rulesJson: string): Promise<void> {
  await db.prepare("UPDATE forms SET spam_rules_json = ? WHERE id = ?").bind(rulesJson, formId).run();
}
