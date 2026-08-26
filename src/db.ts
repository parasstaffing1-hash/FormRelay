import { FormRow, SubmissionRow } from "./types";

export async function createForm(db: D1Database, name: string): Promise<FormRow> {
  const { randomId } = await import("./util");
  const row: FormRow = {
    id: randomId(10),
    name,
    redirect_url: "",
    notify_email: "",
    auto_reply: 0,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO forms (id, name, redirect_url, notify_email, auto_reply, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(row.id, row.name, row.redirect_url, row.notify_email, row.auto_reply, row.created_at)
    .run();
  return row;
}

export async function listForms(db: D1Database): Promise<FormRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM forms ORDER BY created_at DESC")
    .all<FormRow>();
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
    .prepare(
      "UPDATE forms SET name = ?, redirect_url = ?, notify_email = ?, auto_reply = ? WHERE id = ?"
    )
    .bind(fields.name, fields.redirect_url, fields.notify_email, fields.auto_reply, id)
    .run();
}

export async function deleteForm(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM submissions WHERE form_id = ?").bind(id).run();
  await db.prepare("DELETE FROM forms WHERE id = ?").bind(id).run();
}

export async function insertSubmission(
  db: D1Database,
  formId: string,
  data: Record<string, string>,
  ip: string,
  userAgent: string,
  isSpam: boolean
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO submissions (form_id, data, ip, user_agent, is_spam, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(formId, JSON.stringify(data), ip, userAgent, isSpam ? 1 : 0, Date.now())
    .run();
}

export async function listSubmissions(
  db: D1Database,
  formId: string,
  limit = 200
): Promise<SubmissionRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(formId, limit)
    .all<SubmissionRow>();
  return results ?? [];
}

export async function deleteSubmission(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM submissions WHERE id = ?").bind(id).run();
}

export async function setSubmissionSpam(
  db: D1Database,
  id: number,
  isSpam: boolean
): Promise<void> {
  await db
    .prepare("UPDATE submissions SET is_spam = ? WHERE id = ?")
    .bind(isSpam ? 1 : 0, id)
    .run();
}

export async function countRecentByIp(
  db: D1Database,
  ip: string,
  sinceMs: number
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at > ?")
    .bind(ip, sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
