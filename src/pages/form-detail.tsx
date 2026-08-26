import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, Button, EmptyState, Field, EndpointBox, CodeTabs, RowMenu } from "../ui/components";
import { StatusBadge, SpamBadge } from "../ui/components";
import { IconWebhook, IconAlert, IconPlus } from "../ui/icons";
import { FormRow, SubmissionRow, WebhookWithContext } from "../types";
import { SUBMISSIONS_PAGE_SIZE, FormAnalytics } from "../db";
import { fmtNumber, relTime, submissionRef } from "../util";
import { NoSubmissionsEmpty } from "./shared";

const TABS = ["build", "submissions", "setup", "notifications", "webhooks", "settings", "analytics"] as const;
export type FormTab = (typeof TABS)[number];

function setupSnippets(endpoint: string) {
  return [
    {
      key: "html",
      label: "HTML",
      code:
        `<form action="${endpoint}" method="POST">\n` +
        `  <input type="text" name="name" required>\n` +
        `  <input type="email" name="email" required>\n` +
        `  <textarea name="message"></textarea>\n\n` +
        `  <!-- honeypot spam trap: keep hidden -->\n` +
        `  <input type="text" name="_gotcha" style="display:none">\n\n` +
        `  <button type="submit">Send</button>\n` +
        `</form>`,
    },
    {
      key: "js",
      label: "JavaScript",
      code:
        `await fetch("${endpoint}", {\n` +
        `  method: "POST",\n` +
        `  headers: { "Content-Type": "application/json" },\n` +
        `  body: JSON.stringify({\n` +
        `    name: "Ada Lovelace",\n` +
        `    email: "ada@example.com",\n` +
        `    message: "Hello!",\n` +
        `  }),\n` +
        `});`,
    },
    {
      key: "curl",
      label: "cURL",
      code:
        `curl -X POST ${endpoint} \\\n` +
        `  -d "name=Ada Lovelace" \\\n` +
        `  -d "email=ada@example.com" \\\n` +
        `  -d "message=Hello!"`,
    },
  ];
}

const SPECIAL_FIELDS: [string, string][] = [
  ["_gotcha / _honeypot / _hp", "Honeypot spam trap — keep it hidden; bots fill it and are silently dropped."],
  ["_subject", "Custom subject line for notification emails."],
  ["_replyto", "Reply-to address (also used as the auto-reply target)."],
  ["_redirect", "Override the redirect URL for this submission."],
];

