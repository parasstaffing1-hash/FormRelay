import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead, Button, EmptyState, UsageMeter } from "../ui/components";
import {
  IconZap, IconFile, IconLogo, IconAlert,
} from "../ui/icons";
import { FormRow, FormWithStats, DashboardStats } from "../types";

/* ================= workflows (coming soon) ================= */

export const WorkflowsPage: FC<{
  path: string;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, toastMsg, commands, formCount, submissionCount }) => (
  <AppShell path={path} crumbs={[{ label: "Workflows" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
    <PageHead title="Workflows" sub="Route and act on submissions automatically." />
    <EmptyState
      icon={<IconZap size={20} />}
      title="Workflows are coming soon"
      desc="Rule-based automation — when a submission arrives, run actions like notifications, webhooks, or tags. No fake runs are shown here."
    />
    <div style="max-width:560px;margin:8px auto 0">
      <p class="small t2 mb16 muted" style="text-align:center">Planned structure:</p>
      <div class="rule-step"><span class="rule-kw">When</span><span class="rule-chip">New submission</span></div>
      <div class="rule-step"><span class="rule-kw">From</span><span class="rule-chip">Contact form</span></div>
      <div class="rule-step"><span class="rule-kw">Then</span>
        <span class="rule-chip">Send notification</span>
        <span class="rule-chip">Send webhook</span>
      </div>
    </div>
  </AppShell>
);

/* ================= files (coming soon) ================= */

export const FilesPage: FC<{
  path: string;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, toastMsg, commands, formCount, submissionCount }) => (
  <AppShell path={path} crumbs={[{ label: "Files" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
    <PageHead title="Files" sub="Attachments uploaded through your forms." />
    <div class="mb24" style="max-width:420px">
      <UsageMeter label="Storage" used="0 MB" total="1 GB" pct={0} />
    </div>
    <EmptyState
      icon={<IconFile size={20} />}
      title="No files yet"
      desc="File uploads are coming soon. Until then, submissions store field data only."
    />
  </AppShell>
);

/* ================= settings ================= */

const SECTIONS = [
  { key: "general", label: "General" },
  { key: "members", label: "Members" },
  { key: "domains", label: "Domains" },
  { key: "api", label: "API keys" },
  { key: "notifications", label: "Notifications" },
  { key: "billing", label: "Billing" },
  { key: "security", label: "Security" },
] as const;

export type SettingsSection = (typeof SECTIONS)[number]["key"];

export const SettingsPage: FC<{
  path: string;
  section: SettingsSection;
  workspaceName: string;
  stats: DashboardStats;
  formsWithNotify: FormRow[];
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, section, workspaceName, stats, formsWithNotify, toastMsg, commands, formCount, submissionCount }) => {
  const active = SECTIONS.some((s) => s.key === section) ? section : "general";

  return (
    <AppShell path={path} crumbs={[{ label: "Settings" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
      <PageHead title="Settings" sub="Workspace preferences." />

      <div class="settings-wrap">
        <nav class="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a href={`/admin/settings?section=${s.key}`} class={active === s.key ? "active" : ""}>{s.label}</a>
          ))}
        </nav>

        <div style="flex:1;min-width:0">
          {active === "general" ? (
            <div class="setsec">
              <h2>Workspace</h2>
              <p class="desc">Identity for this FormRelay installation.</p>
              <div class="kv">
                <span class="k">Workspace name</span>
                <span>{workspaceName}</span>
              </div>
              <div class="kv">
                <span class="k">Deployment</span>
                <span>Cloudflare Workers · global edge</span>
              </div>
              <p class="hint small t2 mt16">
                Set the workspace name with the <code class="mono">WORKSPACE_NAME</code> variable in your Worker config.
              </p>
            </div>
          ) : null}

          {active === "members" ? (
            <div class="setsec">
              <h2>Members</h2>
              <p class="desc">Invite teammates to this workspace.</p>
              <EmptyState
                icon={<IconZap size={18} />}
                title="Team access is coming soon"
                desc="FormRelay currently uses a single shared admin password. Per-user accounts are on the roadmap."
              />
            </div>
          ) : null}

          {active === "domains" ? (
            <div class="setsec">
              <h2>Allowed domains</h2>
              <p class="desc">Restrict which sites may POST to your endpoints.</p>
              <EmptyState
                icon={<IconGlobeish />}
                title="Origin restrictions are coming soon"
                desc="Endpoints currently accept submissions from any origin. Rate limiting and spam checks remain active."
              />
            </div>
          ) : null}

          {active === "api" ? (
            <div class="setsec">
              <h2>API keys</h2>
              <p class="desc">Programmatic access to the dashboard API.</p>
              <EmptyState
                icon={<IconKeyish />}
                title="Dashboard API keys are coming soon"
                desc="Your public form endpoints need no keys — that's the point. Management APIs are on the roadmap."
              />
            </div>
          ) : null}

          {active === "notifications" ? (
            <div class="setsec">
              <h2>Email notifications</h2>
              <p class="desc">Notification addresses are configured per form.</p>
              {formsWithNotify.length ? (
                <div class="card">
                  {formsWithNotify.map((f) => (
                    <a class="list-item between" href={`/admin/forms/${f.id}?tab=notifications`}>
                      <span class="cell-main">{f.name}</span>
                      <span class="t2 small truncate" style="max-width:220px">{f.notify_email || "Not set"}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p class="t2 small">Create a form first.</p>
              )}
              <p class="hint small t2 mt16">
                Delivery requires the <code class="mono">RESEND_API_KEY</code> secret. Submissions are stored even when email fails.
              </p>
            </div>
          ) : null}

          {active === "billing" ? (
            <div class="setsec">
              <h2>Billing</h2>
              <p class="desc">FormRelay is self-hosted open source — there is nothing to pay here.</p>
              <div class="kv"><span class="k">Plan</span><span class="badge badge-success"><span class="dot"></span>Self-hosted</span></div>
              <div class="kv"><span class="k">Forms</span><span>{stats.form_count}</span></div>
              <div class="kv"><span class="k">Submissions all-time</span><span>{stats.submission_count}</span></div>
              <p class="hint small t2 mt16">
                You pay Cloudflare directly for Workers + D1 usage; their free tiers cover most hobby traffic.
              </p>
            </div>
          ) : null}

          {active === "security" ? (
            <div class="setsec">
              <h2>Security</h2>
              <p class="desc">How this dashboard protects itself.</p>
              <div class="kv"><span class="k">Authentication</span><span>Shared admin password → signed HMAC session cookie (7 days)</span></div>
              <div class="kv"><span class="k">Spam protection</span><span>Honeypot fields, per-IP rate limiting, optional Turnstile</span></div>
              <div class="kv"><span class="k">Webhook integrity</span><span>HMAC-SHA256 signatures per webhook secret</span></div>
              <p class="hint small t2 mt16">
                Rotate credentials with <code class="mono">wrangler secret put ADMIN_PASSWORD</code>. Sessions invalidate automatically.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
};

function IconGlobeish() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </svg>
  );
}

function IconKeyish() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

/* ================= login ================= */

export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Log in · FormRelay</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
    </head>
    <body>
      <div class="auth-body">
        <div class="auth-card">
          <div class="auth-brand bigmark">
            <IconLogo size={34} />
            <span class="wordmark">FormRelay</span>
          </div>
          <div class="auth-panel">
            <h1 style="font-size:17px;text-align:center;margin-bottom:4px">Log in to your workspace</h1>
            <p class="t2 small" style="text-align:center;margin-bottom:18px">Enter your admin password.</p>
            {error ? (
              <div class="callout mb16" style="background:var(--danger-bg);border-color:rgba(196,69,61,.25)">
                <IconAlert size={15} />
                <div>{error}</div>
              </div>
            ) : null}
            <form method="post" action="/admin/login">
              <input
                class="input"
                type="password"
                name="password"
                placeholder="Password"
                required
                autofocus
                aria-label="Admin password"
                style="height:38px;margin-bottom:12px"
              />
              <button class="btn btn-primary" type="submit" style="width:100%;height:38px">Sign in</button>
            </form>
          </div>
          <p class="muted small mt16" style="text-align:center">Forms in. Data anywhere.</p>
        </div>
      </div>
    </body>
  </html>
);

const AUTH_CSS = String.raw`
body{margin:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f5;color:#37352f;-webkit-font-smoothing:antialiased}
.auth-body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.bigmark{display:inline-flex;align-items:center;gap:10px}
.wordmark{font-weight:650;font-size:17px;letter-spacing:-.01em}
.auth-card{width:100%;max-width:340px}
.auth-panel{background:#fff;border:1px solid #e9e9e7;border-radius:10px;padding:26px 24px;box-shadow:0 1px 2px rgba(15,15,15,.05)}
.callout{display:flex;gap:10px;padding:10px 13px;border-radius:7px;font-size:13px;border:1px solid transparent;margin-bottom:16px}
.input{width:100%;height:36px;padding:0 10px;border:1px solid #dededb;border-radius:6px;font:inherit;font-size:14px;box-sizing:border-box}
.input:focus{outline:none;border-color:#2383e2;box-shadow:0 0 0 2.5px rgba(35,131,226,.18)}
.btn-primary{background:#2383e2;color:#fff;border:none;border-radius:6px;font:inherit;font-size:13.5px;font-weight:550;cursor:pointer;padding:0 14px;height:38px}
.btn-primary:hover{background:#1b74ca}
.mt16{margin-top:16px}.mb16{margin-bottom:16px}
.t2{color:#787774}.muted{color:#9b9a97}
.small{font-size:13px}
`;

/* ================= public landing ================= */

export const LandingPage: FC<{ origin: string }> = ({ origin }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>FormRelay — Forms in. Data anywhere.</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: LAND_CSS }} />
    </head>
    <body>
      <header class="lnav">
        <div class="bigmark">
          <span class="logo-mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5"/><path d="M6 12.5v5.5h12v-5.5"/><path d="M9.5 15h5"/></svg></span>
          <span class="wordmark">FormRelay</span>
        </div>
        <a class="btn-secondary" href="/admin">Open dashboard</a>
      </header>

      <main class="land">
        <h1>Forms in.<br />Data anywhere.</h1>
        <p class="tagline">
          A free, self-hosted form backend. Point any HTML form at an endpoint — get spam-filtered
          submissions, email notifications, webhooks, and CSV export. Your data stays yours.
        </p>
        <div class="land-actions">
          <a class="btn-primary" href="/admin">Create a form</a>
          <a class="btn-secondary" href="#quickstart">See it work</a>
        </div>

        <section id="quickstart" class="land-code">
          <pre>{`<form action="${origin}/f/XXXXXX" method="POST">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>

  <!-- honeypot spam trap -->
  <input type="text" name="_gotcha" style="display:none">

  <button>Send</button>
</form>`}</pre>
        </section>

        <section class="feats">
          <div class="feat">
            <h3>Endpoints, not plumbing</h3>
            <p>Create a form, copy one URL, paste it into any HTML — no server code anywhere.</p>
          </div>
          <div class="feat">
            <h3>Spam stays out</h3>
            <p>Honeypot traps, per-IP rate limiting, and optional Cloudflare Turnstile — built in.</p>
          </div>
          <div class="feat">
            <h3>Data goes anywhere</h3>
            <p>Email notifications, signed webhooks, JSON API, CSV export. Runs entirely on Cloudflare's free tier.</p>
          </div>
        </section>
      </main>

      <footer class="lfoot">FormRelay — self-hosted, MIT-spirited, quietly powerful.</footer>
    </body>
  </html>
);

const LAND_CSS = String.raw`
body{margin:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#37352f;-webkit-font-smoothing:antialiased;line-height:1.55}
.lnav{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 28px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px);border-bottom:1px solid #e9e9e7;z-index:10}
.logo-mark{width:26px;height:26px;border-radius:6px;background:#37352f;color:#fff;display:inline-flex;align-items:center;justify-content:center}
.wordmark{font-weight:650;font-size:15px}
.land{max-width:800px;margin:0 auto;padding:130px 24px 40px;text-align:center}
.land h1{font-size:46px;font-weight:700;letter-spacing:-.03em;line-height:1.08;margin:0}
.tagline{font-size:16.5px;color:#787774;max-width:560px;margin:18px auto 30px}
.land-actions{display:flex;gap:10px;justify-content:center;margin-bottom:44px}
.btn-primary{background:#2383e2;color:#fff;border:none;border-radius:6px;font:inherit;font-size:14px;font-weight:550;padding:9px 18px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-primary:hover{background:#1b74ca}
.btn-secondary{background:#fff;border:1px solid #dededb;color:#37352f;border-radius:6px;font:inherit;font-size:14px;font-weight:500;padding:8px 16px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-secondary:hover{background:#f7f7f5}
.land-code pre{text-align:left;background:#f7f7f5;border:1px solid #e9e9e7;border-radius:10px;padding:22px 26px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.8px;line-height:1.65;overflow-x:auto}
.feats{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:28px;text-align:left;margin-top:56px}
.feat h3{font-size:14.5px;margin:0 0 6px}
.feat p{font-size:13.5px;color:#787774;margin:0}
.lfoot{text-align:center;color:#9b9a97;font-size:12.5px;padding:32px 16px 48px}
`;
