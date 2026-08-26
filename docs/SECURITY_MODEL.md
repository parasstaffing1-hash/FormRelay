# Security Model

## Current controls
- **Auth**: single admin password (env `ADMIN_PASSWORD`) → HMAC-SHA256-signed session cookie `fr_session`, 7-day expiry, `HttpOnly`, `SameSite=Lax`. Session token = `expiry.signature`.
- **Spam**: honeypot fields, per-IP rate limit (10/min), optional Cloudflare Turnstile (server-side verify via `challenges.cloudflare.com`).
- **Webhooks**: per-hook random `whsec_…` secret; every payload carries `X-FormRelay-Signature: sha256=<HMAC-SHA256 of raw body>`; delivered over HTTPS.
- **Files**: randomized R2 keys (`fr/{form}/{uuid}/{name}`), filename sanitized, MIME/size recorded in DB (no trust of browser MIME alone), served as `attachment`.
- **SQL injection**: 100% parameterized statements (`db.prepare(...).bind(...)`).
- **XSS**: JSX auto-escapes all interpolated values; raw HTML only via explicit `dangerouslySetInnerHTML` for trusted CSS/JS strings (audited).
- **Secrets**: `ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` via `wrangler secret put` — never in the bundle or repo (`.dev.vars` excluded by `.gitignore`).
- **IDs**: forms use 10-char unguessable ids `[a-z0-9]` (36^10), submissions autoincrement, API keys `fr_live_` + 32 alnum.

## Threat review checklist
| Threat | Posture | Action |
|---|---|---|
| XSS in stored answers | Escaped on render (JSX) | add CSP header; audit remaining `dangerouslySetInnerHTML` |
| SQL injection | Parameterized everywhere | none |
| IDOR / ID enumeration | Unguessable form/webhook/api ids; doc the residual risk opaquely | add per-owner scope when multi-tenant lands |
| CSRF (cookie sessions) | `SameSite=Lax` mitigates top-level/submit CSRF; state-changing POSTs all POST | add CSRF token on auth'd form posts |
| Upload abuse | Size/type recorded, randomized keys | enforce type allowlist + size cap at ingest |
| Path traversal | R2 keys server-generated; `sanitizeFilename` strips path separators | none |
| SSRF (webhooks) | User-supplied URLs by design; Worker egress to public net only | optional allowlist of internal IPs (Workers has no VPC) |
| Secret leakage | Keys hashed (SHA-256); full key shown once | consider scoped keys; avoid key in URL (currently echoed on create for UX) |
| Rate-limit abuse | In-memory Map per isolate document | move to Durable Object / KV for cross-isolate |
| Forged API/webhook | Bearer key lookup by SHA-256 hash; webhook HMAC verify | none |
| Public form abuse | Captcha optional; rate limit; honeypot | enable Turnstile for high-traffic forms |
| D1 exfiltration via responses | JSON only, auth'd routes | none |

## Hardening backlog (priority order)
1. Cross-isolate rate limiting (Durable Object or KV/`Ratelimiter` binding).
2. CSP + `X-Frame-Options`/`frame-ancestors` + `Referrer-Policy` security headers on all responses.
3. CSRF tokens for authenticated POST routes.
4. Optional per-form allowed-origins (origin allowlist) — currently accept-from-any.
5. File type allowlist + per-field size limits enforced at ingest.
6. Scoped API keys (read vs write) + optional expiry.
7. Encrypt-at-rest notes: D1/R2 encryption is Cloudflare-managed; document for self-hosting.

## Compliance
No GDPR/HIPAA/SOC2 claim is made. Legal compliance requires operational controls beyond source code. Data retention control (`retention_days`) and CSV export support this if a deployment later targets compliance.
