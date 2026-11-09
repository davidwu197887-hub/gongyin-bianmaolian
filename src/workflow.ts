import {
  Config,
  Plan,
  Result,
  DayRecord,
  simulate,
  deterministic,
  planningConfig,
  QUANTITIES,
} from "./engine";
export type Role = "COOP" | "FACTORY" | "BANK" | "MEMBER";
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
}
export interface State {
  role: Role;
  effective: Rule | null;
  initial: Rule | null;
  draft: Rule | null;
  history: Rule[];
  day: number;
  facilityChanges: NonNullable<Config["facility_changes"]>;
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
        { ...r.config, facility_changes: s.facilityChanges },
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
    { ...s.effective.config, facility_changes: s.facilityChanges },
    deterministic(s.effective.freeze),
    { trace: true },
  )!;
}
export function evidenceSchedule(
  rule: Rule,
  changes: State["facilityChanges"] = [],
): Evidence[] {
  const r = simulate(
      rule.plan,
      { ...rule.config, facility_changes: changes },
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
  const ev = evidenceSchedule(s.effective, s.facilityChanges).find(
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
  const schedule = evidenceSchedule(s.effective, s.facilityChanges).filter(
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
      { ...c, facility_changes: s.facilityChanges },
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
export function submitBank(s: State, party: "A" | "B", kind: BankCase["kind"]) {
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
  const id =
    "CASE-" +
    hash({
      rule: need.ruleHash,
      draft: need.draftHash,
      party,
      kind,
      day: s.day,
      amount: need.amount,
    });
  if (s.cases.some((x) => x.id === id)) return s;
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
  };
  return log(
    { ...s, cases: [...s.cases, item] },
    "提交银行",
    `${need.subject}提交${kind === "FINANCING" ? "融资需求" : "风险核查"}；与经营确认分别记录`,
  );
}
export function bankDecision(
  s: State,
  id: string,
  status: BankCase["status"],
  feedback: string,
  approvedLimit: number | null = null,
) {
  requireRole(s, ["BANK"]);
  const x = s.cases.find((x) => x.id === id);
  if (!x) throw Error("未找到办理事项");
  if (!feedback.trim()) throw Error("请填写核查意见或办理依据");
  if (status === "APPROVED" && x.kind !== "FINANCING")
    throw Error("风险核查事项请使用核查完成状态");
  if (!["PENDING_BANK_REVIEW", "NEEDS_MATERIAL"].includes(x.status))
    throw Error("该事项已完成审核，请保留结果并发起新的核查事项");
  if (
    status === "APPROVED" &&
    (approvedLimit === null ||
      approvedLimit < 0 ||
      !Number.isFinite(approvedLimit))
  )
    throw Error("请填写模拟获批总额度");
  if (status === "APPROVED") {
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
                status === "APPROVED" ? approvedLimit : z.approvedLimit,
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
