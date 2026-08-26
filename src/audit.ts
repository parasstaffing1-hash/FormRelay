export async function audit(db: D1Database, action: string, targetId = "", detail = ""): Promise<void> {
  try {
    await db.prepare("INSERT INTO audit_log (action, target_id, detail, created_at) VALUES (?, ?, ?, ?)")
      .bind(action, targetId, detail.slice(0, 800), Date.now()).run();
  } catch {}
}
export async function listAudit(db: D1Database, limit = 50): Promise<{ id:number; action:string; target_id:string; detail:string; created_at:number }[]> {
  const { results } = await db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").bind(limit).all<any>();
  return results ?? [];
}
