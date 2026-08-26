import { FC } from "hono/jsx";
import { FormRow, SubmissionRow } from "./types";

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5}
a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid #21262d;background:#010409}
header .brand{font-weight:700;font-size:17px;letter-spacing:.3px}
header nav a{margin-left:18px;font-size:14px}
main{max-width:1000px;margin:32px auto;padding:0 20px}
.card{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:22px;margin-bottom:22px}
h1{font-size:22px;margin:0 0 4px}.sub{color:#8b949e;font-size:13px;margin-bottom:18px}
input[type=text],input[type=password],input[type=email],input[type=url]{width:100%;padding:9px 12px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#e6edf3;font-size:14px}
label{display:block;font-size:12.5px;font-weight:600;color:#8b949e;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.4px}
button,.btn{display:inline-block;padding:8px 15px;background:#238636;border:1px solid #2ea043;border-radius:7px;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#2ea043}
.btn-danger{background:#b62324;border-color:#da3633}.btn-danger:hover{background:#da3633}
.btn-ghost{background:transparent;border-color:#30363d;font-weight:400}.btn-ghost:hover{border-color:#8b949e;background:#21262d}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{ text-align:left;color:#8b949e;font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;border-bottom:1px solid #21262d}
td{padding:9px 10px;border-bottom:1px solid #21262d;vertical-align:top;word-break:break-word}
tr.spam td{opacity:.45}
code{background:#0d1117;border:1px solid #30363d;border-radius:5px;padding:2px 6px;font-size:13px}
.endpoint{display:flex;gap:8px;align-items:center;margin-top:6px}
.endpoint code{flex:1;overflow-x:auto;white-space:nowrap}
.msg{background:#12261e;border:1px solid #1f6f37;color:#56d364;padding:10px 14px;border-radius:8px;margin-bottom:18px;font-size:14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.check{display:flex;gap:8px;align-items:center;margin-top:16px;font-size:14px;color:#e6edf3;text-transform:none}
.check input{width:auto}
pre{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:14px;overflow-x:auto;font-size:13px}
.muted{color:#8b949e;font-size:12.5px}
.row-actions{display:flex;gap:6px;flex-wrap:wrap}
`;

export const Layout: FC<{ title: string; msg?: string; children?: any }> = ({ title, msg, children }) => (
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · FormRelay</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <header>
        <div class="brand">📮 FormRelay</div>
        <nav>
          <a href="/admin">Forms</a>
          <a href="/">Docs</a>
          <a href="/admin/logout">Log out</a>
        </nav>
      </header>
      <main>
        {msg ? <div class="msg">{msg}</div> : null}
        {children}
      </main>
    </body>
  </html>
);

export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <Layout title="Log in">
    <div class="card" style="max-width:380px;margin:60px auto">
      <h1>Log in</h1>
      <p class="sub">Enter the admin password to continue.</p>
      {error ? <p style="color:#f85149;font-size:14px">{error}</p> : null}
      <form method="post" action="/admin/login">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autofocus />
        <div style="margin-top:16px">
          <button type="submit">Sign in</button>
        </div>
      </form>
    </div>
  </Layout>
);

function copyScript(): string {
  return `document.querySelectorAll("[data-copy]").forEach(function(btn){
  btn.addEventListener("click", function(){
    navigator.clipboard.writeText(btn.getAttribute("data-copy"));
    btn.textContent = "Copied!";
    setTimeout(function(){ btn.textContent = "Copy"; }, 1200);
  });
});`;
}

export const FormsPage: FC<{ forms: FormRow[]; origin: string; countFor: Record<string, number> }> = ({
  forms,
  origin,
  countFor,
}) => (
  <Layout title="Forms">
    <h1>Your forms</h1>
    <p class="sub">Create an endpoint, point any HTML form at it — done.</p>

    <div class="card">
      <form method="post" action="/admin/forms" class="endpoint">
        <input type="text" name="name" placeholder="New form name (e.g. Contact form)" required />
        <button type="submit">Create form</button>
      </form>
    </div>

    {forms.map((f) => (
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
          <div>
            <strong>{f.name}</strong>
            <span class="muted" style="margin-left:10px">
              {countFor[f.id] ?? 0} submissions
            </span>
          </div>
          <div class="row-actions">
            <a class="btn btn-ghost" href={`/admin/forms/${f.id}`}>Submissions</a>
            <form method="post" action={`/admin/forms/${f.id}/delete`} onsubmit="return confirm('Delete this form and all its submissions?')">
              <button class="btn-danger" type="submit">Delete</button>
            </form>
          </div>
        </div>
        <label>Endpoint</label>
        <div class="endpoint">
          <code>{`${origin}/f/${f.id}`}</code>
          <button type="button" class="btn-ghost" data-copy={`${origin}/f/${f.id}`}>Copy</button>
        </div>
        <p class="muted" style="margin:10px 0 0">
          Notifications: {f.notify_email || <em>none</em>} · Auto-reply: {f.auto_reply ? "on" : "off"}
          {" · "}
          <a href={`/admin/forms/${f.id}`}>edit settings →</a>
        </p>
      </div>
    ))}

    {forms.length === 0 ? <p class="muted">No forms yet — create your first one above.</p> : null}

    <script dangerouslySetInnerHTML={{ __html: copyScript() }} />
  </Layout>
);

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const SubmissionsPage: FC<{
  form: FormRow;
  subs: SubmissionRow[];
  origin: string;
}> = ({ form, subs, origin }) => {
  const endpoint = `${origin}/f/${form.id}`;
  return (
    <Layout title={form.name}>
      <h1>{form.name}</h1>
      <p class="sub">
        <a href="/admin">← All forms</a> · {subs.length} most recent submissions
      </p>

      <div class="card">
        <label>Endpoint</label>
        <div class="endpoint">
          <code>{endpoint}</code>
          <button type="button" class="btn-ghost" data-copy={endpoint}>Copy</button>
        </div>
        <div class="row-actions" style="margin-top:12px">
          <a class="btn btn-ghost" href={`/admin/forms/${form.id}/export`}>Export CSV</a>
        </div>
      </div>

      <div class="card">
        <h1 style="font-size:17px">Settings</h1>
        <form method="post" action={`/admin/forms/${form.id}/settings`}>
          <div class="grid">
            <div>
              <label for="name">Form name</label>
              <input type="text" id="name" name="name" value={form.name} required />
            </div>
            <div>
              <label for="notify_email">Email notifications to</label>
              <input type="email" id="notify_email" name="notify_email" value={form.notify_email} placeholder="you@example.com" />
            </div>
            <div>
              <label for="redirect_url">Redirect after submit (optional)</label>
              <input type="url" id="redirect_url" name="redirect_url" value={form.redirect_url} placeholder="https://yoursite.com/thanks" />
            </div>
            <div>
              <label class="check">
                <input type="checkbox" name="auto_reply" checked={!!form.auto_reply} />
                Send auto-reply confirmation to the submitter
              </label>
            </div>
          </div>
          <div style="margin-top:16px">
            <button type="submit">Save settings</button>
          </div>
        </form>
      </div>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th style="width:130px">Date</th>
              <th>Data</th>
              <th style="width:190px">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              let parsed: Record<string, string> = {};
              try {
                parsed = JSON.parse(s.data);
              } catch {}
              const entries = Object.entries(parsed);
              return (
                <tr class={s.is_spam ? "spam" : undefined}>
                  <td class="muted">{fmtDate(s.created_at)}</td>
                  <td>
                    {entries.map(([k, v]) => (
                      <div>
                        <span class="muted">{k}: </span>
                        {v}
                      </div>
                    ))}
                    {s.is_spam ? <em style="color:#f0883e;font-size:12px">marked as spam</em> : null}
                  </td>
                  <td>
                    <div class="row-actions">
                      <form method="post" action={`/admin/submissions/${s.id}/spam`}>
                        <input type="hidden" name="form_id" value={form.id} />
                        <input type="hidden" name="is_spam" value={s.is_spam ? "0" : "1"} />
                        <button class="btn-ghost" type="submit">{s.is_spam ? "Not spam" : "Spam"}</button>
                      </form>
                      <form method="post" action={`/admin/submissions/${s.id}/delete`}>
                        <input type="hidden" name="form_id" value={form.id} />
                        <button class="btn-danger" type="submit">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {subs.length === 0 ? <p class="muted">No submissions yet.</p> : null}
      </div>

      <script dangerouslySetInnerHTML={{ __html: copyScript() }} />
    </Layout>
  );
};

export const DocsPage: FC<{ origin: string }> = ({ origin }) => {
  const sampleId = "YOUR_FORM_ID";
  return (
    <Layout title="Docs">
      <h1>FormRelay docs</h1>
      <p class="sub">A free, self-hosted Formspree alternative running on Cloudflare Workers.</p>

      <div class="card">
        <h1 style="font-size:17px">1 · Point your HTML form at your endpoint</h1>
        <pre>{`<form action="${origin}/f/${sampleId}" method="POST">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>

  <!-- honeypot spam trap: keep hidden -->
  <input type="text" name="_gotcha" style="display:none">

  <button type="submit">Send</button>
</form>`}</pre>
        <p class="muted">Works with plain HTML forms, no JavaScript required.</p>
      </div>

      <div class="card">
        <h1 style="font-size:17px">2 · Or submit via fetch / JSON</h1>
        <pre>{`await fetch("${origin}/f/${sampleId}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ada", email: "ada@example.com", message: "Hi!" }),
});`}</pre>
      </div>

      <div class="card">
        <h1 style="font-size:17px">Special fields</h1>
        <table>
          <thead><tr><th>Field</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>_gotcha</code>, <code>_honeypot</code>, <code>_hp</code></td><td>Honeypot spam trap — bots fill it, humans never see it. Submission is silently discarded.</td></tr>
            <tr><td><code>_subject</code></td><td>Custom subject line for notification emails.</td></tr>
            <tr><td><code>_replyto</code></td><td>Reply-to address (also used as auto-reply target).</td></tr>
            <tr><td><code>_redirect</code></td><td>Override the per-form redirect URL for this submission.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h1 style="font-size:17px">Extras</h1>
        <ul>
          <li>Rate limited to {10} submissions/IP/minute.</li>
          <li>Set <code>TURNSTILE_SECRET_KEY</code> to require a Cloudflare Turnstile widget.</li>
          <li>All submissions are stored and viewable in the dashboard even if email fails.</li>
        </ul>
      </div>
    </Layout>
  );
};
