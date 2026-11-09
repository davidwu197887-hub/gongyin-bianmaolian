// 3.0 批次专项提款安排：流程、权限、防错与执行投影检查（全部为模拟办理）。
import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
for (const name of ["engine", "workflow"])
  await build({
    entryPoints: [`src/${name}.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `verification/${name}.mjs`,
  });
const wf = await import("../verification/workflow.mjs?" + Date.now());
const { defaultConfig, plans, simulate, deterministic, planningConfig } =
  await import("../verification/engine.mjs?" + Date.now());
const results = [];
const check = (name, fn) => {
  const detail = fn();
  results.push({ name, status: "PASS", detail: detail ?? null });
  console.log("PASS", name, detail ? JSON.stringify(detail) : "");
};
const as = (s, role) => ({ ...s, role });
function day20(withDraft = true) {
  let s = wf.createRule(wf.emptyState(), plans[0], defaultConfig);
  s = wf.confirmRule(s, "initial");
  s = wf.confirmRule(as(s, "FACTORY"), "initial");
  s = wf.loadHistory(as(wf.activate(s, "initial"), "COOP"), 20);
  return withDraft ? as(wf.propose(as(s, "FACTORY"), 15, [2, 3, 4]), "COOP") : s;
}
const wan = (x) => Math.round(x) / 10000;
const draft = { ...plans[0], terms: [5, 5, 15, 15, 15], counterfactual: true };

check("2.0 基准不变：规划17.064→30.672万元、待筹10.672万元", () => {
  const a = simulate(plans[0], planningConfig(defaultConfig), deterministic());
  const b = simulate(draft, planningConfig(defaultConfig), deterministic());
  assert.equal(a.peak_A, 170640);
  assert.equal(b.peak_A, 306720);
  assert.equal(wf.translateNeed(day20(), "A").waiting, 106720);
  return { before: wan(a.peak_A), after: wan(b.peak_A) };
});
check("2.0 基准不变：受限执行第五批40→42日、回款65→68日、清偿44→54日", () => {
  const a = simulate(plans[0], defaultConfig, deterministic());
  const b = simulate(draft, defaultConfig, deterministic());
  assert.deepEqual([a.order_days[4], b.order_days[4]], [40, 42]);
  assert.deepEqual([a.external_receipt_days[4], b.external_receipt_days[4]], [65, 68]);
  assert.deepEqual([a.settlement_day_A, b.settlement_day_A], [44, 54]);
});
check("不传入专项时结果与未设字段完全相同", () => {
  const a = simulate(draft, defaultConfig, deterministic(), { trace: true });
  const b = simulate(draft, { ...defaultConfig, tranche: null }, deterministic(), { trace: true });
  for (const k of ["peak_A", "peak_B", "interest_A", "interest_B", "settlement_day_A"])
    assert.equal(a[k], b[k], k);
  assert.equal(a.days[60].A_cash, b.days[60].A_cash);
});
let s = day20();
const f = wf.financingPlan(s);
check("方案说明：第五批用款、第3批还款来源、额度区间与期限由计算得出", () => {
  assert.equal(f.applicable, true);
  assert.equal(f.targetBatch, 4);
  assert.equal(f.plannedDay, 40);
  assert.equal(f.delayedDay, 42);
  assert.equal(f.sourceBatch, 2);
  assert.equal(f.sourceAcceptDay, 27);
  assert.equal(f.sourceDueDay, 42);
  assert.equal(f.lower, 106720);
  assert.equal(f.receivable, 136080);
  assert.equal(f.upper, 136080);
  assert.deepEqual([f.openDay, f.closeDay, f.maturityDay], [21, 50, 62]);
  return { lower: wan(f.lower), upper: wan(f.upper), window: [f.openDay, f.closeDay, f.maturityDay] };
});
check("无草案时不形成专项方案；规划口径无缺口", () => {
  const g = wf.financingPlan(day20(false));
  assert.equal(g.applicable, false);
  assert.match(g.reason, /按计划采购/);
});
check("提款条件逐项列出；草案未生效、乙未确认时为待满足", () => {
  const map = Object.fromEntries(f.conditions.map((c) => [c.key, c.status]));
  assert.equal(map.rule, "待满足");
  assert.equal(map.confirm, "待满足");
  assert.equal(map.accept, "待满足");
  assert.equal(map.due, "满足");
  assert.equal(map.overdue, "满足");
  return map;
});
check("安排对照：一般提额与专项在确定性路径上第五批均第40日采购", () => {
  const rows = wf.arrangements(s, f).map((a) => {
    const r = simulate(a.plan, a.config, deterministic());
    return [a.key, r.order_days[4], r.peak_A, +r.interest_A.toFixed(2), Math.round(wf.extraLimitDays(a.extra, r) * 10) / 10];
  });
  assert.deepEqual(rows.map((x) => x[1]), [40, 42, 40, 40]);
  assert.deepEqual(rows.map((x) => x[2]), [170640, 174640, 306720, 306720]);
  assert.equal(rows[2][4], 1089);
  assert.equal(rows[3][4], 285.8);
  return rows;
});
check("专项只能由甲提交；乙未确认应付时银行不能批准", () => {
  assert.throws(() => wf.submitBank(as(s, "FACTORY"), "A", "FINANCING", "TRANCHE"));
  const x = wf.submitBank(s, "A", "FINANCING", "TRANCHE");
  const id = x.cases[0].id;
  assert.throws(
    () => wf.bankDecision(as(x, "BANK"), id, "APPROVED", "批准", null, { limit: 136080, closeDay: 50, maturityDay: 62 }),
    /乙尚未确认/,
  );
});
check("乙确认应付仅限乙角色；重复确认幂等", () => {
  assert.throws(() => wf.confirmReceivable(s), /权限/);
  const y = wf.confirmReceivable(as(s, "FACTORY"));
  assert.equal(y.confirmations.length, 1);
  assert.equal(wf.confirmReceivable(y).confirmations.length, 1);
  assert.equal(y.confirmations[0].amount, 136080);
  assert.equal(y.confirmations[0].dueDay, 42);
});
s = wf.confirmReceivable(as(s, "FACTORY"));
s = wf.submitBank(as(s, "COOP"), "A", "FINANCING", "TRANCHE");
const id = s.cases[0].id;
check("专项申请记录结构与方案快照", () => {
  assert.equal(s.cases[0].structure, "TRANCHE");
  assert.equal(s.cases[0].plan.upper, 136080);
});
check("防重复融资：同一依据不能再提交专项或一般额度申请", () => {
  assert.equal(wf.submitBank(s, "A", "FINANCING", "TRANCHE").cases.length, 1);
  assert.throws(() => wf.submitBank(s, "A", "FINANCING", "GENERAL"), /重复/);
});
const bank = as(s, "BANK"),
  ok = { limit: 136080, closeDay: 50, maturityDay: 62 };
check("银行条件校验：超额度、到期早于回款、晚于一般额度到期、截止早于生效均拒绝", () => {
  const bad = [
    [{ ...ok, limit: 136081 }, /不超过/],
    [{ ...ok, limit: 0 }, /大于0/],
    [{ ...ok, maturityDay: 42 }, /到期日/],
    [{ ...ok, maturityDay: 121 }, /到期日/],
    [{ ...ok, closeDay: 20 }, /截止日/],
    [null, /请填写/],
  ];
  for (const [t, re] of bad)
    assert.throws(() => wf.bankDecision(bank, id, "APPROVED", "模拟批准", null, t), re);
});
check("经营主体不能作出或改写银行结论", () => {
  assert.throws(() => wf.bankDecision(as(s, "COOP"), id, "APPROVED", "自批", null, ok), /权限/);
  assert.throws(() => wf.bankDecision(as(s, "FACTORY"), id, "APPROVED", "自批", null, ok), /权限/);
});
s = wf.bankDecision(bank, id, "APPROVED", "依据第3批应付确认，模拟批准专项13.608万元", null, ok);
check("审批后、回执前不提款：专项未进入执行投影", () => {
  assert.equal(s.tranche, null);
  const r = wf.execution(s);
  assert.equal(r.tranche_draws, 0);
  assert.equal(r.order_days[4], 40);
});
check("经营主体不能回填回执", () =>
  assert.throws(() => wf.acknowledgeBank(as(s, "COOP"), id), /权限/),
);
s = wf.acknowledgeBank(as(s, "BANK"), id);
check("回执回填：专项自第21日可提，依据为 Draft-V2", () => {
  assert.equal(s.tranche.openDay, 21);
  assert.equal(s.tranche.limit, 136080);
  assert.equal(s.tranche.ruleHash, s.draft.hash);
  assert.equal(s.facilityChanges.length, 0);
  assert.equal(s.cases[0].status, "EXECUTED");
  assert.equal(wf.acknowledgeBank(s, id).tranche.caseId, id);
});
check("已办结事项不能被改写", () =>
  assert.throws(() => wf.bankDecision(as(s, "BANK"), id, "NOT_APPROVED", "撤销")),
);
check("草案未生效前，专项不进入执行投影，原规则照常执行", () => {
  const r = wf.execution(s);
  assert.equal(r.tranche_limit, 0);
  assert.equal(r.days[20].A_debt, 146640);
});
s = wf.confirmRule(as(s, "COOP"), "draft");
s = wf.activate(s, "draft");
const r = wf.execution(s);
check("草案生效后按获批条件执行：第五批第40日采购，专项第40日提用10.672万元、第42日归还", () => {
  assert.equal(r.order_days[4], 40);
  assert.equal(r.external_receipt_days[4], 65);
  assert.equal(r.tranche_first_draw_day, 40);
  assert.equal(r.tranche_draws, 106720);
  assert.equal(r.tranche_clear_day, 42);
  assert.equal(r.general_peak_A, 200000);
  assert.equal(r.settlement_day_A, 54);
  assert.equal(r.days[20].A_debt, 146640);
  return { draw: wan(r.tranche_draws), interest: +r.interest_A.toFixed(2) };
});
check("专项足额时执行路径与 2.0 规划口径（不设额度）逐日相同：借款、现金、利息565.34元", () => {
  const plan = simulate(draft, planningConfig(defaultConfig), deterministic(), { trace: true });
  for (let d = 0; d <= 180; d++) {
    assert.ok(Math.abs(r.days[d].A_debt - plan.days[d].A_debt) < 1e-6, "A_debt day " + d);
    assert.ok(Math.abs(r.days[d].A_cash - plan.days[d].A_cash) < 1e-6, "A_cash day " + d);
    assert.ok(Math.abs(r.days[d].B_debt - plan.days[d].B_debt) < 1e-6, "B_debt day " + d);
  }
  assert.ok(Math.abs(r.interest_A - plan.interest_A) < 1e-9);
  assert.equal(+r.interest_A.toFixed(2), 565.34);
  assert.equal(plan.peak_A, 306720);
  return { interestA: +r.interest_A.toFixed(2), planningPeak: wan(plan.peak_A) };
});
check("不用未到账回款支付现实支出：第40、41日专项余额在第3批货款到账前保持", () => {
  assert.equal(r.days[39].A_tranche_debt, 0);
  assert.equal(r.days[40].A_tranche_debt, 106720);
  assert.equal(r.days[41].A_tranche_debt, 106720);
  assert.equal(r.days[42].A_tranche_debt, 0);
  assert.ok(r.days[40].A_cash >= -1e-7 && r.days[41].A_cash >= -1e-7);
  assert.equal(r.days[41].invoice_paid[2], 0);
  assert.equal(r.days[42].invoice_paid[2], 136080);
});
check("一般额度部分不超过20万元，专项累计提款不超过获批额度", () => {
  for (const d of r.days) {
    assert.ok(d.A_debt - d.A_tranche_debt <= 200000 + 1e-5, "day " + d.day);
    assert.ok(d.A_tranche_draws <= 136080 + 1e-5);
  }
});
check("专项提款与归还形成唯一的模拟银行凭证", () => {
  const ev = wf.evidenceSchedule(s.effective, s.facilityChanges, s.tranche);
  const draws = ev.filter((x) => x.kind === "TRANCHE_DRAW"),
    repays = ev.filter((x) => x.kind === "TRANCHE_REPAY");
  assert.deepEqual(draws.map((x) => [x.day, x.amount]), [[40, 106720]]);
  assert.deepEqual(repays.map((x) => [x.day, Math.round(x.amount)]), [[42, 106720]]);
  assert.equal(new Set(ev.map((x) => x.id)).size, ev.length);
});
check("生效专项存续期间不能再提交新的专项", () => {
  assert.throws(() => wf.submitBank(as(s, "COOP"), "A", "FINANCING", "TRANCHE"));
});
check("确定性基准下无复核提示", () => assert.deepEqual(wf.reviewSignals(s), []));
check("证据标为存在差异时生成复核提示，且不改变专项与借款", () => {
  const x = wf.verifyEvidence(as(s, "BANK"), "purchase-2", "存在差异", "数量需补充说明");
  const sig = wf.reviewSignals(x);
  assert.ok(sig.some((g) => g.key === "evidence-purchase-2"));
  assert.deepEqual(x.tranche, s.tranche);
  assert.equal(wf.execution(x).tranche_draws, 106720);
});
check("下游持续拖欠：复核提示给出下游逾期与专项到期余额", () => {
  let z = wf.createRule(wf.emptyState(), plans[0], defaultConfig, true);
  z = wf.confirmRule(z, "initial");
  z = wf.confirmRule(as(z, "FACTORY"), "initial");
  z = wf.loadHistory(as(wf.activate(z, "initial"), "COOP"), 20);
  z = as(wf.propose(as(z, "FACTORY"), 15, [2, 3, 4]), "COOP");
  const g = wf.financingPlan(z);
  assert.equal(g.applicable, true);
  z = wf.confirmReceivable(as(z, "FACTORY"));
  z = wf.submitBank(as(z, "COOP"), "A", "FINANCING", "TRANCHE");
  const cid = z.cases[0].id;
  z = wf.bankDecision(as(z, "BANK"), cid, "APPROVED", "模拟批准", null, { limit: g.upper, closeDay: g.closeDay, maturityDay: g.maturityDay });
  z = wf.acknowledgeBank(z, cid);
  z = wf.activate(wf.confirmRule(as(z, "COOP"), "draft"), "draft");
  const keys = wf.reviewSignals(z).map((x) => x.key);
  assert.ok(keys.includes("maturity-balance"));
  assert.ok(keys.some((k) => k.startsWith("downstream-")));
  const e = wf.execution(z);
  return { draw: wan(e.tranche_draws), dueAtMaturity: wan(e.tranche_due_at_maturity), overdueDays: e.tranche_overdue_days };
});
check("一般额度调整（2.0 流程）仍可选择，回执写入 facilityChanges", () => {
  let y = wf.submitBank(day20(), "A", "FINANCING");
  const gid = y.cases[0].id;
  assert.equal(y.cases[0].structure, "GENERAL");
  y = wf.bankDecision(as(y, "BANK"), gid, "APPROVED", "模拟批准总额度31万元", 310000);
  y = wf.acknowledgeBank(y, gid);
  assert.deepEqual(y.facilityChanges, [{ day: 21, party: "A", limit: 310000, maturityDay: 120 }]);
  assert.equal(y.tranche, null);
});
await build({
  entryPoints: ["src/study.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/study.mjs",
});
const { sampleAt } = await import("../verification/study.mjs?" + Date.now());
check("全情景不变量：专项窗口外不提款、一般部分不超额度、专项不超获批、资金守恒、现金非负", () => {
  const T = { party: "A", limit: 136080, batches: [4], openDay: 21, closeDay: 50, maturityDay: 62, sourceBatch: 2, overdueCheck: "internal", freezeGeneralOnOverdue: true };
  const cfg = { ...defaultConfig, tranche: T };
  let paths = 0, rows = 0, maxErr = 0, drawn = 0;
  for (const [regime, n] of [["base", 12000], ["mild", 6000], ["severe", 6000]])
    for (let i = 0; i < n; i++) {
      const r = simulate(draft, cfg, sampleAt(regime, i), { trace: true });
      let last = 0;
      for (const d of r.days) {
        const inc = d.A_tranche_draws - last;
        if (inc > 1e-7) assert.ok(d.day >= T.openDay && d.day <= T.closeDay && d.day < T.maturityDay, `${regime}#${i} 窗口外提款 day ${d.day}`);
        assert.ok(d.A_debt - d.A_tranche_debt <= 200000 + 1e-5, `${regime}#${i} 一般部分超额度`);
        assert.ok(d.A_tranche_draws <= T.limit + 1e-5 && d.A_tranche_debt >= -1e-7 && d.A_tranche_debt <= d.A_debt + 1e-7);
        assert.ok(d.A_cash >= -1e-5 && d.B_cash >= -1e-5 && d.A_reserve >= -1e-5);
        last = d.A_tranche_draws;
        rows++;
      }
      maxErr = Math.max(maxErr, r.conservation_max_abs_error);
      if (r.tranche_draws > 1e-7) drawn++;
      paths++;
    }
  assert.ok(maxErr < 1e-5);
  return { paths, dayRows: rows, drawnPaths: drawn, maxConservation: maxErr };
});
fs.writeFileSync(
  "verification/financing-checks.json",
  JSON.stringify({ status: "PASS", checks: results.length, results }, null, 2),
);
console.log("PASS:", results.length, "financing workflow checks");




