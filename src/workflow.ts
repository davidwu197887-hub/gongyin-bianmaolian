import {
  Config,
  Plan,
  Result,
  DayRecord,
  simulate,
  deterministic,
  planningConfig,
  QUANTITIES,
  PURCHASE_DAYS,
  Tranche,
} from "./engine";
export type Role = "COOP" | "FACTORY" | "BANK" | "MEMBER";
// 3.0：融资结构。GENERAL 为 2.0 的一般额度调整；TRANCHE 为批次专项提款安排（模拟）。
export type Structure = "GENERAL" | "TRANCHE";
export interface TrancheTerms {
  limit: number;
  closeDay: number;
  maturityDay: number;
}
// 获批专项（模拟）。ruleHash 为批准依据的规则；只有该规则有效时才进入执行投影。
export interface ActiveTranche extends Tranche {
  caseId: string;
  ruleHash: string;
  receiptId: string;
}
export interface ReceivableConfirmation {
  batch: number;
  amount: number;
  dueDay: number;
  ruleHash: string;
  day: number;
}
export interface Rule {
  version: string;
  plan: Plan;
  config: Config;
  freeze: boolean;
  hash: string;
  confirmed: string[];
  basedOn?: string;
  createdDay: number;
}
export interface Evidence {
  id: string;
  kind: string;
  batch: number | null;
  party: string;
  day: number;
  amount: number;
  label: string;
  source: string;
  status: "待核验" | "存在差异" | "已核验";
  version: string;
  note: string;
  balances?: { A_debt: number; B_debt: number; A_cash: number; B_cash: number };
}
export interface BankCase {
  id: string;
  kind: "FINANCING" | "RISK_REVIEW";
  party: "A" | "B";
  amount: number;
  need: any;
  ruleHash: string;
  draftHash: string | null;
  status:
    | "PENDING_BANK_REVIEW"
    | "NEEDS_MATERIAL"
    | "APPROVED"
    | "NOT_APPROVED"
    | "REVIEW_COMPLETED"
    | "EXECUTED";
  materials: string;
  feedback: string;
  followUpDay: number | null;
  approvedLimit: number | null;
  approvalDay: number | null;
  receiptId: string | null;
  structure?: Structure;
  plan?: FinancingPlan | null;
  terms?: TrancheTerms | null;
}
export interface State {
  role: Role;
  effective: Rule | null;
  initial: Rule | null;
  draft: Rule | null;
  history: Rule[];
  day: number;
  facilityChanges: NonNullable<Config["facility_changes"]>;
  tranche?: ActiveTranche | null;
  confirmations?: ReceivableConfirmation[];
  evidence: Evidence[];
  cases: BankCase[];
  audit: {
    seq: number;
    day: number;
    actor: Role;
    action: string;
    detail: string;
  }[];
  disputes: {
    id: string;
    member: string;
    message: string;
    reply: string;
    closed: boolean;
  }[];
}
export const emptyState = (): State => ({
  role: "COOP",
  effective: null,
  initial: null,
  draft: null,
  history: [],
  day: 0,
  facilityChanges: [],
  tranche: null,
  confirmations: [],
  evidence: [],
  cases: [],
  audit: [],
  disputes: [],
});
export function hash(x: any) {
  let h = 2166136261;
  for (const c of JSON.stringify(x)) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return "B" + (h >>> 0).toString(16).padStart(8, "0");
}
// 执行投影使用的融资条件：获批额度变更，以及依据规则仍为当前规则时的批次专项。
export function execConfig(s: State, rule: Rule): Config {
  const t = s.tranche;
  return {
    ...rule.config,
    facility_changes: s.facilityChanges,
    tranche:
      t && t.ruleHash === rule.hash
        ? {
            party: t.party,
            limit: t.limit,
            batches: t.batches,
            openDay: t.openDay,
            closeDay: t.closeDay,
            maturityDay: t.maturityDay,
            sourceBatch: t.sourceBatch,
            overdueCheck: t.overdueCheck,
            freezeGeneralOnOverdue: t.freezeGeneralOnOverdue,
          }
        : null,
  };
}
const log = (s: State, action: string, detail: string): State => ({
  ...s,
  audit: [
    ...s.audit,
    { seq: s.audit.length + 1, day: s.day, actor: s.role, action, detail },
  ],
});
const requireRole = (s: State, roles: Role[]) => {
  if (!roles.includes(s.role))
    throw Error("当前角色无此项操作权限，请切换相应演示角色");
};
export function createRule(
  s: State,
  plan: Plan,
  config: Config,
  freeze = false,
) {
  requireRole(s, ["COOP", "FACTORY"]);
  if (s.effective) throw Error("已有有效规则，请通过变更草案调整");
  simulate(plan, config, deterministic(freeze));
  const initial: Rule = {
    version: "Rule-V1",
    plan: structuredClone(plan),
    config: structuredClone(config),
    freeze,
    confirmed: [],
    hash: hash({ plan, config, freeze }),
    createdDay: s.day,
  };
  return log(
    { ...s, initial },
    "建立规则",
    "根据选定方案建立待确认规则；案例既有融资条件独立导入",
  );
}
export function confirmRule(s: State, kind: "initial" | "draft") {
  requireRole(s, ["COOP", "FACTORY"]);
  const r = s[kind];
  if (!r) throw Error("请先形成规则草案");
  const who = s.role === "COOP" ? "甲" : "乙";
  if (r.confirmed.includes(who)) return s;
  const next = { ...r, confirmed: [...r.confirmed, who] };
  return log(
    { ...s, [kind]: next },
    "按责确认",
    `${who}确认${r.version}中自身承担的合同条件`,
  );
}
export function activate(s: State, kind: "initial" | "draft") {
  requireRole(s, ["COOP", "FACTORY"]);
  const r = s[kind];
  if (!r || !["甲", "乙"].every((x) => r.confirmed.includes(x)))
    throw Error("请完成甲、乙必要确认");
  if (kind === "draft" && r.basedOn !== s.effective?.hash)
    throw Error("草案依据已变化，请重新计算和确认");
  if (kind === "draft" && s.effective) {
    const a = execution(s),
      b = simulate(
        r.plan,
        execConfig(s, r),
        deterministic(r.freeze),
        { trace: true },
      )!;
    for (let i = 0; i <= s.day; i++) {
      const x = a.days[i],
        y = b.days[i];
      for (const k of [
        "A_cash",
        "A_debt",
        "B_cash",
        "B_debt",
        "ordered_tonnes",
        "accepted_tonnes",
        "finished_tonnes",
      ] as const)
        if (Math.abs(x[k] - y[k]) > 0.00001)
          throw Error("拟议条件改变了已发生历史，请核对变更范围");
    }
  }
  return log(
    {
      ...s,
      effective: r,
      [kind]: null,
      history: s.effective ? [...s.history, s.effective] : s.history,
    },
    "规则生效",
    `${r.version}成为当前有效规则；银行申请及审批状态分别保留`,
  );
}
export function propose(s: State, term: number, batches: number[]) {
  requireRole(s, ["FACTORY", "COOP"]);
  if (!s.effective) throw Error("请先确认有效规则");
  if (s.draft) throw Error("请先处理或撤回现有草案");
  if (!batches.length) throw Error("请选择需要调整的未到期批次");
  const r = execution(s),
    old = s.effective;
  const terms = old.plan.terms
    ? [...old.plan.terms]
    : Array(5).fill(old.plan.term);
  for (const j of batches) {
    if (j < 0 || j > 4 || r.internal_due[j] <= s.day)
      throw Error("本演示仅调整尚未到期批次，既有到期义务保留原依据");
    terms[j] = term;
  }
  const plan = {
    ...structuredClone(old.plan),
    terms,
    counterfactual: true,
    name: "账期调整草案",
  };
  simulate(plan, old.config, deterministic(old.freeze));
  const draft: Rule = {
    ...structuredClone(old),
    version: "Draft-V" + (s.history.length + 2),
    plan,
    hash: hash({ base: old.hash, plan }),
    basedOn: old.hash,
    createdDay: s.day,
    confirmed: [s.role === "FACTORY" ? "乙" : "甲"],
  };
  return log(
    { ...s, draft },
    "提出变更",
    `批次${batches.map((x) => x + 1).join("、")}拟改为验收后${term}日付款；当前有效规则继续适用`,
  );
}
export function withdraw(s: State) {
  requireRole(s, ["COOP", "FACTORY"]);
  if (!s.draft) return s;
  return log(
    { ...s, draft: null },
    "草案处理",
    "保留草案及需求记录，当前有效规则继续执行",
  );
}
export function execution(s: State): Result {
  if (!s.effective) throw Error("请先形成有效规则");
  return simulate(
    s.effective.plan,
    execConfig(s, s.effective),
    deterministic(s.effective.freeze),
    { trace: true },
  )!;
}
export function evidenceSchedule(
  rule: Rule,
  changes: State["facilityChanges"] = [],
  tranche: State["tranche"] = null,
): Evidence[] {
  const r = simulate(
      rule.plan,
      execConfig(
        { ...emptyState(), facilityChanges: changes, tranche },
        rule,
      ),
      deterministic(rule.freeze),
      { trace: true },
    )!,
    c = rule.config,
    p = rule.plan;
  const all: Evidence[] = [];
  const add = (
    id: string,
    kind: string,
    batch: number | null,
    party: string,
    day: number,
    amount: number,
    label: string,
    source = "业务单据·模拟",
  ) => {
    if (day < 0 || day > c.horizon || day >= 10000) return;
    all.push({
      id,
      kind,
      batch,
      party,
      day,
      amount,
      label,
      source,
      status: "待核验",
      version: rule.version,
      note: "",
    });
  };
  for (let j = 0; j < 5; j++) {
    if (r.order_days[j] >= 0)
      add(
        "purchase-" + j,
        "PURCHASE",
        j,
        "A",
        r.order_days[j],
        QUANTITIES[j] * c.prepaid_per_tonne,
        "向成员预付收购款",
      );
    if (r.accept_days[j] < 10000)
      add(
        "accept-" + j,
        "ACCEPT",
        j,
        "B",
        r.accept_days[j],
        QUANTITIES[j],
        "完成交割验收",
      );
    let lastTail = 0,
      lastInv = 0,
      lastAdv = 0,
      lastDown = false;
    for (const d of r.days) {
      const td = d.tail_paid[j] - lastTail,
        iv = d.invoice_paid[j] - lastInv,
        av = d.advance_paid[j] - lastAdv;
      if (td > 0.00001)
        add(
          `tail-${j}-${d.day}`,
          "MEMBER_PAY",
          j,
          "A",
          d.day,
          td,
          "成员收购尾款支付",
          "银行支付回执·模拟",
        );
      if (iv > 0.00001)
        add(
          `invoice-${j}-${d.day}`,
          "TRADE_PAY",
          j,
          "B",
          d.day,
          iv,
          "乙向甲支付货款",
          "银行支付回执·模拟",
        );
      if (av > 0.00001)
        add(
          `advance-${j}-${d.day}`,
          "TRADE_PAY",
          j,
          "B",
          d.day,
          av,
          "乙支付贸易预付款",
          "银行支付回执·模拟",
        );
      if (d.down_paid[j] && !lastDown)
        add(
          "external-" + j,
          "EXTERNAL_RECEIPT",
          j,
          "B",
          d.day,
          QUANTITIES[j] * c.downstream_cash_per_raw_tonne,
          "乙取得成品销售回款",
          "银行收款回执·模拟",
        );
      lastTail = d.tail_paid[j];
      lastInv = d.invoice_paid[j];
      lastAdv = d.advance_paid[j];
      lastDown = d.down_paid[j];
    }
  }
  // 专项提款按受托支付记录，归还按日终回笼记录（均为模拟银行凭证）。
  let lastDraw = 0,
    lastTDebt = 0;
  for (const d of r.days) {
    const draw = d.A_tranche_draws - lastDraw,
      repay = lastTDebt + draw - d.A_tranche_debt;
    if (draw > 0.00001)
      add(
        `tdraw-${d.day}`,
        "TRANCHE_DRAW",
        null,
        "A",
        d.day,
        draw,
        "专项提款（受托支付至采购收款方）",
        "银行放款凭证·模拟",
      );
    if (repay > 0.00001)
      add(
        `trepay-${d.day}`,
        "TRANCHE_REPAY",
        null,
        "A",
        d.day,
        repay,
        "专项本金归还（回笼账户日终扣划）",
        "银行还款凭证·模拟",
      );
    lastDraw = d.A_tranche_draws;
    lastTDebt = d.A_tranche_debt;
  }
  for (const d of r.days) {
    add(
      "close-" + d.day,
      "BANK_CLOSE",
      null,
      "BANK",
      d.day,
      d.A_debt,
      "甲、乙日终资金与本金核对",
      "银行日终对账·模拟",
    );
    all[all.length - 1].balances = {
      A_debt: d.A_debt,
      B_debt: d.B_debt,
      A_cash: d.A_cash,
      B_cash: d.B_cash,
    };
  }
  return all.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
}
export function setDay(s: State, day: number) {
  if (!Number.isSafeInteger(day) || day < 0 || day > 180)
    throw Error("请选择0—180日的观察时点");
  return { ...s, day };
}
export function submitEvidence(s: State, id: string) {
  requireRole(s, ["COOP", "FACTORY", "BANK"]);
  if (!s.effective) throw Error("请先形成有效规则");
  const ev = evidenceSchedule(s.effective, s.facilityChanges, s.tranche).find(
    (x) => x.id === id,
  );
  if (!ev || ev.day > s.day) throw Error("事项尚未发生，请在发生后登记");
  if (s.evidence.some((x) => x.id === id)) return s;
  return log(
    { ...s, evidence: [...s.evidence, ev] },
    "提交材料",
    `${ev.label}，批次${ev.batch === null ? "日终" : ev.batch + 1}，来源${ev.source}`,
  );
}
export function verifyEvidence(
  s: State,
  id: string,
  status: Evidence["status"],
  note = "",
) {
  requireRole(s, ["COOP", "FACTORY", "BANK"]);
  const ev = s.evidence.find((x) => x.id === id);
  if (!ev) throw Error("请先提交材料");
  if (ev.status === status && ev.note === note) return s;
  if (ev.kind === "BANK_CLOSE" && s.role !== "BANK")
    throw Error("日终银行记录由客户经理视图核验");
  return log(
    {
      ...s,
      evidence: s.evidence.map((x) =>
        x.id === id ? { ...x, status, note } : x,
      ),
    },
    "材料核验",
    `${ev.label}：${status}${note ? "；" + note : ""}`,
  );
}
export function loadHistory(s: State, day: number) {
  requireRole(s, ["COOP", "FACTORY", "BANK"]);
  if (!s.effective) throw Error("请先形成有效规则");
  const schedule = evidenceSchedule(s.effective, s.facilityChanges, s.tranche).filter(
    (x) => x.day <= day,
  );
  const old = new Map(s.evidence.map((x) => [x.id, x]));
  for (const ev of schedule)
    if (!old.has(ev.id))
      old.set(ev.id, {
        ...ev,
        status: "已核验",
        note: "载入案例模拟材料及独立支付回执",
      });
  return log(
    { ...s, day, evidence: [...old.values()] },
    "载入案例履约",
    `截至第${day}日的模拟单据、支付回执和日终对账已分别核验；未来事项保持预测`,
  );
}
export function translateNeed(
  s: State,
  party: "A" | "B" = "A",
  kind: "FINANCING" | "RISK_REVIEW" = "FINANCING",
) {
  if (!s.effective) throw Error("请先形成有效规则");
  const before = s.effective,
    after = s.draft ?? s.effective,
    c = before.config,
    key = party === "A" ? "A" : "B",
    limit = (party === "A" ? c.limit_A : c.limit_B) ?? Infinity;
  const base = simulate(
      before.plan,
      planningConfig(c),
      deterministic(before.freeze),
      { trace: true },
    )!,
    draft = simulate(
      after.plan,
      planningConfig(c),
      deterministic(after.freeze),
      { trace: true },
    )!;
  const exBefore = execution(s),
    exAfter = simulate(
      after.plan,
      execConfig(s, after),
      deterministic(after.freeze),
      { trace: true },
    )!;
  const limitOn = (day: number) =>
    s.facilityChanges
      .filter((x) => x.party === party && x.day <= day)
      .sort((a, b) => a.day - b.day)
      .at(-1)?.limit ?? limit;
  const debt = (d: DayRecord) => (party === "A" ? d.A_debt : d.B_debt);
  const future = draft.days.filter((d) => d.day >= s.day),
    pressured = future.filter((d) => debt(d) > limitOn(d.day) + 0.00001);
  const peakBefore = base["peak_" + key],
    peakAfter = draft["peak_" + key],
    waiting = Math.max(0, ...future.map((d) => debt(d) - limitOn(d.day))),
    start = pressured[0]?.day ?? s.day;
  const end = pressured.length
    ? (draft.days.find(
        (d) => d.day > start && debt(d) <= limitOn(d.day) + 0.00001,
      )?.day ?? null)
    : null;
  const expected = exAfter.days[s.day],
    bankClose = s.evidence.find(
      (x) => x.id === "close-" + s.day && x.status === "已核验",
    ),
    existing =
      party === "A"
        ? (bankClose?.balances?.A_debt ?? exBefore.days[s.day].A_debt)
        : (bankClose?.balances?.B_debt ?? exBefore.days[s.day].B_debt);
  const receiptIndex =
    party === "A"
      ? draft.internal_due.findIndex((x: number) => x >= start && x < 10000)
      : draft.external_receipt_days.findIndex(
          (x: number) => x >= start && x < 10000,
        );
  const evidence = s.evidence.filter((x) => x.day <= s.day),
    missing = evidence.filter((x) => x.status !== "已核验");
  return {
    kind,
    party,
    subject: party === "A" ? "合作组织甲" : "加工企业乙",
    amount: kind === "FINANCING" ? waiting : 0,
    originalPeak: peakBefore,
    proposedPeak: peakAfter,
    increment: peakAfter - peakBefore,
    waiting,
    startDay: start,
    endDay: end,
    purpose:
      party === "A" ? "后续批次原料采购及相关费用" : "原料货款及加工支出",
    receiptBatch: receiptIndex < 0 ? null : receiptIndex + 1,
    receiptDay:
      receiptIndex < 0
        ? null
        : party === "A"
          ? draft.internal_due[receiptIndex]
          : draft.external_receipt_days[receiptIndex],
    receiptAmount:
      receiptIndex < 0
        ? null
        : QUANTITIES[receiptIndex] *
          (party === "A" ? after.plan.price : c.downstream_cash_per_raw_tonne),
    existingDebt: existing,
    existingConfirmed: !!bankClose?.balances,
    maturityDay: c.limit_expiry,
    clearBefore: exBefore["settlement_day_" + key],
    clearAfter: exAfter["settlement_day_" + key],
    duePrincipal:
      party === "A"
        ? exAfter.days[c.limit_expiry].A_debt
        : exAfter.days[c.limit_expiry].B_debt,
    rule: before.version,
    draft: s.draft?.version ?? null,
    evidenceCount: evidence.length,
    verifiedCount: evidence.length - missing.length,
    missing: missing.map((x) => x.label),
    observedDay: s.day,
    expectedCash: party === "A" ? expected.A_cash : expected.B_cash,
    needs: [
      "核对付款条件及变更原因",
      "补充企业其他收支、全口径债务与账户可用资金",
      "核验回款来源及已有融资清偿约束",
    ],
    ruleHash: before.hash,
    draftHash: s.draft?.hash ?? null,
  };
}
// ---- 3.0 批次专项提款安排（模拟）----
export interface PlanCondition {
  key: string;
  label: string;
  status: "满足" | "待满足" | "不满足";
  note: string;
  daily: boolean;
}
export interface FinancingPlan {
  applicable: boolean;
  reason: string;
  ruleHash: string;
  version: string;
  targetBatch: number | null;
  plannedDay: number | null;
  delayedDay: number | null;
  sourceBatch: number | null;
  sourceAcceptDay: number | null;
  sourceDueDay: number | null;
  receivable: number;
  purposeAmount: number;
  lower: number;
  upper: number;
  openDay: number;
  closeDay: number;
  maturityDay: number;
  conditions: PlanCondition[];
}
// 期限形成方式：提款截止＝目标批次计划采购日＋10日；到期＝还款来源合同付款日＋20日，不晚于一般额度到期日。
export const TRANCHE_WINDOW = 10,
  TRANCHE_BUFFER = 20;
