import { Bindings, FileRow, FileWithContext } from "./types";
import { randomToken } from "./util";
import { DEFAULT_WORKSPACE } from "./db";

export const FILES_PAGE_SIZE = 25;

/**
 * The browser's `multiple` attribute is only a convenience. A client can still send
 * several parts for a single-file field, so the submission handler must enforce the
 * builder setting server-side as well.
 */
export function validateUploadCount(fileCount: number, multiple = false): string | null {
  return !multiple && fileCount > 1 ? "Only one file is allowed." : null;
}

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
  try {
    await env.DB.prepare(
      "INSERT INTO files (id, form_id, submission_id, filename, content_type, size, r2_key, field_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(row.id, row.form_id, row.submission_id, row.filename, row.content_type, row.size, row.r2_key, row.field_name, row.created_at)
      .run();
  } catch (error) {
    // Do not leave an unreferenced object behind when the metadata write fails.
    try { await env.FILES.delete(key); } catch {}
    throw error;
  }
  return row;
}

export type FilesFilter = { formId?: string; page?: number; workspaceId?: string };

/**
 * Files are reached through their form, which is what carries the workspace.
 *
 * An inner join, not a left join: a file whose form no longer exists belongs to no
 * workspace, so there is no tenant it can correctly be shown to. Deleting a form does not
 * currently remove its files, so such orphans do exist -- they are excluded here rather
 * than leaked to whichever workspace happens to be listing.
 */
export async function getFiles(db: D1Database, filter: FilesFilter = {}): Promise<FileWithContext[]> {
  const workspaceId = filter.workspaceId ?? DEFAULT_WORKSPACE;
  const where = filter.formId ? "WHERE fo.workspace_id = ? AND fi.form_id = ?" : "WHERE fo.workspace_id = ?";
  const offset = Math.max(1, filter.page ?? 1) - 1;
  const sql = `SELECT fi.*, fo.name AS form_name FROM files fi JOIN forms fo ON fo.id = fi.form_id ${where} ORDER BY fi.created_at DESC LIMIT ? OFFSET ?`;
  const binds: (string | number)[] = filter.formId ? [workspaceId, filter.formId] : [workspaceId];
  const { results } = await db
    .prepare(sql)
    .bind(...binds, FILES_PAGE_SIZE, offset * FILES_PAGE_SIZE)
    .all<FileWithContext>();
  return results ?? [];
}

/** Counts what `getFiles` would list, so pagination cannot disagree with the page. */
export async function countFiles(db: D1Database, filter: FilesFilter = {}): Promise<number> {
  const workspaceId = filter.workspaceId ?? DEFAULT_WORKSPACE;
  const where = filter.formId ? "WHERE fo.workspace_id = ? AND fi.form_id = ?" : "WHERE fo.workspace_id = ?";
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM files fi JOIN forms fo ON fo.id = fi.form_id ${where}`)
    .bind(...(filter.formId ? [workspaceId, filter.formId] : [workspaceId]))
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
