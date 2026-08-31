/**
 * End-to-end check of the Postgres adapter against the real database.
 *
 * Exercises the paths most likely to diverge from D1: generated ids, case-insensitive
 * search, the rate-limiter upsert, batch atomicity, and COUNT(*) coercion. Cleans up after
 * itself so it can be re-run.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const { createPgDatabase } = require("../.test-build/pgdriver.js");
const db_ = require("../.test-build/db.js");
const rl = require("../.test-build/ratelimit.js");

const line = readFileSync(".dev.vars", "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const client = postgres(line.slice("DATABASE_URL=".length).trim(), { max: 1, onnotice: () => {} });
const DB = createPgDatabase(client);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

try {
  const ws = `ws_smoke_${Date.now()}`;

  // 1. createForm through the real adapter, then read it back scoped.
  const form = await db_.createForm(DB, { name: "Smoke Contact", workspaceId: ws });
  check("createForm writes and returns a row", typeof form.id === "string" && form.id.length > 0, true);
  const fetched = await db_.getFormInWorkspace(DB, form.id, ws);
  check("getFormInWorkspace reads it back", fetched?.id, form.id);
  check("a foreign workspace cannot see it", await db_.getFormInWorkspace(DB, form.id, "ws_other"), null);

  // 2. The sharp edge: last_row_id synthesised from RETURNING id.
  const ins = await DB.prepare(
    "INSERT INTO submissions (form_id, data, created_at) VALUES (?, ?, ?)"
  ).bind(form.id, JSON.stringify({ email: "a@b.c" }), Date.now()).run();
  check("submission insert yields a real last_row_id", typeof ins.meta.last_row_id === "number" && ins.meta.last_row_id > 0, true);
  check("meta.changes reports the write", ins.meta.changes, 1);

  // 3. LIKE -> ILIKE: case-insensitive search must survive the port.
  const found = await db_.listFormsWithStats(DB, "smoke contact", ws);
  check("lowercase search still matches a capitalised name", found.length, 1);
  check("COUNT(*) comes back as a number, not a string", typeof found[0].submission_count, "number");

  // 4. Rate limiter UPSERT .. RETURNING against real Postgres.
  const bucket = `smoke:${Date.now()}`;
  const first = await rl.consume(DB, bucket, 2, 60_000, Date.now());
  const second = await rl.consume(DB, bucket, 2, 60_000, Date.now());
  const third = await rl.consume(DB, bucket, 2, 60_000, Date.now());
  check("limiter counts across calls", [first.allowed, second.allowed, third.allowed], [true, true, false]);

  // 5. batch() as a real transaction — what ownership transfer depends on.
  const now = Date.now();
  await DB.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(`u_o_${now}`, `o${now}@x.com`, "Owner", "x", now).run();
  await DB.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(`u_e_${now}`, `e${now}@x.com`, "Editor", "x", now).run();
  for (const [u, r] of [[`u_o_${now}`, "owner"], [`u_e_${now}`, "editor"]]) {
    await DB.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)").bind(u, ws, r, now).run();
  }
  const moved = await db_.transferOwnership(DB, ws, `u_o_${now}`, `u_e_${now}`);
  check("transferOwnership succeeds", moved, true);
  const owners = await DB.prepare("SELECT user_id FROM memberships WHERE workspace_id = ? AND role = 'owner'").bind(ws).all();
  check("exactly one owner remains after the transaction", owners.results.length, 1);
  check("the new owner is the promoted member", owners.results[0].user_id, `u_e_${now}`);

  // 6. R2 metadata paths. The objects themselves live in R2 (only reachable through the
  // Worker binding), but the rows describing them go through this adapter, and `files`
  // has a TEXT id — so it must NOT get a RETURNING id appended.
  const fileId = `file_smoke_${now}`;
  const fres = await DB.prepare(
    "INSERT INTO files (id, form_id, submission_id, filename, content_type, size, r2_key, field_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(fileId, form.id, ins.meta.last_row_id, "cv.pdf", "application/pdf", 204800, `fr/${form.id}/abc/cv.pdf`, "resume", now).run();
  check("file metadata row inserts (TEXT id, no RETURNING)", fres.meta.changes, 1);
  const frow = await DB.prepare("SELECT * FROM files WHERE id = ?").bind(fileId).first();
  check("file row reads back with its R2 key", frow?.r2_key, `fr/${form.id}/abc/cv.pdf`);
  check("file size survives as a number", typeof frow.size, "number");

  // 7. Spill pointer round-trip: a large payload is replaced in the database by an r2://
  // pointer. This is what keeps Postgres small, so the column must hold it verbatim.
  const pointer = JSON.stringify({ _spilled: "r2://spill/deadbeef.json" });
  const sres = await DB.prepare("INSERT INTO submissions (form_id, data, created_at) VALUES (?, ?, ?)")
    .bind(form.id, pointer, now).run();
  const srow = await DB.prepare("SELECT data FROM submissions WHERE id = ?").bind(sres.meta.last_row_id).first();
  check("spill pointer stored verbatim", srow?.data, pointer);

  await DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId).run();

  // cleanup
  await DB.prepare("DELETE FROM submissions WHERE form_id = ?").bind(form.id).run();
  await DB.prepare("DELETE FROM memberships WHERE workspace_id = ?").bind(ws).run();
  await DB.prepare("DELETE FROM users WHERE id IN (?, ?)").bind(`u_o_${now}`, `u_e_${now}`).run();
  await DB.prepare("DELETE FROM forms WHERE workspace_id = ?").bind(ws).run();
  await DB.prepare("DELETE FROM rate_counters WHERE bucket = ?").bind(bucket).run();
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
} finally {
  await client.end();
}
process.exit(failures === 0 ? 0 : 1);
