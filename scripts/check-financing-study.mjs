// 3.0 浏览器计算线程使用的 financingStudy 与 Python financing_study.py 对照。
// 安排由页面同一函数 wf.arrangements() 生成，确认页面对照与离线研究使用相同条件。
import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
for (const name of ["engine", "workflow", "study"])
  await build({
    entryPoints: [`src/${name}.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `verification/${name}.mjs`,
  });
const wf = await import("../verification/workflow.mjs?" + Date.now());
const { financingStudy } = await import("../verification/study.mjs?" + Date.now());
const { defaultConfig, plans } = await import("../verification/engine.mjs?" + Date.now());
const ref = JSON.parse(fs.readFileSync("verification/financing_reference.json", "utf8"));
const as = (s, role) => ({ ...s, role });
let s = wf.createRule(wf.emptyState(), plans[0], defaultConfig);
s = wf.confirmRule(s, "initial");
s = wf.confirmRule(as(s, "FACTORY"), "initial");
s = wf.loadHistory(as(wf.activate(s, "initial"), "COOP"), 20);
s = as(wf.propose(as(s, "FACTORY"), 15, [2, 3, 4]), "COOP");
const f = wf.financingPlan(s),
  arr = wf.arrangements(s, f);
const map = {
  current: "A0_原安排",
  draft: "A1_草案_原额度",
  general: "A2_草案_一般额度31万",
  tranche: "A3_草案_第五批专项13.608万",
};
const fields = [
  ["on_plan_pct", "on_plan_pct", 1],
  ["purchase_p90", "purchase5_p90", 1],
  ["late_beyond_grace_pct", "late_beyond_grace_pct", 1],
  ["peak_A_p90", "peak_A_p90", 10000],
  ["general_peak_A_p90", "general_peak_A_p90", 10000],
  ["peak_B_p90", "peak_B_p90", 10000],
  ["interest_A_mean", "interest_A_mean", 1],
  ["interest_B_mean", "interest_B_mean", 1],
  ["clear_A_p90", "clear_A_p90", 1],
  ["extra_limit_wan_days_mean", "extra_limit_wan_days_mean", 1],
];
let checks = 0;
const report = {};
for (const [regime, paths, observedDay, sample] of [
  ["base", 12000, 20, "matched_day20"],
  ["base", 12000, null, "base_12000"],
  ["severe", 6000, null, "severe_6000"],
]) {
  const started = Date.now();
  const r = financingStudy({
    kind: "financing",
    base: s.effective.plan,
    baseConfig: { ...s.effective.config, facility_changes: [], tranche: null },
    arrangements: arr,
    target: f.targetBatch,
    regime,
    paths,
    observedDay,
  });
  if (observedDay !== null) assert.equal(r.retained, 3969);
  assert.ok(r.maximumError < 0.00002);
  for (const row of r.rows) {
    const py = ref.samples[sample][map[row.key]];
    for (const [ts, pyKey, scale] of fields) {
      const a = row[ts] / scale, e = py[pyKey];
      assert.ok(Math.abs(a - e) <= 1e-6 * Math.max(1, Math.abs(e)), `${sample}/${row.key}.${ts}: ${a} / ${e}`);
      checks++;
    }
    if (row.key === "tranche")
      for (const [ts, pyKey] of [["tranche_drawn_pct", "tranche_drawn_pct"], ["tranche_blocked_pct", "tranche_blocked_pct"], ["tranche_overdue_pct", "tranche_overdue_pct"]]) {
        assert.ok(Math.abs(row[ts] - py[pyKey]) < 1e-9, `${sample}.${ts}`);
        checks++;
      }
  }
  report[sample] = { retained: r.retained, seconds: (Date.now() - started) / 1000 };
  console.log("PASS", sample, JSON.stringify(report[sample]));
}
fs.writeFileSync(
  "verification/financing-study-checks.json",
  JSON.stringify({ status: "PASS", checks, samples: report }, null, 2),
);
console.log(`PASS: ${checks} 项融资安排情景统计与 Python 一致`);
