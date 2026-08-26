# Product Gap Analysis

## What FormRelay is today
FormRelay started as a **Formspree-style headless form backend**: point any HTML form at `POST /f/:id`, get spam-filtered, stored submissions with email alerts, signed webhooks, R2 file storage, and a calm Notion-inspired admin dashboard. It runs 100% on Cloudflare's free tier (Workers + D1 + R2 + Resend) — self-hosted, single-password auth.

Over the build it gained a real **visual form system**: a block-based schema (`src/blocks.ts`), a form **builder** (add/reorder/edit/duplicate blocks, publish/unpublish draft snapshots), a **schema-driven public renderer** with server-side validation, **analytics** (30-day bars, views, completion/spam rate, referrers), **retention** with R2 spill to keep D1 small, an **API-key secured REST API**, and an **audit log**.

So FormRelay now competes in BOTH lanes: headless backend (Formspree) and visual forms (Typeform/Tally).

## What a serious form platform requires (competitor lens)
| Dimension | Reference | Present in FormRelay? |
|---|---|---|
| Headless endpoints, spam, email, webhooks | Formspree | **Yes** (strong) |
| Visual block builder + published renderer | Tally/Typeform | **Yes** (core, field types growing) |
| Conditional logic & branching | Typeform | **No** |
| Calculations/variables/piping | Fillout | **No** |
| Multi-page / conversational | Typeform | **No** |
| Partial responses + resume | Typeform | **No** |
| Templates & custom themes | Tally | Partial (no presets yet) |
| Analytics depth (drop-off, question-level) | Tally/SurveyMonkey | Basic (daily bars, funnel stats) |
| Payments / signatures / bookings | Jotform | **No** |
| Workflows / automations / approvals | Jotform | **No** |
| External integrations (Sheets/Airtable/Slack) | Jotform/Zapier | **No** |
| Embedding (iframe/JS/popup) | Typeform | **No** |
| Multi-tenant team workspace + roles | Typeform | **No** |
| REST API + API keys | — | **Yes** (partial) |
| Enterprise: custom domains, PDF, compliance | Formstack | **No** |

## Gap severity
- **P0 (reliability/parity)** — largely DONE. Remaining: field-type breadth, origin allowlist, CSP/security headers, CSRF tokens, cross-isolate rate limiting.
- **P1 (must-have to be competitive)** — conditional logic, multi-page, calculations/piping, partial/resume, templates, integrations, embeddings, multi-tenant roles.
- **P2 (differentiation)** — AI builder, logic simulator, form health check, payment/signature/appointment, offline collection, custom domains.

## How the roadmap closes it
See `IMPLEMENTATION_PLAN.md`. The design deliberately keeps the **headless endpoint + visual form** on one schema and one submit pipeline, so any field type, logic rule, or integration benefits both lanes at once — the core differentiator (Section 65 of the product brief) is already the architecture.
