# Deploying FormRelay to Cloudflare

Every step runs from the repository root. Steps 1, 4, and 5 need your own credentials, so
run those yourself — the rest can be handed off.

## 0. Prerequisites

A Cloudflare account (the free plan is enough). Workers, D1, and — only if you want file
uploads — R2 are all available on it.

## 1. Sign in to Cloudflare

```bash
npx wrangler login
```

Opens a browser for OAuth. Confirm it worked:

```bash
npx wrangler whoami
```

## 2. Create the production D1 database

```bash
npx wrangler d1 create formrelay
```

It prints a `database_id`. Paste that into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "formrelay"
database_id = "the-uuid-it-printed"
```

## 3. Create the tables remotely

```bash
npx wrangler d1 execute formrelay --remote --file=./schema.sql
node scripts/migrate.mjs --remote --baseline
```

`schema.sql` creates every table, so a new database already has the current shape.
Baselining records the existing migrations as satisfied **without running them** — replaying
them would fail on the first `ALTER TABLE`, because those columns are already there.

From then on, upgrades are just:

```bash
npm run migrate:remote
```

The runner keeps a `schema_migrations` table and applies pending files in order, stopping at
the first failure rather than continuing into a half-applied state:

```bash
npm run migrate:status
```

Nothing needs to be applied by hand, and re-running is safe.

## 3b. If you are using PostgreSQL instead of D1

The Worker supports either engine. With a Postgres URL configured, `env.DB` is backed by
the adapter in `src/pgdriver.ts` and every query works unchanged.

```bash
node scripts/pg-init.mjs        # apply schema.postgres.sql
npm run migrate:pg:baseline     # record the migrations that schema already contains
npm run pg:smoke                # end-to-end check against the live database
```

Thereafter, upgrades are `npm run migrate:pg`. Each migration runs inside a transaction, so
a failure rolls back in full rather than leaving the schema half-changed.

`schema.postgres.sql` is generated — run `npm run pg:schema` after editing `schema.sql`,
never edit it directly.

Set the connection string as a secret, and prefer Hyperdrive for connection pooling (see
the commented block in `wrangler.toml`) — Workers open a connection per isolate and
Postgres caps concurrent connections.

```bash
npx wrangler secret put DATABASE_URL
```

## 4. Set the secrets

Two are required. Each command prompts for the value; nothing is written to the repo.

```bash
npx wrangler secret put ADMIN_PASSWORD
```

```bash
npx wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` should be long and random — it signs session cookies, and rotating it
invalidates every existing session. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Optional secrets, each enabling one feature:

| Secret | Enables |
|---|---|
| `SENDLAYER_API_URL` | full SendLayer `POST /v1/emails` endpoint |
| `SENDLAYER_API_KEY` | server-side SendLayer project key; never ship it to the browser |
| `EMAIL_PROVIDER` | set to `sendlayer` when using SendLayer |
| `RESEND_API_KEY` | legacy fallback for notification emails via Resend |
| `EMAIL_API_URL` | generic JSON email endpoint for other providers |
| `EMAIL_API_KEY` | bearer token for `EMAIL_API_URL` |
| `MAIL_FROM` | sender identity, e.g. `FormRelay <you@yourdomain.com>`; it must be authorized by SendLayer |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile spam verification |

`TURNSTILE_SITE_KEY` is the public site key paired with `TURNSTILE_SECRET_KEY` when
Turnstile is enabled. `WORKSPACE_NAME` is a plain display name, not a secret — set it under `[vars]` in
`wrangler.toml` if you want something other than the default.

## 5. Deploy

```bash
npm run deploy
```

Wrangler prints the live URL, `https://formrelay.<your-subdomain>.workers.dev`.

## 6. Verify the deploy

Sign in at `https://<your-worker>/admin/login` with `ADMIN_PASSWORD`, then confirm the
security controls survived the deploy. Each of these should be rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<your-worker>/admin/login -d 'password=x'
```

Expect `403` — a state-changing request with no `Origin` header is refused.

```bash
curl -s -D - -o /dev/null https://<your-worker>/admin/login | grep -i content-security-policy
```

Expect a CSP header on the response.

Then create a form in the dashboard, publish it, and submit to its `POST /f/:id` endpoint.

## Optional: file uploads (R2)

Uploads work without this — the bytes just aren't persisted, and the submission stores
`[file: name]`. To keep the files:

```bash
npx wrangler r2 bucket create formrelay-files
```

Uncomment the `[[r2_buckets]]` block in `wrangler.toml`, then `npm run deploy` again.

## Notes for production

- **Password hashing cost.** PBKDF2 runs at 50,000 iterations (`PASSWORD_ITERATIONS` in
  `src/util.ts`) so a sign-in fits the free plan's 10ms CPU budget. On a paid plan raise it
  to 100,000+; existing hashes record their own iteration count and keep verifying.
- **Sign-in lockout** is 8 failures per IP per 15 minutes, stored in D1 (`login_attempts`),
  so it holds across isolates. The API-key rate limiter is still per-isolate.
- **Rotate `SESSION_SECRET`** if you suspect exposure; it signs every session cookie.
- **Retention.** Set `retention_days` under `/admin/settings` to prune old submissions.
