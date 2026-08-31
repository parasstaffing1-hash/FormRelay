import { FC } from "hono/jsx";
import { AppShell } from "../ui/shell";
import { PageHead, StatBlock } from "../ui/components";
import { FormRow } from "../types";
import { fmtNumber } from "../util";
import {
  FunnelStep,
  CompletionStats,
  AnswerSlice,
  DeviceSlice,
  formatDuration,
  headlineFinding,
} from "../insights";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Insights: where responses are lost, not how many arrived.
 *
 * The funnel is the page. Everything else is supporting context, so the drop-off table
 * gets the full measure and the summary numbers sit above it rather than competing for
 * attention in a grid of equal cards.
 */
export const InsightsPage: FC<{
  path: string;
  form: FormRow;
  steps: FunnelStep[];
  stats: CompletionStats;
  distributions: { block: { id: string; label: string; type: string }; slices: AnswerSlice[] }[];
  devices: DeviceSlice[];
  days: number;
  toastMsg?: string;
  commands: { label: string; href: string; icon: string; keywords?: string }[];
  formCount: number;
  submissionCount: number;
}> = ({ path, form, steps, stats, distributions, devices, days, toastMsg, commands, formCount, submissionCount }) => {
  const worst = headlineFinding(steps);
  const maxReached = steps.length ? Math.max(...steps.map((s) => s.reached), 1) : 1;

  return (
    <AppShell
      path={path}
      crumbs={[{ label: "Forms", href: "/admin/forms" }, { label: form.name, href: `/admin/forms/${form.id}` }, { label: "Insights" }]}
      toastMsg={toastMsg}
      formCount={formCount}
      submissionCount={submissionCount}
      commands={commands}
    >
      <PageHead
        title="Insights"
        sub={`Where responses are won and lost — last ${days} days.`}
        actions={
          <div class="flex gap6">
            {[7, 30, 90].map((d) => (
              <a
                class={`btn btn-sm ${d === days ? "btn-secondary" : "btn-ghost"}`}
                href={`/admin/forms/${form.id}/insights?days=${d}`}
              >
                {d}d
              </a>
            ))}
          </div>
        }
      />

      {stats.starts === 0 ? (
        <div class="empty" style="padding-top:64px">
          <h3>Nothing to analyse yet</h3>
          <p>
            Once people start filling this form, this page shows which question they abandon,
            how long the form really takes, and what they chose.
          </p>
        </div>
      ) : (
        <>
          <div class="stats">
            <StatBlock label="Started" value={fmtNumber(stats.starts)} />
            <StatBlock label="Completed" value={fmtNumber(stats.completions)} />
            <StatBlock label="Completion rate" value={pct(stats.completionRate)} />
            <StatBlock label="Median time" value={formatDuration(stats.medianMs)} />
          </div>

          {worst ? (
            <div class="card card-b mb16" style="border-left:3px solid var(--warning-foreground)">
              <p style="margin:0">
                <strong>{worst.label}</strong> loses the most responses — {pct(worst.dropRate)} of the{" "}
                {fmtNumber(worst.reached)} people who reach it stop there. Making it optional, or
                asking it later, is usually the cheapest thing to try.
              </p>
            </div>
          ) : null}

          <h2 class="section-title">Drop-off by question</h2>
          <div class="card mb16">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Question</th>
                  <th style="width:180px">Reached</th>
                  <th class="num" style="width:90px">Answered</th>
                  <th class="num" style="width:90px">Dropped</th>
                  <th class="num" style="width:80px">Drop rate</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr class="row">
                    <td>
                      <span class="cell-main">{s.label}</span>
                      <span class="muted small"> · {s.type.replace(/_/g, " ")}</span>
                    </td>
                    <td>
                      {/* The bar is the funnel: its width is the honest shape of the loss. */}
                      <div class="flex gap6" style="align-items:center">
                        <div style="flex:1;height:6px;background:var(--muted);border-radius:999px;overflow:hidden">
                          <div
                            style={`width:${Math.round((s.reached / maxReached) * 100)}%;height:100%;background:var(--primary);border-radius:999px`}
                          />
                        </div>
                        <span class="t2 small nowrap" style="width:44px;text-align:right">{fmtNumber(s.reached)}</span>
                      </div>
                    </td>
                    <td class="num t2 small">{fmtNumber(s.answered)}</td>
                    <td class="num t2 small">{s.droppedHere ? fmtNumber(s.droppedHere) : "—"}</td>
                    <td class="num small">
                      {s.droppedHere ? (
                        <span style={s.dropRate >= 0.2 ? "color:var(--danger-foreground);font-weight:600" : ""}>
                          {pct(s.dropRate)}
                        </span>
                      ) : (
                        <span class="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div class="flex gap16" style="align-items:flex-start;flex-wrap:wrap">
            <div style="flex:1 1 340px;min-width:0">
              <h2 class="section-title">Answers</h2>
              {distributions.length ? (
                distributions.map((d) => (
                  <div class="card card-b mb16">
                    <p class="small" style="font-weight:600;margin:0 0 10px">{d.block.label}</p>
                    {d.slices.map((s) => (
                      <div class="mb8">
                        <div class="flex between small" style="margin-bottom:3px">
                          <span class="truncate" style="max-width:70%">{s.value}</span>
                          <span class="t2 nowrap">{fmtNumber(s.count)} · {pct(s.pct)}</span>
                        </div>
                        <div style="height:5px;background:var(--muted);border-radius:999px;overflow:hidden">
                          <div style={`width:${Math.round(s.pct * 100)}%;height:100%;background:var(--primary);border-radius:999px`} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div class="card card-b mb16">
                  <p class="t2 small" style="margin:0">
                    No choice fields on this form. Add a dropdown, radio, checkbox or rating
                    question to see how answers are distributed.
                  </p>
                </div>
              )}
            </div>

            <div style="flex:1 1 300px;min-width:0">
              <h2 class="section-title">Device</h2>
              <div class="card card-b mb16">
                {devices.map((d) => (
                  <div class="flex between small mb8">
                    <span>{d.device}</span>
                    <span class="t2">{fmtNumber(d.count)} · {pct(d.pct)}</span>
                  </div>
                ))}
              </div>

              <h2 class="section-title">Timing</h2>
              <div class="card card-b">
                <div class="flex between small mb8">
                  <span>Median completion</span>
                  <span class="t2">{formatDuration(stats.medianMs)}</span>
                </div>
                <div class="flex between small">
                  <span>90th percentile</span>
                  <span class="t2">{formatDuration(stats.p90Ms)}</span>
                </div>
                <p class="muted small" style="margin:12px 0 0">
                  Median, not average — one abandoned tab left open overnight would drag a mean
                  into meaninglessness.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
};
