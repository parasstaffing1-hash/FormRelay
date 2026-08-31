/**
 * Chooses the database behind `env.DB`.
 *
 * The Worker was written against D1 and still supports it. When a Postgres connection is
 * configured, `pgdriver.ts` presents the same interface, so nothing downstream changes.
 *
 * Precedence is deliberate: a Hyperdrive binding wins over a raw connection string. Workers
 * open a connection per isolate and Postgres caps concurrent connections — a free-tier
 * instance is a low cap — so connecting directly at any real traffic level exhausts the
 * server. Hyperdrive pools on Cloudflare's side. The direct path exists for local
 * development, where there is one connection and no pool to speak of.
 */
import postgres from "postgres";
import { createPgDatabase, type PgClient } from "./pgdriver";

export type DbEnv = {
  DB?: D1Database;
  /** Hyperdrive binding; `.connectionString` points at the pooled endpoint. */
  HYPERDRIVE?: { connectionString: string };
  /** Direct Postgres URL. Local development, or deployments not using Hyperdrive. */
  DATABASE_URL?: string;
};

export function postgresUrl(env: DbEnv): string | null {
  return env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? null;
}

/**
 * Builds a client for one request.
 *
 * `max: 1` because a Worker isolate handles one request at a time and a larger pool would
 * multiply connections against the server's cap for no gain. `fetch_types: false` skips
 * the type-introspection round trip postgres.js otherwise makes on connect — pure latency
 * in an environment where the connection does not persist. `prepare: false` is required
 * when running through a pooler, which cannot guarantee the same backend between calls.
 */
export function createClient(url: string): PgClient {
  return postgres(url, {
    max: 1,
    fetch_types: false,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  }) as unknown as PgClient;
}

/**
 * The database for this request. Returns D1 untouched when no Postgres URL is configured,
 * so an existing D1 deployment keeps working with no change.
 */
export function resolveDatabase(env: DbEnv): D1Database {
  const url = postgresUrl(env);
  if (!url) {
    if (!env.DB) throw new Error("No database configured: set a HYPERDRIVE binding, DATABASE_URL, or a D1 DB binding");
    return env.DB;
  }
  return createPgDatabase(createClient(url)) as unknown as D1Database;
}
