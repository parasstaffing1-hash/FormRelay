/* -------------------------------------------------- read-only SQL access */

/**
 * Guard for the read-only SQL endpoint.
 *
 * Lets an operator query their own responses directly instead of exporting CSV and
 * loading it somewhere else. D1 has no per-connection read-only mode, so the guard is
 * an allow-list: a single SELECT, no statement chaining, no write or schema verbs, and
 * a LIMIT is imposed if the caller did not supply one.
 */
export type SqlVerdict = { ok: true; sql: string } | { ok: false; reason: string };

const FORBIDDEN = [
  "insert", "update", "delete", "drop", "alter", "create", "replace", "truncate",
  "attach", "detach", "pragma", "vacuum", "reindex", "begin", "commit", "rollback",
];

/** Tables an API caller may read. Auth and secret material stay out of reach. */
const READABLE_TABLES = [
  "submissions", "forms", "webhooks", "webhook_deliveries", "form_events",
  "workflows", "workflow_runs", "workflow_steps", "audit_log", "response_views",
  "chain_anchors", "notifications", "files", "form_versions",
];

const BLOCKED_TABLES = ["users", "memberships", "invitations", "api_keys", "settings_kv", "login_attempts"];

export function guardSelect(raw: string, maxLimit = 1000): SqlVerdict {
  const sql = raw.trim().replace(/;\s*$/, "");
  if (!sql) return { ok: false, reason: "empty query" };
  if (sql.includes(";")) return { ok: false, reason: "only a single statement is allowed" };

  const lower = sql.toLowerCase();
  if (!/^select\s/.test(lower) && !/^with\s/.test(lower)) return { ok: false, reason: "only SELECT queries are allowed" };

  // Word-boundary match so a column called `updated_at` is not mistaken for `update`.
  for (const verb of FORBIDDEN) {
    if (new RegExp(`\\b${verb}\\b`).test(lower)) return { ok: false, reason: `\`${verb}\` is not allowed` };
  }
  for (const table of BLOCKED_TABLES) {
    if (new RegExp(`\\b${table}\\b`).test(lower)) return { ok: false, reason: `the \`${table}\` table is not readable through this endpoint` };
  }
  if (!READABLE_TABLES.some((table) => new RegExp(`\\b${table}\\b`).test(lower))) {
    return { ok: false, reason: "query does not reference a readable table" };
  }

  return { ok: true, sql: /\blimit\b/.test(lower) ? sql : `${sql} LIMIT ${maxLimit}` };
}

/* ------------------------------------------------------ recurring cohorts */

/**
 * Recurring forms.
 *
 * The same form collects on a repeating cycle (a weekly standup, a monthly check-in) and
 * each response is stamped with the cycle it belongs to, so responses group into
 * comparable cohorts instead of one undifferentiated pile.
 */
export type Recurrence = "off" | "daily" | "weekly" | "monthly";

export function isRecurrence(value: string): value is Recurrence {
  return value === "off" || value === "daily" || value === "weekly" || value === "monthly";
}

/** Stable cohort label, e.g. `2026-W09`. Computed in UTC so it does not drift by viewer. */
export function cohortFor(when: number, recurrence: Recurrence): string {
  if (recurrence === "off") return "";
  const date = new Date(when);
  const year = date.getUTCFullYear();
  if (recurrence === "daily") {
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  if (recurrence === "monthly") {
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // ISO-8601 week: weeks start Monday and belong to the year containing their Thursday.
  const target = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/* ------------------------------------------------------ schema migrations */

/**
 * Field migrations with backfill.
 *
 * Renaming a field normally orphans every historical response, because exports key on
 * the old id. These operations rewrite stored responses alongside the schema so the
 * history stays queryable under the new shape.
 *
 * Rewriting stored answers necessarily changes their digests, so a migration is a
 * disclosed event: callers re-seal the chain afterwards and record why.
 */
export type MigrationOp =
  | { kind: "rename"; from: string; to: string }
  | { kind: "merge"; from: string[]; to: string; separator: string }
  | { kind: "split"; from: string; to: [string, string]; separator: string };

export function applyMigration(stored: Record<string, unknown>, op: MigrationOp): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  const labels = (out._labels && typeof out._labels === "object" ? { ...(out._labels as Record<string, unknown>) } : null);

  const moveLabel = (from: string, to: string) => {
    if (labels && from in labels) {
      labels[to] = labels[from];
      delete labels[from];
    }
  };

  if (op.kind === "rename") {
    if (op.from in out) {
      out[op.to] = out[op.from];
      delete out[op.from];
    }
    moveLabel(op.from, op.to);
  }

  if (op.kind === "merge") {
    const parts = op.from.map((field) => (out[field] == null ? "" : String(out[field]))).filter((part) => part !== "");
    if (parts.length > 0) out[op.to] = parts.join(op.separator);
    for (const field of op.from) {
      if (field !== op.to) delete out[field];
      if (labels && field !== op.to) delete labels[field];
    }
  }

  if (op.kind === "split") {
    const value = out[op.from] == null ? "" : String(out[op.from]);
    const index = value.indexOf(op.separator);
    const [left, right] = index === -1 ? [value, ""] : [value.slice(0, index), value.slice(index + op.separator.length)];
    out[op.to[0]] = left;
    out[op.to[1]] = right;
    if (op.from !== op.to[0] && op.from !== op.to[1]) delete out[op.from];
    moveLabel(op.from, op.to[0]);
  }

  if (labels) out._labels = labels;
  return out;
}

/** Applies the same operation to a schema's block ids so form and data stay in step. */
export function migrateSchemaBlocks(schemaJson: string | null, op: MigrationOp): string | null {
  if (!schemaJson) return schemaJson;
  try {
    const schema = JSON.parse(schemaJson) as { blocks?: { id: string }[] };
    if (!Array.isArray(schema.blocks)) return schemaJson;
    if (op.kind === "rename") {
      for (const block of schema.blocks) if (block.id === op.from) block.id = op.to;
    }
    if (op.kind === "merge") {
      const kept = schema.blocks.filter((block) => !op.from.includes(block.id) || block.id === op.to);
      const first = schema.blocks.find((block) => op.from.includes(block.id));
      if (first && !kept.some((block) => block.id === op.to)) kept.unshift({ ...first, id: op.to });
      schema.blocks = kept;
    }
    return JSON.stringify(schema);
  } catch {
    return schemaJson;
  }
}

/* -------------------------------------------------------- sealed responses */

/**
 * Time-locked responses. Enforced server-side: content is withheld from every read path
 * until the unlock time. This is an access-control lock, not a cryptographic one — an
 * operator with direct database access can still read the rows, so it suits sealed bids
 * and blind review among cooperating parties, not adversarial secrecy.
 */
export function isSealed(unlockAt: number | null | undefined, now = Date.now()): boolean {
  return !!unlockAt && now < unlockAt;
}

export function sealedNotice(unlockAt: number): string {
  return `Sealed until ${new Date(unlockAt).toUTCString()}`;
}
