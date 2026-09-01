/**
 * SQLite -> PostgreSQL statement translation.
 *
 * The application speaks D1's dialect in 173 `prepare()` calls. Rewriting each one by hand
 * would be 173 chances to introduce a silent behaviour change, so the statements stay as
 * they are and this module rewrites them on the way to Postgres.
 *
 * Pure string work, deliberately: every rule here is testable without a database, which is
 * the only reason a translation layer like this is defensible at all.
 *
 * What it does NOT attempt: arbitrary SQL. It handles the specific constructs this codebase
 * uses. Anything outside that set should fail loudly in tests rather than be silently
 * mistranslated — see `assertTranslatable`.
 */

/**
 * Rewrites positional `?` markers as Postgres `$1..$n`.
 *
 * String literals and quoted identifiers are skipped, so a `?` inside `'why?'` is left
 * alone. Without this, any literal containing a question mark would shift every subsequent
 * parameter index by one — corrupting the query rather than failing it.
 */
export function numberPlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (quote) {
      out += ch;
      // Doubled quotes are an escaped quote inside the literal, not a terminator.
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          out += sql[i + 1];
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "?") {
      index++;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * `INSERT OR IGNORE` and `INSERT OR REPLACE` have no Postgres equivalent spelling.
 *
 * `OR IGNORE` maps cleanly to `ON CONFLICT DO NOTHING`. `OR REPLACE` does not map cleanly
 * at all — Postgres needs to be told *which* columns conflict and what to set — so it is
 * rejected here rather than guessed at. The single `INSERT OR REPLACE` in this codebase is
 * rewritten explicitly at its call site instead.
 */
export function translateInsertOr(sql: string): string {
  if (/\bINSERT\s+OR\s+REPLACE\b/i.test(sql)) {
    throw new Error("INSERT OR REPLACE has no safe automatic translation; rewrite the statement with an explicit ON CONFLICT target");
  }
  const ignore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i;
  if (!ignore.test(sql)) return sql;
  const rewritten = sql.replace(ignore, "INSERT INTO");
  // Appending is correct only when the statement has no existing conflict clause.
  if (/\bON\s+CONFLICT\b/i.test(rewritten)) return rewritten;
  return appendBeforeReturning(rewritten, "ON CONFLICT DO NOTHING");
}

/** Inserts a clause before a trailing RETURNING, which must stay last. */
function appendBeforeReturning(sql: string, clause: string): string {
  const match = /\bRETURNING\b/i.exec(sql);
  if (!match) return `${sql.trimEnd().replace(/;$/, "")} ${clause}`;
  const head = sql.slice(0, match.index).trimEnd();
  const tail = sql.slice(match.index);
  return `${head} ${clause} ${tail}`;
}

/**
 * SQLite's `LIKE` is case-insensitive for ASCII; Postgres's is not.
 *
 * This is the one divergence that fails silently: form search would keep returning rows,
 * just fewer of them, and nobody would notice until a customer said "search is broken".
 * `ILIKE` restores the original behaviour.
 */
export function translateLike(sql: string): string {
  return sql.replace(/\bLIKE\b/gi, "ILIKE").replace(/\bNOT\s+ILIKE\b/gi, "NOT ILIKE");
}

/**
 * SQLite date formatting -> Postgres.
 *
 * Analytics buckets events by day with
 *   strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch'))
 * which is SQLite-only. Postgres spells the same thing
 *   to_char(to_timestamp(created_at/1000), 'YYYY-MM-DD')
 *
 * Only the epoch-seconds form this codebase uses is handled. Anything else falls through
 * to `assertTranslatable` and is refused, because a half-understood date expression that
 * returns plausible-but-wrong buckets is far worse than one that will not run.
 */
export function translateDateFunctions(sql: string): string {
  let out = sql.replace(/datetime\(([^,()]*(?:\([^()]*\))?[^,()]*)\s*,\s*'unixepoch'\s*\)/gi, (_m, expr) => `to_timestamp(${String(expr).trim()})`);
  out = out.replace(/strftime\(\s*'([^']+)'\s*,\s*([^;]*?)\s*\)\s*(AS|FROM|,|$)/gi, (match, fmt, expr, tail) => {
    const mapped = SQLITE_DATE_FORMATS[String(fmt)];
    if (!mapped) return match;
    return `to_char(${String(expr).trim()}, '${mapped}')${tail ? " " + tail : ""}`;
  });
  return out;
}

