# 📮 FormRelay

**Forms in. Data anywhere.** Self-hosted, open-source Formspree alternative — point any HTML form at an endpoint and get spam-filtered storage, email alerts, and webhooks on a 100% free-tier stack (Hono SSR JSX + Cloudflare Workers + D1 + SendLayer). Notion-inspired admin UI.

## Features

- **Form endpoints** — `POST /f/:formId` accepts HTML form-encoded, multipart, or JSON; CORS enabled
- **File uploads** — multipart attachments stored in Cloudflare R2 when a binding named `FILES` is configured (gracefully degrades to `[file: name]` text without it)
- **Spam protection** — honeypot fields (`_gotcha`/`_honeypot`/`_hp`), per-IP rate limit (10/min), optional Cloudflare Turnstile
- **Email** — per-form notifications + optional auto-reply to the submitter via the native SendLayer adapter (with legacy Resend fallback)
- **Webhooks** — HMAC-SHA256 signed payloads (`whsec_…` secrets), automatic retries with backoff, delivery history with status codes, one-click test sends
- **Submissions inbox** — global browser with form/spam filters, detail view with metadata and raw JSON
- **CSV export** per form
- **Forms management** — create, rename, duplicate, archive, delete; per-form redirect URL
- **Dashboard stats** — form count, total + this-month submissions
- **Command palette** — `Cmd`/`Ctrl`+`K`, plus mobile drawer sidebar and dark-mode-ready CSS tokens

## Quick start

```bash
npm install

# 1. Create the D1 database (prints a database_id)
npm run db:create
#    -> paste it into wrangler.toml [[d1_databases]] database_id

# 2. Create tables — locally AND remotely. (schema.sql is idempotent.)
npm run db:init
npm run db:init:remote

# 3. Configure environment
cp .dev.vars.example .dev.vars   # local dev values
```

Secrets (`npx wrangler secret put <NAME>` after `npx wrangler login`):

| Variable | Required | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | yes | dashboard login |
| `SESSION_SECRET` | yes | long random string for session cookies |
| `DATABASE_URL` | no | PostgreSQL connection string when not using D1 or Hyperdrive; keep it server-side |
| `SENDLAYER_API_URL` | no | SendLayer `POST /v1/emails` endpoint; keep this server-side |
| `SENDLAYER_API_KEY` | no | SendLayer project key; never expose it in browser code |
| `EMAIL_PROVIDER` | no | set to `sendlayer` to use the native Resend-compatible adapter |
| `RESEND_API_KEY` | no | legacy fallback for notifications/auto-reply |
| `MAIL_FROM` | no | e.g. `FormRelay <you@yourdomain.com>`; must be authorized by SendLayer |
| `TURNSTILE_SECRET_KEY` | no | Turnstile server-side verification secret |
| `TURNSTILE_SITE_KEY` | no | public Turnstile site key rendered on visitor-facing forms |
| `TURNSTILE_HOSTNAMES` | no | comma-separated hostnames accepted by Siteverify |
| `WORKSPACE_NAME` | no | plain var (in `.dev.vars`/dashboard header), not a secret |

```bash
npm run dev      # http://localhost:8787
npm run deploy   # wrangler deploy
```

### Upgrading an existing install

`schema.sql` always describes the current shape, so a fresh install needs nothing else.
Existing databases apply the numbered migrations in `migrations/` once each, in order:

```bash
npx wrangler d1 execute formrelay --remote --file=./migrations/0002-smart-forms-workflows.sql
npx wrangler d1 execute formrelay --remote --file=./migrations/0003-security-hardening.sql
```

`0002` is a one-time upgrade — SQLite `ALTER TABLE ... ADD COLUMN` is not idempotent, so
re-running it errors on columns that already exist. `0003` is safe to re-run.

Passwords are stored as salted PBKDF2. Databases written by an earlier build hold unsalted
SHA-256 digests; those still authenticate and are re-hashed to PBKDF2 automatically the next
time each user signs in, so no manual password reset is needed.

## Usage

HTML form:

```html
<form action="https://your-worker.workers.dev/f/YOUR_FORM_ID" method="POST">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <!-- honeypot: keep hidden from humans -->
  <input type="text" name="_gotcha" style="display:none">
  <button type="submit">Send</button>
</form>
```

JSON:

```js
fetch("https://your-worker.workers.dev/f/YOUR_FORM_ID", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ada", email: "ada@example.com", message: "Hi" }),
});
// -> {"ok":true}
```

Fields starting with `_` are control fields — stripped before storage.

| Field | Effect |
|---|---|
| `_gotcha` / `_honeypot` / `_hp` | Honeypot trap: non-empty value silently drops the submission |
| `_subject` | Custom subject for notification emails |
| `_replyto` | Reply-to address; also the auto-reply target if no `email` field |
| `_redirect` | Per-submission redirect URL (falls back to form setting) |

## Insights

`/admin/forms/:id/insights` (linked as **Insights** in the builder toolbar) answers the
question plain counts cannot: *where do people give up?*

- **Drop-off by question** — for each field, how many respondents reached it and how many
  stopped there. A respondent counts as having *reached* the question after their last
  answer, not at it: someone who fills name and email then leaves saw the next question
  and refused it, and that is the field worth fixing.
- **Completion rate and median time** — median rather than mean, because one abandoned tab
  left open overnight drags a mean into meaninglessness.
