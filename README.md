# 📮 FormRelay

A free, self-hosted Formspree alternative. Point any HTML form at an endpoint — get spam-filtered submissions stored in a database, email notifications, and a dashboard with CSV export.

**100% free-tier stack**: Hono + Cloudflare Workers + Cloudflare D1 + Resend (or any SMTP via Resend-compatible flows).

## Features

- `POST /f/:formId` accepts HTML form-encoded, multipart, or JSON payloads
- Email notifications per form (Resend, free tier)
- Optional auto-reply confirmation to the submitter
- Spam protection: honeypot fields, IP rate limiting (10/min), optional Cloudflare Turnstile
- Admin dashboard (password auth): forms CRUD, submission browser, mark-spam, delete
- CSV export
- Custom redirect after submit (`_redirect` field or per-form setting)
- Special fields: `_subject`, `_replyto`, `_gotcha` / `_honeypot` / `_hp`
- CORS enabled — works from any static site

## Setup

```bash
npm install

# 1. Create the D1 database (prints a database_id)
npm run db:create

# 2. Put that id in wrangler.toml -> [[d1_databases]] database_id

# 3. Create tables (locally and remotely)
npm run db:init
npm run db:init:remote

# 4. Set secrets
cp .dev.vars.example .dev.vars   # fill values for local dev

npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY     # free at resend.com (optional)
npx wrangler secret put MAIL_FROM          # e.g. FormRelay <you@yourdomain.com>

# 5. Run locally
npm run dev        # http://localhost:8787

# 6. Deploy
npm run deploy
```

### Optional: Turnstile CAPTCHA
Set `TURNSTILE_SECRET_KEY` secret and add the Turnstile widget to your forms; submissions without a valid token are marked spam.

## Usage

```html
<form action="https://your-worker.workers.dev/f/YOUR_FORM_ID" method="POST">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <!-- honeypot: keep hidden -->
  <input type="text" name="_gotcha" style="display:none">
  <button type="submit">Send</button>
</form>
```

JSON also works: `fetch(url, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...}) })`.

Dashboard lives at `/admin`. Full docs render at `/`.

## Cost

| Piece | Free tier |
|---|---|
| Workers | 100k requests/day |
| D1 | 5 GB storage, 5M rows read/day |
| Resend | 3,000 emails/month |

## Project structure

```
src/
  index.tsx    # routes: public submit endpoint, admin API, docs page
  admin.tsx    # server-rendered dashboard UI
  db.ts        # D1 queries
  email.ts     # Resend notification + auto-reply
  spam.ts      # honeypot, rate limit, Turnstile verification
  util.ts      # HMAC sessions, ids, escaping
schema.sql     # tables (forms, submissions)
```
