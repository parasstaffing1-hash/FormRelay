# Implementation Plan

Phases follow the governing `SPEC_PLATFORM.md`. Priority: P0 first (reliability), then P1 (competitive parity), then P2 (differentiation).

## Phase 0 — Foundation (DONE)
- Form-definition schema v1 (`blocks` registry, `_labels` submission contract, draft vs published snapshot)
- D1 migrations: `forms` (schema_json/published_json/status/views), `settings_kv`, `api_keys`, `audit_log`
- Test-time note: existing local DBs need the 4 `ALTER TABLE forms ...` statements (documented in `schema.sql` header)

## Phase 1 — Visual forms (DONE)
- **Builder** (`src/pages/builder.tsx`): palette → add/dup/delete/reorder blocks, inline edit panel, settings, Save (form POST), Publish/Unpublish.
- **Public renderer** (`src/pages/public-form.tsx`): schema-driven respondent form, per-field errors, honeypot, custom submit text/success message/redirect; legacy headless fallback preserved.
- **Server-side validation** in submit pipeline via `blocks.ts`.

## Phase 2 — Intelligence & data hygiene (DONE)
- **Analytics**: per-form 30-day bars + views/completion/spam rate/referrers; home 14-day sparkline (`db.ts` aggregates, inline SVG).
- **Retention**: workspace `retention_days` setting + prune endpoint (deletes old submissions + files + spilled R2 objects).
- **Spill-to-R2** for large submission payloads (D1 size guard).

## Phase 3 — API & security layer (DONE)
- **API keys**: create/list/revoke; SHA-256 hash stored, prefix + last4 shown; full key shown once.
- **REST API `/api/v1`**: forms + responses (Bearer-key auth, per-key rate limit, pagination).
- **Audit log**: form.created/published/archived/deleted, key.created/revoked, response.deleted, settings.updated, retention.pruned.

## Phase 4 — Templates & sharing (SHIPPED)
- Added eight editable schema-v2 presets (Contact, Feedback, Job app, RSVP, NPS, Project request, Registration, Consent) in the New-form modal.
- Added validated public slugs, iframe embed snippet, open/close windows, submission limits, one-per-browser protection, closed message, and theme JSON controls.

## Phase 5 — Smart forms (SHIPPED / PARTIAL)
- Added pure schema-v2 conditional evaluator, visual rule editor, show/hide/require/jump/redirect/set-variable actions, publish-time reference validation, safe AST calculations, typed variables, answer piping, page navigation, prefill, autosave, and expiring resume tokens.
- Remaining: multi-condition editing, full conditional endings, repeatable sections, richer client-side calculation updates, and conversational rendering.

## Phase 6 — Workflow & integrations (SHIPPED / PARTIAL)
- Added persisted workflow definitions, trigger conditions, asynchronous execution, run/step history, bounded retries, notification/email/webhook/tag/wait actions, and a management UI.
- Generic outbound webhook actions are available as the first provider adapter; provider-specific Sheets/Airtable/Slack/Discord/HubSpot adapters and update-record mappings remain.
- Responsive iframe embed and ready postMessage event are available; callback SDK, popup, and QR UI remain.

## Phase 7 — Enterprise & differentiation (PLANNED, P2)
- Multi-tenant workspaces + roles/invitations.
- Payments (provider abstraction, Stripe first), e-signatures, appointments.
- Custom domains, PDF generation, AI builder/insights, logic simulator, form health check.
- Cross-isolate rate limiting (Durable Object / KV).

## Verification gate (each phase)
`npx tsc --noEmit` green → wrangler dev smoke (login + affected pages 200 + real action flow) → commit.
