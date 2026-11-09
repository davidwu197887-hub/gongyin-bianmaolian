import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
await build({
  entryPoints: ["src/engine.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/engine.mjs",
});
await build({
  entryPoints: ["src/study.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/study.mjs",
});
const { study } = await import("../verification/study.mjs?" + Date.now());
const { plans, defaultConfig } = await import(
  "../verification/engine.mjs?study"
);
const reference = JSON.parse(
  fs.readFileSync("verification/reference_results.json", "utf8"),
);
const request = {
  plan: plans[0],
  draft: null,
  config: defaultConfig,
  regime: "base",
  paths: 12000,
  mode: "plan",
  observedDay: null,
  variation: 0,
};
const started = Date.now();
let checks = 0;
function close(value, expected, name) {
  assert.ok(
    Math.abs(value - expected) < 0.00002,
    `${name}: ${value} / ${expected}`,
  );
  checks++;
}
const r = study(request);
const g = reference.stochastic["短账期_plan"];
for (const [key, field] of [
  ["A50", "peak_A_p50"],
  ["A90", "peak_A_p90"],
  ["A95", "peak_A_p95"],
  ["B90", "peak_B_p90"],
  ["B95", "peak_B_p95"],
  ["joint90", "peak_joint_p90"],
])
  close(r.original[key] / 10000, g[field], key);
close(r.original.coverage, g.coverage_20_20_90, "coverage");
assert.ok(r.maximumError < 0.00002);
checks++;
console.log(
  "PASS prior 12000 paths",
  ((Date.now() - started) / 1000).toFixed(2) + "s",
);
const rolling = study({
  ...request,
  observedDay: 20,
  draft: { ...plans[0], terms: [5, 5, 15, 15, 15], counterfactual: true },
});
assert.equal(rolling.retained, reference.rolling.retained_particles);
checks++;
for (const [stats, name] of [
  [rolling.original, "短账期"],
  [rolling.changed, "后续三批改为15日_草案"],
]) {
  const expected = reference.rolling.comparison[name];
  close(stats.A90 / 10000, expected.peak_A_p90, name + " A90");
  close(stats.B90 / 10000, expected.peak_B_p90, name + " B90");
}
fs.writeFileSync(
  "verification/study-checks.json",
  JSON.stringify(
    {
      status: "PASS",
      checks,
      priorPaths: 12000,
      retainedPaths: rolling.retained,
      elapsedSeconds: (Date.now() - started) / 1000,
      prior: { A90: r.original.A90, B90: r.original.B90 },
      rolling: { original: rolling.original.A90, draft: rolling.changed.A90 },
    },
    null,
    2,
  ),
);
console.log(
  "PASS:",
  checks,
  "scenario checks; retained",
  rolling.retained,
  "paths; total",
  ((Date.now() - started) / 1000).toFixed(2) + "s",
);
