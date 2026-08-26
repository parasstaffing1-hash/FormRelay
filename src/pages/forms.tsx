import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, Button, EmptyState, Modal, Field, RowMenu } from "../ui/components";
import { StatusBadge } from "../ui/components";
import { IconPlus, IconForm } from "../ui/icons";
import { FormWithStats } from "../types";
import { fmtNumber, relTime } from "../util";
import { CommandItem } from "../ui/shell";

export const FormsPage: FC<{
  path: string;
  forms: FormWithStats[];
  q?: string;
  openNew?: boolean;
  origin: string;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
}> = ({ path, forms, q, openNew, origin, toastMsg, commands, formCount, submissionCount }) => {
  const hasAny = forms.length > 0;

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Forms" }]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <PageHead
        title="Forms"
        sub="Create and manage submission endpoints."
        actions={
          <Button variant="primary" href="/admin/forms?new=1">
            <IconPlus size={14} /> New form
          </Button>
        }
      />

      {!hasAny && !q ? (
        <EmptyState
          icon={<IconForm size={20} />}
          title="No forms yet"
          desc="Create an endpoint and point any HTML form at it — no server code required."
          actions={
            <a class="btn btn-primary" href="/admin/forms?new=1"><IconPlus size={14} /> Create your first form</a>
          }
          snippet={`<form action="${origin}/f/XXXX" method="POST">\n  <input type="text" name="name">\n  <input type="email" name="email">\n  <textarea name="message"></textarea>\n  <button>Send</button>\n</form>`}
        />
      ) : (
        <>
          <form method="get" action="/admin/forms" class="mb16" style="max-width:340px">
            <input
              class="input"
              type="search"
              name="q"
              value={q ?? ""}
              placeholder="Search forms..."
              aria-label="Search forms"
            />
          </form>

          {forms.length === 0 ? (
            <p class="t2 small">No forms match "{q}".</p>
          ) : (
            <table class="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Endpoint</th>
                  <th class="num">Submissions</th>
                  <th style="width:130px">Last submission</th>
                  <th style="width:100px">Status</th>
                  <th style="width:44px"></th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => {
                  const endpoint = `${origin}/f/${f.id}`;
                  return (
                    <tr class="row rowlink-tr">
                      <td><a href={`/admin/forms/${f.id}`} class="cell-main truncate" style="display:block;max-width:220px">{f.name}</a></td>
                      <td>
                        <a href={`/admin/forms/${f.id}`} class="mono muted truncate" style="display:block;max-width:170px">/f/{f.id}</a>
                      </td>
                      <td class="num"><a href={`/admin/forms/${f.id}`}>{fmtNumber(f.submission_count)}</a></td>
                      <td><a href={`/admin/forms/${f.id}`} class="t2 nowrap" style="display:block">{relTime(f.last_submission_at)}</a></td>
                      <td><a href={`/admin/forms/${f.id}`} style="display:block"><StatusBadge status={f.archived ? "archived" : "active"} /></a></td>
                      <td class="rowmenu-cell">
                        <RowMenu>
                          <a class="menu-it" href={`/admin/forms/${f.id}`}>Open</a>
                          <button type="button" class="menu-it" data-copy={endpoint}>Copy endpoint</button>
                          <hr class="menu-sep" />
                          <form method="post" action={`/admin/forms/${f.id}/duplicate`}>
                            <button type="submit" class="menu-it">Duplicate</button>
                          </form>
                          <form method="post" action={`/admin/forms/${f.id}/${f.archived ? "unarchive" : "archive"}`}>
                            <button type="submit" class="menu-it">{f.archived ? "Restore" : "Archive"}</button>
                          </form>
                          <hr class="menu-sep" />
                          <form method="post" action={`/admin/forms/${f.id}/delete`} onsubmit="return confirm('Delete this form and all of its submissions?')">
                            <button type="submit" class="menu-it danger">Delete</button>
                          </form>
                        </RowMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      <Modal id="new-form-modal" title="New form" open={openNew}>
        <form method="post" action="/admin/forms">
          <Field label="Form name" forId="nf-name">
            <input class="input" id="nf-name" name="name" placeholder="Contact form" required />
          </Field>
          <p class="hint t2 small" style="margin-top:-6px">
            A unique endpoint is generated automatically. You can rename the form later.
          </p>
          <div class="flex mt16 gap8" style="justify-content:flex-end">
            <Button variant="ghost" data-close-modal="">Cancel</Button>
            <Button variant="primary" type="submit">Create form</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
