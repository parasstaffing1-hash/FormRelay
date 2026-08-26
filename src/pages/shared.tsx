import { FC } from "hono/jsx";
import { SubmissionWithContext } from "../types";
import { relTime, fmtDateTime, fmtNumber, submissionRef } from "../util";
import { EmptyState } from "../ui/components";
import { IconInbox } from "../ui/icons";

export function senderOf(data: Record<string, string>): string {
  const email = data.email || data._replyto || "";
  if (email) return email;
  const name = data.name || Object.values(data)[0];
  return typeof name === "string" && name ? name : "(no sender)";
}

export function previewOf(data: Record<string, string>): string {
  const skip = ["email", "_replyto"];
  const entry = Object.entries(data).find(([k, v]) => !k.startsWith("_") && !skip.includes(k) && v.trim());
  return entry ? entry[1].slice(0, 90) : "(empty)";
}

export function parseData(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export const SubmissionTable: FC<{ subs: SubmissionWithContext[]; showForm?: boolean; selectable?: boolean }> = ({ subs, showForm, selectable }) => (
  <table class="tbl">
    <thead>
      <tr>
        {selectable ? <th style="width:34px"><span class="sr-only">Select</span></th> : null}
        <th style="width:110px">Sender</th>
        <th>Preview</th>
        {showForm ? <th style="width:150px">Form</th> : null}
        <th style="width:130px">Received</th>
      </tr>
    </thead>
    <tbody>
      {subs.map((s) => {
        const data = parseData(s.data);
        return (
          <tr class="row rowlink-tr">
            {selectable ? <td><input type="checkbox" name="id" value={s.id} aria-label={`Select ${submissionRef(s.id)}`} /></td> : null}
            <td>
              <a href={`/admin/submissions/${s.id}`} style="display:block">
                <div class={`cell-main ${s.is_spam ? "muted" : ""} truncate`} style="max-width:190px">
                  {s.is_spam ? <span class="badge badge-danger" style="margin-right:6px">Spam</span> : null}
                  {senderOf(data)}
                </div>
                <div class="cell-sub mono">{submissionRef(s.id)}</div>
              </a>
            </td>
            <td>
              <a href={`/admin/submissions/${s.id}`} class="t2 truncate" style="display:block;max-width:380px">
                {previewOf(data)}
              </a>
            </td>
            {showForm ? (
              <td><a href={`/admin/submissions/${s.id}`} class="t2 truncate" style="display:block;max-width:140px">{s.form_name ?? "—"}</a></td>
            ) : null}
            <td><a href={`/admin/submissions/${s.id}`} class="t2 nowrap" style="display:block">{relTime(s.created_at)}</a></td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export const NoSubmissionsEmpty: FC<{ endpointUrl?: string }> = ({ endpointUrl }) => (
  <EmptyState
    icon={<IconInbox size={20} />}
    title="No submissions yet"
    desc={
      endpointUrl
        ? "Send a test submission to see it appear here instantly."
        : "Submissions will appear here as soon as your forms receive traffic."
    }
    snippet={
      endpointUrl
        ? `curl -X POST ${endpointUrl} \\\n  -d "name=Ada Lovelace" \\\n  -d "email=ada@example.com"`
        : undefined
    }
  />
);