const EPS_W = 0.00001;
export function financingPlan(s: State): FinancingPlan | null {
  if (!s.effective) return null;
  const rule = s.draft ?? s.effective,
    c = rule.config,
    p = rule.plan,
    planned = p.purchase_override ?? PURCHASE_DAYS;
  const exec = simulate(
    p,
    { ...c, facility_changes: s.facilityChanges, tranche: null },
    deterministic(rule.freeze),
    { trace: true },
  )!;
  const base: FinancingPlan = {
    applicable: false,
    reason: "",
    ruleHash: rule.hash,
    version: rule.version,
    targetBatch: null,
    plannedDay: null,
    delayedDay: null,
    sourceBatch: null,
    sourceAcceptDay: null,
    sourceDueDay: null,
    receivable: 0,
    purposeAmount: 0,
    lower: 0,
    upper: 0,
    openDay: s.day + 1,
    closeDay: s.day + 1,
    maturityDay: s.day + 2,
    conditions: [],
  };
  // 用款批次：现有额度下最早顺延、且计划采购日未过的批次。
  const target = QUANTITIES.findIndex(
    (_, j) =>
      planned[j] >= s.day &&
      (exec.order_days[j] < 0 || exec.order_days[j] > planned[j]),
  );
  if (target < 0)
    return {
      ...base,
      reason: s.tranche
        ? "已有获批专项；当前观察日之后没有新的受额度约束的待启动批次"
        : "现有额度下当前观察日之后的批次均可按计划采购，不形成专项提款需要",
    };
  const day = planned[target],
    need = translateNeed(s, "A", "FINANCING");
  base.targetBatch = target;
  base.plannedDay = day;
  base.delayedDay = exec.order_days[target] < 0 ? null : exec.order_days[target];
  if (need.waiting <= EPS_W)
    return {
      ...base,
      reason:
        "规划口径下没有超出现有额度的资金需要，顺延来自付款方延迟等执行因素，建议发起风险核查",
    };
  // 还款来源：计划采购日前已验收、该日尚未到付款日的其他批次中，付款日最早者。
  let source = -1;
  for (let j = 0; j < 5; j++)
    if (
      j !== target &&
      exec.accept_days[j] <= day &&
      exec.internal_due[j] >= day &&
      exec.internal_due[j] < 10000 &&
      (source < 0 || exec.internal_due[j] < exec.internal_due[source])
    )
      source = j;
  if (source < 0)
    return {
      ...base,
      lower: need.waiting,
      reason: `第${target + 1}批计划采购日前没有已验收、未到期的批次应收可作还款依据，缺口需由银行按企业整体经营判断一般流动资金额度`,
    };
  const receivable = QUANTITIES[source] * p.price * (1 - p.prepay_fraction),
    purposeAmount =
      QUANTITIES[target] *
        (c.prepaid_per_tonne + c.logistics_per_tonne) +
      c.setup_per_purchase +
      QUANTITIES[target] * (c.member_total_per_tonne - c.prepaid_per_tonne),
    dueDay = exec.internal_due[source],
    openDay = s.day + 1,
    closeDay = Math.min(day + TRANCHE_WINDOW, c.limit_expiry - 1),
    maturityDay = Math.min(dueDay + TRANCHE_BUFFER, c.limit_expiry);
  if (maturityDay <= Math.max(closeDay, dueDay))
    return {
      ...base,
      lower: need.waiting,
      reason: "还款来源付款日距一般额度到期日过近，不宜单设专项",
    };
  Object.assign(base, {
    applicable: true,
    reason: `第${source + 1}批已验收应收覆盖第${target + 1}批采购的过桥需要`,
    sourceBatch: source,
    sourceAcceptDay: exec.accept_days[source],
    sourceDueDay: dueDay,
    receivable,
    purposeAmount,
    lower: need.waiting,
    upper: Math.min(receivable, purposeAmount),
    openDay,
    closeDay,
    maturityDay,
  });
  base.conditions = planConditions(s, base, exec);
  return base;
}
// 提款前条件逐项状态。daily 为 true 的项由引擎在每个提款日日初重新判定。
function planConditions(
  s: State,
  f: FinancingPlan,
  exec: Result,
): PlanCondition[] {
  const src = f.sourceBatch!,
    tgt = f.targetBatch!,
    day = f.plannedDay!,
    ev = (id: string) =>
      s.evidence.find((x) => x.id === id && x.day <= s.day),
    st = (ok: boolean, wait: boolean): PlanCondition["status"] =>
      ok ? "满足" : wait ? "待满足" : "不满足";
  const draft = s.draft,
    accepted = ev("accept-" + src),
    purchase = ev("purchase-" + tgt),
    confirmed = (s.confirmations ?? []).some(
      (x) => x.batch === src && x.ruleHash === f.ruleHash,
    ),
    rec = exec.days[Math.min(s.day, exec.days.length - 1)],
    overdue = QUANTITIES.some(
      (_, j) =>
        exec.internal_due[j] < s.day &&
        exec.actual_internal_paid[j] < QUANTITIES[j] * (draft ?? s.effective)!.plan.price - EPS_W &&
        exec.accept_days[j] <= s.day,
    );
  return [
    {
      key: "rule",
      label: "引起缺口的条件变更已由甲乙确认生效",
      status: draft ? st(false, draft.confirmed.length < 2) : "满足",
      note: draft
        ? `${draft.version}已确认：${draft.confirmed.join("、") || "无"}；生效后专项才进入执行投影`
        : `${s.effective!.version}为当前有效规则`,
      daily: false,
    },
    {
      key: "accept",
      label: `第${src + 1}批验收记录已核验`,
      status: st(accepted?.status === "已核验", !accepted),
      note: accepted
        ? `第${accepted.day}日验收，${accepted.status}`
        : `预计第${f.sourceAcceptDay}日验收；引擎在提款日检查是否已验收`,
      daily: true,
    },
    {
      key: "due",
      label: `第${src + 1}批合同付款日早于专项到期日`,
      status: st(f.sourceDueDay! < f.maturityDay, false),
      note: `付款日第${f.sourceDueDay}日，专项到期第${f.maturityDay}日`,
      daily: true,
    },
    {
      key: "confirm",
      label: `乙确认第${src + 1}批应付金额与付款日`,
      status: st(confirmed, true),
      note: confirmed
        ? `已确认${(f.receivable / 10000).toFixed(3)}万元、第${f.sourceDueDay}日付款`
        : "需切换为加工企业乙确认",
      daily: false,
    },
    {
      key: "purchase",
      label: `第${tgt + 1}批采购单据已登记`,
      status: st(!!purchase, s.day < day),
      note: purchase
        ? `第${purchase.day}日登记，${purchase.status}`
        : `计划第${day}日采购；作为受托支付对象与金额的依据`,
      daily: false,
    },
    {
      key: "overdue",
      label: "提款当日乙对甲没有到期未付货款",
      status: st(!overdue, false),
      note: overdue ? "存在到期未付货款，专项不能提用" : "截至当前观察日无到期未付",
      daily: true,
    },
    {
      key: "interest",
      label: "甲没有欠息",
      status: st(rec.A_interest_due < EPS_W, false),
      note: rec.A_interest_due < EPS_W ? "无欠息" : "存在欠息",
      daily: true,
    },
  ];
}
// 乙确认还款来源批次的应付金额与付款日。只证明还款来源，不构成对甲借款的保证。
export function confirmReceivable(s: State) {
  requireRole(s, ["FACTORY"]);
  const f = financingPlan(s);
  if (!f?.applicable || f.sourceBatch === null)
    throw Error("当前没有可确认的还款来源批次");
  const list = s.confirmations ?? [];
  if (list.some((x) => x.batch === f.sourceBatch && x.ruleHash === f.ruleHash))
    return s;
  return log(
    {
      ...s,
      confirmations: [
        ...list,
        {
          batch: f.sourceBatch,
          amount: f.receivable,
          dueDay: f.sourceDueDay!,
          ruleHash: f.ruleHash,
          day: s.day,
        },
      ],
    },
    "应付确认",
    `乙确认第${f.sourceBatch + 1}批应付${(f.receivable / 10000).toFixed(3)}万元，按${f.version}于第${f.sourceDueDay}日付款；不构成对甲借款的保证`,
  );
}
export interface ReviewSignal {
  key: string;
  level: "提示" | "关注";
  text: string;
}
// 复核提示：只提示客户经理，不改变额度、借款或审批状态。
export function reviewSignals(s: State): ReviewSignal[] {
  if (!s.effective) return [];
  const r = execution(s),
    p = s.effective.plan,
    c = s.effective.config,
    t = s.tranche && s.tranche.ruleHash === s.effective.hash ? s.tranche : null,
    out: ReviewSignal[] = [];
  const unpaid = (j: number) =>
    QUANTITIES[j] * p.price - r.actual_internal_paid[j];
  if (t) {
    const j = t.sourceBatch;
    if (r.internal_due[j] < s.day && unpaid(j) > EPS_W)
      out.push({
        key: "source-overdue",
        level: "关注",
        text: `还款来源第${j + 1}批已过合同付款日（第${r.internal_due[j]}日），乙仍未付${(unpaid(j) / 10000).toFixed(3)}万元`,
      });
    const left = r.days[t.maturityDay]?.A_tranche_debt ?? 0;
    if (left > EPS_W)
      out.push({
        key: "maturity-balance",
        level: "关注",
        text: `按当前执行投影，专项到期日第${t.maturityDay}日仍有本金${(left / 10000).toFixed(3)}万元`,
      });
  }
  const watched = t ? [t.sourceBatch, ...t.batches] : [0, 1, 2, 3, 4];
  for (const e of s.evidence)
    if (e.status === "存在差异" && (e.batch === null || watched.includes(e.batch)))
      out.push({
        key: "evidence-" + e.id,
        level: "关注",
        text: `${e.label}（第${e.day}日）标为存在差异：${e.note || "待说明"}`,
      });
  QUANTITIES.forEach((_, j) => {
    const due = r.production_finish[j] + c.downstream_term,
      actual = r.external_receipt_days[j];
    if (r.production_finish[j] < 10000 && actual > due)
      out.push({
        key: "downstream-" + j,
        level: due < s.day ? "关注" : "提示",
        text: `第${j + 1}批下游回款${due < s.day ? "已逾期" : "预计晚于合同日"}（合同第${due}日，${actual > c.horizon ? "观察期内未到账" : "预计第" + actual + "日"}），可能影响乙对甲付款`,
      });
  });
  const planned = p.purchase_override ?? PURCHASE_DAYS;
  QUANTITIES.forEach((_, j) => {
    if (planned[j] < s.day && (r.order_days[j] < 0 || r.order_days[j] > s.day))
      out.push({
        key: "purchase-" + j,
        level: "提示",
        text: `第${j + 1}批计划第${planned[j]}日采购，截至第${s.day}日尚未启动`,
      });
  });
  return out;
}
export interface Arrangement {
  key: string;
  label: string;
  plan: Plan;
  config: Config;
  extra: { kind: "none" | "general" | "tranche"; amount: number; from: number; to: number };
}
// 安排对照：同一确定性路径（或同一组情景）上比较原账期、草案原额度、一般提额、批次专项。
export function arrangements(s: State, f: FinancingPlan | null): Arrangement[] {
  if (!s.effective) return [];
  const e = s.effective,
    rule = s.draft ?? e,
    c = { ...e.config, facility_changes: s.facilityChanges, tranche: null },
    none = { kind: "none" as const, amount: 0, from: 0, to: 0 },
    out: Arrangement[] = [
      { key: "current", label: `${e.version}，现有额度`, plan: e.plan, config: c, extra: none },
    ];
  if (s.draft)
    out.push({ key: "draft", label: `${s.draft.version}，现有额度`, plan: rule.plan, config: c, extra: none });
  if (f?.applicable) {
    const limit = e.config.limit_A ?? 0,
      raise = Math.ceil((limit + f.lower) / 10000) * 10000;
    out.push({
      key: "general",
      label: `${rule.version}，一般额度提至${raise / 10000}万元`,
      plan: rule.plan,
      config: {
        ...c,
        facility_changes: [
          ...s.facilityChanges,
          { day: f.openDay, party: "A", limit: raise, maturityDay: e.config.limit_expiry },
        ],
      },
      extra: { kind: "general", amount: raise - limit, from: f.openDay, to: e.config.limit_expiry },
    });
    out.push({
      key: "tranche",
      label: `${rule.version}，第${f.targetBatch! + 1}批专项${(f.upper / 10000).toFixed(3)}万元`,
      plan: rule.plan,
      config: { ...c, tranche: trancheOf(f, { limit: f.upper, closeDay: f.closeDay, maturityDay: f.maturityDay }) },
      extra: { kind: "tranche", amount: f.upper, from: f.openDay, to: f.closeDay },
    });
  }
  return out;
}
export function trancheOf(f: FinancingPlan, t: TrancheTerms): Tranche {
  return {
    party: "A",
    limit: t.limit,
    batches: [f.targetBatch!],
    openDay: f.openDay,
    closeDay: t.closeDay,
    maturityDay: t.maturityDay,
    sourceBatch: f.sourceBatch!,
    overdueCheck: "internal",
    freezeGeneralOnOverdue: true,
  };
}
// 额外承诺（万元·日）：一般额度按可提期间；专项按开放日至归还日（未提用按开放至截止）。
export function extraLimitDays(a: Arrangement["extra"], r: Result) {
  if (a.kind === "none") return 0;
  if (a.kind === "general") return (a.amount / 10000) * (a.to - a.from);
  const end =
    r.tranche_first_draw_day < 0
      ? a.to + 1
      : Number.isFinite(r.tranche_clear_day)
        ? r.tranche_clear_day
        : 181;
  return (a.amount / 10000) * (end - a.from);
}
export function submitBank(
  s: State,
  party: "A" | "B",
  kind: BankCase["kind"],
  structure: Structure = "GENERAL",
) {
  requireRole(s, ["COOP", "FACTORY", "BANK"]);
  if (
    kind === "FINANCING" &&
    s.role !== "BANK" &&
    (s.role === "COOP" ? "A" : "B") !== party
  )
    throw Error("请切换为需求主体对应的经营角色后提交");
  const need = translateNeed(s, party, kind);
  if (kind === "FINANCING" && need.amount <= 0.00001)
    throw Error("当前无待筹金额，可选择发起风险核查");
  const tranche = kind === "FINANCING" && structure === "TRANCHE",
    plan = tranche ? financingPlan(s) : null;
  if (tranche && (party !== "A" || !plan?.applicable))
    throw Error(plan?.reason || "本演示的批次专项仅适用于合作组织甲");
  const id =
    "CASE-" +
    hash({
      rule: need.ruleHash,
      draft: need.draftHash,
      party,
      kind,
      day: s.day,
      amount: need.amount,
      ...(tranche ? { structure } : {}),
    });
  if (s.cases.some((x) => x.id === id)) return s;
  // 防止重复融资：同一依据下同一主体只能有一项未结的融资申请或一项生效的专项。
  if (
    kind === "FINANCING" &&
    s.cases.some(
      (x) =>
        x.kind === "FINANCING" &&
        x.party === party &&
        x.ruleHash === need.ruleHash &&
        x.draftHash === need.draftHash &&
        x.status !== "NOT_APPROVED",
    )
  )
    throw Error("同一业务依据已有融资申请或获批安排，请勿重复提交");
  // 专项存续期间（到期日前），甲不能就同一缺口再申请一般额度或新的专项。
  if (
    kind === "FINANCING" &&
    party === "A" &&
    s.tranche &&
    s.day < s.tranche.maturityDay
  )
    throw Error("已有生效的批次专项安排覆盖该缺口，请勿重复申请融资");
  const item: BankCase = {
    id,
    kind,
    party,
    amount: need.amount,
    need,
    ruleHash: need.ruleHash,
    draftHash: need.draftHash,
    status: "PENDING_BANK_REVIEW",
    materials: "",
    feedback: "",
    followUpDay: null,
    approvedLimit: null,
    approvalDay: null,
    receiptId: null,
    structure: kind === "FINANCING" ? structure : undefined,
    plan,
    terms: null,
  };
  return log(
    { ...s, cases: [...s.cases, item] },
    "提交银行",
    `${need.subject}提交${kind === "FINANCING" ? (tranche ? "批次专项提款方案" : "融资需求") : "风险核查"}；与经营确认分别记录`,
  );
}
export function bankDecision(
  s: State,
  id: string,
  status: BankCase["status"],
  feedback: string,
  approvedLimit: number | null = null,
  terms: TrancheTerms | null = null,
) {
  requireRole(s, ["BANK"]);
  const x = s.cases.find((x) => x.id === id);
  if (!x) throw Error("未找到办理事项");
  if (!feedback.trim()) throw Error("请填写核查意见或办理依据");
  if (status === "APPROVED" && x.kind !== "FINANCING")
    throw Error("风险核查事项请使用核查完成状态");
  if (!["PENDING_BANK_REVIEW", "NEEDS_MATERIAL"].includes(x.status))
    throw Error("该事项已完成审核，请保留结果并发起新的核查事项");
  const isT = x.structure === "TRANCHE";
  if (status === "APPROVED" && isT) checkTerms(s, x, terms);
  else if (
    status === "APPROVED" &&
    (approvedLimit === null ||
      approvedLimit < 0 ||
      !Number.isFinite(approvedLimit))
  )
    throw Error("请填写模拟获批总额度");
  if (status === "APPROVED" && !isT) {
    const now = execution(s).days[s.day],
      debt = x.party === "A" ? now.A_debt : now.B_debt;
    if (approvedLimit! < debt - 0.00001)
      throw Error("本演示的新增额度安排应覆盖当前未偿本金");
  }
  if (x.status === status && x.feedback === feedback) return s;
  return log(
    {
      ...s,
      cases: s.cases.map((z) =>
        z.id === id
          ? {
              ...z,
              status,
              feedback,
              approvedLimit:
                status === "APPROVED" && !isT ? approvedLimit : z.approvedLimit,
              terms: status === "APPROVED" && isT ? { ...terms! } : z.terms ?? null,
              approvalDay: status === "APPROVED" ? s.day : null,
              followUpDay: Math.min(s.day + 5, 180),
            }
          : z,
      ),
    },
    "银行反馈",
    `${id}：${status}；${feedback}`,
  );
}
// 专项获批条件校验：额度不超过还款来源与用途，期限覆盖还款来源付款日，不晚于一般额度到期。
function checkTerms(s: State, x: BankCase, t: TrancheTerms | null) {
  const f = x.plan;
  if (!f?.applicable) throw Error("该申请没有可用的专项方案依据");
  if (
    !t ||
    !Number.isFinite(t.limit) ||
    !Number.isSafeInteger(t.closeDay) ||
    !Number.isSafeInteger(t.maturityDay)
  )
    throw Error("请填写专项额度、提款截止日与到期日");
  const now = financingPlan(s);
  if (!now || now.ruleHash !== f.ruleHash)
    throw Error("业务依据已变化，请客户重新提交专项方案");
  if (
    !(s.confirmations ?? []).some(
      (c) => c.batch === f.sourceBatch && c.ruleHash === f.ruleHash,
    )
  )
    throw Error(`乙尚未确认第${f.sourceBatch! + 1}批应付，不能批准专项`);
  if (t.limit <= 0 || t.limit > f.upper + EPS_W)
    throw Error(
      `专项额度应大于0且不超过还款来源与用途的较小者${(f.upper / 10000).toFixed(3)}万元`,
    );
  if (t.closeDay < f.openDay || t.closeDay <= s.day)
    throw Error(`提款截止日应不早于生效日第${f.openDay}日`);
  const expiry = s.effective!.config.limit_expiry;
  if (t.maturityDay <= Math.max(t.closeDay, f.sourceDueDay!) || t.maturityDay > expiry)
    throw Error(
      `到期日应晚于提款截止日和还款来源付款日第${f.sourceDueDay}日，且不晚于第${expiry}日`,
    );
  if (s.tranche) throw Error("已有生效的批次专项安排");
}
export function supplement(s: State, id: string, materials: string) {
  requireRole(s, ["COOP", "FACTORY"]);
  if (!materials.trim()) throw Error("请填写补充材料说明");
  const x = s.cases.find((x) => x.id === id);
  if (!x || x.status !== "NEEDS_MATERIAL")
    throw Error("该事项当前未要求补充材料");
  return log(
    {
      ...s,
      cases: s.cases.map((x) =>
        x.id === id ? { ...x, materials, status: "PENDING_BANK_REVIEW" } : x,
      ),
    },
    "补充材料",
    `${id}：${materials}`,
  );
}
export function acknowledgeBank(s: State, id: string) {
  requireRole(s, ["BANK"]);
  const x = s.cases.find((x) => x.id === id);
  if (x?.receiptId) return s;
  if (!x || !["APPROVED", "REVIEW_COMPLETED"].includes(x.status))
    throw Error("请先完成相应银行办理");
  if (x.status === "APPROVED" && x.structure === "TRANCHE") {
    const f = x.plan!,
      t = x.terms!,
      receiptId = "RCPT-" + hash({ id, day: s.day, status: x.status }),
      tranche: ActiveTranche = {
        ...trancheOf({ ...f, openDay: s.day + 1 }, t),
        caseId: id,
        ruleHash: f.ruleHash,
        receiptId,
      };
    if (s.tranche) throw Error("已有生效的批次专项安排");
    if (tranche.openDay > tranche.closeDay)
      throw Error("回执日已晚于提款截止日，请银行重新办理");
    return log(
      {
        ...s,
        tranche,
        cases: s.cases.map((z) =>
          z.id === id ? { ...z, receiptId, status: "EXECUTED" as const } : z,
        ),
      },
      "办理回执回填",
      `${id}专项${(t.limit / 10000).toFixed(3)}万元自第${tranche.openDay}日可提、第${t.closeDay}日截止、第${t.maturityDay}日到期；${f.version}生效后进入执行投影，只用于第${f.targetBatch! + 1}批采购及尾款`,
    );
  }
  const changes =
    x.status === "APPROVED" && x.approvedLimit !== null
      ? [
          ...s.facilityChanges,
          {
            day: s.day + 1,
            party: x.party,
            limit: x.approvedLimit,
            maturityDay: s.effective!.config.limit_expiry,
          },
        ]
      : s.facilityChanges;
  return log(
    {
      ...s,
      facilityChanges: changes,
      cases: s.cases.map((z) =>
        z.id === id
          ? {
              ...z,
              receiptId: "RCPT-" + hash({ id, day: s.day, status: x.status }),
              status: x.status === "APPROVED" ? "EXECUTED" : x.status,
            }
          : z,
      ),
    },
    "办理回执回填",
    x.status === "APPROVED"
      ? `${id}回执已关联需求及后续跟踪；获批额度在下一日进入执行投影，既有履约事实保留`
      : `${id}核查意见与办理回执已返回业务档案，后续跟踪事项继续保留`,
  );
}
export function memberView(s: State, batch = 0) {
  const c = s.effective?.config ?? null;
  if (!c) return null;
  const accepts = s.evidence.filter(
    (x) =>
      x.kind === "ACCEPT" &&
      x.batch === batch &&
      x.status === "已核验" &&
      x.day <= s.day,
  );
  const payments = s.evidence.filter(
    (x) =>
      x.kind === "MEMBER_PAY" &&
      x.batch === batch &&
      x.status === "已核验" &&
      x.day <= s.day,
  );
  const prepay = s.evidence.filter(
    (x) =>
      x.kind === "PURCHASE" &&
      x.batch === batch &&
      x.status === "已核验" &&
      x.day <= s.day,
  );
  const due = accepts.length
      ? c.member_total_per_tonne - c.prepaid_per_tonne
      : 0,
    paid = Math.min(
      due,
      payments.reduce((a, b) => a + b.amount, 0) / QUANTITIES[batch],
    );
  return {
    batch: batch + 1,
    prepay: prepay.length ? c.prepaid_per_tonne : 0,
    contractTotal: c.member_total_per_tonne,
    tail: due,
    paid,
    outstanding: Math.max(due - paid, 0),
    acceptDay: accepts[0]?.day ?? null,
    receiptIds: payments.map((x) => x.id),
    status: !accepts.length
      ? "待交割验收"
      : paid >= due - 0.00001
        ? "已支付（模拟回执已核验）"
        : payments.length
          ? "部分支付"
          : "已形成应付，待支付回执",
  };
}
export function addDispute(s: State, message: string, member: string) {
  requireRole(s, ["MEMBER"]);
  if (!message.trim()) throw Error("请填写需要核对的内容");
  return log(
    {
      ...s,
      disputes: [
        ...s.disputes,
        {
          id: "Q" + (s.disputes.length + 1),
          member,
          message,
          reply: "",
          closed: false,
        },
      ],
    },
    "成员核对",
    `${member}提出款项核对申请`,
  );
}
export function replyDispute(s: State, id: string, reply: string) {
  requireRole(s, ["COOP"]);
  if (!reply.trim()) throw Error("请填写处理说明");
  return log(
    {
      ...s,
      disputes: s.disputes.map((x) =>
        x.id === id ? { ...x, reply, closed: true } : x,
      ),
    },
    "成员反馈",
    `${id}已提供核对说明`,
  );
}