export const FormDetailPage: FC<{
  path: string;
  form: FormRow;
  tab: FormTab;
  subs?: SubmissionRow[];
  subsPage: number;
  subsTotal: number;
  webhooks: WebhookWithContext[];
  origin: string;
  created?: boolean;
  hasEmailProvider: boolean;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
  analytics?: FormAnalytics | null;
}> = ({ path, form, tab, subs = [], subsPage, subsTotal, webhooks, origin, created, hasEmailProvider, toastMsg, commands, formCount, submissionCount, analytics }) => {
  const endpoint = `${origin}/f/${form.id}`;
  const activeTab: FormTab = TABS.includes(tab) ? tab : "submissions";

  const rangeStart = (subsPage - 1) * SUBMISSIONS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(subsPage * SUBMISSIONS_PAGE_SIZE, subsTotal);
  const showPager = subs.length > 0 && (rangeEnd < subsTotal || subsPage > 1);
  const subsTabHref = (p: number) => `/admin/forms/${form.id}?tab=submissions&page=${p}`;

  const tabLink = (t: FormTab, label: string, badge?: number | null) => {
    const href = t === "build" ? `/admin/forms/${form.id}/build` : `/admin/forms/${form.id}?tab=${t}`;
    return (
      <a class={`tab ${activeTab === t ? "active" : ""}`} href={href}>
        {label}
        {badge !== undefined && badge !== null && badge > 0 ? <span class="badge badge-neutral">{fmtNumber(badge)}</span> : null}
      </a>
    );
  };

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name }]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <PageHead
        title={form.name}
        sub={
          <span class="flex gap8">
            <StatusBadge status={form.archived ? "archived" : "active"} />
            <span class="muted small">Created {relTime(form.created_at)}</span>
          </span>
        }
        actions={
          <>
            <Button href={`/admin/forms/${form.id}/export`}>Export CSV</Button>
            <RowMenu>
              <button type="button" class="menu-it" data-copy={endpoint}>Copy endpoint</button>
              <hr class="menu-sep" />
              <form method="post" action={`/admin/forms/${form.id}/duplicate`}>
                <button type="submit" class="menu-it">Duplicate form</button>
              </form>
              <form method="post" action={`/admin/forms/${form.id}/${form.archived ? "unarchive" : "archive"}`}>
                <button type="submit" class="menu-it">{form.archived ? "Restore form" : "Archive form"}</button>
              </form>
              <hr class="menu-sep" />
              <form method="post" action={`/admin/forms/${form.id}/delete`} onsubmit="return confirm('Delete this form and all of its submissions?')">
                <button type="submit" class="menu-it danger">Delete form</button>
              </form>
            </RowMenu>
          </>
        }
      />

      <div class="mb16">
        <EndpointBox url={endpoint} />
        {form.slug ? <div class="card card-b mt8"><div class="small muted">Public share link</div><a class="mono small" href={`${origin}/s/${form.slug}`} target="_blank" rel="noreferrer">{origin}/s/{form.slug}</a><div class="small muted mt8">Embed</div><code class="mono small">{`<iframe src="${origin}/s/${form.slug}" style="width:100%;min-height:520px;border:0" loading="lazy"></iframe>`}</code></div> : null}
      </div>

      <div class="tabs">
        {tabLink("build", "Build")}
        {tabLink("submissions", "Submissions", subsTotal)}
        {tabLink("setup", "Setup")}
        {tabLink("notifications", "Notifications")}
        {tabLink("webhooks", "Webhooks", webhooks.length)}
        {tabLink("settings", "Settings")}
        {tabLink("analytics", "Analytics")}
      </div>

      {activeTab === "submissions" ? (
        subs.length ? (
          <table class="tbl">
            <thead>
              <tr>
                <th style="width:110px">Sender</th>
                <th>Data</th>
                <th style="width:130px">Received</th>
                <th style="width:90px">Spam</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                let d: Record<string, string> = {};
                try { d = JSON.parse(s.data); } catch {}
                const first = Object.entries(d).find(([k, v]) => !k.startsWith("_") && v.trim());
                return (
                  <tr class="row rowlink-tr">
                    <td>
                      <a href={`/admin/submissions/${s.id}?back=form&fid=${form.id}`} style="display:block" class={`cell-main truncate ${s.is_spam ? "muted" : ""}`} title={String(first?.[1] ?? "")}>
                        {first ? first[1] : "(empty)"}
                      </a>
                      <div class="cell-sub mono">{submissionRef(s.id)}</div>
                    </td>
                    <td>
                      <a href={`/admin/submissions/${s.id}?back=form&fid=${form.id}`} class="t2 truncate" style="display:block;max-width:420px">
                        {Object.entries(d)
                          .filter(([k]) => !k.startsWith("_"))
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("  ·  ")}
                      </a>
                    </td>
                    <td><a href={`/admin/submissions/${s.id}?back=form&fid=${form.id}`} class="t2 nowrap" style="display:block">{relTime(s.created_at)}</a></td>
                    <td><a href={`/admin/submissions/${s.id}?back=form&fid=${form.id}`} style="display:block"><SpamBadge isSpam={!!s.is_spam} /></a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <NoSubmissionsEmpty endpointUrl={endpoint} />
        )
      ) : null}

      {activeTab === "submissions" && showPager ? (
        <div
          class="flex gap8"
          style="align-items:center;border-top:1px solid var(--border);margin-top:12px;padding-top:10px"
        >
          <span class="muted small">
            {fmtNumber(rangeStart)}–{fmtNumber(rangeEnd)} of {fmtNumber(subsTotal)}
          </span>
          <span style="flex:1"></span>
          {subsPage > 1 ? <a class="btn btn-secondary btn-sm" href={subsTabHref(subsPage - 1)}>Prev</a> : null}
          {rangeEnd < subsTotal ? <a class="btn btn-secondary btn-sm" href={subsTabHref(subsPage + 1)}>Next</a> : null}
        </div>
      ) : null}

      {activeTab === "setup" ? (
        <div style="max-width:720px">
          {created ? (
            <div class="callout mb16">
              <IconAlert size={15} />
              <div>
                <strong>Form created.</strong> Copy the endpoint above, paste it into your HTML, and submit
                a test — you'll see it in Submissions within seconds.
              </div>
            </div>
          ) : null}
          <CodeTabs groupKey="setup" tabs={setupSnippets(endpoint)} />
          <h2 class="section-title">Special fields</h2>
          <p class="t2 small mb16">Fields starting with an underscore control FormRelay behavior and are never shown as data.</p>
          <table class="tbl">
            <tbody>
              {SPECIAL_FIELDS.map(([k, v]) => (
                <tr>
                  <td class="mono" style="white-space:nowrap">{k}</td>
                  <td class="t2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="t2 small mt16">
            Optional: protect this form with a Cloudflare Turnstile widget — set the <code class="mono">TURNSTILE_SECRET_KEY</code> secret on your Worker.
          </p>
        </div>
      ) : null}

      {activeTab === "notifications" ? (
        <div style="max-width:520px">
          {!hasEmailProvider ? (
            <div class="callout mb16">
              <IconAlert size={15} />
              <div>
                Email delivery isn't configured yet. Add a <strong>RESEND_API_KEY</strong> secret to your
                Worker (<code class="mono">wrangler secret put RESEND_API_KEY</code>) to enable notifications.
                Submissions are always stored regardless of email.
              </div>
            </div>
          ) : null}
          <form method="post" action={`/admin/forms/${form.id}/settings`}>
            <input type="hidden" name="tab" value="notifications" />
            <Field label="Email notifications to" forId="nt-email" hint="One address. Every valid submission sends a summary email here.">
              <input class="input" id="nt-email" type="email" name="notify_email" value={form.notify_email} placeholder="you@example.com" />
            </Field>
            <label class="checkbox-row field">
              <input type="checkbox" name="auto_reply" checked={!!form.auto_reply} />
              <span>
                Send auto-reply confirmation to the submitter
                <span class="hint" style="margin-top:2px">Uses the <code class="mono">email</code> or <code class="mono">_replyto</code> field from the submission.</span>
              </span>
            </label>
            <div class="mt8">
              <Button variant="primary" type="submit">Save changes</Button>
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === "webhooks" ? (
        <div style="max-width:680px">
          <p class="t2 small mb16">
            POST a signed JSON payload to your own endpoints on every valid submission.
          </p>
          {webhooks.length ? (
            <table class="tbl">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th style="width:100px">Status</th>
                  <th style="width:44px"></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr class="row rowlink-tr">
                    <td>
                      <a href={`/admin/webhooks/${w.id}`} class="cell-main mono truncate" style="display:block;max-width:340px">{w.url}</a>
                    </td>
                    <td><a href={`/admin/webhooks/${w.id}`} style="display:block">
                      {w.active ? <span class="badge badge-success"><span class="dot"></span>Active</span> : <span class="badge badge-warning"><span class="dot"></span>Paused</span>}
                    </a></td>
                    <td>
                      <RowMenu>
                        <form method="post" action={`/admin/webhooks/${w.id}/toggle`}>
                          <button type="submit" class="menu-it">{w.active ? "Pause" : "Resume"}</button>
                        </form>
                        <hr class="menu-sep" />
                        <form method="post" action={`/admin/webhooks/${w.id}/delete`} onsubmit="return confirm('Delete this webhook?')">
                          <button type="submit" class="menu-it danger">Delete</button>
                        </form>
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<IconWebhook size={20} />}
              title="No webhooks"
              desc="Forward submissions to Slack, Zapier, or your own API in real time."
            />
          )}
          <form method="post" action="/admin/webhooks" class="card card-b flex gap8 mt16">
            <input type="hidden" name="form_id" value={form.id} />
            <input class="input" name="url" type="url" placeholder="https://hooks.yourservice.com/..." required aria-label="Webhook URL" />
            <Button variant="primary" type="submit"><IconPlus size={14} /> Add webhook</Button>
          </form>
          <p class="small t2 mt8">Deliveries include an <code class="mono">X-FormRelay-Signature</code> header you can verify.</p>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div style="max-width:520px">
          <form method="post" action={`/admin/forms/${form.id}/settings`}>
            <input type="hidden" name="tab" value="settings" />
            <Field label="Form name" forId="fs-name">
              <input class="input" id="fs-name" name="name" value={form.name} required />
            </Field>
            <div class="mt8">
              <Button variant="primary" type="submit">Save changes</Button>
            </div>
          </form>

          <h2 class="section-title">Sharing</h2>
          <form method="post" action={`/admin/forms/${form.id}/share`}>
            <Field label="Human-readable slug" forId="share-slug" hint="Public URL: /s/your-slug. Letters, numbers, and hyphens only."><input class="input" id="share-slug" name="slug" value={form.slug ?? ""} placeholder="contact" /></Field>
            <div class="flex gap8"><Field label="Open at" forId="share-open"><input class="input" id="share-open" type="datetime-local" name="open_at" value={form.open_at ? new Date(form.open_at).toISOString().slice(0,16) : ""} /></Field><Field label="Close at" forId="share-close"><input class="input" id="share-close" type="datetime-local" name="close_at" value={form.close_at ? new Date(form.close_at).toISOString().slice(0,16) : ""} /></Field></div>
            <Field label="Submission limit" forId="share-limit"><input class="input" id="share-limit" type="number" min="1" name="submission_limit" value={form.submission_limit ?? ""} placeholder="Unlimited" /></Field>
            <Field label="Closed message" forId="share-closed"><input class="input" id="share-closed" name="closed_message" value={form.closed_message ?? ""} placeholder="This form is closed." /></Field>
            <label class="checkbox-row field"><input type="checkbox" name="one_per_respondent" checked={form.one_per_respondent === 1} /><span>Allow one submission per browser</span></label>
            <Button variant="primary" type="submit">Save sharing settings</Button>
          </form>

          <h2 class="section-title">Theme</h2>
          <form method="post" action={`/admin/forms/${form.id}/theme`}>
            <div class="flex gap8"><Field label="Background" forId="theme-bg"><input class="input" id="theme-bg" name="background" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.background === "string" ? v.background : ""; } catch { return ""; } })()} placeholder="#f7f7f5" /></Field><Field label="Button" forId="theme-button"><input class="input" id="theme-button" name="button" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.button === "string" ? v.button : ""; } catch { return ""; } })()} placeholder="#2383e2" /></Field></div>
            <div class="flex gap8"><Field label="Text" forId="theme-text"><input class="input" id="theme-text" name="text" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.text === "string" ? v.text : ""; } catch { return ""; } })()} placeholder="#37352f" /></Field><Field label="Radius (px)" forId="theme-radius"><input class="input" id="theme-radius" type="number" min="0" max="32" name="radius" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.radius === "number" ? String(v.radius) : "10"; } catch { return "10"; } })()} /></Field></div>
            <Field label="Logo URL" forId="theme-logo"><input class="input" id="theme-logo" type="url" name="logo" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.logo === "string" ? v.logo : ""; } catch { return ""; } })()} placeholder="https://..." /></Field>
            <Field label="Cover image URL" forId="theme-cover"><input class="input" id="theme-cover" type="url" name="cover" value={(() => { try { const v = JSON.parse(form.theme_json ?? "{}"); return typeof v.cover === "string" ? v.cover : ""; } catch { return ""; } })()} placeholder="https://..." /></Field>
            <Button variant="primary" type="submit">Save theme</Button>
          </form>

          <h2 class="section-title" style="color:var(--danger)">Danger zone</h2>
          <div class="card">
            <div class="list-item between wrap">
              <div>
                <div class="cell-main">{form.archived ? "Restore form" : "Archive form"}</div>
                <div class="cell-sub">{form.archived ? "Start accepting submissions again." : "Endpoint stops accepting submissions."}</div>
              </div>
              <form method="post" action={`/admin/forms/${form.id}/${form.archived ? "unarchive" : "archive"}`}>
                <Button type="submit">{form.archived ? "Restore" : "Archive"}</Button>
              </form>
            </div>
            <div class="list-item between wrap">
              <div>
                <div class="cell-main">Delete form</div>
                <div class="cell-sub">Permanently removes the form, its settings, and every submission.</div>
              </div>
              <form method="post" action={`/admin/forms/${form.id}/delete`} onsubmit="return confirm('Delete this form and all of its submissions? This cannot be undone.')">
                <Button variant="danger" type="submit">Delete</Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "analytics" ? (
        analytics ? <AnalyticsView analytics={analytics} /> : <p class="t2 small">Loading analytics…</p>
      ) : null}
    </AppShell>
  );
};

