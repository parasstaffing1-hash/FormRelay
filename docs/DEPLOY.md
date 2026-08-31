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
npm run migrate:remote
```

`schema.sql` creates every table for a new database. `npm run migrate:remote` then records
which migrations that shape already satisfies, so later upgrades apply only what is missing.

The runner keeps a `schema_migrations` table and applies pending files in order, stopping at
the first failure rather than continuing into a half-applied state:

```bash
npm run migrate:status
```

Nothing needs to be applied by hand, and re-running is safe.

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
| `RESEND_API_KEY` | notification emails, auto-replies, workflow email actions |
| `MAIL_FROM` | sender identity, e.g. `FormRelay <you@yourdomain.com>` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile spam verification |

`WORKSPACE_NAME` is a plain display name, not a secret — set it under `[vars]` in
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
