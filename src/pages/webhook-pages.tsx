import { FC, Child } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, Button, EmptyState, CopyButton } from "../ui/components";
import { IconWebhook, IconPlus, IconSend, IconCheck, IconAlert } from "../ui/icons";
import { FormRow, WebhookWithContext, DeliveryRow } from "../types";
import { relTime, fmtDateTime, fmtNumber } from "../util";

export const WebhooksPage: FC<{
  path: string;
  hooks: (WebhookWithContext & { last_delivery_at: number | null; last_ok: boolean | null })[];
  forms: FormRow[];
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, hooks, forms, toastMsg, commands, formCount, submissionCount }) => (
  <AppShell
    path={path}
    crumbs={[{ label: "Webhooks" }]}
    toastMsg={toastMsg}
    commands={commands}
    formCount={formCount}
    submissionCount={submissionCount}
  >
    <PageHead
      title="Webhooks"
      sub="Push submissions to external services in real time."
    />

    {hooks.length ? (
      <table class="tbl">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th style="width:160px">Form</th>
            <th style="width:100px">Status</th>
            <th style="width:140px">Last delivery</th>
            <th style="width:44px"></th>
          </tr>
        </thead>
        <tbody>
          {hooks.map((w) => (
            <tr class="row rowlink-tr">
              <td><a href={`/admin/webhooks/${w.id}`} class="cell-main mono truncate" style="display:block;max-width:300px">{w.url}</a></td>
              <td><a href={`/admin/webhooks/${w.id}`} class="t2 truncate" style="display:block;max-width:150px">{w.form_name ?? "—"}</a></td>
              <td><a href={`/admin/webhooks/${w.id}`} style="display:block">
                {w.active
                  ? <span class="badge badge-success"><span class="dot"></span>Active</span>
                  : <span class="badge badge-warning"><span class="dot"></span>Paused</span>}
              </a></td>
              <td>
                <a href={`/admin/webhooks/${w.id}`} style="display:block" class="nowrap">
                  {w.last_delivery_at ? (
                    <span style={`color:${w.last_ok ? "var(--success)" : "var(--danger)"}`}>
                      {relTime(w.last_delivery_at)}
                    </span>
                  ) : (
                    <span class="muted">never</span>
                  )}
                </a>
              </td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <EmptyState
        icon={<IconWebhook size={20} />}
        title="No webhooks"
        desc="Forward every submission to Slack, Discord, Zapier, or your own API — signed and retried-on-failure visible in a delivery log."
      />
    )}

    <h2 class="section-title">Add webhook</h2>
    {forms.length ? (
      <form method="post" action="/admin/webhooks" class="card card-b flex gap8 wrap" style="max-width:640px">
        <select class="select" name="form_id" style="width:200px" required aria-label="Form">
          {forms.map((f) => <option value={f.id}>{f.name}</option>)}
        </select>
        <input class="input" name="url" type="url" placeholder="https://hooks.yourservice.com/..." required aria-label="Webhook URL" style="flex:1;min-width:220px" />
        <Button variant="primary" type="submit"><IconPlus size={14} /> Add webhook</Button>
      </form>
    ) : (
      <p class="t2 small">Create a form first — webhooks attach to forms.</p>
    )}
  </AppShell>
);

export const WebhookDetailPage: FC<{
  path: string;
  hook: WebhookWithContext;
  deliveries: DeliveryRow[];
  testResult?: { ok: boolean; detail: string };
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, hook, deliveries, testResult, toastMsg, commands, formCount, submissionCount }) => {
  const okCount = deliveries.filter((d) => d.ok).length;
  const failRate = deliveries.length ? Math.round(((deliveries.length - okCount) / deliveries.length) * 100) : 0;

  return (
    <AppShell
      path={path}
      crumbs={[
        { label: "Webhooks", href: "/admin/webhooks" },
        { label: hook.form_name ?? hook.id },
      ]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <div class="page-head">
        <div style="min-width:0">
          <div class="crumbs mb8">
            <a class="link-btn" href="/admin/webhooks">← All webhooks</a>
          </div>
          <div class="flex gap12 wrap">
            <h1 class="mono truncate" style="font-size:19px;font-weight:600">{hook.url}</h1>
            {hook.active
              ? <span class="badge badge-success"><span class="dot"></span>Active</span>
              : <span class="badge badge-warning"><span class="dot"></span>Paused</span>}
          </div>
          <p class="sub">Subscribed to submission.created · for {hook.form_name ?? "unknown form"}</p>
        </div>
        <div class="page-actions">
          <form method="post" action={`/admin/webhooks/${hook.id}/toggle`}>
            <Button type="submit">{hook.active ? "Pause" : "Resume"}</Button>
          </form>
          <form method="post" action={`/admin/webhooks/${hook.id}/delete`} onsubmit="return confirm('Delete this webhook?')">
            <Button variant="danger" type="submit">Delete</Button>
          </form>
        </div>
      </div>

      {testResult ? (
        <div class={`callout mb16 ${testResult.ok ? "" : ""}`} style={testResult.ok ? "" : "background:var(--danger-bg);border-color:rgba(196,69,61,.25)"}>
          {testResult.ok ? <IconCheck size={15} /> : <IconAlert size={15} />}
          <div>
            Test delivery {testResult.ok ? "succeeded" : "failed"}{testResult.detail && !testResult.ok ? `: ${testResult.detail}` : ""}.
            See it in the delivery history below.
          </div>
        </div>
      ) : null}

      <div class="settings-wrap" style="margin-top:8px">
        <div style="flex:1;min-width:0">
          <h2 class="section-title">Delivery history</h2>
          <p class="t2 small mb16">Last {deliveries.length || 0} attempts · {failRate}% failures</p>
          {deliveries.length ? (
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:90px">Status</th>
                  <th style="width:170px">Event</th>
                  <th>Response</th>
                  <th style="width:130px">When</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr>
                    <td>{d.ok ? <span class="badge badge-success">OK</span> : <span class="badge badge-danger">Failed</span>}</td>
                    <td class="mono small">{d.event}</td>
                    <td class="t2 small truncate" title={d.detail}>
                      {d.status_code ? `HTTP ${d.status_code}` : d.detail}
                    </td>
                    <td class="t2 small nowrap">{fmtDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="t2 small">No deliveries yet. Send a test to verify the endpoint.</p>
          )}
        </div>

        <div style="width:280px;flex-shrink:0">
          <h2 class="section-title">Test</h2>
          <form method="post" action={`/admin/webhooks/${hook.id}/test`}>
            <Button variant="primary" type="submit">
              <IconSend size={14} /> Send test webhook
            </Button>
          </form>
          <p class="small t2 mt8">Sends a sample payload and records the result.</p>

          <h2 class="section-title">Signing secret</h2>
          <details>
            <summary class="link-btn" style="cursor:pointer;width:fit-content">Reveal signing secret</summary>
            <div class="endpoint mt8">
              <code>{hook.secret}</code>
              <CopyButton value={hook.secret} small />
            </div>
          </details>
          <p class="small t2 mt8">
            Verify payloads with HMAC-SHA256 over the raw body — header <code class="mono">X-FormRelay-Signature: sha256=...</code>
          </p>
        </div>
      </div>
    </AppShell>
  );
};

export const ComingSoonPage: FC<{
  path: string;
  icon: Child;
  title: string;
  desc: string;
  extra?: Child;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, icon, title, desc, extra, toastMsg, commands, formCount, submissionCount }) => (
  <AppShell
    path={path}
    crumbs={[{ label: title }]}
    toastMsg={toastMsg}
    commands={commands}
    formCount={formCount}
    submissionCount={submissionCount}
  >
    <PageHead title={title} sub={desc} />
    <EmptyState
      icon={icon}
      title="Coming soon"
      desc="This area is scaffolded but not active yet — no fake data is shown."
    />
    {extra ?? null}
  </AppShell>
);