/** Only the formats this codebase uses. Guessing at others invites silently wrong buckets. */
const SQLITE_DATE_FORMATS: Record<string, string> = {
  "%Y-%m-%d": "YYYY-MM-DD",
  "%Y-%m": "YYYY-MM",
  "%Y": "YYYY",
};

/**
 * SQLite json_extract(col, '$.key') -> Postgres (col::json->>'key').
 *
 * Restricted to single-level keys, which is all the UTM attribution query uses. Nested
 * paths and array indexes are left alone and therefore refused, rather than mistranslated
 * into an expression that quietly returns null for every row.
 */
export function translateJsonExtract(sql: string): string {
  return sql.replace(/json_extract\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*'\$\.([A-Za-z_][A-Za-z0-9_]*)'\s*\)/gi, (_m, column, key) => `(${column}::json->>'${key}')`);
}

/** Constructs this translator knowingly does not handle. Loud beats subtly wrong. */
const UNSUPPORTED: { pattern: RegExp; why: string }[] = [
  { pattern: /\bAUTOINCREMENT\b/i, why: "AUTOINCREMENT is DDL-only; use the Postgres schema file" },
  { pattern: /\bPRAGMA\b/i, why: "PRAGMA is SQLite-only" },
  { pattern: /\bGROUP_CONCAT\s*\(/i, why: "GROUP_CONCAT is spelled STRING_AGG in Postgres" },
  { pattern: /\bdatetime\s*\(/i, why: "unrecognised datetime() form; only datetime(x, 'unixepoch') is translated" },
  { pattern: /\bstrftime\s*\(/i, why: "unrecognised strftime() format; see SQLITE_DATE_FORMATS" },
  { pattern: /\bjson_extract\s*\(/i, why: "unrecognised json_extract() path; only single-level $.key is translated" },
];

/** Throws when a statement uses something this module would otherwise mistranslate. */
export function assertTranslatable(sql: string): void {
  for (const { pattern, why } of UNSUPPORTED) {
    if (pattern.test(sql)) throw new Error(`Untranslatable SQL: ${why} — ${sql.slice(0, 120)}`);
  }
}

/** Full statement translation, in the order the rules must apply. */
export function toPostgres(sql: string): string {
  // Date and JSON rewrites run BEFORE the reject check, so the check only ever sees what
  // the rules could not handle. Placeholders are numbered last so no earlier rewrite can
  // shift the parameter order.
  const rewritten = translateJsonExtract(translateDateFunctions(sql));
  assertTranslatable(rewritten);
  return numberPlaceholders(translateLike(translateInsertOr(rewritten)));
}

/**
 * Postgres returns `bigint` (including every `COUNT(*)`) as a string, because it does not
 * fit a JS number safely. The application reads those as numbers — `COUNT(*) AS n` is
 * compared and arithmetic'd throughout — so a raw passthrough would turn counts into
 * string concatenation. Values beyond Number.MAX_SAFE_INTEGER are left as strings rather
 * than silently losing precision.
 */
export function coerceRow<T>(row: Record<string, unknown> | null): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      out[key] = value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
    } else if (typeof value === "string" && /^-?\d{1,15}$/.test(value) && key !== "id" && NUMERIC_COLUMNS.has(key)) {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Columns the application treats as numbers. Restricted to an explicit list because a blind
 * "looks like a number, convert it" rule would mangle genuine text — a form answer of
 * "12345", a phone number, a postcode with a leading zero.
 */
const NUMERIC_COLUMNS = new Set([
  "n", "count", "submission_count", "views", "size", "attempts", "spam_score", "lead_score",
  "response_status", "pow_bits", "submission_limit", "window_start",
]);
