# 📮 FormRelay

**Forms in. Data anywhere.** Self-hosted, open-source Formspree alternative — point any HTML form at an endpoint and get spam-filtered storage, email alerts, and webhooks on a 100% free-tier stack (Hono SSR JSX + Cloudflare Workers + D1 + Resend). Notion-inspired admin UI.

## Features

- **Form endpoints** — `POST /f/:formId` accepts HTML form-encoded, multipart, or JSON; CORS enabled
- **Spam protection** — honeypot fields (`_gotcha`/`_honeypot`/`_hp`), per-IP rate limit (10/min), optional Cloudflare Turnstile
- **Email** — per-form notifications + optional auto-reply to the submitter via Resend
- **Webhooks** — HMAC-SHA256 signed payloads (`whsec_…` secrets), delivery history with status codes, one-click test sends
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

# 2. Create tables — locally AND remotely.
#    Re-run schema.sql if upgrading: webhooks/webhook_deliveries tables
#    and referer/archived columns were added recently. (Idempotent.)
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
| `RESEND_API_KEY` | no | enables notifications/auto-reply (free at resend.com) |
| `MAIL_FROM` | no | e.g. `FormRelay <you@yourdomain.com>` |
| `TURNSTILE_SECRET_KEY` | no | Turnstile verification |
| `WORKSPACE_NAME` | no | plain var (in `.dev.vars`/dashboard header), not a secret |

```bash
npm run dev      # http://localhost:8787
npm run deploy   # wrangler deploy
```

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
| `/admin/files` | Coming soon (file uploads) |
| `/admin/settings` | Sections: general, members, domains, API keys, notifications, billing, security |

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