const AnalyticsView: FC<{ analytics: FormAnalytics }> = ({ analytics }) => {
  const { daily, views, total, spam, referrers } = analytics;
  const completion = views > 0 ? (total / views) * 100 : 0;
  const spamRate = total > 0 ? (spam / total) * 100 : 0;
  const max = Math.max(...daily.map((d) => d.count), 1);
  const w = 600;
  const h = 110;
  const padLeft = 24;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 20;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const barGap = 2;
  const barW = Math.max(1, chartW / daily.length - barGap);
  return (
    <div style="max-width:720px">
      <div class="stats" style="gap: 18px 32px; padding-bottom: 14px">
        <div class="stat"><div class="stat-v">{fmtNumber(views)}</div><div class="stat-l">Total views</div></div>
        <div class="stat"><div class="stat-v">{fmtNumber(total)}</div><div class="stat-l">Submissions</div></div>
        <div class="stat"><div class="stat-v">{completion.toFixed(1)}%</div><div class="stat-l">Completion rate</div></div>
        <div class="stat"><div class="stat-v">{spamRate.toFixed(1)}%</div><div class="stat-l">Spam rate</div></div>
      </div>

      <div class="card card-b mb16">
        <div class="flex between mb8"><span class="small" style="font-weight:600">Submissions per day — last 30 days</span><span class="muted small">max {fmtNumber(max)}/day</span></div>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Submissions per day last 30 days" style="display:block">
          <line x1={padLeft} y1={padTop} x2={padLeft} y2={h - padBottom} stroke="var(--border)" stroke-width="1" />
          <line x1={padLeft} y1={h - padBottom} x2={w - padRight} y2={h - padBottom} stroke="var(--border)" stroke-width="1" />
          {daily.map((d, i) => {
            const barH = max ? (d.count / max) * chartH : 0;
            const x = padLeft + i * (chartW / daily.length) + barGap / 2;
            const y = h - padBottom - barH;
            return (
              <>
                <rect x={x} y={y} width={barW} height={barH} rx="2" fill={d.count ? "var(--accent)" : "var(--border)"} opacity={d.count ? 0.9 : 0.6} />
                <title>{`${d.date}: ${d.count}`}</title>
              </>
            );
          })}
          {daily.map((d, i) => {
            if (i % 5 !== 0 && i !== daily.length - 1) return null;
            const x = padLeft + i * (chartW / daily.length) + (chartW / daily.length) / 2;
            return <text x={x} y={h - 6} text-anchor="middle" font-size="8" fill="var(--text-muted)">{d.date.slice(5)}</text>;
          })}
        </svg>
        {total === 0 ? <p class="t2 small mt8" style="text-align:center">No submissions in the last 30 days.</p> : null}
      </div>

      <div class="card">
        <div class="card-h">Top referrers</div>
        {referrers.length ? (
          <table class="tbl">
            <thead><tr><th>Referrer</th><th class="num">Count</th></tr></thead>
            <tbody>
              {referrers.map((r) => (
                <tr><td class="truncate" style="max-width:420px" title={r.referer}>{r.referer}</td><td class="num">{fmtNumber(r.count)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="t2 small" style="padding:14px">No referrer data yet — submissions will show their Referer header here.</p>
        )}
      </div>
    </div>
  );
};
