import { build } from "esbuild";
import fs from "node:fs";
import assert from "node:assert/strict";
await build({
  entryPoints: ["src/workflow.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/workflow.mjs",
});
const wf = await import("../verification/workflow.mjs?" + Date.now());
const { defaultConfig, plans } = await import(
  "../verification/engine.mjs?workflow"
);
let count = 0;
const check = (name, fn) => {
  fn();
  count++;
  console.log("PASS", name);
};
function effective() {
  let s = wf.createRule(wf.emptyState(), plans[0], defaultConfig);
  s = wf.confirmRule(s, "initial");
  s = wf.confirmRule({ ...s, role: "FACTORY" }, "initial");
  return { ...wf.activate(s, "initial"), role: "COOP" };
}
const initial = wf.createRule(wf.emptyState(), plans[0], defaultConfig);
check("缺少必要确认时保持草案", () =>
  assert.throws(() => wf.activate(initial, "initial")),
);
check("银行角色保留独立职责", () =>
  assert.throws(() => wf.confirmRule({ ...initial, role: "BANK" }, "initial")),
);
let s = effective();
check("有效规则保留双方确认", () =>
  assert.deepEqual(s.effective.confirmed, ["甲", "乙"]),
);
check("未来材料保持待发生", () =>
  assert.throws(() => wf.submitEvidence(s, "accept-0")),
);
s = wf.setDay(s, 8);
s = wf.submitEvidence(s, "accept-0");
s = wf.verifyEvidence(s, "accept-0", "已核验");
check("验收形成应付且实付为零", () => {
  const m = wf.memberView(s);
  assert.equal(m.tail, 100);
  assert.equal(m.paid, 0);
  assert.equal(m.status, "已形成应付，待支付回执");
});
s = wf.submitEvidence(s, "tail-0-8");
check("回执待核验时实付仍为零", () => assert.equal(wf.memberView(s).paid, 0));
s = wf.verifyEvidence(s, "tail-0-8", "已核验");
check("独立支付回执核验后记实付", () =>
  assert.equal(wf.memberView(s).paid, 100),
);
check("重复登记不产生重复支付", () => {
  const twice = wf.submitEvidence(s, "tail-0-8");
  assert.equal(twice.evidence.length, s.evidence.length);
  assert.equal(wf.memberView(twice).paid, 100);
});
check("成员角色仅查看本人及提出核对", () =>
  assert.throws(() =>
    wf.submitBank({ ...s, role: "MEMBER" }, "A", "RISK_REVIEW"),
  ),
);
let dispute = wf.addDispute({ ...s, role: "MEMBER" }, "请核对支付依据", "M01");
check("成员核对保留待处理", () =>
  assert.equal(dispute.disputes[0].closed, false),
);
dispute = wf.replyDispute(
  { ...dispute, role: "COOP" },
  dispute.disputes[0].id,
  "已关联本人批次及支付回执",
);
check("合作组织反馈可供成员查询", () =>
  assert.equal(dispute.disputes[0].closed, true),
);
s = wf.loadHistory(effective(), 20);
check("第20日实际台账本金14.664万元", () =>
  assert.equal(wf.execution(s).days[20].A_debt, 146640),
);
check("无新增需求可提交风险核查", () => {
  const x = wf.submitBank(s, "A", "RISK_REVIEW");
  assert.equal(x.cases[0].amount, 0);
  assert.equal(x.cases[0].status, "PENDING_BANK_REVIEW");
});
check("无待筹额的新增融资入口有明确校验", () =>
  assert.throws(() => wf.submitBank(s, "A", "FINANCING")),
);
s = wf.propose({ ...s, role: "FACTORY" }, 15, [2, 3, 4]);
s = { ...s, role: "COOP" };
const need = wf.translateNeed(s, "A");
check("融资申请对应实际需求主体", () =>
  assert.throws(() => wf.submitBank({ ...s, role: "FACTORY" }, "A", "FINANCING")),
);
check("草案资金峰值及需求增量对应第四章", () => {
  assert.ok(Math.abs(need.originalPeak - 170640) < 0.001);
  assert.ok(Math.abs(need.proposedPeak - 306720) < 0.001);
  assert.ok(Math.abs(need.increment - 136080) < 0.001);
  assert.ok(Math.abs(need.waiting - 106720) < 0.001);
});
check("压力窗口与回款来源来自计算", () => {
  assert.equal(need.startDay, 40);
  assert.equal(need.endDay, 42);
  assert.equal(need.receiptDay, 42);
  assert.equal(need.receiptAmount, 136080);
});
check("草案保留有效规则", () => {
  assert.equal(s.effective.plan.term, 5);
  assert.equal(s.draft.confirmed.length, 1);
  assert.throws(() => wf.activate(s, "draft"));
});
let rejected = wf.submitBank(s, "A", "FINANCING");
const id = rejected.cases[0].id;
check("重复提交按需求身份去重", () =>
  assert.equal(wf.submitBank(rejected, "A", "FINANCING").cases.length, 1),
);
check("经营主体不能生成银行结论", () =>
  assert.throws(() =>
    wf.bankDecision(rejected, id, "APPROVED", "额度调整", 310000),
  ),
);
let pending = wf.bankDecision(
  { ...rejected, role: "BANK" },
  id,
  "NEEDS_MATERIAL",
  "请补充回款依据与整体债务",
);
check("新增额度安排覆盖已有未偿本金", () =>
  assert.throws(() => wf.bankDecision({ ...rejected, role: "BANK" }, id, "APPROVED", "模拟额度", 100)),
);
check("银行补充要求回到客户待办", () =>
  assert.equal(pending.cases[0].status, "NEEDS_MATERIAL"),
);
pending = wf.supplement(
  { ...pending, role: "COOP" },
  id,
  "已补充销售合同与债务清单",
);
check("客户补充材料后重新进入银行核查", () =>
  assert.equal(pending.cases[0].status, "PENDING_BANK_REVIEW"),
);
pending = wf.bankDecision(
  { ...pending, role: "BANK" },
  id,
  "APPROVED",
  "依据模拟材料批准总额度31万元",
  310000,
);
check("银行批准不代替合同确认", () => {
  assert.equal(pending.effective.plan.term, 5);
  assert.equal(pending.draft.confirmed.length, 1);
  assert.equal(pending.facilityChanges.length, 0);
});
pending = wf.acknowledgeBank(pending, id);
check("办理回执将条件用于后续执行", () => {
  assert.equal(pending.facilityChanges[0].day, 21);
  assert.equal(pending.cases[0].status, "EXECUTED");
  assert.ok(pending.cases[0].receiptId);
});
check("已发生本金记录保持不变", () =>
  assert.equal(wf.execution(pending).days[20].A_debt, 146640),
);
check("回执重复返回保持幂等", () => {
  const x = wf.acknowledgeBank(pending, id);
  assert.equal(x.facilityChanges.length, 1);
});
pending = wf.confirmRule({ ...pending, role: "COOP" }, "draft");
pending = wf.activate(pending, "draft");
check("合同确认及资金落实后采购按新条件执行", () =>
  assert.equal(wf.execution(pending).order_days[4], 40),
);
check("银行处理完成后保留原结果", () =>
  assert.throws(() =>
    wf.bankDecision(
      { ...pending, role: "BANK" },
      id,
      "NOT_APPROVED",
      "撤销旧结果",
    ),
  ),
);
let risk = wf.submitBank(s, "B", "RISK_REVIEW");
const rid = risk.cases[0].id;
risk = wf.bankDecision(
  { ...risk, role: "BANK" },
  rid,
  "REVIEW_COMPLETED",
  "核查付款原因，继续按约跟踪",
);
risk = wf.acknowledgeBank(risk, rid);
check("风险核查完成回填且不调整授信", () => {
  assert.equal(risk.facilityChanges.length, 0);
  assert.ok(risk.cases[0].receiptId);
});
check("核查回执使用独立的跟踪说明", () => {
  assert.ok(risk.audit.some((x) => JSON.stringify(x).includes("核查意见与办理回执已返回业务档案")));
});
check("已到期批次保留原依据", () =>
  assert.throws(() =>
    wf.propose({ ...wf.loadHistory(effective(), 20), role: "FACTORY" }, 15, [
      0,
    ]),
  ),
);
check("证据冲突保留原记录与核验说明", () => {
  let x = wf.setDay(effective(), 8);
  x = wf.submitEvidence(x, "accept-0");
  x = wf.verifyEvidence(x, "accept-0", "存在差异", "数量需补充说明");
  assert.equal(wf.memberView(x).tail, 0);
  assert.equal(x.evidence[0].note, "数量需补充说明");
});
fs.writeFileSync(
  "verification/workflow-checks.json",
  JSON.stringify({ checks: count, status: "PASS" }, null, 2),
);
console.log("PASS:", count, "workflow checks");
