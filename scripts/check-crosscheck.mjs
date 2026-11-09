// Python 参考模型与前端引擎逐路径对照。
// 先运行 python model/export_crosscheck.py 生成 model/results/crosscheck_paths.json。
import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
await build({
  entryPoints: ["src/study.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/study.mjs",
});
const { sampleAt } = await import("../verification/study.mjs?" + Date.now());
await build({
  entryPoints: ["src/engine.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/engine.mjs",
});
const { simulate } = await import("../verification/engine.mjs?" + Date.now());
const file = "model/results/crosscheck_paths.json";
if (!fs.existsSync(file))
  throw Error("缺少 " + file + "，请先运行 python model/export_crosscheck.py");
const groups = JSON.parse(fs.readFileSync(file, "utf8"));
const TOL = 0.00002;
let paths = 0,
  values = 0,
  maxDiff = 0;
function same(a, e, name) {
  values++;
  if (e === null) {
    assert.ok(a === null || a === Infinity || Number.isNaN(a), name);
    return;
  }
  if (typeof e === "boolean") return assert.equal(a, e, name);
  const d = Math.abs(a - e);
  maxDiff = Math.max(maxDiff, d);
  assert.ok(d < TOL, `${name}: ${a} / ${e}`);
}
const started = Date.now(),
  summary = [];
for (const g of groups) {
  const scalar = Object.keys(g).filter(
    (k) => Array.isArray(g[k]) && !Array.isArray(g[k][0]),
  );
  const arrays = ["order_days", "accept_days", "external_receipt_days"];
  for (let i = 0; i < g.paths; i++) {
    const r = simulate(g.plan, g.config, sampleAt(g.regime, i));
    const name = `${g.regime}/${g.plan_name}/${g.mode}#${i}`;
    for (const k of scalar) same(r[k], g[k][i], name + "." + k);
    for (const k of arrays)
      g[k][i].forEach((v, j) => same(r[k][j], v, `${name}.${k}[${j}]`));
    paths++;
  }
  assert.ok(g.conservation_max_abs_error < TOL);
  summary.push(`${g.regime}/${g.plan_name}/${g.mode}: ${g.paths}`);
}
const report = {
  status: "PASS",
  groups: groups.length,
  paths,
  comparedValues: values,
  maxAbsDifference: maxDiff,
  tolerance: TOL,
  elapsedSeconds: (Date.now() - started) / 1000,
  summary,
};
fs.writeFileSync(
  "verification/crosscheck-checks.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `PASS: Python/TypeScript ${groups.length} 组、${paths} 条路径、${values} 项数值逐条一致；最大绝对差 ${maxDiff}`,
);
