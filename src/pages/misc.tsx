import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead, Button, EmptyState, UsageMeter, CopyButton } from "../ui/components";
import {
  IconZap, IconFile, IconLogo, IconAlert,
} from "../ui/icons";
import { FormRow, FormWithStats, DashboardStats, FileWithContext, ApiKeyRow, WorkflowRow, WorkflowRunRow, UserRow } from "../types";
import { fmtBytes, fmtDateTime, fmtNumber } from "../util";
import { FILES_PAGE_SIZE } from "../files";
import { AllowedDomainsConfig } from "../db";

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
    {workflows.length ? workflows.map((workflow) => <div class="card mb16" style="max-width:820px"><div class="card-h flex between"><span><strong>{workflow.name}</strong> <span class="badge badge-neutral">{workflow.trigger}</span></span><span class="flex gap8"><form method="post" action={`/admin/workflows/${workflow.id}/toggle`}><Button type="submit">{workflow.active ? "Pause" : "Resume"}</Button></form><form method="post" action={`/admin/workflows/${workflow.id}/delete`} data-confirm="Delete this workflow and its run history?"><Button variant="danger" type="submit">Delete</Button></form></span></div><div class="card-b"><p class="small t2">Scope: {workflow.form_id ? (forms.find((form) => form.id === workflow.form_id)?.name ?? workflow.form_id) : "All forms"} · Status: {workflow.active ? "active" : "paused"}</p><h3 class="small" style="margin:16px 0 8px">Recent runs</h3>{(runs[workflow.id] ?? []).length ? <table class="tbl"><thead><tr><th>Run</th><th>Status</th><th>Started</th><th>Error</th><th></th></tr></thead><tbody>{(runs[workflow.id] ?? []).map((run) => <tr><td class="mono small">{run.id}</td><td>{run.status}</td><td>{fmtDateTime(run.started_at)}</td><td class="small t2">{run.error || "—"}</td><td>{run.submission_id ? <form method="post" action={`/admin/workflows/${workflow.id}/replay`}><input type="hidden" name="submission_id" value={run.submission_id} /><button class="btn btn-secondary btn-sm" type="submit">Replay</button></form> : "—"}</td></tr>)}</tbody></table> : <p class="small t2">No runs yet. A run is created only when a matching submission arrives.</p>}</div></div>) : <EmptyState icon={<IconZap size={20} />} title="No workflows" desc="Create a rule above. Actions run after submission persistence and record success or failure." />}
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
  allowedDomains?: AllowedDomainsConfig;
}> = ({ path, section, workspaceName, stats, formsWithNotify, toastMsg, commands, formCount, submissionCount, retentionDays, apiKeys, createdKey, members = [], inviteUrl, allowedDomains }) => {
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
                <form method="post" action="/admin/maintenance/prune" data-confirm="Prune submissions older than retention period? This deletes data and files." style="margin-top:12px">
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
              <div class="card mt16">{members.length ? members.map((member) => <div class="list-item between"><span><span class="cell-main">{member.name}</span><span class="cell-sub">{member.email}</span></span><span class="flex gap8"><span class="badge badge-neutral">{member.role}</span>{member.role !== "owner" ? <form method="post" action={`/admin/settings/members/${member.id}/transfer`} data-confirm="Make this member the owner? You will become an editor and lose owner permissions."><button class="btn btn-secondary btn-sm" type="submit">Make owner</button></form> : null}{member.role !== "owner" ? <form method="post" action={`/admin/settings/members/${member.id}/remove`} data-confirm="Remove this member?"><button class="btn btn-danger btn-sm" type="submit">Remove</button></form> : null}</span></div>) : <div class="card-b"><p class="small t2">No members found. The bootstrap owner is created on the next admin login.</p></div>}</div>
              <p class="hint small t2 mt16">Invite links are single-use and expire after seven days. Share them through a trusted channel. Transferring ownership demotes you to editor in the same step, so exactly one owner always remains.</p>
            </div>
          ) : null}

          {active === "domains" ? (
            <div class="setsec">
              <h2>Allowed domains</h2>
              <p class="desc">Restrict which websites and origins are permitted to submit to your form endpoints.</p>

              <form method="post" action="/admin/settings/domains/toggle" class="card card-b flex between" style="align-items:center;margin-bottom:20px">
                <div>
                  <div style="font-weight:600;font-size:14px">Enforce origin restrictions</div>
                  <div class="t2 small" style="margin-top:2px">
                    {allowedDomains?.enforced
                      ? "Origin enforcement is ACTIVE. Unrecognized origins/referrers will be rejected with 403 Forbidden."
                      : "Origin enforcement is DISABLED. Submissions from any website origin are currently accepted."}
                  </div>
                </div>
                <input type="hidden" name="enforced" value={allowedDomains?.enforced ? "0" : "1"} />
                <button class={allowedDomains?.enforced ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"} type="submit">
                  {allowedDomains?.enforced ? "Disable enforcement" : "Enable enforcement"}
                </button>
              </form>

              <div style="margin-bottom:18px">
                <h3 style="font-size:14px;font-weight:600;margin:0 0 8px">Add allowed domain</h3>
                <form method="post" action="/admin/settings/domains/add" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
                  <div class="field" style="margin:0;flex:1;min-width:240px">
                    <label for="domain-input">Domain or Origin pattern</label>
                    <input
                      class="input"
                      id="domain-input"
                      name="domain"
                      placeholder="e.g. example.com, *.example.com, or localhost:3000"
                      required
                    />
                  </div>
                  <button class="btn btn-primary" type="submit">Add domain</button>
                </form>
                <p class="hint small t2" style="margin-top:6px">
                  Supports exact domains (<code class="mono">mysite.com</code>), wildcards (<code class="mono">*.mysite.com</code>), and local origins (<code class="mono">localhost:3000</code>).
                </p>
              </div>

              {allowedDomains?.domains && allowedDomains.domains.length > 0 ? (
                <div class="card" style="padding:0 14px">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>Allowed Domain / Pattern</th>
                        <th style="width:90px;text-align:right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowedDomains.domains.map((dom) => (
                        <tr class="row">
                          <td><code class="mono" style="font-size:13px;font-weight:500">{dom}</code></td>
                          <td style="text-align:right">
                            <form method="post" action="/admin/settings/domains/delete" data-confirm="Remove this allowed domain?" style="display:inline">
                              <input type="hidden" name="domain" value={dom} />
                              <button class="btn btn-danger btn-sm" type="submit">Remove</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div class="empty" style="padding:24px;text-align:center;border:1px dashed var(--border);border-radius:8px">
                  <div style="display:flex;justify-content:center;margin-bottom:8px"><IconGlobeish /></div>
                  <div style="font-weight:600;font-size:13px">No domain restrictions configured</div>
                  <p class="t2 small" style="margin:6px 0 0">
                    Add allowed domains above to restrict submission origins.
                  </p>
                </div>
              )}
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
                  <div class="field" style="margin:0;min-width:150px"><label for="api-key-scope">Scope</label><select class="select" id="api-key-scope" name="scope"><option value="read_write">Read + write</option><option value="read">Read only</option><option value="write">Write only</option></select></div>
                  <div class="field" style="margin:0;width:130px"><label for="api-key-expiry">Expires</label><select class="select" id="api-key-expiry" name="expires_days"><option value="0">Never</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></div>
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
                        <th>Scope</th>
                        <th>Expires</th>
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
                          <td><span class="badge badge-neutral">{k.scope ?? "read_write"}</span></td>
                          <td><span class="t2 small">{k.expires_at ? fmtDateTime(k.expires_at) : "never"}</span></td>
                          <td><span class="t2 small">{k.last_used_at ? fmtDateTime(k.last_used_at) : "never"}</span></td>
                          <td><span class="t2 small">{fmtDateTime(k.created_at)}</span></td>
                          <td>
                            <form method="post" action={`/admin/api-keys/${k.id}/revoke`} data-confirm="Revoke this key? This cannot be undone." style="display:inline">
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
                Delivery requires a configured email provider. Submissions are stored even when email fails.
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
              <div class="callout mb16" style="background:var(--danger-subtle);border-color:rgba(196,69,61,.25)">
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
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f5;color:#37352f;-webkit-font-smoothing:antialiased}
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

/* ================= public landing =================
   Editorial layout, not a card grid. The hero is asymmetric: the pitch sits left,
   the integration snippet sits right — for a form backend the paste-this-HTML moment
   *is* the product, so it gets equal billing instead of being buried below the fold.
   Structure is carried by hairlines and type scale rather than by boxing every idea
   in a bordered card. One ink-based palette; colour is spent almost entirely inside
   the code panel, where it does real work. */

/** A syntax-coloured run: [className, text]. An empty class renders as bare text. */
type Tok = [string, string];

const P = (s: string): Tok => ["tok-p", s];
const T = (s: string): Tok => ["tok-t", s];
const A = (s: string): Tok => ["tok-a", s];
const S = (s: string): Tok => ["tok-s", `"${s}"`];
const X = (s: string): Tok => ["", s];
const C = (s: string): Tok => ["tok-c", s];

/* Tokens render as ordinary JSX text nodes, so the renderer does the escaping and
   `origin` can never inject markup. Lines are joined with explicit newlines rather
   than relying on JSX to preserve source whitespace inside <pre>. */
const snippetLines = (origin: string): Tok[][] => [
  [P("<"), T("form"), X(" "), A("action"), P("="), S(`${origin}/f/XXXXXX`), X(" "), A("method"), P("="), S("POST"), P(">")],
  [X("  "), P("<"), T("input"), X(" "), A("name"), P("="), S("email"), X(" "), A("type"), P("="), S("email"), X(" "), A("required"), P(">")],
  [X("  "), P("<"), T("textarea"), X(" "), A("name"), P("="), S("message"), P("></"), T("textarea"), P(">")],
  [],
  [X("  "), C("<!-- bots fill this in, people don't -->")],
  [X("  "), P("<"), T("input"), X(" "), A("name"), P("="), S("_gotcha"), X(" "), A("hidden"), P(">")],
  [],
  [X("  "), P("<"), T("button"), P(">"), X("Send"), P("</"), T("button"), P(">")],
  [P("</"), T("form"), P(">")],
];

const STEPS: [string, string, string][] = [
  ["01", "Create an endpoint", "Name a form in the dashboard. You get back a URL — that is the whole setup."],
  ["02", "Point HTML at it", "Any form, any framework, any static host. No client library, no build step."],
  ["03", "Own what arrives", "Submissions land in your inbox, your webhooks, your export — on your account."],
];

const SPECS: [string, string][] = [
  ["Spam control", "Honeypot traps, per-IP rate limiting, proof-of-work, and optional Turnstile."],
  ["Delivery", "Email notifications and HMAC-signed webhooks with a full delivery log."],
  ["Form building", "Multi-page flows, conditional logic, save and resume, and custom themes."],
  ["Data out", "JSON API, CSV export, and a shared inbox your team can actually work from."],
  ["Integrity", "Hash-chained submissions and tamper-evident receipts for every response."],
  ["Access", "Scoped sessions, per-field permissions, and an append-only audit log."],
];

const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13" /><path d="m12 5 7 7-7 7" /></svg>
);

export const LandingPage: FC<{ origin: string }> = ({ origin }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>FormRelay — self-hosted form backend</title>
      <meta name="description" content="Turn any HTML form into a spam-filtered inbox with email, webhooks, and export — running entirely on your own Cloudflare account." />
      <style dangerouslySetInnerHTML={{ __html: LAND_CSS }} />
    </head>
    <body>
      <header class="nav">
        <div class="wrap nav-in">
          <a class="brand" href="/">
            <span class="brand-mark">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5" /><path d="M6 12.5v5.5h12v-5.5" /><path d="M9.5 15h5" /></svg>
            </span>
            <span class="brand-name">FormRelay</span>
          </a>
          <a class="btn btn-ghost btn-sm" href="/admin">Open dashboard</a>
        </div>
      </header>

      <main>
        <div class="wrap">
          <section class="hero">
            <h1>
              Ship a form<br />
              <span class="h1-dim">without shipping a backend.</span>
            </h1>
            <div class="hero-body">
              <div class="hero-copy">
                <p class="lede">
                FormRelay turns any HTML form into a spam-filtered inbox with email
                notifications, signed webhooks, and one-click export — running entirely on
                  your own Cloudflare account. No third party ever holds your submissions.
                </p>
                <div class="cta">
                  <a class="btn btn-ink" href="/admin">Create a form <ArrowRight /></a>
                  <a class="btn btn-ghost" href="#how">How it works</a>
                </div>
                <p class="fineprint">Deploys in about five minutes on Cloudflare's free tier.</p>
              </div>

            <div class="panel">
              <div class="panel-bar">
                <span class="verb">POST</span>
                <span class="panel-path">{origin}/f/XXXXXX</span>
              </div>
              <pre class="code" aria-label="Example HTML form pointed at a FormRelay endpoint"><code>
                {snippetLines(origin).map((line, i) => (
                  <>
                    {i ? "\n" : ""}
                    {line.map(([cls, text]) => (cls ? <span class={cls}>{text}</span> : text))}
                  </>
                ))}
              </code></pre>
              </div>
            </div>
          </section>
        </div>

        <div class="wrap">
          <section id="how" class="band">
            <p class="band-label">How it works</p>
            <ol class="steps">
              {STEPS.map(([n, title, body]) => (
                <li class="step">
                  <span class="step-n">{n}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section class="band">
            <p class="band-label">What you get</p>
            <dl class="specs">
              {SPECS.map(([term, body]) => (
                <div class="spec">
                  <dt>{term}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>

      <footer class="foot">
        <div class="wrap foot-in">
          <span>FormRelay — self-hosted forms on Cloudflare Workers.</span>
          <a href="/admin">Dashboard</a>
        </div>
      </footer>
    </body>
  </html>
);

const LAND_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}

:root{
  --paper:#fff;
  --paper-2:#f7f7f6;
  --veil:rgba(255,255,255,.78);
  --ink:#15161a;
  --ink-hover:#000;
  --ink-2:#5d606b;
  --ink-3:#8e909b;
  --line:rgba(20,21,26,.11);
  --line-2:rgba(20,21,26,.07);
  --line-strong:rgba(20,21,26,.16);
  --code-bg:#15171e;
  --panel-edge:rgba(255,255,255,.09);
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  color-scheme:light;
}

@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0e0f13;
    --paper-2:#16181e;
    --veil:rgba(14,15,19,.78);
    --ink:rgba(255,255,255,.93);
    --ink-hover:#fff;
    --ink-2:rgba(255,255,255,.62);
    --ink-3:rgba(255,255,255,.44);
    --line:rgba(255,255,255,.12);
    --line-2:rgba(255,255,255,.07);
    --line-strong:rgba(255,255,255,.2);
    --code-bg:#191d26;
    --panel-edge:rgba(255,255,255,.14);
    color-scheme:dark;
  }
}

html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--font);font-size:15px;line-height:1.6;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  overflow-x:hidden;
}
a{color:inherit}
::selection{background:var(--ink);color:var(--paper)}

.wrap{max-width:1080px;margin:0 auto;padding:0 clamp(20px,4vw,32px);width:100%}

/* ---- nav ---- */
.nav{position:sticky;top:0;z-index:20;background:var(--veil);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line-2)}
.nav-in{display:flex;align-items:center;justify-content:space-between;height:58px}
.brand{display:inline-flex;align-items:center;gap:9px;text-decoration:none}
.brand-mark{width:25px;height:25px;border-radius:7px;background:var(--ink);color:var(--paper);display:inline-flex;align-items:center;justify-content:center;flex:none}
.brand-name{font-size:14.5px;font-weight:600;letter-spacing:-.01em}

/* ---- buttons ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 17px;border-radius:9px;font-size:14px;font-weight:500;letter-spacing:-.005em;text-decoration:none;white-space:nowrap;transition:background 140ms ease,border-color 140ms ease,color 140ms ease}
.btn-sm{height:32px;padding:0 13px;font-size:13.5px;border-radius:8px}
.btn-ink{background:var(--ink);color:var(--paper)}
.btn-ink:hover{background:var(--ink-hover)}
.btn-ghost{border:1px solid var(--line-strong);color:var(--ink)}
.btn-ghost:hover{background:var(--paper-2)}
.btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}

/* ---- hero ---- */
.hero{padding:clamp(52px,8vw,92px) 0 clamp(44px,6vw,72px)}
.hero-body{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.06fr);
  gap:clamp(30px,4.5vw,56px);align-items:start;
  margin-top:clamp(28px,4vw,44px);
}
h1{
  margin:0;font-size:clamp(38px,6vw,72px);line-height:1.02;
  letter-spacing:-.042em;font-weight:600;
}
.h1-dim{color:var(--ink-3)}
.lede{margin:0;max-width:44ch;font-size:15.5px;line-height:1.62;color:var(--ink-2)}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.fineprint{margin:16px 0 0;font-size:13px;color:var(--ink-3)}

/* ---- code panel ---- */
.panel{
  border-radius:13px;background:var(--code-bg);overflow:hidden;min-width:0;
  border:1px solid var(--panel-edge);
  box-shadow:0 28px 60px -28px rgba(12,14,22,.42),0 2px 6px rgba(12,14,22,.10);
}
.panel-bar{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);min-width:0}
.verb{flex:none;font:600 10px/1 var(--mono);letter-spacing:.09em;padding:5px 7px;border-radius:5px;background:rgba(122,162,247,.16);color:#7aa2f7}
.panel-path{font:12px/1.4 var(--mono);color:#7f869f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.code{margin:0;padding:18px 16px 20px;overflow-x:auto;font:13px/1.75 var(--mono);color:#c6cde6;tab-size:2}
.code code{font:inherit}
.tok-t{color:#7aa2f7}
.tok-a{color:#e0af68}
.tok-s{color:#9ece6a}
.tok-p{color:#6b7391}
.tok-c{color:#5b6382;font-style:italic}

/* ---- bands ---- */
.band{padding:clamp(44px,6vw,68px) 0 0}
.band-label{margin:0 0 26px;font:500 11px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3)}

.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--line)}
.step{padding:26px 30px 4px;border-left:1px solid var(--line-2);min-width:0}
.step:first-child{border-left:0;padding-left:0}
.step-n{font:500 11px/1 var(--mono);letter-spacing:.12em;color:var(--ink-3)}
.step h3{margin:13px 0 7px;font-size:15px;font-weight:600;letter-spacing:-.012em}
.step p{margin:0;font-size:13.5px;line-height:1.62;color:var(--ink-2)}

.specs{margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(32px,5vw,64px);border-top:1px solid var(--line)}
.spec{display:grid;grid-template-columns:132px minmax(0,1fr);gap:18px;padding:17px 0;border-bottom:1px solid var(--line-2);align-items:baseline}
.spec dt{font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.spec dd{margin:0;font-size:13.5px;line-height:1.6;color:var(--ink-2)}

/* ---- footer ---- */
.foot{margin-top:clamp(56px,8vw,88px);border-top:1px solid var(--line-2);background:var(--paper-2)}
.foot-in{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;padding:24px 0;font-size:13px;color:var(--ink-3)}
.foot-in a{text-decoration:none}
.foot-in a:hover{color:var(--ink)}

/* ---- responsive ---- */
@media (max-width:940px){
  .hero-body{grid-template-columns:minmax(0,1fr);gap:32px}
  .lede{max-width:58ch}
  .steps{grid-template-columns:minmax(0,1fr)}
  .step{border-left:0;padding:22px 0 4px;border-bottom:1px solid var(--line-2)}
  .step:last-child{border-bottom:0}
  .specs{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:560px){
  .spec{grid-template-columns:minmax(0,1fr);gap:5px}
  .code{font-size:12px}
  .cta .btn{flex:1 1 auto}
}
@media (prefers-reduced-motion:reduce){
  *{transition-duration:.01ms !important;animation-duration:.01ms !important}
}
`;
