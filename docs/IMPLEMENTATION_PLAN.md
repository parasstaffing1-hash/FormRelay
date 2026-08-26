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

## Phase 4 — Templates & sharing (PLANNED)
- Seed 6 real preset schemas (Contact, Feedback, Job app, RSVP, NPS, Project request) in the New-form modal.
- Public URL slugs, share/embed affordances.

## Phase 5 — Smart forms (PLANNED, P1)
- Conditional logic engine (rules, AND/OR groups, actions: show/hide/require/jump).
- Variables + sandboxed calculations + answer piping.
- Multi-page + page-break blocks; multiple/conditional endings.
- Partial responses + save/resume tokens + prefill.

## Phase 6 — Workflow & integrations (PLANNED, P1)
- Visual workflow engine (triggers/conditions/actions, run history, retry/replay).
- Integrations: Google Sheets / Airtable / Slack / Discord / HubSpot (provider adapters, field mapping, update-record support).
- Embedded forms (iframe + JS API + popup), QR, close dates.

## Phase 7 — Enterprise & differentiation (PLANNED, P2)
- Multi-tenant workspaces + roles/invitations.
- Payments (provider abstraction, Stripe first), e-signatures, appointments.
- Custom domains, PDF generation, AI builder/insights, logic simulator, form health check.
- Cross-isolate rate limiting (Durable Object / KV).

## Verification gate (each phase)
`npx tsc --noEmit` green → wrangler dev smoke (login + affected pages 200 + real action flow) → commit.
