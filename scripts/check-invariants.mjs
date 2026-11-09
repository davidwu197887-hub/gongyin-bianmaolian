// 资金守恒、采购批次、融资额度等不变量，以及第20日账期调整贯穿案例的关键数值。
// 只读取正式计算函数结果，不改变模型参数或业务口径。
import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
for (const m of ["engine", "study", "workflow"])
  await build({
    entryPoints: [`src/${m}.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `verification/${m}.mjs`,
  });
const stamp = "?" + Date.now();
const E = await import("../verification/engine.mjs" + stamp);
const { sampleAt } = await import("../verification/study.mjs" + stamp);
const wf = await import("../verification/workflow.mjs" + stamp);
const { simulate, plans, defaultConfig, planningConfig, deterministic, QUANTITIES, PURCHASE_DAYS } = E;
const EPS = 0.00002;
const results = [];
let count = 0;
const check = (name, fn) => {
  const detail = fn();
  count++;
  results.push({ name, status: "PASS", detail: detail ?? null });
  console.log("PASS", name, detail === undefined ? "" : JSON.stringify(detail));
};
const draftPlan = { ...plans[0], terms: [5, 5, 15, 15, 15], counterfactual: true, name: "账期调整草案" };
const allPlans = [...plans, draftPlan];
// 1. 全部情景：规划口径与受限执行口径的资金守恒、批次、额度约束
const exec = defaultConfig,
  planCfg = planningConfig(defaultConfig);
const stats = { tracedPaths: 0, plannedPaths: 0, dayRows: 0, maxConservation: 0, delayedPurchasePaths: 0 };
for (const [regime, n] of [["base", 12000], ["mild", 6000], ["severe", 6000]])
  for (const p of allPlans)
    for (let i = 0; i < n; i++) {
      const s = sampleAt(regime, i),
        tag = `${regime}/${p.name}#${i}`;
      const pl = simulate(p, planCfg, s);
      assert.ok(pl.conservation_max_abs_error < EPS, tag + " 规划守恒");
      assert.deepEqual(pl.order_days, PURCHASE_DAYS, tag + " 规划口径维持采购日历");
      assert.equal(pl.ordered_tonnes, 200, tag + " 规划口径采购200吨");
      stats.plannedPaths++;
      const r = simulate(p, exec, s, { trace: true });
      stats.maxConservation = Math.max(stats.maxConservation, r.conservation_max_abs_error, pl.conservation_max_abs_error);
      assert.ok(r.peak_A <= exec.limit_A + EPS && r.peak_B <= exec.limit_B + EPS, tag + " 峰值不超过额度");
      assert.equal(r.order_days.length, 5);
      r.order_days.forEach((d, j) => assert.ok(d === -1 || d >= PURCHASE_DAYS[j], tag + " 不早于计划采购日"));
      if (r.order_days.some((d, j) => d !== PURCHASE_DAYS[j])) stats.delayedPurchasePaths++;
      assert.ok(r.interest_paid_A <= r.interest_A + EPS && r.interest_paid_B <= r.interest_B + EPS, tag + " 已付利息不超过计提");
      let prev = null;
      for (const d of r.days) {
        assert.ok(Math.abs(d.conservation) < EPS, `${tag} D${d.day} 守恒`);
        assert.ok(d.A_debt <= exec.limit_A + EPS && d.B_debt <= exec.limit_B + EPS, `${tag} D${d.day} 本金≤额度`);
        assert.ok(d.A_cash >= -EPS && d.B_cash >= -EPS && d.A_reserve >= -EPS && d.B_reserve >= -EPS, `${tag} D${d.day} 现金非负`);
        assert.ok(d.ordered_tonnes + EPS >= d.accepted_tonnes && d.accepted_tonnes + EPS >= d.finished_tonnes && d.ordered_tonnes <= 200 + EPS, `${tag} D${d.day} 数量链条`);
        if (prev) {
          assert.ok(d.ordered_tonnes + EPS >= prev.ordered_tonnes && d.finished_tonnes + EPS >= prev.finished_tonnes, `${tag} D${d.day} 数量单调`);
          if (d.day >= exec.limit_expiry)
            assert.ok(d.A_debt <= prev.A_debt + EPS && d.B_debt <= prev.B_debt + EPS, `${tag} D${d.day} 到期后无新增提款`);
        }
        prev = d;
        stats.dayRows++;
      }
      if (r.complete) assert.ok(r.accepted_tonnes > 200 - EPS && r.finished_tonnes > 200 - EPS && r.debt_A < EPS && r.debt_B < EPS);
      stats.tracedPaths++;
    }
check("全情景资金守恒、批次、额度与数量约束", () => stats);
// 2. 贯穿案例：第20日第三至第五批改为15日账期
const wan = (x) => Math.round(x) / 10000;
const base = simulate(plans[0], planCfg, deterministic(), { trace: true }),
  draftPlanning = simulate(draftPlan, planCfg, deterministic(), { trace: true });
check("规划口径：甲峰值17.064→30.672万元，对照20万元额度待筹10.672万元", () => {
  assert.equal(base.peak_A, 170640);
  assert.equal(draftPlanning.peak_A, 306720);
  assert.equal(draftPlanning.peak_A - defaultConfig.limit_A, 106720);
  return { before: wan(base.peak_A), after: wan(draftPlanning.peak_A), waiting: wan(draftPlanning.peak_A - defaultConfig.limit_A) };
});
const ex0 = simulate(plans[0], exec, deterministic()),
  ex1 = simulate(draftPlan, exec, deterministic());
check("受限执行（甲乙各20万元、第120日到期）：第五批采购40→42日，回款65→68日，甲清偿44→54日", () => {
  assert.equal(ex0.order_days[4], 40);
  assert.equal(ex1.order_days[4], 42);
  assert.equal(ex0.external_receipt_days[4], 65);
  assert.equal(ex1.external_receipt_days[4], 68);
  assert.equal(ex0.settlement_day_A, 44);
  assert.equal(ex1.settlement_day_A, 54);
  assert.ok(ex1.peak_A <= 200000 + EPS);
  return { purchase5: [ex0.order_days[4], ex1.order_days[4]], receipt5: [ex0.external_receipt_days[4], ex1.external_receipt_days[4]], clearA: [ex0.settlement_day_A, ex1.settlement_day_A], execPeakA: [wan(ex0.peak_A), wan(ex1.peak_A)] };
});
check("条件依赖：第五批顺延40→42日只在额度约束下发生；甲清偿44→54日在规划口径下同样成立", () => {
  const p0 = simulate(plans[0], planCfg, deterministic()), p1 = simulate(draftPlan, planCfg, deterministic());
  assert.equal(p1.order_days[4], 40);
  assert.equal(p1.external_receipt_days[4], 65);
  assert.deepEqual([p0.settlement_day_A, p1.settlement_day_A], [44, 54]);
  return { planningClearA: [p0.settlement_day_A, p1.settlement_day_A], planningPurchase5: p1.order_days[4], planningReceipt5: p1.external_receipt_days[4] };
});
function effective() {
  let s = wf.createRule(wf.emptyState(), plans[0], defaultConfig);
  s = wf.confirmRule(s, "initial");
  s = wf.confirmRule({ ...s, role: "FACTORY" }, "initial");
  return { ...wf.activate(s, "initial"), role: "COOP" };
}
let day20 = wf.loadHistory(effective(), 20);
check("第20日已核验台账：甲本金14.664万元，无草案时无待筹额", () => {
  const n = wf.translateNeed(day20, "A");
  assert.equal(wf.execution(day20).days[20].A_debt, 146640);
  assert.equal(n.waiting, 0);
  assert.equal(n.existingConfirmed, true);
  assert.throws(() => wf.submitBank(day20, "A", "FINANCING"));
  return { existingDebt: wan(n.existingDebt), waiting: n.waiting };
});
let drafted = { ...wf.propose({ ...day20, role: "FACTORY" }, 15, [2, 3, 4]), role: "COOP" };
const need = wf.translateNeed(drafted, "A");
check("重算后金融需求：峰值、增量、待筹、压力窗口、回款与清偿日期", () => {
  assert.equal(need.originalPeak, 170640);
  assert.equal(need.proposedPeak, 306720);
  assert.equal(need.increment, 136080);
  assert.equal(need.waiting, 106720);
  assert.equal(need.amount, 106720);
  assert.deepEqual([need.startDay, need.endDay, need.receiptBatch, need.receiptDay, need.receiptAmount], [40, 42, 3, 42, 136080]);
  assert.deepEqual([need.clearBefore, need.clearAfter, need.maturityDay], [44, 54, 120]);
  assert.equal(need.rule, "Rule-V1");
  assert.equal(drafted.effective.plan.term, 5);
  return { amount: wan(need.amount), window: [need.startDay, need.endDay], clear: [need.clearBefore, need.clearAfter], draft: need.draft };
});
check("零新增融资时独立发起风险核查，完成后不改变额度与历史", () => {
  let r = wf.submitBank(day20, "A", "RISK_REVIEW");
  const c = r.cases[0];
  assert.equal(c.kind, "RISK_REVIEW");
  assert.equal(c.amount, 0);
  assert.throws(() => wf.bankDecision({ ...r, role: "BANK" }, c.id, "APPROVED", "不应批准核查事项", 300000));
  r = wf.bankDecision({ ...r, role: "BANK" }, c.id, "NEEDS_MATERIAL", "请补充回款依据");
  r = wf.supplement({ ...r, role: "COOP" }, c.id, "已补充销售合同");
  r = wf.bankDecision({ ...r, role: "BANK" }, c.id, "REVIEW_COMPLETED", "按约跟踪");
  r = wf.acknowledgeBank(r, c.id);
  assert.equal(r.facilityChanges.length, 0);
  assert.equal(r.cases[0].status, "REVIEW_COMPLETED");
  assert.ok(r.cases[0].receiptId);
  assert.equal(wf.execution(r).days[20].A_debt, 146640);
  return { status: r.cases[0].status, followUpDay: r.cases[0].followUpDay };
});
check("融资需求：补件→重新核查→模拟批准→回执，状态与权限边界", () => {
  let r = wf.submitBank(drafted, "A", "FINANCING");
  const id = r.cases[0].id, trail = [r.cases[0].status];
  assert.throws(() => wf.bankDecision(r, id, "APPROVED", "经营方自行批准", 310000), /权限/);
  assert.throws(() => wf.supplement(r, id, "未要求补件时提交"));
  r = wf.bankDecision({ ...r, role: "BANK" }, id, "NEEDS_MATERIAL", "请补充整体债务");
  trail.push(r.cases[0].status);
  assert.throws(() => wf.supplement({ ...r, role: "BANK" }, id, "银行代客户补件"), /权限/);
  r = wf.supplement({ ...r, role: "COOP" }, id, "已补充债务清单");
  trail.push(r.cases[0].status);
  r = wf.bankDecision({ ...r, role: "BANK" }, id, "APPROVED", "模拟批准总额度31万元", 310000);
  trail.push(r.cases[0].status);
  assert.equal(r.facilityChanges.length, 0);
  assert.equal(r.draft.confirmed.length, 1);
  r = wf.acknowledgeBank(r, id);
  trail.push(r.cases[0].status);
  assert.deepEqual(trail, ["PENDING_BANK_REVIEW", "NEEDS_MATERIAL", "PENDING_BANK_REVIEW", "APPROVED", "EXECUTED"]);
  assert.deepEqual(r.facilityChanges[0], { day: 21, party: "A", limit: 310000, maturityDay: 120 });
  assert.equal(wf.execution(r).days[20].A_debt, 146640);
  assert.equal(r.effective.version, "Rule-V1");
  return { trail, facility: r.facilityChanges[0] };
});
check("成员明白账：第8日验收后应付100元，支付回执核验后实付100元", () => {
  let s = wf.setDay(effective(), 8);
  s = wf.verifyEvidence(wf.submitEvidence(s, "accept-0"), "accept-0", "已核验");
  const before = wf.memberView(s);
  s = wf.verifyEvidence(wf.submitEvidence(s, "tail-0-8"), "tail-0-8", "已核验");
  const after = wf.memberView(s);
  assert.deepEqual([before.tail, before.paid, after.paid, after.outstanding], [100, 0, 100, 0]);
  return { before: before.status, after: after.status };
});
const { study } = await import("../verification/study.mjs" + stamp);
const ref = JSON.parse(fs.readFileSync("verification/reference_results.json", "utf8"));
const close = (a, e, name) => assert.ok(Math.abs(a - e) < EPS, `${name}: ${a} / ${e}`);
check("蒙特卡洛受限执行：12000条基准情景 P50/P90/P95 与 Python 研究结果一致", () => {
  const r = study({ plan: plans[0], draft: null, config: defaultConfig, regime: "base", paths: 12000, mode: "execute", observedDay: null, variation: 0 });
  const g = ref.stochastic["短账期_execute"], o = r.original;
  for (const [k, f] of [["A50", "peak_A_p50"], ["A90", "peak_A_p90"], ["A95", "peak_A_p95"], ["B50", "peak_B_p50"], ["B90", "peak_B_p90"], ["B95", "peak_B_p95"], ["joint90", "peak_joint_p90"]]) close(o[k] / 10000, g[f], k);
  close(o.coverage, g.coverage_20_20_90, "coverage");
  close(o.clearA90, g.settlement_day_A_p90, "clearA90");
  assert.ok(o.A50 <= o.A90 && o.A90 <= o.A95 && o.B50 <= o.B90 && o.B90 <= o.B95);
  assert.ok(r.maximumError < EPS);
  return { paths: r.paths, A50: wan(o.A50), A90: wan(o.A90), A95: wan(o.A95), B90: wan(o.B90), coverage: o.coverage, completed: o.completed };
});
check("第20日历史匹配：保留3969条，原安排与草案共用样本，P50/P90 与 Python 一致", () => {
  const r = study({ plan: plans[0], draft: draftPlan, config: defaultConfig, regime: "base", paths: 12000, mode: "plan", observedDay: 20, variation: 0 });
  const cmp = ref.rolling.comparison, names = Object.keys(cmp), o = cmp[names.find((x) => x === "短账期")], d = cmp[names.find((x) => x !== "短账期")];
  assert.equal(r.retained, 3969);
  assert.equal(r.changed.n, r.original.n);
  close(r.original.A50 / 10000, o.peak_A_p50, "orig A50"); close(r.original.A90 / 10000, o.peak_A_p90, "orig A90");
  close(r.changed.A50 / 10000, d.peak_A_p50, "draft A50"); close(r.changed.A90 / 10000, d.peak_A_p90, "draft A90");
  close(r.changed.B90 / 10000, d.peak_B_p90, "draft B90");
  return { retained: r.retained, originalA50: wan(r.original.A50), draftA50: wan(r.changed.A50), draftA90: wan(r.changed.A90) };
});
check("温和/严峻情景可运行且严峻情景甲P90不低于温和情景", () => {
  const run = (regime) => study({ plan: plans[1], draft: null, config: defaultConfig, regime, paths: 6000, mode: "plan", observedDay: null, variation: 0 });
  const m = run("mild"), s = run("severe");
  assert.equal(m.paths, 6000); assert.equal(s.paths, 6000);
  assert.ok(s.original.A90 >= m.original.A90 - EPS);
  return { mildA90: wan(m.original.A90), severeA90: wan(s.original.A90) };
});
fs.writeFileSync("verification/invariant-checks.json", JSON.stringify({ status: "PASS", checks: count, results }, null, 2));
console.log("PASS:", count, "invariant and case checks");
