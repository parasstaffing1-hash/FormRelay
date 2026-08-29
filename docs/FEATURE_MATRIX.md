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
| **Analytics per form** (30d bars, views, completion/spam rate, referrers) | DONE | 5 | Tally | cohort filters and exportable funnels | P1 | db agg, form_events | typecheck ✅ |
| Home 14-day sparkline | DONE | 3 | Jotform | — | P1 | db agg | smoke ✅ |
| Spill large values to R2 (D1 size guard) | DONE | 3 | — | — | P1 | R2 | smoke ✅ |
| Retention policy (auto-prune days) | DONE | 3 | — | scheduled cron | P1 | cron trigger | smoke ✅ |
| **API keys** (create/list/revoke, SHA-256 hash, prefix+last4) | DONE | 5 | — | per-key read/write scope, expiry, and rotation | P1 | schema | typecheck ✅ |
| **REST API `/api/v1`** (forms/responses) | DONE | 4 | — | — | P1 | keys | smoke ✅ |
| Audit log (form/key/response actions) | PARTIAL | 3 | — | cover webhook/integration actions | P2 | schema | partial |
| Templates (preset schemas) | DONE | 4 | Tally | — | P1 | schema | smoke ✅ |
| Webhook HMAC secret rotation / reveal | PARTIAL | 3 | Formspree | — | P2 | — | manual |
| Workspace multi-tenant (members/roles) | PARTIAL | 4 | Typeform | full query-level workspace isolation and owner role enforcement | P1 | users/memberships | smoke ✅ |
| Invitations | DONE | 4 | Typeform | email delivery and invite revocation UI | P1 | memberships | smoke ✅ |
| Conditional logic engine | PARTIAL | 3 | Typeform | multi-condition UI, richer validation | P1 | schema v2 | smoke ✅ |
| Logic simulator / map view | NOT IMPLEMENTED | — | Typeform | — | P2 | logic | — |
| Calculations & variables | PARTIAL | 3 | Fillout | client recalculation and richer types | P1 | schema v2 | typecheck ✅ |
| Answer piping (`{{value}}`) | DONE | 3 | Typeform | — | P1 | schema v2 | smoke ✅ |
| Multi-page / page-break forms | DONE | 3 | Typeform | — | P1 | schema v2 | smoke ✅ |
| Conversational (one-question-at-a-time) | DONE | 4 | Typeform | keyboard-focused next-step validation | P1 | schema v2 | typecheck ✅ |
| Partial responses / autosave | PARTIAL | 3 | Typeform | server-side validation during autosave | P1 | sessions | smoke ✅ |
| Save & resume (continue later) | DONE | 3 | Typeform | — | P1 | sessions | smoke ✅ |
| Prefill via URL params | DONE | 3 | Typeform | — | P1 | schema v2 | smoke ✅ |
| Multiple endings / conditional endings | DONE | 4 | Typeform | conditional-ending editor with condition groups | P1 | schema v2 | typecheck ✅ |
| Repeating sections / subforms | NOT IMPLEMENTED | — | Jotform | — | P2 | schema v2 | — |
| Skip logic / disqualification | PARTIAL | 4 | Typeform | richer page skipping and disqualified analytics | P1 | logic | typecheck ✅ |
| Custom themes / branding | DONE | 3 | Tally | font selector and hosted asset picker | P1 | schema | smoke ✅ |
| Multilingual forms (no clone) | NOT IMPLEMENTED | — | Typeform | translation layer over IDs | P2 | schema v2 | — |
| Randomization / question pools | NOT IMPLEMENTED | — | SurveyMonkey | — | P2 | schema v2 | — |
| Quizzes & scoring | NOT IMPLEMENTED | — | Typeform | points + outcomes | P2 | calc | — |
| Payments (Stripe-style provider) | NOT IMPLEMENTED | — | Jotform | provider abstraction | P1 | — | — |
| E-signatures | NOT IMPLEMENTED | — | Cognito | — | P2 | — | — |
| Appointments / booking fields | NOT IMPLEMENTED | — | Jotform | availability + calendars | P2 | — | — |
| Workflows automation engine | DONE | 4 | Jotform | multi-step visual editor and durable queued jobs | P1 | schema v2 | typecheck ✅ |
| Approvals | NOT IMPLEMENTED | — | Formstack | — | P2 | workflow | — |
| Integrations (Sheets/Airtable/Slack/Terminal) | PARTIAL | 4 | Jotform | OAuth credential vault, native record updates, Terminal app | P1 | workflow | typecheck ✅ |
| Embedding (iframe/JS API/popup) | DONE | 4 | Typeform | postMessage origin allowlist and hosted SDK docs | P1 | schema v2 | typecheck ✅ |
| Custom domains | NOT IMPLEMENTED | — | Typeform | hostname→form map | P2 | — | — |
| Form sharing/public URL + slug | DONE | 4 | Tally | — | P1 | schema | smoke ✅ |
| QR codes, closed dates, submission limits | PARTIAL | 3 | Typeform | QR rendering | P2 | schema | smoke ✅ |
| PDF / document generation | NOT IMPLEMENTED | — | Formstack | template engine | P2 | — | — |
| XLSX / JSON export | PARTIAL | 4 | Jotform | XLSX export and streamed large exports | P2 | — | typecheck ✅ |
| Global search (forms/subs) | PARTIAL | 2 | Jotform | form name search only | P1 | — | partial |
| Add-custom tags / notes / status on responses | DONE | 4 | Jotform | saved views and bulk editing | P2 | schema | typecheck ✅ |
| Saved views / bulk select / bulk actions | PARTIAL | 5 | Jotform | persisted saved views and cross-page bulk selection | P2 | submissions | typecheck ✅ |
| Response editing | PARTIAL | 4 | Jotform | field-value editing with full revision snapshots | P2 | schema | typecheck ✅ |
| Form health check (pre-publish) | DONE | 4 | — | deeper accessibility scan | P2 | schema | smoke ✅ |
| Notifications center (in-app) | DONE | 4 | Jotform | per-user notification preferences | P2 | notifications | smoke ✅ |
| Version history restore | DONE | 5 | Typeform | diff view and named releases | P2 | form_versions | typecheck ✅ |
| AI features (prompt→form, suggestions) | NOT IMPLEMENTED | — | Fillout | provider-agnostic AI | P2 | — | — |
| Offline collection (PWA) | NOT IMPLEMENTED | — | — | — | P2 | — | — |
| Rate limit (API keys) | PARTIAL | 3 | — | cross-isolate (DO/KV) | P2 | Durable Object | — |
| CSRF protections | DONE | 4 | — | nonce tokens only if a cross-origin POST flow is added | P0 | — | smoke ✅ |
| XSS hardening | DONE | 5 | — | `style-src` still needs `'unsafe-inline'` for inline style attributes | P0 | — | smoke ✅ |
| Password hashing (salted PBKDF2) | DONE | 5 | — | — | P0 | — | unit ✅ |
| Sign-in brute-force lockout | DONE | 4 | — | — | P0 | — | smoke ✅ |
| Theme CSS-injection sanitization | DONE | 5 | — | — | P0 | — | smoke ✅ |
