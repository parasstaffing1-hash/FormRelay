import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { Button, SpamBadge } from "../ui/components";
import { IconAlert } from "../ui/icons";
import { SubmissionWithContext } from "../types";
import { fmtDateTime, relTime, submissionRef } from "../util";
import { parseData } from "./shared";
import { SubmissionEvent, stageLabel } from "../events";
import { SpamSignal } from "../spam-score";

export const SubmissionDetailPage: FC<{
  path: string;
  sub: SubmissionWithContext;
  backHref: string;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
  events?: SubmissionEvent[];
}> = ({ path, sub, backHref, toastMsg, commands, formCount, submissionCount, events = [] }) => {
  const data = parseData(sub.data);
  let spamSignals: SpamSignal[] = [];
  try {
    const parsed = JSON.parse(sub.spam_signals ?? "[]");
    if (Array.isArray(parsed)) spamSignals = parsed as SpamSignal[];
  } catch {}
  const spamScore = sub.spam_score ?? 0;
  const fields = Object.entries(data).filter(([k]) => !k.startsWith("_"));
  const meta: [string, string][] = [
    ["IP address", sub.ip || "—"],
    ["User agent", sub.user_agent || "—"],
    ["Referrer", sub.referer || "—"],
  ];

  return (
    <AppShell
      path={path}
      crumbs={[
        { label: "Submissions", href: "/admin/submissions" },
        { label: submissionRef(sub.id) },
      ]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <div class="page-head">
        <div>
          <div class="crumbs mb8">
            <a class="link-btn" href={backHref}>← Back</a>
          </div>
          <div class="flex gap12">
            <h1 class="mono" style="font-size:22px">{submissionRef(sub.id)}</h1>
            <SpamBadge isSpam={!!sub.is_spam} />
          </div>
          <p class="sub">
            {fmtDateTime(sub.created_at)} · {relTime(sub.created_at)}
            {sub.form_name ? <> · via <a class="link-btn" href={`/admin/forms/${sub.form_id}`}>{sub.form_name}</a></> : null}
          </p>
        </div>
        <div class="page-actions">
          <form method="post" action={`/admin/submissions/${sub.id}/spam`}>
            <input type="hidden" name="back" value={backHref} />
            <input type="hidden" name="is_spam" value={sub.is_spam ? "0" : "1"} />
            <Button type="submit">{sub.is_spam ? "Mark not spam" : "Mark spam"}</Button>
          </form>
          <form method="post" action={`/admin/submissions/${sub.id}/delete`} data-confirm="Delete this submission?">
            <input type="hidden" name="back" value={backHref} />
            <Button variant="danger" type="submit">Delete</Button>
          </form>
        </div>
      </div>

      <div class="settings-wrap">
        <div style="flex:1;min-width:0;max-width:620px">
          <h2 class="section-title">Fields</h2>
          {fields.length ? (
            <div class="card card-b">
              {fields.map(([k, v]) => (
                <div class="kv" style="align-items:flex-start">
                  <span class="k mono small nowrap">{k}</span>
                  <span style="text-align:right;word-break:break-word">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p class="t2 small">This submission has no visible fields.</p>
          )}

          <details class="mt16">
            <summary class="link-btn" style="cursor:pointer;width:fit-content">View raw data</summary>
            <pre class="snippet mt8">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>

        <div style="width:260px;flex-shrink:0">
          <h2 class="section-title">Delivery timeline</h2>
          <p class="small muted" style="margin-top:-8px;margin-bottom:12px">
            Every stage this submission passed through. A stage that failed is shown with
            its reason; a stage that never ran is absent.
          </p>
          {events.length === 0 ? (
            <div class="callout">No pipeline events recorded for this submission.</div>
          ) : (
            <div class="card">
              {events.map((event) => (
                <div class="list-item" style="align-items:flex-start">
                  <span
                    class={`badge ${event.status === "ok" ? "badge-success" : event.status === "failed" ? "badge-danger" : "badge-neutral"}`}
                    style="flex-shrink:0;min-width:64px;justify-content:center"
                  >
                    {event.status}
                  </span>
                  <div class="grow">
                    <div class="cell-main">{stageLabel(event.stage)}</div>
                    <div class="cell-sub">
                      {event.detail}
                      {event.response_status ? ` · HTTP ${event.response_status}` : ""}
                      {event.attempt > 1 ? ` · attempt ${event.attempt}` : ""}
                    </div>
                  </div>
                  <div class="small muted nowrap">{relTime(event.created_at)}</div>
                </div>
              ))}
            </div>
          )}

          <h2 class="section-title mt16">Spam analysis</h2>
          <div class="card">
            <div class="card-b">
              <div class="flex between">
                <div class="cell-main">Score {spamScore} / 100</div>
                <span class={`badge ${spamScore >= 70 ? "badge-danger" : spamScore > 0 ? "badge-warning" : "badge-success"}`}>
                  {spamScore >= 70 ? "filed as spam" : spamScore > 0 ? "some signals" : "clean"}
                </span>
              </div>
              {spamSignals.length === 0 ? (
                <p class="small muted mt8">No spam signals were raised for this submission.</p>
              ) : (
                <ul class="small muted mt8" style="margin:0;padding-left:18px">
                  {spamSignals.map((signal) => (
                    <li style="margin-bottom:4px">{signal.detail} <span class="mono">(+{signal.weight})</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <h2 class="section-title mt16">Metadata</h2>
          <div class="card card-b">
            {meta.map(([k, v]) => (
              <div class="kv">
                <span class="k">{k}</span>
                <span class="small truncate" style="max-width:150px" title={v}>{v}</span>
              </div>
            ))}
          </div>
          <h2 class="section-title mt16">Response management</h2>
          <form method="post" action={`/admin/submissions/${sub.id}/meta`} class="card card-b">
            <input type="hidden" name="back" value={backHref} />
            <div class="field"><label for="response-status">Status</label><select class="select" id="response-status" name="status"><option value="completed" selected={sub.status === "completed" || !sub.status}>Completed</option><option value="partial" selected={sub.status === "partial"}>Partial</option><option value="abandoned" selected={sub.status === "abandoned"}>Abandoned</option><option value="spam" selected={sub.status === "spam" || !!sub.is_spam}>Spam</option></select></div>
            <div class="field"><label for="response-tags">Tags</label><input class="input" id="response-tags" name="tags" value={(() => { try { const parsed = JSON.parse(sub.tags_json ?? "[]"); return Array.isArray(parsed) ? parsed.join(", ") : ""; } catch { return ""; } })()} placeholder="lead, follow-up" /></div>
            <div class="field"><label for="response-note">Internal note</label><textarea class="textarea" id="response-note" name="note" rows={4} placeholder="Private note for the team">{sub.note ?? ""}</textarea></div>
            <Button variant="primary" type="submit">Save response</Button>
          </form>
          {sub.is_spam ? (
            <div class="callout mt16">
              <IconAlert size={15} />
              <div>Flagged as spam by honeypot, rate limiting, or captcha checks.</div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
};
