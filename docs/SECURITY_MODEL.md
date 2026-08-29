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
- **XSS**: JSX auto-escapes all interpolated values. `script-src` is `'self'` plus a single SHA-256 hash for the one inline (pre-paint theme) script; all other client JS is served from `/assets/*.js` and no `on*=` handler attributes remain in the markup.
- **Secrets**: `ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` via `wrangler secret put` — never in the bundle or repo (`.dev.vars` excluded by `.gitignore`).
- **IDs**: forms use 10-char unguessable ids `[a-z0-9]` (36^10), submissions autoincrement, API keys `fr_live_` + 32 alnum.

## Threat review checklist
| Threat | Posture | Action |
|---|---|---|
| XSS in stored answers | Escaped on render (JSX); `script-src 'self'` with no `'unsafe-inline'`; JSON inlined into `<script>` has `<` escaped | none |
| CSS injection via form themes | Theme colors/fonts/URLs re-validated at render, not just on save; unrecognised values dropped | none |
| Credential stuffing / brute force | Per-IP sign-in lockout (8 failures / 15 min) backed by D1, so it holds across isolates | none |
| SQL injection | Parameterized everywhere | none |
| IDOR / ID enumeration | Unguessable form/webhook/api ids; doc the residual risk opaquely | add per-owner scope when multi-tenant lands |
| CSRF (cookie sessions) | `SameSite=Lax` + mandatory same-origin `Origin`/`Referer` on all state-changing routes (missing header rejected) | per-request nonce tokens if a future flow needs cross-origin POSTs |
| Upload abuse | Size/type recorded, randomized keys | enforce type allowlist + size cap at ingest |
| Path traversal | R2 keys server-generated; `sanitizeFilename` strips path separators | none |
| SSRF (webhooks) | User-supplied URLs by design; Worker egress to public net only | optional allowlist of internal IPs (Workers has no VPC) |
| Secret leakage | Keys hashed (SHA-256); full key shown once | consider scoped keys; avoid key in URL (currently echoed on create for UX) |
| Rate-limit abuse | Sign-in limiter is D1-backed (cross-isolate); API-key limiter is still an in-memory Map per isolate | move the API-key limiter to Durable Object / KV |
| Forged API/webhook | Bearer key lookup by SHA-256 hash; webhook HMAC verify | none |
| Public form abuse | Captcha optional; rate limit; honeypot | enable Turnstile for high-traffic forms |
| D1 exfiltration via responses | JSON only, auth'd routes | none |

## Hardening backlog (priority order)
1. Cross-isolate rate limiting for the **API-key** limiter (Durable Object or KV/`Ratelimiter`
   binding). The sign-in limiter is already D1-backed and therefore cross-isolate.
2. Drop `'unsafe-inline'` from `style-src`. This needs the inline `style` attributes used
   throughout the UI to move into stylesheet rules; a nonce or hash cannot cover style
   attributes. Lower value than the `script-src` work, since theme-derived values are already
   sanitized and CSS injection is not script execution.
3. Optional per-form allowed-origins for the public submit endpoint — currently accept-from-any by design.
4. Encrypt-at-rest notes: D1/R2 encryption is Cloudflare-managed; document for self-hosting.

### Done in the security pass
- CSP + `X-Frame-Options` + `Referrer-Policy` + `Permissions-Policy` + `nosniff` on all responses,
  plus `base-uri 'self'`, `form-action 'self'`, and `object-src 'none'`.
- **`script-src` reduced to `'self'` + one SHA-256 hash.** All client JS moved to
  `/assets/{app,builder,form-runtime,guards}.js`; the only inline script left is the pre-paint
  theme boot, pinned by hash. Every `on*=` handler attribute was replaced with delegated
  listeners driven by `data-confirm`, `data-autosubmit`, `data-check-all`, and
  `data-require-checked`. Per-form config reaches the public renderer through a
  non-executable `<script type="application/json">` block instead of generated code.
- Same-origin enforcement on all authenticated state-changing routes (missing header rejected).
- Salted PBKDF2 password hashing with transparent migration off unsalted SHA-256.
- Constant-time `ADMIN_PASSWORD` comparison.
- `Secure` cookie flag on HTTPS.
- Per-IP sign-in brute-force lockout.
- Render-time theme sanitization (CSS injection).
- File type allowlist + per-field size limits enforced at ingest.
- Scoped API keys (read vs write) + optional expiry.

## Compliance
No GDPR/HIPAA/SOC2 claim is made. Legal compliance requires operational controls beyond source code. Data retention control (`retention_days`) and CSV export support this if a deployment later targets compliance.
