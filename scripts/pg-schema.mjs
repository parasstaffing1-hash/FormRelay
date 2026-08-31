/**
 * Generates schema.postgres.sql from schema.sql.
 *
 * A script rather than a hand-written copy so the two schemas cannot drift: re-run it
 * whenever schema.sql changes. Every mapping below is a deliberate decision, not a
 * find-and-replace convenience.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { translateDDL } from "./lib-pgtranslate.mjs";

const source = readFileSync("schema.sql", "utf8");

const translated = translateDDL(source);
const out = translated.sql;
const applied = translated.counts.map((c) => `${c.why}: ${c.n}`);

const header = `-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/pg-schema.mjs from schema.sql. Re-run after changing schema.sql:
--   node scripts/pg-schema.mjs
--
-- SQLite -> PostgreSQL mappings applied:
${applied.map((line) => `--   ${line}`).join("\n")}
--
-- Deliberately unchanged: TEXT, CHECK constraints, partial indexes (WHERE clauses) and
-- IF NOT EXISTS are all valid Postgres and mean the same thing in both engines.

`;

writeFileSync("schema.postgres.sql", header + out);
console.log(applied.join("\n"));
console.log("wrote schema.postgres.sql");
