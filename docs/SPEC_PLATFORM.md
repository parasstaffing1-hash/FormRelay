# FormRelay Platform Spec — v1 (governing document)

All implementation waves MUST conform to this spec. Existing behavior is contract; do not regress it.

## Stack (fixed)
Hono 4 SSR JSX (`hono/jsx`) on Cloudflare Workers · D1 · optional R2 (`FILES` binding) · Resend via fetch.
No client framework, no new runtime deps. Strict TS. Vanilla JS strings only for interactivity.

## Route map
- Public: `GET /f/:id` (renderer — NEW), `POST /f/:id` (submit — existing), landing `/`
- Admin: `/admin/*` as today + NEW builder & analytics
- API: `/api/v1/*` Bearer-key REST (NEW)

## Form definition schema (version 1)
Stored on `forms` row:
- `schema_json`   draft definition (JSON text)
- `published_json` published snapshot (JSON text) — public renderer uses THIS
- `status`        'draft' | 'published'
- `views`         integer counter

```jsonc
{
  "version": 1,
  "blocks": [
    {
      "id": "blk_ab12cd34",          // immutable, generated once
      "type": "short_text",          // see registry below
      "label": "Full name",
      "required": true,
      "placeholder": "",             // optional
      "help": "",                    // optional
      "options": ["A", "B"],         // choice types only
      "min": null, "max": null,      // number/length limits where meaningful
      "multiple": false              // file type only
    }
  ],
  "settings": { "submitText": "Submit", "successMessage": "", "redirectUrl": "" }
}
```

### Block registry (src/blocks.ts is canonical)
`short_text, long_text, email, number, phone, url, date, select, radio, checkbox_choice (multi), checkbox (single consent), rating (1..5), file, heading, divider, paragraph`
Every entry: `{ key, label, group, defaults(), validate(value, block): string|null, renderInput(block, value): JSX }`.
Validation runs SERVER-SIDE always (public POST); client-side niceties optional.

## Submission data contract
`submissions.data` JSON = `{ [blockId]: value, "_labels": { [blockId]: label }, "_v": 1 }`.
Headless/legacy forms (no `published_json`) keep the CURRENT raw-key behavior unchanged — zero regression.
Dashboard/inbox/detail render labels via `_labels`, falling back to raw key.

## API v1 (Bearer keys)
Key format `fr_live_<32 alnum>`; DB stores sha256 hex hash + prefix(first 12 chars) + last4; full key shown ONCE.
Endpoints: `GET /api/v1/forms`, `POST /api/v1/forms {name}`, `GET /api/v1/forms/:id`,
`GET /api/v1/forms/:id/responses?page=&per_page=50`, `GET /api/v1/responses/:id`, `DELETE /api/v1/responses/:id`.
Simple per-key rate limit (in-memory Map, documented island caveat). Update `last_used_at` on auth.

## Audit log
Append-only `audit_log(id, action, target_id, detail, created_at)`.
Actions: form.created/published/deleted/archived, response.deleted, export.run, key.created/revoked, settings.updated, retention.pruned.

## Retention
Workspace-level `settings_kv(key,value)` table; key `retention_days` (int or empty=off).
Admin button runs prune: deletes submissions older than N days (+ their file rows/R2 objects best-effort).

## Templates
6 real presets serialized as schema_json v1: Contact us, Feedback survey, Job application, Event RSVP, NPS survey, Project request. Offered in New-form modal; inserted as drafts.

## Analytics (real data only)
Per form: submissions/day 30d bar chart (inline SVG, no libs), total views, completion rate (submissions/views), spam rate, top referrers. Home: 14-day trend sparkline + existing stat blocks. No fake numbers ever.

## Non-negotiables
- Every UI control must work against real backend state.
- No `any`, no `@ts-ignore`. `npx tsc --noEmit` green at all times.
- Never block submission persistence on side effects (use `waitUntil`).
- Destructive actions confirm(). Toast on success via ?msg= → data-toast pipeline.
- Do not break: headless POST flow, spam checks, email notify/auto-reply, webhooks fan-out, CSV export, R2 uploads, pagination, auth session.
