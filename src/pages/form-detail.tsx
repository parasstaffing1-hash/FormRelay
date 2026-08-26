import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, Button, EmptyState, Field, EndpointBox, CodeTabs, RowMenu } from "../ui/components";
import { StatusBadge, SpamBadge } from "../ui/components";
import { IconWebhook, IconAlert, IconPlus } from "../ui/icons";
import { FormRow, SubmissionRow, WebhookWithContext } from "../types";
import { fmtNumber, relTime, submissionRef } from "../util";
import { NoSubmissionsEmpty } from "./shared";

const TABS = ["submissions", "setup", "notifications", "webhooks", "settings"] as const;
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
  webhooks: WebhookWithContext[];
  origin: string;
  created?: boolean;
  hasEmailProvider: boolean;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, form, tab, subs = [], webhooks, origin, created, hasEmailProvider, toastMsg, commands, formCount, submissionCount }) => {
  const endpoint = `${origin}/f/${form.id}`;
  const activeTab: FormTab = TABS.includes(tab) ? tab : "submissions";

  const tabLink = (t: FormTab, label: string, badge?: number | null) => (
    <a class={`tab ${activeTab === t ? "active" : ""}`} href={`/admin/forms/${form.id}?tab=${t}`}>
      {label}
      {badge !== undefined && badge !== null && badge > 0 ? <span class="badge badge-neutral">{fmtNumber(badge)}</span> : null}
    </a>
  );

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
      </div>

      <div class="tabs">
        {tabLink("submissions", "Submissions", subs.length)}
        {tabLink("setup", "Setup")}
        {tabLink("notifications", "Notifications")}
        {tabLink("webhooks", "Webhooks", webhooks.length)}
        {tabLink("settings", "Settings")}
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
              {subs.slice(0, 50).map((s) => {
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
    </AppShell>
  );
};
