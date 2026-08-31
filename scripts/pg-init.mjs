/**
 * Applies schema.postgres.sql to the configured Postgres database.
 *
 * Reads DATABASE_URL from the environment or .dev.vars so the credential is never a
 * command-line argument (argv is visible to other processes and lands in shell history).
 * Every statement is IF NOT EXISTS, so re-running is safe.
 */
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync(".dev.vars")) throw new Error("No DATABASE_URL and no .dev.vars");
  const line = readFileSync(".dev.vars", "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .dev.vars");
  return line.slice("DATABASE_URL=".length).trim();
}

const sql = postgres(connectionString(), { max: 1, onnotice: () => {} });
try {
  const schema = readFileSync("schema.postgres.sql", "utf8");
  await sql.unsafe(schema);
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  const indexes = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
  console.log(`tables:  ${tables.length}`);
  console.log(`indexes: ${indexes.length}`);
  console.log(tables.map((t) => t.table_name).join(", "));
} finally {
  await sql.end();
}
