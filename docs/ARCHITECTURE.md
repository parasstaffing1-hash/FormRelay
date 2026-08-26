# Architecture

## Stack
Hono 4 with `hono/jsx` (server-rendered React-like JSX, no client framework) running on **Cloudflare Workers**. Data in **D1** (SQLite at edge). Blobs/attachments and spilled-large-values in **R2**. Email via **Resend** (HTTP fetch). Worker config: `wrangler.toml` → D1 binding `DB`, optional R2 binding `FILES`.

```
Browser ──► Cloudflare Worker (Hono)
             ├── /f/:id         public render (GET) + submit (POST)
             ├── /admin/*       dashboard (session-auth via HMAC cookie)
             ├── /api/v1/*      REST API (Bearer key auth)
             ├── /assets/app.js vanilla JS (palette, toasts, builder, copy)
             └── /             public landing
```

## Request flow — submission (`POST /f/:id`)
1. CORS preflight (OPTIONS) handled.
2. Parse payload by content type: `multipart/form-data`, `application/x-www-form-urlencoded`, or `application/json`.
3. **Spam gate**: honeypot fields (`_gotcha`/`_honeypot`/`_hp`) → silent discard; per-IP rate limit (10/min); optional Turnstile verify.
4. **Schema validation** (if the form is published): validate each block via `blocks.ts validateBlockValue`. On failure → re-render form with 400 + inline errors, nothing persisted.
5. **Persist** to `submissions` (JSON data `{[blockId]: value, _labels, _v:1}`; headless forms keep raw keys). Large payloads (>10k) spill to R2 and store an `r2://key` pointer to keep D1 rows small.
6. Acknowledge (JSON `{ok:true}`, 303 redirect, or thank-you) **immediately**.
7. Non-critical side effects run in `waitUntil` (never block submission): email notification, auto-reply, webhook fan-out (signed HMAC), file upload persistence.

**Rule:** an email/webhook outage must NEVER lose a submission — persistence happens before side effects.

## Data model (D1)
- `forms` — id, name, redirect_url, notify_email, auto_reply, archived, `schema_json` (draft), `published_json` (published snapshot), `status` (draft|published), `views`, created_at
- `submissions` — id (autoincrement), form_id, data (JSON), ip, user_agent, referer, is_spam, created_at
- `webhooks` / `webhook_deliveries`
- `files` — metadata (actual bytes in R2)
- `settings_kv` — workspace settings (e.g. `retention_days`)
- `api_keys` — name, prefix, sha256 hash, last4, last_used_at
- `audit_log` — append-only admin actions

## Module map (`src/`)
- `index.tsx` — all routes; mounts `/api/v1`; the submit pipeline
- `db.ts` — every D1 query (forms, submissions, webhooks, analytics, api_keys, settings)
- `blocks.ts` — canonical block-type registry: definitions, defaults, per-type validation, schema parser
- `spam.ts` — honeypot, rate limit, Turnstile
- `email.ts` — Resend notification + auto-reply
- `webhooks.ts` — signed delivery + test sends
- `files.ts` — R2 upload/download/delete + storage meters
- `spill.ts` — spill large submission JSON to R2 when D1 would bloat
- `audit.ts` — append-only audit helper
- `api.ts` — `/api/v1` REST subapp (Bearer keys)
- `pages/*` — page components (home, forms, builder, form-detail, inbox, public-form, submission-detail, webhooks, misc)
- `ui/*` — design system: AppShell/sidebar/topbar (shell), tokens+CSS (styles), components (components), icons, client JS

## Extension points
- **Field types**: add to `BLOCK_DEFS` in `blocks.ts` — renderer and validation key off the same registry.
- **Integrations**: add an HTTP-based provider following the webhooks/email pattern (fetch + waitUntil); no framework needed.
- **AuthN**: swap the password HMAC-cookie scheme for a users table when multi-tenant lands.
- **Analytics**: aggregate in D1 SQL; charts are inline SVG (no chart lib introduced).

## Constraints (free tier)
- Workers: 100k req/day free.
- D1: single database caps near **500 MB** on the free plan → mitigations: R2 spill for large values, retention auto-prune, CSV export before purge.
- Resend: 3k messages/month free.
- R2: 10 GB free.
- No long-running background jobs: use `waitUntil` + optional cron trigger (retention prune) instead.
- Per-isolate in-memory state is NOT shared across edge isolates (documented for API rate limiting).
