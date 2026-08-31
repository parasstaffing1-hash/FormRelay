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
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";

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
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await appliedVersions();
  const pending = files.filter((f) => !applied.has(f));

  console.log(`database: ${DB_NAME} (${remote ? "remote" : "local"})`);
  console.log(`applied:  ${applied.size}`);
  console.log(`pending:  ${pending.length}`);

  // A database created from schema.sql already has the current shape, so replaying the
  // migrations that built it would fail on the first ALTER TABLE. Baselining records them
  // as satisfied so only genuinely new migrations ever run.
  if (baseline) {
    for (const file of pending) {
      await sql(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES ('${file}', ${Date.now()})`);
      console.log(`  recorded  ${file}`);
    }
    console.log(`
Baselined ${pending.length} migration(s). None were executed.`);
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
      await sqlFile(join(MIGRATIONS_DIR, file));
      await sql(
        `INSERT INTO schema_migrations (version, applied_at) VALUES ('${file}', ${Date.now()})`
      );
      console.log("ok");
    } catch (error) {
      console.log("FAILED");
      console.error(`\n${error.stderr || error.message}`);
      console.error(
        `\nStopped at ${file}. Earlier migrations are recorded as applied; fix this one and re-run.` +
        `\nIf this migration was already applied by hand, record it and skip:` +
        `\n  npx wrangler d1 execute ${DB_NAME} ${scope} --command "INSERT INTO schema_migrations VALUES ('${file}', ${Date.now()})"`
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log(`\nApplied ${pending.length} migration(s).`);
}

main().catch((error) => {
  console.error(error.stderr || error.message);
  process.exitCode = 1;
});
