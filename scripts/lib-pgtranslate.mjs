/**
 * SQLite -> PostgreSQL DDL translation, shared by the schema generator and the migration
 * runner.
 *
 * Deliberately one module: if the schema generator and the migration runner applied
 * different rules, a database built from schema.postgres.sql and one built by replaying
 * migrations would end up with different column types — and nothing would notice until a
 * query returned the wrong thing.
 */

export const DDL_RULES = [
  {
    from: /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi,
    to: "BIGSERIAL PRIMARY KEY",
    why: "AUTOINCREMENT -> BIGSERIAL",
  },
  {
    // Every INTEGER in this schema is an epoch-millisecond timestamp or a flag. Postgres
    // INTEGER is int4 and overflows on epoch-ms, so BIGINT is required for correctness.
    from: /\bINTEGER\b/gi,
    to: "BIGINT",
    why: "INTEGER -> BIGINT (epoch-ms overflows int4)",
  },
];

/** Applies every DDL rule, returning the translated SQL and a per-rule count. */
export function translateDDL(sql) {
  let out = sql;
  const counts = [];
  for (const rule of DDL_RULES) {
    const n = (out.match(rule.from) || []).length;
    out = out.replace(rule.from, rule.to);
    counts.push({ why: rule.why, n });
  }
  return { sql: out, counts };
}

/**
 * Postgres has no `INSERT OR IGNORE`. Used when recording baseline rows.
 */
export function translateInsertOrIgnore(sql) {
  return sql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
}
