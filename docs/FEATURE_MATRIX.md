# Feature Matrix

Legend — **DONE** = UI works + backend works + data persists + errors handled + verified. **PARTIAL** = some real functionality but incomplete. **NOT IMPLEMENTED** = none (UI placeholders don't count). Quality: 1 (rough) → 5 (polished).

| Feature | Status | Quality | Competitor ref | Required work | Priority | Dependencies | Test status |
|---|---|---|---|---|---|---|---|
| Headless form endpoints (`POST /f/:id`) | DONE | 5 | Formspree | — (existing) | P0 | — | smoke ✅ |
| HTML form-encoded + JSON submission | DONE | 5 | Formspree | — (existing) | P0 | — | smoke ✅ |
| Multipart file submission | DONE | 4 | Jotform | — | P0 | R2 binding | smoke ✅ |
| Spam: honeypot | DONE | 5 | Formspree | — | P0 | — | unit ✅ |
| Spam: per-IP rate limit (10/min) | DONE | 5 | Formspree | — | P0 | — | unit ✅ |
| Spam: Cloudflare Turnstile (optional) | DONE | 4 | Formspree | — | P0 | Turnstile secret | config |
| Email notification (owner) | DONE | 4 | Formspree | — | P0 | Resend key | config |
| Auto-reply to submitter | DONE | 4 | Tally | — | P0 | Resend key | config |
| Webhooks: signed HMAC delivery | DONE | 5 | Formspree | — | P0 | — | smoke ✅ |
| Webhooks: delivery history + retry-on-fail statuses | DONE | 4 | Formspree | — (log exists) | P1 | — | smoke ✅ |
| Webhooks: test send | DONE | 4 | Formspree | — | P1 | — | smoke ✅ |
| Submissions inbox (global + per form) | DONE | 5 | Jotform | — | P0 | — | smoke ✅ |
| Submission detail view (+ metadata, raw JSON) | DONE | 5 | Jotform | — | P0 | — | smoke ✅ |
| CSV export per form | DONE | 4 | Formstack | — | P0 | — | smoke ✅ |
| Submission pagination (25/page) | DONE | 5 | Jotform | — | P1 | — | smoke ✅ |
| Forms CRUD (create/rename/dup/archive/delete) | DONE | 5 | Jotform | — | P0 | — | smoke ✅ |
| Dark mode | DONE | 5 | Notion | — | P1 | — | manual |
| R2 file uploads (storage + meter + download/delete) | DONE | 4 | Formstack | — | P0 | R2 binding | smoke ✅ |
| Auth: password session (HMAC cookie 7d) | DONE | 4 | — | — | P0 | — | smoke ✅ |
| **Visual form builder (draft/publish)** | DONE | 4 | Tally/Typeform | field-type coverage | P0 | schema, blocks | smoke ✅ |
| Public form renderer (schema-driven) | DONE | 4 | Typeform/Tally | advanced field types | P0 | schema | smoke ✅ |
| Server-side field validation (as renderer) | DONE | 4 | Typeform | client-side parity | P0 | blocks | smoke ✅ |
| Form versioning (draft vs published snapshot) | DONE | 3 | Typeform | version history UI | P1 | schema | smoke ✅ |
| **Analytics per form** (30d bars, views, completion/spam rate, referrers) | DONE | 4 | Tally | — | P1 | db agg | smoke ✅ |
| Home 14-day sparkline | DONE | 3 | Jotform | — | P1 | db agg | smoke ✅ |
| Spill large values to R2 (D1 size guard) | DONE | 3 | — | — | P1 | R2 | smoke ✅ |
| Retention policy (auto-prune days) | DONE | 3 | — | scheduled cron | P1 | cron trigger | smoke ✅ |
| **API keys** (create/list/revoke, SHA-256 hash, prefix+last4) | DONE | 4 | — | — | P1 | schema | smoke ✅ |
| **REST API `/api/v1`** (forms/responses) | DONE | 4 | — | — | P1 | keys | smoke ✅ |
| Audit log (form/key/response actions) | PARTIAL | 3 | — | cover webhook/integration actions | P2 | schema | partial |
| Templates (preset schemas) | PARTIAL | 2 | Tally | seed real presets in UI | P1 | schema | none |
| Webhook HMAC secret rotation / reveal | PARTIAL | 3 | Formspree | — | P2 | — | manual |
| Workspace multi-tenant (members/roles) | NOT IMPLEMENTED | — | Typeform | full RBAC | P1 | users table | — |
| Invitations | NOT IMPLEMENTED | — | Typeform | invite flow | P1 | memberships | — |
| Conditional logic engine | NOT IMPLEMENTED | — | Typeform | rules engine | P1 | schema v2 | — |
| Logic simulator / map view | NOT IMPLEMENTED | — | Typeform | — | P2 | logic | — |
| Calculations & variables | NOT IMPLEMENTED | — | Fillout | formula parser (sandboxed) | P1 | schema v2 | — |
| Answer piping (`{{value}}`) | NOT IMPLEMENTED | — | Typeform | pipe resolver | P1 | schema v2 | — |
| Multi-page / page-break forms | NOT IMPLEMENTED | — | Typeform | page blocks | P1 | schema v2 | — |
| Conversational (one-question-at-a-time) | NOT IMPLEMENTED | — | Typeform | — | P1 | schema v2 | — |
| Partial responses / autosave | NOT IMPLEMENTED | — | Typeform | resume tokens | P1 | sessions | — |
| Save & resume (continue later) | NOT IMPLEMENTED | — | Typeform | resume tokens + expiry | P1 | sessions | — |
| Prefill via URL params | NOT IMPLEMENTED | — | Typeform | prefill resolver | P1 | schema v2 | — |
| Multiple endings / conditional endings | NOT IMPLEMENTED | — | Typeform | — | P1 | schema v2 | — |
| Repeating sections / subforms | NOT IMPLEMENTED | — | Jotform | — | P2 | schema v2 | — |
| Skip logic / disqualification | NOT IMPLEMENTED | — | Typeform | — | P1 | logic | — |
| Custom themes / branding | NOT IMPLEMENTED | — | Tally | theme engine | P1 | schema | — |
| Multilingual forms (no clone) | NOT IMPLEMENTED | — | Typeform | translation layer over IDs | P2 | schema v2 | — |
| Randomization / question pools | NOT IMPLEMENTED | — | SurveyMonkey | — | P2 | schema v2 | — |
| Quizzes & scoring | NOT IMPLEMENTED | — | Typeform | points + outcomes | P2 | calc | — |
| Payments (Stripe-style provider) | NOT IMPLEMENTED | — | Jotform | provider abstraction | P1 | — | — |
| E-signatures | NOT IMPLEMENTED | — | Cognito | — | P2 | — | — |
| Appointments / booking fields | NOT IMPLEMENTED | — | Jotform | availability + calendars | P2 | — | — |
| Workflows automation engine | NOT IMPLEMENTED | — | Jotform | triggers/actions + runs | P1 | schema v2 | — |
| Approvals | NOT IMPLEMENTED | — | Formstack | — | P2 | workflow | — |
| Integrations (Sheets/Airtable/Slack/Terminal) | NOT IMPLEMENTED | — | Jotform | providers + field mapping | P1 | — | — |
| Embedding (iframe/JS API/popup) | NOT IMPLEMENTED | — | Typeform | embed SDK | P1 | — | — |
| Custom domains | NOT IMPLEMENTED | — | Typeform | hostname→form map | P2 | — | — |
| Form sharing/public URL + slug | NOT IMPLEMENTED | — | Tally | slug field | P1 | schema | — |
| QR codes, closed dates, submission limits | NOT IMPLEMENTED | — | Typeform | — | P2 | schema | — |
| PDF / document generation | NOT IMPLEMENTED | — | Formstack | template engine | P2 | — | — |
| XLSX / JSON export | PARTIAL | 3 | Jotform | JSON via API only | P2 | — | — |
| Global search (forms/subs) | PARTIAL | 2 | Jotform | form name search only | P1 | — | partial |
| Add-custom tags / notes / status on responses | NOT IMPLEMENTED | — | Jotform | — | P2 | schema | — |
| Saved views / bulk select / bulk actions | NOT IMPLEMENTED | — | Jotform | — | P2 | — | — |
| Response editing | NOT IMPLEMENTED | — | Jotform | audit trail | P2 | — | — |
| Form health check (pre-publish) | NOT IMPLEMENTED | — | — | validator | P2 | schema | — |
| Notifications center (in-app) | NOT IMPLEMENTED | — | Jotform | — | P2 | — | — |
| Version history restore | PARTIAL | 2 | Typeform | snapshots UI | P2 | schema | none |
| AI features (prompt→form, suggestions) | NOT IMPLEMENTED | — | Fillout | provider-agnostic AI | P2 | — | — |
| Offline collection (PWA) | NOT IMPLEMENTED | — | — | — | P2 | — | — |
| Rate limit (API keys) | PARTIAL | 3 | — | cross-isolate (DO/KV) | P2 | Durable Object | — |
| CSRF protections | PARTIAL | 3 | — | audit + tokens | P0 | — | — |
| XSS hardening | PARTIAL | 4 | — | JSX auto-escape ✅; review raw `dangerouslySetInnerHTML` | P0 | — | manual |