- **Answer distribution** for choice fields. Multi-select answers are split, so `A, B`
  counts toward `A` and `B` rather than inventing a third option.
- **Device split** — three coarse buckets, enough to answer "does this work on phones"
  without fingerprinting anyone.

Spam and erased submissions are excluded: spam would invent abandonment from bots that
never meant to finish, and an erased row has an empty payload that reads as quitting at
question one.

The headline finding stays silent below ten respondents on a question. A 100% drop rate
off two people is noise, and presenting it as a finding sends someone rewriting a
question for no reason.

All of it derives from data already stored on each submission — no extra tracking, no
third-party script, nothing new collected.

## Webhooks

Attach a webhook to any form (dashboard → Webhooks). Each gets an auto-generated `whsec_…` secret.

Payload POSTed on every non-spam submission:

```json
{
  "event": "submission.created",
  "sent_at": "2025-01-01T12:00:00.000Z",
  "form": { "id": "abc123", "name": "Contact" },
  "submission": {
    "id": 42,
    "data": { "name": "Ada", "email": "ada@example.com" },
    "created_at": 1735732800000
  }
}
```

Verify it:

- Header `X-FormRelay-Event`: event name (`submission.created`, or `webhook.test`)
- Header `X-FormRelay-Signature`: `sha256=<hex>` — HMAC-SHA256 of the raw request body using your webhook secret

### Retries

A delivery that fails is retried on a backoff of 1m, 5m, 15m, 1h, 6h, 24h — seven
attempts in total — driven by the Cron Trigger in `wrangler.toml`. **Without that trigger
deployed, nothing retries**, so keep the `[triggers]` block when you edit the config.

Only transport failures, timeouts, `408`, `429`, and `5xx` are retried. Any other `4xx`
means your endpoint read the payload and refused it, so retrying would change nothing;
those are marked failed immediately.

While a retry is outstanding the delivery row holds a verbatim copy of the submission.
It is dropped the moment the delivery succeeds or runs out of attempts, and erasing or
deleting a submission cancels any retry still holding it — so the queue never becomes a
second, longer-lived copy of respondent data.

Delivery history shows `Retrying` alongside the attempt count while a backlog is
draining. To exercise the sweeper locally, run `npm run dev` and hit
`http://localhost:8787/__scheduled?cron=*/5+*+*+*+*`.

Management: pause/resume (toggle active), delete, delivery history (last 25 attempts with status codes and errors), and **Send test** to fire a sample payload.

## Dashboard tour

Sign in at `/admin/login` (single password auth, 7-day session cookie).

| Route | What's there |
|---|---|
| `/admin` | Stats cards, forms overview, recent submissions |
| `/admin/forms` | Form list with counts, search, new-form modal |
| `/admin/forms/:id` | Tabs: `submissions` \| `setup` \| `notifications` \| `webhooks` \| `settings`; CSV export, duplicate, archive |
| `/admin/submissions` | Global inbox, filter by form or spam-only |
| `/admin/submissions/:id` | Full field view, IP/UA/referer metadata, raw JSON, spam/delete actions |
| `/admin/webhooks` | All webhooks + last delivery status |
| `/admin/webhooks/:id` | Secret, deliveries history, pause/resume, test send |
| `/admin/workflows` | Coming soon (rule-based automation) |
| `/admin/files` | Uploaded attachments — list, download, delete, storage usage |
| `/admin/settings` | Sections: general, members, domains, API keys, notifications, billing, security |

## Files

Form endpoints accept multipart uploads out of the box. To store the actual bytes, configure an R2 bucket:

```bash
npx wrangler r2 bucket create formrelay-files
```

Then uncomment in `wrangler.toml` and deploy:

```toml
[[r2_buckets]]
binding = "FILES"
bucket_name = "formrelay-files"
```

- Objects land under `fr/<formId>/<uuid>/<filename>`; metadata goes into the `files` table (run `npm run db:init` if upgrading).
- The submission itself stores `[file: name]` as the field value either way.
- Without a `FILES` binding everything still works — uploads just aren't persisted, so default deploys need no bucket. Locally, `wrangler dev` simulates R2 once the binding is uncommented.
- Manage files at `/admin/files`: per-row download + delete, total storage meter (25 per page).

## Project structure

```
schema.sql            # D1 schema: forms, submissions, webhooks, webhook_deliveries
wrangler.toml         # Worker config + D1 binding (DB)
src/
  index.tsx           # all routes: submit endpoint, auth, admin pages/actions
  db.ts               # D1 queries (forms, submissions, stats, webhooks)
  email.ts            # Resend notification + auto-reply
  spam.ts             # honeypot, IP rate limit, Turnstile verify
  webhooks.ts         # signed delivery + test sends
  util.ts             # HMAC sessions, ids, CSV escaping
  types.ts            # shared types/bindings
  pages/              # page components (home, forms, inbox, settings, …)
  ui/                 # AppShell/nav, styles, icons, client JS (palette)
```

## Cost

Runs entirely on free tiers:

| Piece | Free tier |
|---|---|
| Cloudflare Workers | 100k requests/day |
| Cloudflare D1 | 5 GB storage, 5M rows read/day |
| Resend | 3,000 emails/month |

Self-hosted and open-source — fork it, own your data. PRs welcome.
