/**
 * A D1-shaped facade over PostgreSQL.
 *
 * The application makes 173 `prepare()` calls against D1's interface. Rewriting each one
 * for a Postgres driver would be 173 opportunities for a silent behaviour change, so the
 * call sites stay untouched and this adapter presents the same shape:
 *
 *     prepare(sql).bind(...values).first() | .all() | .run()
 *     batch([statements])
 *
 * Statement text is translated by `pgdialect.ts` on the way through.
 *
 * The hard part is not the query — it is `meta`. D1 returns `meta.last_row_id` and
 * `meta.changes`, and this codebase reads them in six places, including the one that
 * returns a new submission's id. Postgres has no `last_row_id`, so it is synthesised from
 * `RETURNING id`. Get this wrong and submissions are stored with a null id and the failure
 * surfaces far away from its cause.
 */
import { toPostgres, coerceRow } from "./pgdialect";

/** Minimal shape of the postgres.js client this adapter needs. */
export type PgClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<unknown> & { count?: number };
  begin: <T>(fn: (tx: PgClient) => Promise<T>) => Promise<T>;
};

/**
 * Tables whose primary key is a generated `id`. Derived from schema.postgres.sql — the 13
 * tables declared `id BIGSERIAL PRIMARY KEY`.
 *
 * `RETURNING id` is appended only for these. Appending it to an insert into `memberships`
 * (keyed on user_id + workspace_id) or `settings_kv` (keyed on key) would not degrade
 * gracefully — Postgres raises `column "id" does not exist` and the write fails outright.
 */
export const SERIAL_ID_TABLES = new Set([
  "form_versions", "form_events", "submissions", "webhook_deliveries", "audit_log",
  "workflow_steps", "notifications", "login_attempts", "chain_anchors", "response_views",
  "submission_events", "email_deliveries", "dead_letters",
]);

/** The table an INSERT targets, or null when the statement is not an insert. */
export function insertTarget(sql: string): string | null {
  const match = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+"?(\w+)"?/i.exec(sql);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * Adds `RETURNING id` to an insert into a serial-id table so `meta.last_row_id` can be
 * populated. Statements that already return something are left alone — appending a second
 * RETURNING is a syntax error, and the existing one is there for a reason.
 */
export function withReturningId(sql: string): string {
  const table = insertTarget(sql);
  if (!table || !SERIAL_ID_TABLES.has(table)) return sql;
  if (/\bRETURNING\b/i.test(sql)) return sql;
  return `${sql.trimEnd().replace(/;$/, "")} RETURNING id`;
}

export type PgMeta = { last_row_id: number | null; changes: number };

class PgPreparedStatement {
  constructor(
    private readonly client: PgClient,
    private readonly source: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): PgPreparedStatement {
    return new PgPreparedStatement(this.client, this.source, values);
  }

  /** The translated statement and its parameters, as they will be sent. */
  compile(): { text: string; params: unknown[] } {
    return { text: toPostgres(withReturningId(this.source)), params: this.params };
  }

  private async execute(client: PgClient = this.client): Promise<{ rows: Record<string, unknown>[]; count: number }> {
    const { text, params } = this.compile();
    const result = (await client.unsafe(text, params)) as Record<string, unknown>[] & { count?: number };
    const rows = Array.isArray(result) ? result : [];
    // postgres.js reports affected rows on `count` for writes; for reads it is the row total.
    return { rows, count: typeof result.count === "number" ? result.count : rows.length };
  }

  async first<T = unknown>(): Promise<T | null> {
    const { rows } = await this.execute();
    return coerceRow<T>(rows[0] ?? null);
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: true; meta: PgMeta }> {
    const { rows, count } = await this.execute();
    return {
      results: rows.map((row) => coerceRow<T>(row)!).filter(Boolean),
      success: true,
      meta: { last_row_id: null, changes: count },
    };
  }

  async run(): Promise<{ success: true; meta: PgMeta }> {
    const { rows, count } = await this.execute();
    // `RETURNING id` puts the generated key in the first row; absent for non-serial tables,
    // which is exactly the case where the caller does not read last_row_id.
    const returned = rows[0]?.["id"];
    const lastRowId =
      typeof returned === "number" ? returned
      : typeof returned === "bigint" ? Number(returned)
      : typeof returned === "string" && /^\d+$/.test(returned) ? Number(returned)
      : null;
    return { success: true, meta: { last_row_id: lastRowId, changes: count } };
  }

  /** Used by `batch` so statements can be replayed on the transaction's connection. */
  withClient(client: PgClient): PgPreparedStatement {
    return new PgPreparedStatement(client, this.source, this.params);
  }
}

export type PgDatabase = {
  prepare(sql: string): PgPreparedStatement;
  batch(statements: PgPreparedStatement[]): Promise<{ success: true; meta: PgMeta }[]>;
};

export function createPgDatabase(client: PgClient): PgDatabase {
  return {
    prepare(sql: string) {
      return new PgPreparedStatement(client, sql);
    },
    /**
     * D1's `batch` is atomic, and `transferOwnership` depends on that to avoid leaving a
     * workspace with two owners or none. A real Postgres transaction is a strictly stronger
     * guarantee, so the semantics the callers rely on are preserved.
     */
    async batch(statements: PgPreparedStatement[]) {
      return await client.begin(async (tx) => {
        const out: { success: true; meta: PgMeta }[] = [];
        for (const statement of statements) out.push(await statement.withClient(tx).run());
        return out;
      });
    },
  };
}
