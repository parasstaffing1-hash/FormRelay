# Security Model

## Current controls
- **Auth**: single admin password (env `ADMIN_PASSWORD`) → HMAC-SHA256-signed session cookie `fr_session`, 7-day expiry, `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request arrives over HTTPS. Session token = `expiry.signature`.
- **Password storage**: user passwords are hashed with salted PBKDF2-SHA256 (`pbkdf2$<iterations>$<salt>$<hash>`, 50k iterations, per-password 16-byte salt). Legacy unsalted SHA-256 digests are still accepted and are transparently re-hashed to PBKDF2 on the next successful sign-in. `ADMIN_PASSWORD` is compared in constant time.
- **Sign-in brute force**: failed attempts are recorded per IP in `login_attempts`; 8 failures within 15 minutes lock that IP out for the remainder of the window. Successful sign-in clears the counter.
- **CSRF**: every state-changing request under `/admin/*`, plus the sign-in and invitation-acceptance POSTs, must carry a same-origin `Origin` or `Referer`. A *missing* header is rejected, not allowed — stripping the header is not a bypass. Combined with `SameSite=Lax` this is the CSRF defense.
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
| XSS in stored answers | Escaped on render (JSX); CSP set on every response; JSON inlined into `<script>` has `<` escaped | tighten CSP off `'unsafe-inline'` via nonces |
| CSS injection via form themes | Theme colors/fonts/URLs re-validated at render, not just on save; unrecognised values dropped | none |
| Credential stuffing / brute force | Per-IP sign-in lockout (8 failures / 15 min) backed by D1, so it holds across isolates | none |
| SQL injection | Parameterized everywhere | none |
| IDOR / ID enumeration | Unguessable form/webhook/api ids; doc the residual risk opaquely | add per-owner scope when multi-tenant lands |
| CSRF (cookie sessions) | `SameSite=Lax` + mandatory same-origin `Origin`/`Referer` on all state-changing routes (missing header rejected) | per-request nonce tokens if a future flow needs cross-origin POSTs |
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
