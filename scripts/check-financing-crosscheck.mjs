// 3.0 融资安排：Python 参考模型与前端引擎逐路径对照。
// 先运行 python model/export_financing_crosscheck.py 生成 model/results/financing_crosscheck.json。
import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
for (const name of ["engine", "study"])
  await build({
    entryPoints: [`src/${name}.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `verification/${name}.mjs`,
  });
const { simulate, deterministic } = await import(
  "../verification/engine.mjs?" + Date.now()
);
const { sampleAt } = await import("../verification/study.mjs?" + Date.now());
const file = "model/results/financing_crosscheck.json";
if (!fs.existsSync(file))
  throw Error(
    "缺少 " + file + "，请先运行 python model/export_financing_crosscheck.py",
  );
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
const scenario = (regime, i) =>
  regime === "deterministic"
    ? deterministic()
    : regime === "freeze"
      ? deterministic(true)
      : sampleAt(regime, i);
const started = Date.now(),
  summary = [];
for (const g of groups) {
  const config = { ...g.config, facility_changes: [], tranche: null };
  if (g.financing?.facility_changes)
    config.facility_changes = g.financing.facility_changes;
  if (g.financing?.tranche) config.tranche = g.financing.tranche;
  const scalar = Object.keys(g).filter(
    (k) => Array.isArray(g[k]) && !Array.isArray(g[k][0]),
  );
  const arrays = ["order_days", "accept_days", "internal_due", "external_receipt_days"];
  for (let i = 0; i < g.paths; i++) {
    const r = simulate(g.plan, config, scenario(g.regime, i));
    const name = `${g.regime}/${g.arrangement}#${i}`;
    for (const k of scalar) same(r[k], g[k][i], name + "." + k);
    for (const k of arrays)
      g[k][i].forEach((v, j) => same(r[k][j], v, `${name}.${k}[${j}]`));
    assert.ok(r.conservation_max_abs_error < TOL, name + " 资金守恒");
    paths++;
  }
  summary.push(`${g.regime}/${g.arrangement}: ${g.paths}`);
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
  "verification/financing-crosscheck-checks.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `PASS: 融资安排 Python/TypeScript ${groups.length} 组、${paths} 条路径、${values} 项数值逐条一致；最大绝对差 ${maxDiff}`,
);
