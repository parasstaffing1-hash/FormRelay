import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, EmptyState } from "../ui/components";
import { IconInbox } from "../ui/icons";
import { FormRow, SubmissionWithContext } from "../types";
import { fmtNumber } from "../util";
import { SubmissionTable } from "./shared";

export const InboxPage: FC<{
  path: string;
  subs: SubmissionWithContext[];
  forms: FormRow[];
  activeForm?: string;
  spamOnly?: boolean;
  total: number;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, subs, forms, activeForm, spamOnly, total, toastMsg, commands, formCount, submissionCount }) => {
  const filtered = !!(activeForm || spamOnly);

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Submissions" }]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <PageHead
        title="Submissions"
        sub={filtered ? `${fmtNumber(subs.length)} shown` : `${fmtNumber(total)} total`}
        actions={
          <form method="get" action="/admin/submissions" class="flex gap8">
            <select
              class="select"
              name="form"
              style="width:190px"
              aria-label="Filter by form"
              onchange="this.form.submit()"
            >
              <option value="">All forms</option>
              {forms.map((f) => (
                <option value={f.id} selected={activeForm === f.id}>{f.name}</option>
              ))}
            </select>
            <input type="hidden" name={spamOnly ? "spam" : ""} value="1" />
          </form>
        }
      />

      {subs.length ? (
        <>
          <div class="flex gap8 mb8 wrap">
            <a class={`badge ${spamOnly ? "badge-danger" : "badge-neutral"}`} href={`/admin/submissions${spamOnly ? `?form=${activeForm ?? ""}` : "?spam=1"}`}>
              {spamOnly ? "Showing spam — show all" : "Spam only"}
            </a>
            {activeForm ? (
              <a class="badge badge-accent" href={spamOnly ? `/admin/submissions?spam=1` : "/admin/submissions"}>
                {forms.find((f) => f.id === activeForm)?.name ?? "Form"} — clear filter
              </a>
            ) : null}
          </div>
          <div class="card" style="padding:0 14px">
            <SubmissionTable subs={subs} showForm />
          </div>
        </>
      ) : (
        <EmptyState
          icon={<IconInbox size={20} />}
          title={total === 0 && !filtered ? "No submissions yet" : "Nothing here"}
          desc={
            total === 0 && !filtered
              ? "As soon as a form endpoint receives its first POST, the submission appears here."
              : "No submissions match the current filters."
          }
          actions={
            filtered ? <a class="btn btn-secondary" href="/admin/submissions">Clear filters</a> : undefined
          }
        />
      )}
    </AppShell>
  );
};
