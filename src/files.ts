import { Bindings, FileRow, FileWithContext } from "./types";
import { randomToken } from "./util";

export const FILES_PAGE_SIZE = 25;

export function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "").trim();
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "upload.bin";
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

export async function saveUpload(
  env: Bindings,
  formId: string,
  submissionId: number | null,
  fieldName: string,
  file: File
): Promise<FileRow | null> {
  if (!env.FILES) return null;
  const filename = sanitizeFilename(file.name);
  const key = `fr/${formId}/${crypto.randomUUID()}/${filename}`;
  await env.FILES.put(key, file);
  const row: FileRow = {
    id: `file_${randomToken(12)}`,
    form_id: formId,
    submission_id: submissionId,
    filename,
    content_type: file.type || "application/octet-stream",
    size: file.size,
    r2_key: key,
    field_name: fieldName,
    created_at: Date.now(),
  };
  await env.DB.prepare(
    "INSERT INTO files (id, form_id, submission_id, filename, content_type, size, r2_key, field_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(row.id, row.form_id, row.submission_id, row.filename, row.content_type, row.size, row.r2_key, row.field_name, row.created_at)
    .run();
  return row;
}

export type FilesFilter = { formId?: string; page?: number };

export async function getFiles(db: D1Database, filter: FilesFilter = {}): Promise<FileWithContext[]> {
  const where = filter.formId ? "WHERE fi.form_id = ?" : "";
  const offset = Math.max(1, filter.page ?? 1) - 1;
  const sql = `SELECT fi.*, fo.name AS form_name FROM files fi LEFT JOIN forms fo ON fo.id = fi.form_id ${where} ORDER BY fi.created_at DESC LIMIT ? OFFSET ?`;
  const binds: (string | number)[] = filter.formId ? [filter.formId] : [];
  const { results } = await db
    .prepare(sql)
    .bind(...binds, FILES_PAGE_SIZE, offset * FILES_PAGE_SIZE)
    .all<FileWithContext>();
  return results ?? [];
}

export async function countFiles(db: D1Database, filter: FilesFilter = {}): Promise<number> {
  const where = filter.formId ? "WHERE form_id = ?" : "";
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM files ${where}`)
    .bind(...(filter.formId ? [filter.formId] : []))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function totalStorage(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM files").first<{ total: number }>();
  return row?.total ?? 0;
}

export async function getFile(db: D1Database, id: string): Promise<FileRow | null> {
  return await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileRow>();
}

export async function deleteFile(env: Bindings, db: D1Database, row: FileRow): Promise<void> {
  try {
    await env.FILES?.delete(row.r2_key);
  } catch {
    // best-effort: remove the metadata row even if the object is already gone
  }
  await db.prepare("DELETE FROM files WHERE id = ?").bind(row.id).run();
}
