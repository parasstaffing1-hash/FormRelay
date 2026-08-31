/**
 * Form insights.
 *
 * The existing analytics answers "how many?" — counts, trends, referrers. This module
 * answers "why not?": which field people abandon, how long the form really takes, and
 * what respondents actually chose. All of it is derived from data already captured on
 * every submission (status, the answer payload, created_at/completed_at, user agent), so
 * turning it on costs no new tracking and no third-party script.
 *
 * Pure functions only — no database, no request context — so the arithmetic that drives
 * the numbers an operator will act on can be tested directly.
 */

export type InsightBlock = { id: string; type: string; label: string };

export type Respondent = {
  /** 'completed' or 'partial'. */
  status: string;
  data: Record<string, unknown>;
  createdAt: number;
  completedAt: number | null;
  userAgent: string;
};

/** A field counts as answered only if it holds something a human actually entered. */
export function isAnswered(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(isAnswered);
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  return String(value).trim() !== "";
}

/**
 * How far a respondent got, as an index into `blocks`.
 *
 * Reached is one past the last field they answered, not the last field itself: someone
 * who filled name and email and then left *did* reach the next question — they saw it
 * and refused, which is exactly the abandonment worth measuring. Measuring furthest
 * answered instead would credit the drop to the previous field and point the operator at
 * the wrong question.
 *
 * A completed submission reached the end by definition. Skipping an optional last
 * question is not abandonment, and treating it as such would invent a drop-off cliff on
 * the final field of every form that ends in something optional.
 */
function reachedIndex(blocks: InsightBlock[], r: Respondent): number {
  if (r.status === "completed") return blocks.length - 1;
  let furthestAnswered = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (isAnswered(r.data[blocks[i].id])) furthestAnswered = i;
  }
  return Math.min(blocks.length - 1, furthestAnswered + 1);
}

export type FunnelStep = {
  blockId: string;
  label: string;
  type: string;
  /** Respondents who got at least this far. */
  reached: number;
  /** Respondents who put something in this field. */
  answered: number;
  /** Respondents whose last activity was this field — they stopped here. */
  droppedHere: number;
  /** droppedHere / reached, 0..1. The number worth sorting by. */
  dropRate: number;
  /** answered / reached, 0..1. Low with low drop-off means an ignored optional field. */
  answerRate: number;
};

/**
 * Per-field drop-off. `reached` is monotonically non-increasing down the form, so the
 * steepest `dropRate` is the question costing the most responses.
 */
export function fieldFunnel(blocks: InsightBlock[], respondents: Respondent[]): FunnelStep[] {
  if (blocks.length === 0) return [];
  const depth = respondents.map((r) => reachedIndex(blocks, r));

  const reached: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    reached.push(depth.filter((d) => d >= i).length);
  }

  return blocks.map((block, i) => {
    const answered = respondents.filter((r) => isAnswered(r.data[block.id])).length;
    const next = i + 1 < blocks.length ? reached[i + 1] : respondents.filter((r) => r.status === "completed").length;
    const droppedHere = Math.max(0, reached[i] - next);
    return {
      blockId: block.id,
      label: block.label || block.id,
      type: block.type,
      reached: reached[i],
      answered,
      droppedHere,
      dropRate: reached[i] > 0 ? droppedHere / reached[i] : 0,
      answerRate: reached[i] > 0 ? answered / reached[i] : 0,
    };
  });
}

export type CompletionStats = {
  starts: number;
  completions: number;
  completionRate: number;
  /** Median beats mean here: one respondent leaving a tab open for a day skews a mean. */
  medianMs: number | null;
  p90Ms: number | null;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export function completionStats(respondents: Respondent[]): CompletionStats {
  const starts = respondents.length;
  const completed = respondents.filter((r) => r.status === "completed");
  const durations = completed
    .filter((r) => r.completedAt != null && r.completedAt > r.createdAt)
    .map((r) => (r.completedAt as number) - r.createdAt)
    .sort((a, b) => a - b);
  return {
    starts,
    completions: completed.length,
    completionRate: starts > 0 ? completed.length / starts : 0,
    medianMs: percentile(durations, 0.5),
    p90Ms: percentile(durations, 0.9),
  };
}

export type AnswerSlice = { value: string; count: number; pct: number };

/**
 * Answer histogram for a choice-shaped field. Multi-select answers are stored joined,
 * so they are split back apart — otherwise "A, B" reads as a third option distinct from
 * "A" and "B", which quietly invents choices nobody made.
 */
export function answerDistribution(block: InsightBlock, respondents: Respondent[], limit = 12): AnswerSlice[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of respondents) {
    const raw = r.data[block.id];
    if (!isAnswered(raw)) continue;
    const parts = Array.isArray(raw)
      ? raw.map((v) => String(v))
      : String(raw)
          .split(",")
          .map((s) => s.trim());
    for (const part of parts) {
      if (part === "") continue;
      counts.set(part, (counts.get(part) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, pct: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type DeviceSlice = { device: string; count: number; pct: number };

/**
 * Coarse device class from the user agent. Deliberately three buckets: fingerprinting
 * respondents is not the job, and "does this form work on phones" is the only question
 * the number is used to answer.
 */
export function classifyDevice(userAgent: string): "Mobile" | "Tablet" | "Desktop" | "Unknown" {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return "Unknown";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "Tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "Mobile";
  return "Desktop";
}

export function deviceBreakdown(respondents: Respondent[]): DeviceSlice[] {
  const counts = new Map<string, number>();
  for (const r of respondents) {
    const d = classifyDevice(r.userAgent);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const total = respondents.length;
  return [...counts.entries()]
    .map(([device, count]) => ({ device, count, pct: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Human duration for the UI: "1m 24s", "48s". */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * The single sentence worth putting at the top of the page. Returns null when the sample
 * is too small to mean anything — a 100% drop rate off two respondents is noise, and
 * dressing it up as a finding sends someone rewriting a question for no reason.
 */
export function headlineFinding(steps: FunnelStep[], minReached = 10): FunnelStep | null {
  const candidates = steps.filter((s) => s.reached >= minReached && s.droppedHere > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, s) => (s.dropRate > worst.dropRate ? s : worst));
}
