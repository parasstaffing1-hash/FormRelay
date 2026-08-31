import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead, Button, EmptyState } from "../ui/components";
import { ContactRow, SubmissionRow } from "../types";
import { IconUsers } from "../ui/icons";
import { relTime, fmtDateTime, fmtNumber, submissionRef } from "../util";
import { LEAD_STATUSES, scoreBand, ScoreBreakdown } from "../contacts";

const BAND_CLASS: Record<string, string> = { hot: "badge-danger", warm: "badge-warning", cold: "badge-neutral" };

function ScorePill({ score }: { score: number }) {
  const band = scoreBand(score);
  return <span class={`badge ${BAND_CLASS[band]}`}>{score} · {band}</span>;
}

function StatusSelect({ action, value }: { action: string; value: string }) {
  return (
    <form method="post" action={action} style="margin:0">
      <select class="select" name="status" data-autosubmit aria-label="Lead status">
        {LEAD_STATUSES.map((status) => (
          <option value={status} selected={value === status}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </option>
        ))}
      </select>
    </form>
  );
}

export const ContactsPage: FC<{
  path: string;
  contacts: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; hot: number; new_count: number };
  q?: string;
  status?: string;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, contacts, total, page, pageSize, stats, q, status, toastMsg, commands, formCount, submissionCount }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    for (const [k, v] of Object.entries(patch)) v ? params.set(k, v) : params.delete(k);
    const text = params.toString();
    return text ? `/admin/contacts?${text}` : "/admin/contacts";
  };

  return (
    <AppShell path={path} crumbs={[{ label: "Contacts" }]} toastMsg={toastMsg} commands={commands} formCount={formCount} submissionCount={submissionCount}>
      <PageHead title="Contacts" sub="People who have submitted, matched across forms by email or phone. Repeat submissions become one contact, not three leads." />

      <div class="stats">
        <div class="stat"><div class="stat-v">{fmtNumber(stats.total)}</div><div class="stat-l">Contacts</div></div>
        <div class="stat"><div class="stat-v">{fmtNumber(stats.hot)}</div><div class="stat-l">Hot leads</div></div>
        <div class="stat"><div class="stat-v">{fmtNumber(stats.new_count)}</div><div class="stat-l">New</div></div>
      </div>

      <form method="get" action="/admin/contacts" class="flex gap8 wrap mb16">
        <input class="input input-search" name="q" value={q ?? ""} placeholder="Search name, email, company, phone" style="max-width:320px" aria-label="Search contacts" />
        <select class="select" name="status" data-autosubmit style="max-width:170px" aria-label="Filter by status">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option value={s} selected={status === s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <Button variant="secondary" type="submit">Search</Button>
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={20} />}
          title={q || status ? "No matching contacts" : "No contacts yet"}
          desc={q || status
            ? "Try a different search or clear the status filter."
            : "A contact is created the first time someone submits with an email address or phone number."}
        />
      ) : (
        <>
          <div class="tbl-scroll">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th class="num">Submissions</th>
                  <th>Lead score</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr class="row rowlink-tr">
                    <td>
                      <div class="cell-main"><a href={`/admin/contacts/${contact.id}`}>{contact.name || contact.email || contact.phone}</a></div>
                      <div class="cell-sub">{contact.email || contact.phone}</div>
                    </td>
                    <td>{contact.company || <span class="muted">—</span>}</td>
                    <td class="num">{contact.submission_count}</td>
                    <td><ScorePill score={contact.lead_score} /></td>
                    <td><span class="badge badge-neutral">{contact.status}</span></td>
                    <td class="nowrap muted small">{relTime(contact.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div class="flex between mt16">
              <span class="small muted">Page {page} of {pages} · {fmtNumber(total)} contacts</span>
              <div class="flex gap8">
                {page > 1 ? <a class="btn btn-secondary btn-sm" href={qs({ page: String(page - 1) })}>Previous</a> : null}
                {page < pages ? <a class="btn btn-secondary btn-sm" href={qs({ page: String(page + 1) })}>Next</a> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
};

export const ContactDetailPage: FC<{
  path: string;
  contact: ContactRow;
  submissions: SubmissionRow[];
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, contact, submissions, toastMsg, commands, formCount, submissionCount }) => {
  let breakdown: ScoreBreakdown[] = [];
  try {
    const parsed = JSON.parse(contact.score_breakdown || "[]");
    if (Array.isArray(parsed)) breakdown = parsed as ScoreBreakdown[];
  } catch {}

  const facts: [string, string][] = [
    ["Email", contact.email || "—"],
    ["Phone", contact.phone || "—"],
    ["Company", contact.company || "—"],
    ["First seen", fmtDateTime(contact.first_seen)],
    ["Last seen", fmtDateTime(contact.last_seen)],
    ["Submissions", String(contact.submission_count)],
    ["Matched on", contact.dedupe_key.split(":")[0]],
  ];

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Contacts", href: "/admin/contacts" }, { label: contact.name || contact.email || contact.id }]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <PageHead
        title={contact.name || contact.email || "Contact"}
        sub={contact.company ? `${contact.company} · ${contact.email || contact.phone}` : contact.email || contact.phone}
        actions={<StatusSelect action={`/admin/contacts/${contact.id}/status`} value={contact.status} />}
      />

      <div class="flex gap8 mb24">
        <ScorePill score={contact.lead_score} />
        <span class="badge badge-neutral">{contact.status}</span>
        {contact.assigned_to ? <span class="badge badge-accent">assigned: {contact.assigned_to}</span> : null}
      </div>

      <h2 class="section-title">Lead score</h2>
      <div class="card w-prose">
        <div class="card-b">
          {breakdown.length === 0 ? (
            <p class="small muted">No scoring rules matched this contact.</p>
          ) : (
            <>
              <ul class="small" style="margin:0;padding-left:18px">
                {breakdown.map((entry) => (
                  <li style="margin-bottom:4px">{entry.detail} <span class="mono muted">(+{entry.points})</span></li>
                ))}
              </ul>
              <p class="small muted mt12">
                Every point traces to a named rule. Rule set <span class="mono">{contact.score_version || "default"}</span>,
                stored with the score so it stays explainable if the rules change later.
              </p>
            </>
          )}
        </div>
      </div>

      <h2 class="section-title">Details</h2>
      <div class="card w-prose">
        <div class="card-b">
          {facts.map(([key, value]) => (
            <div class="kv"><div class="k">{key}</div><div>{value}</div></div>
          ))}
        </div>
      </div>

      <h2 class="section-title">Notes</h2>
      <form method="post" action={`/admin/contacts/${contact.id}/note`} class="w-prose">
        <div class="field">
          <label for="note">Internal note</label>
          <textarea class="textarea" id="note" name="note" placeholder="Context for whoever picks this up next">{contact.note}</textarea>
        </div>
        <Button type="submit">Save note</Button>
      </form>

      <h2 class="section-title">Submissions from this contact</h2>
      {submissions.length === 0 ? (
        <div class="callout">No submissions linked yet.</div>
      ) : (
        <div class="card">
          {submissions.map((sub) => (
            <div class="list-item">
              <div class="grow">
                <div class="cell-main"><a href={`/admin/submissions/${sub.id}`}>{submissionRef(sub.id)}</a></div>
                <div class="cell-sub">{sub.form_id} · {fmtDateTime(sub.created_at)}</div>
              </div>
              {sub.lead_score ? <ScorePill score={sub.lead_score} /> : null}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};
