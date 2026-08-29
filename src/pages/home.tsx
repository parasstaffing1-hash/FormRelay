import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, StatBlock, Button } from "../ui/components";
import { IconPlus, IconForm } from "../ui/icons";
import { FormWithStats, SubmissionWithContext, DashboardStats } from "../types";
import { fmtNumber, relTime } from "../util";
import { SubmissionTable } from "./shared";
import { StatusBadge } from "../ui/components";
import { DashboardAnalytics } from "../db";

export const HomePage: FC<{
  path: string;
  stats: DashboardStats;
  forms: FormWithStats[];
  recent: SubmissionWithContext[];
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  sparkline?: DashboardAnalytics | null;
}> = ({ path, stats, forms, recent, toastMsg, commands, sparkline }) => {
  const isNew = stats.form_count === 0 && recent.length === 0;

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Home" }]}
      toastMsg={toastMsg}
      formCount={stats.form_count}
      submissionCount={stats.submission_count}
      commands={commands}
    >
      <PageHead
        title="Home"
        sub="Manage your forms and recent submissions."
        actions={
          <Button variant="primary" href="/admin/forms?new=1">
            <IconPlus size={14} /> New form
          </Button>
        }
      />

      {isNew ? (
        <div class="empty" style="padding-top:80px">
          <div class="empty-icon"><IconForm size={20} /></div>
          <h3>Create your first form</h3>
          <p>
            Forms give any website a backend without writing server code. Point an HTML form at your
            endpoint and submissions land here.
          </p>
          <div class="empty-actions">
            <a class="btn btn-primary" href="/admin/forms?new=1"><IconPlus size={14} /> Create your first form</a>
          </div>
          <pre class="snippet mt24" style="text-align:left;display:inline-block">{`<form action="https://your-worker.workers.dev/f/XXXX" method="POST">
  <input type="text" name="name">
  <input type="email" name="email">
  <button>Send</button>
</form>`}</pre>
        </div>
      ) : (
        <>
          <div class="stats">
            <StatBlock label="Forms" value={fmtNumber(stats.form_count)} />
            <StatBlock label="Submissions" value={fmtNumber(stats.submission_count)} />
            <StatBlock label="This month" value={fmtNumber(stats.month_count)} />
          </div>
          {sparkline ? <SparklineCard daily={sparkline.daily} /> : null}

          {forms.length ? (
            <>
              <div class="flex between mb8">
                <h2 class="section-title" style="margin-bottom:0">Recent forms</h2>
                <a class="link-btn" href="/admin/forms">View all →</a>
              </div>
              <div class="card mb16">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th class="num">Submissions</th>
                      <th style="width:140px">Last submission</th>
                      <th style="width:110px">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.slice(0, 5).map((f) => (
                      <tr class="row rowlink-tr">
                        <td><a href={`/admin/forms/${f.id}`} class="cell-main truncate" style="display:block;max-width:260px">{f.name}</a></td>
                        <td class="num"><a href={`/admin/forms/${f.id}`}>{fmtNumber(f.submission_count)}</a></td>
                        <td><a href={`/admin/forms/${f.id}`} class="t2 nowrap" style="display:block">{relTime(f.last_submission_at)}</a></td>
                        <td><a href={`/admin/forms/${f.id}`} style="display:block"><StatusBadge status={f.archived ? "archived" : "active"} /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div class="flex between mb8">
            <h2 class="section-title" style="margin-bottom:0">Recent submissions</h2>
            {recent.length ? <a class="link-btn" href="/admin/submissions">View all →</a> : null}
          </div>
          <div class="card">
            {recent.length ? (
              <SubmissionTable subs={recent} showForm />
            ) : (
              <p class="t2 small" style="padding:22px 14px">
                No submissions yet — send a test from one of your form endpoints ({recent[0] ? "" : "Submissions →"}).
              </p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
};

const SparklineCard: FC<{ daily: { date: string; count: number }[] }> = ({ daily }) => {
  const w = 300;
  const h = 40;
  const pad = 2;
  const max = Math.max(...daily.map((d) => d.count), 1);
  const points = daily
    .map((d, i) => {
      const x = (i / Math.max(1, daily.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - (d.count / max) * (h - pad * 2) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;
  return (
    <div class="card card-b mb16" style="padding:10px 14px">
      <div class="flex between mb8">
        <span class="small" style="font-weight:600">14-day trend</span>
        <span class="muted small">{daily[0]?.date.slice(5)} → {daily[daily.length - 1]?.date.slice(5)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="14-day submission sparkline" style="display:block;max-width:100%">
        <polygon points={areaPoints} fill="var(--primary-subtle)" opacity="0.6" />
        <polyline points={points} fill="none" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        {daily.map((d, i) => {
          if (d.count === 0) return null;
          const x = (i / Math.max(1, daily.length - 1)) * (w - pad * 2) + pad;
          const y = h - pad - (d.count / max) * (h - pad * 2) - 2;
          return <circle cx={x} cy={y} r="1.6" fill="var(--primary)" />;
        })}
      </svg>
    </div>
  );
};
