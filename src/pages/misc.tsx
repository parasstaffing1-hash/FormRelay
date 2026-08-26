import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead, Button, EmptyState, UsageMeter, CopyButton } from "../ui/components";
import {
  IconZap, IconFile, IconLogo, IconAlert,
} from "../ui/icons";
import { FormRow, FormWithStats, DashboardStats, FileWithContext, ApiKeyRow, WorkflowRow, WorkflowRunRow, UserRow } from "../types";
import { fmtBytes, fmtDateTime, fmtNumber } from "../util";
import { FILES_PAGE_SIZE } from "../files";

/* ================= workflows ================= */

export const WorkflowsPage: FC<{
  path: string;
  workflows: WorkflowRow[];
  forms: FormRow[];
  runs: Record<string, WorkflowRunRow[]>;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, workflows, forms, runs, toastMsg, commands, formCount, submissionCount }) => (
  <AppShell path={path} crumbs={[{ label: "Workflows" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
    <PageHead title="Workflows" sub="Run real actions after submissions are persisted." />
    <div class="card mb16" style="max-width:820px">
      <div class="card-h">Create workflow</div>
      <div class="card-b">
        <form method="post" action="/admin/workflows" class="grid2">
          <div class="field"><label for="wf-name">Name</label><input class="input" id="wf-name" name="name" placeholder="Notify sales" required /></div>
          <div class="field"><label for="wf-form">Form</label><select class="select" id="wf-form" name="form_id"><option value="">All forms</option>{forms.map((form) => <option value={form.id}>{form.name}</option>)}</select></div>
          <div class="field"><label for="wf-trigger">When</label><select class="select" id="wf-trigger" name="trigger"><option value="submission.completed">Submission completed</option><option value="submission.partial">Submission saved</option><option value="response.updated">Response updated</option></select></div>
          <div class="field"><label for="wf-field">If field (optional)</label><input class="input" id="wf-field" name="condition_field" placeholder="e.g. topic" /></div>
          <div class="field"><label for="wf-op">Condition</label><select class="select" id="wf-op" name="condition_operator"><option value="equals">equals</option><option value="not_equals">does not equal</option><option value="contains">contains</option><option value="gt">greater than</option><option value="lt">less than</option><option value="is_not_empty">is not empty</option></select></div>
          <div class="field"><label for="wf-value">Condition value</label><input class="input" id="wf-value" name="condition_value" placeholder="Optional value" /></div>
          <div class="field"><label for="wf-action">Then</label><select class="select" id="wf-action" name="action_type"><option value="notify">Send notification</option><option value="email">Send email</option><option value="webhook">Send webhook</option><option value="add_tag">Add tag</option><option value="wait">Wait</option><option value="integration">Provider integration</option></select></div>
          <div class="field"><label for="wf-url">Action URL / recipient</label><input class="input" id="wf-url" name="action_url" placeholder="https://... or email" /></div>
          <div class="field"><label for="wf-action-value">Action value</label><input class="input" id="wf-action-value" name="action_value" placeholder="Tag or delay in ms" /></div><div class="field"><label for="wf-provider">Provider</label><select class="select" id="wf-provider" name="integration_provider"><option value="webhook">Generic JSON webhook</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option><option value="airtable">Airtable automation webhook</option><option value="google_sheets">Google Sheets automation webhook</option></select></div>
          <div class="flex" style="align-items:flex-end"><Button variant="primary" type="submit">Create workflow</Button></div>
        </form>
      </div>
    </div>
    {workflows.length ? workflows.map((workflow) => <div class="card mb16" style="max-width:820px"><div class="card-h flex between"><span><strong>{workflow.name}</strong> <span class="badge badge-neutral">{workflow.trigger}</span></span><span class="flex gap8"><form method="post" action={`/admin/workflows/${workflow.id}/toggle`}><Button type="submit">{workflow.active ? "Pause" : "Resume"}</Button></form><form method="post" action={`/admin/workflows/${workflow.id}/delete`} onsubmit="return confirm('Delete this workflow and its run history?')"><Button variant="danger" type="submit">Delete</Button></form></span></div><div class="card-b"><p class="small t2">Scope: {workflow.form_id ? (forms.find((form) => form.id === workflow.form_id)?.name ?? workflow.form_id) : "All forms"} · Status: {workflow.active ? "active" : "paused"}</p><h3 class="small" style="margin:16px 0 8px">Recent runs</h3>{(runs[workflow.id] ?? []).length ? <table class="tbl"><thead><tr><th>Run</th><th>Status</th><th>Started</th><th>Error</th><th></th></tr></thead><tbody>{(runs[workflow.id] ?? []).map((run) => <tr><td class="mono small">{run.id}</td><td>{run.status}</td><td>{fmtDateTime(run.started_at)}</td><td class="small t2">{run.error || "—"}</td><td>{run.submission_id ? <form method="post" action={`/admin/workflows/${workflow.id}/replay`}><input type="hidden" name="submission_id" value={run.submission_id} /><button class="btn btn-secondary btn-sm" type="submit">Replay</button></form> : "—"}</td></tr>)}</tbody></table> : <p class="small t2">No runs yet. A run is created only when a matching submission arrives.</p>}</div></div>) : <EmptyState icon={<IconZap size={20} />} title="No workflows" desc="Create a rule above. Actions run after submission persistence and record success or failure." />}
  </AppShell>
);

/* ================= files ================= */

const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024;

const R2_SETUP_SNIPPET = `npx wrangler r2 bucket create formrelay-files

# then in wrangler.toml:
# [[r2_buckets]]
# binding = "FILES"
# bucket_name = "formrelay-files"

npx wrangler deploy`;

export const FilesPage: FC<{
  path: string;
  files: FileWithContext[];
  total: number;
  page: number;
  storageUsed: number;
  hasR2: boolean;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, files, total, page, storageUsed, hasR2, toastMsg, commands, formCount, submissionCount }) => {
  const rangeStart = (page - 1) * FILES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * FILES_PAGE_SIZE, total);
  const showPager = files.length > 0 && (rangeEnd < total || page > 1);
  const pct = Math.round((storageUsed / R2_FREE_TIER_BYTES) * 100);

  return (
    <AppShell path={path} crumbs={[{ label: "Files" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
      <PageHead title="Files" sub="Attachments uploaded through your forms." />
      {hasR2 ? (
        <>
          <div class="mb24" style="max-width:420px">
            <UsageMeter label="Storage" used={fmtBytes(storageUsed)} total="10 GB" pct={pct} />
          </div>
          {files.length ? (
            <>
              <div class="card" style="padding:0 14px">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th style="width:150px">Type</th>
                      <th style="width:90px" class="num">Size</th>
                      <th style="width:140px">Form</th>
                      <th style="width:160px">Uploaded</th>
                      <th style="width:170px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr class="row">
                        <td>
                          <div class="cell-main truncate" style="max-width:240px">{f.filename}</div>
                          <div class="cell-sub mono">{f.field_name || "—"}</div>
                        </td>
                        <td><span class="t2 small truncate" style="display:block;max-width:140px">{f.content_type || "—"}</span></td>
                        <td class="num">{fmtBytes(f.size)}</td>
                        <td><a href={`/admin/forms/${f.form_id}`} class="t2 truncate" style="display:block;max-width:130px">{f.form_name ?? f.form_id}</a></td>
                        <td><span class="t2 small">{fmtDateTime(f.created_at)}</span></td>
                        <td>
                          <div class="flex gap8" style="justify-content:flex-end">
                            <a class="btn btn-secondary btn-sm" href={`/admin/files/${f.id}/download`}>Download</a>
                            <form method="post" action={`/admin/files/${f.id}/delete`} style="display:inline">
                              <button class="btn btn-danger btn-sm" type="submit">Delete</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showPager ? (
                <div
                  class="flex gap8"
                  style="align-items:center;border-top:1px solid var(--border);margin-top:12px;padding-top:10px"
                >
                  <span class="muted small">
                    {fmtNumber(rangeStart)}–{fmtNumber(rangeEnd)} of {fmtNumber(total)}
                  </span>
                  <span style="flex:1"></span>
                  {page > 1 ? <a class="btn btn-secondary btn-sm" href={`/admin/files?page=${page - 1}`}>Prev</a> : null}
                  {rangeEnd < total ? <a class="btn btn-secondary btn-sm" href={`/admin/files?page=${page + 1}`}>Next</a> : null}
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<IconFile size={20} />}
              title="No files yet"
              desc='Add <input type="file" name="attachment"> to any form — multipart uploads are stored in your R2 bucket and listed here.'
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={<IconFile size={20} />}
          title="File storage is not configured"
          desc="Bind an R2 bucket named FILES to store uploads. Submissions still record [file: name] as text without it."
          snippet={R2_SETUP_SNIPPET}
        />
      )}
    </AppShell>
  );
};

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
  retentionDays?: string | null;
  apiKeys?: ApiKeyRow[];
  createdKey?: string;
  members?: (UserRow & { role: string })[];
  inviteUrl?: string;
}> = ({ path, section, workspaceName, stats, formsWithNotify, toastMsg, commands, formCount, submissionCount, retentionDays, apiKeys, createdKey, members = [], inviteUrl }) => {
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
            <>
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
              <div class="setsec">
                <h2>Retention</h2>
                <p class="desc">Automatically prune old submissions to keep D1 small. Empty = keep forever.</p>
                <form method="post" action="/admin/settings/retention">
                  <div class="field">
                    <label for="ret-days">Retention (days)</label>
                    <input class="input" id="ret-days" type="number" min="1" name="retention_days" value={retentionDays ?? ""} placeholder="Off (keep forever)" style="max-width:200px" />
                    <div class="hint">Number of days to keep submissions. Leave empty to disable.</div>
                  </div>
                  <button class="btn btn-primary" type="submit">Save retention</button>
                </form>
                <form method="post" action="/admin/maintenance/prune" onsubmit="return confirm('Prune submissions older than retention period? This deletes data and files.')" style="margin-top:12px">
                  <button class="btn btn-secondary" type="submit">Purge now</button>
                  <span class="hint small t2" style="margin-left:8px">Deletes submissions older than the configured period.</span>
                </form>
              </div>
            </>
          ) : null}

          {active === "members" ? (
            <div class="setsec">
              <h2>Members</h2>
              <p class="desc">Invite teammates with editor or viewer access.</p>
              {inviteUrl ? <div class="callout mb16"><div><strong>Invite link — copy it now</strong><div class="mono small" style="word-break:break-all;margin-top:6px">{inviteUrl}</div></div></div> : null}
              <form method="post" action="/admin/settings/members/invite" class="card card-b flex gap8" style="align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0;flex:1;min-width:220px"><label for="member-email">Email</label><input class="input" id="member-email" type="email" name="email" required /></div><div class="field" style="margin:0;min-width:150px"><label for="member-role">Role</label><select class="select" id="member-role" name="role"><option value="editor">Editor</option><option value="viewer">Viewer</option></select></div><Button variant="primary" type="submit">Create invite</Button></form>
              <div class="card mt16">{members.length ? members.map((member) => <div class="list-item between"><span><span class="cell-main">{member.name}</span><span class="cell-sub">{member.email}</span></span><span class="flex gap8"><span class="badge badge-neutral">{member.role}</span>{member.role !== "owner" ? <form method="post" action={`/admin/settings/members/${member.id}/remove`} onsubmit="return confirm('Remove this member?')"><button class="btn btn-danger btn-sm" type="submit">Remove</button></form> : null}</span></div>) : <div class="card-b"><p class="small t2">No members found. The bootstrap owner is created on the next admin login.</p></div>}</div>
              <p class="hint small t2 mt16">Invite links are single-use and expire after seven days. Share them through a trusted channel.</p>
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
              {createdKey ? (
                <div class="callout" style="background:#e6f4ea;border:1px solid #a8d5b5;border-radius:8px;padding:14px 16px;margin-bottom:16px;display:flex;flex-direction:column;gap:8px">
                  <div style="font-weight:600;font-size:13px">New API key — copy it now</div>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <code class="mono" style="background:#fff;border:1px solid #d3e7d9;padding:6px 10px;border-radius:6px;font-size:13px;word-break:break-all">{createdKey}</code>
                    <CopyButton value={createdKey} />
                  </div>
                  <div class="hint small t2" style="color:#5c5c5c">This key will not be shown again. Store it securely — it is shown once via URL query for this demo. In production, transmit via secure header and clear the URL after copying. Risk: URL history/logging may retain the key.</div>
                </div>
              ) : null}
              <div style="margin-bottom:18px">
                <h3 style="font-size:14px;font-weight:600;margin:0 0 8px">Create new key</h3>
                <form method="post" action="/admin/api-keys" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
                  <div class="field" style="margin:0;flex:1;min-width:180px">
                    <label for="api-key-name">Name</label>
                    <input class="input" id="api-key-name" name="name" placeholder="e.g. CI, Zapier, Mobile" required style="max-width:320px" />
                  </div>
                  <button class="btn btn-primary" type="submit">Create key</button>
                </form>
                <p class="hint small t2" style="margin-top:6px">Key format: <code class="mono">fr_live_</code> + 32 alnum. Stored as SHA-256 hash + prefix (first 12 chars) + last4.</p>
              </div>
              {apiKeys && apiKeys.length ? (
                <div class="card" style="padding:0 14px">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Key</th>
                        <th>Last used</th>
                        <th>Created</th>
                        <th style="width:90px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((k) => (
                        <tr class="row">
                          <td><span class="cell-main">{k.name}</span><span class="cell-sub mono" style="font-size:11px">{k.id}</span></td>
                          <td><code class="mono" style="font-size:12px">{k.prefix}…{k.last4}</code></td>
                          <td><span class="t2 small">{k.last_used_at ? fmtDateTime(k.last_used_at) : "never"}</span></td>
                          <td><span class="t2 small">{fmtDateTime(k.created_at)}</span></td>
                          <td>
                            <form method="post" action={`/admin/api-keys/${k.id}/revoke`} onsubmit="return confirm('Revoke this key? This cannot be undone.')" style="display:inline">
                              <button class="btn btn-danger btn-sm" type="submit">Revoke</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div class="empty" style="padding:18px;text-align:center;border:1px dashed var(--border);border-radius:8px">
                  <div style="display:flex;justify-content:center;margin-bottom:8px"><IconKeyish /></div>
                  <div style="font-weight:600;font-size:13px">No API keys yet</div>
                  <p class="t2 small" style="margin:6px 0 0">Create one above — the full key is shown once after creation.</p>
                </div>
              )}
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
            <p class="t2 small" style="text-align:center;margin-bottom:18px">Use your workspace account or the bootstrap admin password.</p>
            {error ? (
              <div class="callout mb16" style="background:var(--danger-bg);border-color:rgba(196,69,61,.25)">
                <IconAlert size={15} />
                <div>{error}</div>
              </div>
            ) : null}
            <form method="post" action="/admin/login">
              <input class="input" type="email" name="email" placeholder="Email (invited members)" aria-label="Email" style="height:38px;margin-bottom:12px" />
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
