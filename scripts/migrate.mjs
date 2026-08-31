#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Migrations were previously applied by hand, in order, from memory. That is fine until
 * it isn't: there is no record of what ran, re-running 0002 errors because SQLite's
 * ALTER TABLE ADD COLUMN is not idempotent, and a half-applied upgrade is invisible.
 *
 * This keeps a `schema_migrations` table, applies only what is missing, and stops at the
 * first failure rather than continuing into an inconsistent state.
 *
 *   node scripts/migrate.mjs             apply pending migrations locally
 *   node scripts/migrate.mjs --remote    apply them to the deployed database
 *   node scripts/migrate.mjs --status    list applied and pending, change nothing
 *   node scripts/migrate.mjs --baseline  record every migration as applied without
 *                                        running it, for a database just created from
 *                                        schema.sql (which already has the current shape)
 *   node scripts/migrate.mjs --pg        target PostgreSQL (DATABASE_URL / .dev.vars)
 *                                        instead of D1; combines with the flags above
 *
 * The two backends share the same migration files and the same `schema_migrations` table.
 * Migration SQL is written in SQLite's dialect and translated for Postgres by
 * lib-pgtranslate.mjs — the same rules the schema generator uses, so a database built by
 * replaying migrations matches one built from schema.postgres.sql.
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { translateDDL } from "./lib-pgtranslate.mjs";

const run = promisify(execFile);

// Wrangler is invoked through its JS entry rather than the npx shim. A shell would split
// any --command argument containing spaces (mangling every SQL statement), and Node 20+
// refuses to spawn a .cmd without one. Running it under the current node binary avoids
// both, and passes arguments as a list so nothing is interpolated into a command line.
const WRANGLER = createRequire(import.meta.url).resolve("wrangler/bin/wrangler.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "migrations");
const DB_NAME = "formrelay";

const args = new Set(process.argv.slice(2));
const remote = args.has("--remote");
const statusOnly = args.has("--status");
const baseline = args.has("--baseline");
const usePg = args.has("--pg");
const scope = remote ? "--remote" : "--local";

/** Runs one SQL statement through wrangler and returns stdout. */
async function sql(command) {
  const { stdout } = await run(
    process.execPath,
    [WRANGLER, "d1", "execute", DB_NAME, scope, "--json", "--command", command],
    { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }
  );
  return stdout;
}

async function sqlFile(path) {
  await run(
    process.execPath,
    [WRANGLER, "d1", "execute", DB_NAME, scope, "--file", path],
    { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }
  );
}

/** Reads DATABASE_URL from the environment, falling back to the gitignored .dev.vars. */
function postgresUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const path = join(ROOT, ".dev.vars");
  if (!existsSync(path)) throw new Error("--pg needs DATABASE_URL, or a DATABASE_URL line in .dev.vars");
  const NEWLINE = String.fromCharCode(10);
  const line = readFileSync(path, "utf8")
    .split(NEWLINE)
    .map((l) => l.trim())
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .dev.vars");
  return line.slice("DATABASE_URL=".length).trim();
}

/**
 * Postgres backend.
 *
 * The meaningful difference from D1: Postgres supports transactional DDL, so a migration
 * and the row recording it are committed together. A migration that fails halfway leaves
 * the database exactly as it was, rather than partially altered with no record of it —
 * which is the failure mode the D1 path can only warn about.
 */
async function pgDriver() {
  const { default: postgres } = await import("postgres");
  const sqlc = postgres(postgresUrl(), { max: 1, onnotice: () => {} });
  return {
    label: "postgres",
    async ensureTable() {
      await sqlc`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`;
    },
    async applied() {
      const rows = await sqlc`SELECT version FROM schema_migrations ORDER BY version`;
      return new Set(rows.map((r) => r.version));
    },
    async applyAndRecord(file, path) {
      const raw = readFileSync(path, "utf8");
      const { sql: translated } = translateDDL(raw);
      await sqlc.begin(async (tx) => {
        await tx.unsafe(translated);
        await tx`INSERT INTO schema_migrations (version, applied_at) VALUES (${file}, ${Date.now()})`;
      });
    },
    async record(file) {
      await sqlc`INSERT INTO schema_migrations (version, applied_at) VALUES (${file}, ${Date.now()}) ON CONFLICT (version) DO NOTHING`;
    },
    async close() {
      await sqlc.end();
    },
  };
}

/** D1 backend, driven through wrangler exactly as before. */
function d1Driver() {
  return {
    label: `${DB_NAME} (${remote ? "remote" : "local"})`,
    async ensureTable() {
      await sql("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    },
    async applied() {
      const out = await sql("SELECT version FROM schema_migrations ORDER BY version");
      try {
        return new Set((JSON.parse(out)?.[0]?.results ?? []).map((r) => r.version));
      } catch {
        return new Set();
      }
    },
    async applyAndRecord(file, path) {
      // Two statements, not one transaction: D1 cannot wrap DDL and the bookkeeping row
      // together, so a crash between them leaves the migration applied but unrecorded.
      await sqlFile(path);
      await sql(`INSERT INTO schema_migrations (version, applied_at) VALUES ('${file}', ${Date.now()})`);
    },
    async record(file) {
      await sql(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES ('${file}', ${Date.now()})`);
    },
    async close() {},
  };
}

async function appliedVersions() {
  await sql(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );
  const out = await sql("SELECT version FROM schema_migrations ORDER BY version");
  try {
    const parsed = JSON.parse(out);
    const rows = parsed?.[0]?.results ?? [];
    return new Set(rows.map((r) => r.version));
  } catch {
    return new Set();
  }
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const driver = usePg ? await pgDriver() : d1Driver();

  try {
    await driver.ensureTable();
    const applied = await driver.applied();
    const pending = files.filter((f) => !applied.has(f));

    console.log(`database: ${driver.label}`);
    console.log(`applied:  ${applied.size}`);
    console.log(`pending:  ${pending.length}`);

    // A database created from the full schema already has the current shape, so replaying
    // the migrations that built it would fail on the first ALTER TABLE. Baselining records
    // them as satisfied so only genuinely new migrations ever run.
    if (baseline) {
      for (const file of pending) {
        await driver.record(file);
        console.log(`  recorded  ${file}`);
      }
      console.log(`\nBaselined ${pending.length} migration(s). None were executed.`);
      return;
    }

    if (statusOnly || pending.length === 0) {
      for (const f of files) console.log(`  ${applied.has(f) ? "applied" : "PENDING"}  ${f}`);
      if (!statusOnly && pending.length === 0) console.log("\nNothing to do.");
      return;
    }

    for (const file of pending) {
      process.stdout.write(`\napplying ${file} ... `);
      try {
        await driver.applyAndRecord(file, join(MIGRATIONS_DIR, file));
        console.log("ok");
      } catch (error) {
        console.log("FAILED");
        console.error(`\n${error.stderr || error.message}`);
        console.error(
          `\nStopped at ${file}. Earlier migrations are recorded as applied; fix this one and re-run.` +
          (usePg
            ? `\nThis migration was rolled back in full - the database is unchanged by it.`
            : `\nIf this migration was already applied by hand, record it and skip:` +
              `\n  npx wrangler d1 execute ${DB_NAME} ${scope} --command "INSERT INTO schema_migrations VALUES ('${file}', ${Date.now()})"`)
        );
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error.stderr || error.message);
  process.exitCode = 1;
});
