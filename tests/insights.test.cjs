const test = require("node:test");
const assert = require("node:assert");

const {
  fieldFunnel,
  completionStats,
  answerDistribution,
  deviceBreakdown,
  classifyDevice,
  isAnswered,
  formatDuration,
  headlineFinding,
} = require("../.test-build/insights.js");

const BLOCKS = [
  { id: "name", type: "short_text", label: "Name" },
  { id: "email", type: "email", label: "Email" },
  { id: "salary", type: "number", label: "Current salary" },
  { id: "notes", type: "long_text", label: "Anything else?" },
];

function r(status, data, extra = {}) {
  return {
    status,
    data,
    createdAt: extra.createdAt ?? 1000,
    completedAt: extra.completedAt ?? null,
    userAgent: extra.userAgent ?? "",
  };
}

/* ---- what counts as an answer ---- */

test("blank, whitespace and missing values are not answers", () => {
  for (const v of [undefined, null, "", "   ", [], [""]]) {
    assert.equal(isAnswered(v), false, `${JSON.stringify(v)} should not count`);
  }
});

test("zero and false are real answers, not emptiness", () => {
  assert.equal(isAnswered(0), true, "0 is a number someone entered");
  assert.equal(isAnswered("0"), true);
});

/* ---- the funnel ---- */

test("finds the field where people actually quit", () => {
  // Ten reach the salary question; six abandon rather than answer it.
  const people = [
    ...Array.from({ length: 6 }, () => r("partial", { name: "a", email: "a@b.c" })),
    ...Array.from({ length: 4 }, () => r("completed", { name: "a", email: "a@b.c", salary: "50000", notes: "hi" })),
  ];
  const steps = fieldFunnel(BLOCKS, people);
  const salary = steps.find((s) => s.blockId === "salary");

  assert.equal(salary.reached, 10, "everyone got as far as the salary question");
  assert.equal(salary.answered, 4);
  assert.equal(salary.droppedHere, 6, "six stopped at salary");
  assert.equal(Math.round(salary.dropRate * 100), 60);

  const worst = headlineFinding(steps);
  assert.equal(worst.blockId, "salary", "salary is the question costing responses");
});

test("reached never increases down the form", () => {
  const people = [
    r("partial", {}),
    r("partial", { name: "a" }),
    r("partial", { name: "a", email: "a@b.c" }),
    r("completed", { name: "a", email: "a@b.c", salary: "1", notes: "x" }),
  ];
  const steps = fieldFunnel(BLOCKS, people);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].reached <= steps[i - 1].reached, `step ${i} reached rose`);
  }
});

test("a completed response that skipped an optional last field is not a drop-off", () => {
  // Regression guard: treating a skipped optional tail as abandonment invents a cliff
  // on the final question of every form that ends in something optional.
  const people = Array.from({ length: 5 }, () =>
    r("completed", { name: "a", email: "a@b.c", salary: "1" })
  );
  const steps = fieldFunnel(BLOCKS, people);
  const notes = steps.find((s) => s.blockId === "notes");
  assert.equal(notes.reached, 5);
  assert.equal(notes.answered, 0, "nobody filled the optional field");
  assert.equal(notes.droppedHere, 0, "but nobody abandoned there either");
});

test("empty inputs do not throw or produce NaN", () => {
  assert.deepEqual(fieldFunnel([], []), []);
  const steps = fieldFunnel(BLOCKS, []);
  for (const s of steps) {
    assert.equal(s.reached, 0);
    assert.equal(s.dropRate, 0);
    assert.ok(!Number.isNaN(s.dropRate));
  }
});

test("headline finding stays silent on a small sample", () => {
  // 100% drop off two people is noise, not a finding.
  const people = [r("partial", { name: "a" }), r("partial", { name: "b" })];
  assert.equal(headlineFinding(fieldFunnel(BLOCKS, people)), null);
});

/* ---- completion ---- */

test("completion rate and median duration", () => {
  const people = [
    r("completed", {}, { createdAt: 0, completedAt: 30_000 }),
    r("completed", {}, { createdAt: 0, completedAt: 60_000 }),
    r("completed", {}, { createdAt: 0, completedAt: 90_000 }),
    r("partial", {}),
  ];
  const stats = completionStats(people);
  assert.equal(stats.starts, 4);
  assert.equal(stats.completions, 3);
  assert.equal(Math.round(stats.completionRate * 100), 75);
  assert.equal(stats.medianMs, 60_000);
});

test("median ignores an abandoned tab left open for a day", () => {
  const people = [
    r("completed", {}, { createdAt: 0, completedAt: 20_000 }),
    r("completed", {}, { createdAt: 0, completedAt: 25_000 }),
    r("completed", {}, { createdAt: 0, completedAt: 86_400_000 }),
  ];
  const stats = completionStats(people);
  assert.equal(stats.medianMs, 25_000, "median resists the outlier a mean would follow");
});

test("no completions yields null durations rather than zero", () => {
  const stats = completionStats([r("partial", {})]);
  assert.equal(stats.medianMs, null);
  assert.equal(stats.completionRate, 0);
});

/* ---- distributions ---- */

test("multi-select answers split instead of inventing a combined option", () => {
  const block = { id: "topic", type: "checkbox", label: "Topics" };
  const people = [
    r("completed", { topic: "Sales, Support" }),
    r("completed", { topic: "Support" }),
  ];
  const dist = answerDistribution(block, people);
  const values = dist.map((d) => d.value).sort();
  assert.deepEqual(values, ["Sales", "Support"]);
  assert.equal(dist.find((d) => d.value === "Support").count, 2);
});

test("device buckets", () => {
  assert.equal(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148"), "Mobile");
  assert.equal(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0)"), "Tablet");
  assert.equal(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Desktop");
  assert.equal(classifyDevice(""), "Unknown");

  const slices = deviceBreakdown([
    r("completed", {}, { userAgent: "iPhone Mobile" }),
    r("completed", {}, { userAgent: "Windows NT 10.0" }),
  ]);
  assert.equal(slices.reduce((n, s) => n + s.count, 0), 2);
  assert.equal(Math.round(slices[0].pct * 100), 50);
});

test("durations read like durations", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(48_000), "48s");
  assert.equal(formatDuration(84_000), "1m 24s");
  assert.equal(formatDuration(120_000), "2m");
});
