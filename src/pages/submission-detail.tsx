import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { Button, SpamBadge } from "../ui/components";
import { IconAlert } from "../ui/icons";
import { SubmissionWithContext } from "../types";
import { fmtDateTime, relTime, submissionRef } from "../util";
import { parseData } from "./shared";

export const SubmissionDetailPage: FC<{
  path: string;
  sub: SubmissionWithContext;
  backHref: string;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, sub, backHref, toastMsg, commands, formCount, submissionCount }) => {
  const data = parseData(sub.data);
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
          <form method="post" action={`/admin/submissions/${sub.id}/delete`} onsubmit="return confirm('Delete this submission?')">
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
          <h2 class="section-title">Metadata</h2>
          <div class="card card-b">
            {meta.map(([k, v]) => (
              <div class="kv">
                <span class="k">{k}</span>
                <span class="small truncate" style="max-width:150px" title={v}>{v}</span>
              </div>
            ))}
          </div>
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
