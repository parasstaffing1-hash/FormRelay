import type { FC } from "hono/jsx";

/**
 * The sign-in challenge. Deliberately minimal: it is reached only with a valid pending
 * token, shows nothing about the account, and offers no way back except starting over.
 */
export const TwoFactorPage: FC<{ error?: string }> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Two-step verification — FormRelay</title>
    </head>
    <body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f7f7f6;margin:0">
      <main style="background:#fff;padding:32px;border-radius:12px;max-width:380px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <h1 style="font-size:18px;margin:0 0 6px">Two-step verification</h1>
        <p style="color:#5d606b;font-size:14px;margin:0 0 20px">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
        {error ? (
          <p role="alert" style="background:#fdecec;color:#a3232b;font-size:13px;padding:10px 12px;border-radius:8px;margin:0 0 16px">{error}</p>
        ) : null}
        <form method="post" action="/admin/login/2fa">
          <label for="code" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Code</label>
          {/* inputmode numeric brings up a phone keypad; autocomplete lets password managers
              and iOS fill the code straight from the SMS/authenticator suggestion bar. */}
          <input
            id="code"
            name="code"
            autocomplete="one-time-code"
            inputmode="numeric"
            autofocus
            required
            placeholder="123456"
            style="width:100%;padding:10px 12px;font-size:16px;letter-spacing:.12em;border:1px solid rgba(20,21,26,.18);border-radius:8px;box-sizing:border-box"
          />
          <button type="submit" style="width:100%;margin-top:16px;padding:10px 12px;font-size:14px;font-weight:600;color:#fff;background:#15161a;border:0;border-radius:8px;cursor:pointer">
            Verify
          </button>
        </form>
        <p style="margin:18px 0 0;font-size:13px"><a href="/admin/login" style="color:#5d606b">Start over</a></p>
      </main>
    </body>
  </html>
);
