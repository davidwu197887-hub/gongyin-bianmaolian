export const QUANTITIES = [32, 44, 36, 48, 40];
export const PURCHASE_DAYS = [0, 9, 19, 31, 40];
export const BASE_FINISH = [10, 20, 29, 42, 50];
const FAR = 10000;
const EPS = 1e-7;
// 3.0：甲的批次专项额度（模拟）。只用于指定批次的采购付款，不可循环；
// 提款窗口、到期日与“无逾期内部应收”条件均由银行模拟批准后写入。
export interface Tranche {
  party: "A";
  limit: number;
  batches: number[];
  openDay: number;
  closeDay: number;
  maturityDay: number;
  sourceBatch: number;
  overdueCheck: "none" | "internal" | "chain";
  freezeGeneralOnOverdue: boolean;
}
export interface Config {
  facility_changes?: {
    day: number;
    party: "A" | "B";
    limit: number;
    maturityDay: number;
  }[];
  tranche?: Tranche | null;
  horizon: number;
  own_A: number;
  own_B: number;
  interest_reserve_A: number;
  interest_reserve_B: number;
  limit_A: number | null;
  limit_B: number | null;
  annual_rate_A: number;
  annual_rate_B: number;
  limit_expiry: number;
  prepaid_per_tonne: number;
  member_total_per_tonne: number;
  logistics_per_tonne: number;
  setup_per_purchase: number;
  holding_per_tonne_day: number;
  delay_per_tonne_day: number;
  transport_days: number;
  acceptance_capacity: number;
  processing_capacity: number;
  processing_cost: number;
  downstream_cash_per_raw_tonne: number;
  downstream_term: number;
  delivery_grace_days: number;
  external_receipt_before_cutoff: boolean;
  freeze_new_draw_on_overdue_interest: boolean;
}
export interface Plan {
  name: string;
  price: number;
  term: number;
  prepay_fraction: number;
  bulk_purchase: boolean;
  bulk_collection: boolean;
  terms: number[] | null;
  purchase_override: number[] | null;
  rule_id: string;
  counterfactual: boolean;
}
export interface Scenario {
  q: number[];
  border: number[];
  downstream: number[];
  individual_border: number[];
  individual_down: number[];
  freeze_downstream: boolean[];
}
export const defaultConfig: Config = {
  horizon: 180,
  own_A: 150000,
  own_B: 200000,
  interest_reserve_A: 5000,
  interest_reserve_B: 5000,
  limit_A: 200000,
  limit_B: 200000,
  annual_rate_A: 0.04,
  annual_rate_B: 0.04,
  limit_expiry: 120,
  prepaid_per_tonne: 3500,
  member_total_per_tonne: 3600,
  logistics_per_tonne: 100,
  setup_per_purchase: 600,
  holding_per_tonne_day: 1,
  delay_per_tonne_day: 2,
  transport_days: 6,
  acceptance_capacity: 30,
  processing_capacity: 20,
  processing_cost: 200,
  downstream_cash_per_raw_tonne: 4200,
  downstream_term: 15,
  delivery_grace_days: 10,
  external_receipt_before_cutoff: true,
  freeze_new_draw_on_overdue_interest: true,
};
export const planOf = (name = "短账期", patch: Partial<Plan> = {}): Plan => ({
  name,
  price: 3780,
  term: 5,
  prepay_fraction: 0,
  bulk_purchase: false,
  bulk_collection: false,
  terms: null,
  purchase_override: null,
  rule_id: "Rule-V1",
  counterfactual: false,
  ...patch,
});
export const plans = [
  planOf(),
  planOf("长账期", { price: 3800, term: 15 }),
  planOf("长账期＋30%贸易预付", {
    price: 3800,
    term: 15,
    prepay_fraction: 0.3,
  }),
];
export const planningConfig = (c: Config): Config => ({
  ...c,
  limit_A: null,
  limit_B: null,
  limit_expiry: c.horizon + 1,
  facility_changes: [],
});
export const deterministic = (freeze = false): Scenario => ({
  q: [...QUANTITIES],
  border: Array(21).fill(0),
  downstream: Array(21).fill(0),
  individual_border: Array(5).fill(0),
  individual_down: Array(5).fill(0),
  freeze_downstream: Array(5).fill(freeze),
});
export function validate(c: Config, p: Plan, s: Scenario) {
  if (
    s.q.length !== 5 ||
    s.q.some((x) => !Number.isFinite(x) || x <= 0) ||
    Math.abs(s.q.reduce((a, b) => a + b) - 200) > 1e-5
  )
    throw Error("五批数量应为正数，合计200吨");
  for (const k of Object.keys(defaultConfig) as (keyof Config)[]) {
    const v = c[k];
    if (typeof v === "number" && (!Number.isFinite(v) || v < 0))
      throw Error(`${k}需要有限非负数`);
  }
  if (c.own_A < c.interest_reserve_A || c.own_B < c.interest_reserve_B)
    throw Error("付息准备金应包含在可投入自有资金内");
  if (c.acceptance_capacity <= 0 || c.processing_capacity <= 0)
    throw Error("验收和加工能力应大于0");
  if (c.member_total_per_tonne < c.prepaid_per_tonne)
    throw Error("成员收购价应覆盖预付款");
  if (
    !Number.isFinite(p.price) ||
    p.price <= 0 ||
    p.prepay_fraction < 0 ||
    p.prepay_fraction >= 1
  )
    throw Error("请核对价格与贸易预付款比例");
  if (
    [p.term, ...(p.terms ?? [])].some((x) => !Number.isSafeInteger(x) || x < 0)
  )
    throw Error("账期应为非负整数");
  if (p.terms && p.terms.length !== 5) throw Error("批次账期应包含五项");
  if (p.prepay_fraction * p.price > c.prepaid_per_tonne + c.logistics_per_tonne)
    throw Error("本模板的贸易预付款应在采购启动支出范围内");
  const t = c.tranche;
  if (t) {
    if (t.party !== "A") throw Error("本演示的专项额度仅适用于合作组织甲");
    if (!Number.isFinite(t.limit) || t.limit <= 0)
      throw Error("专项额度应为正数");
    if (
      !t.batches.length ||
      t.batches.some((j) => !Number.isSafeInteger(j) || j < 0 || j > 4)
    )
      throw Error("专项额度应指定第1—5批中的采购批次");
    if (
      ![t.openDay, t.closeDay, t.maturityDay].every(Number.isSafeInteger) ||
      t.openDay < 0 ||
      t.closeDay < t.openDay ||
      t.maturityDay <= t.closeDay
    )
      throw Error("专项额度应满足：开放日≤提款截止日＜到期日");
    if (
      !Number.isSafeInteger(t.sourceBatch) ||
      t.sourceBatch < 0 ||
      t.sourceBatch > 4 ||
      t.batches.includes(t.sourceBatch)
    )
      throw Error("还款来源应为与用款批次不同的已有批次");
    if (!["none", "internal", "chain"].includes(t.overdueCheck))
      throw Error("请选择逾期核对范围");
  }
}
class Wallet {
  cash: number;
  reserve: number;
  debt = 0;
  accrued = 0;
  interest_due = 0;
  interest_total = 0;
  interest_paid = 0;
  draws = 0;
  repays = 0;
  last_clear = -1;
  peak = 0;
  draw_enabled = true;
  // 专项额度：tdebt 是 debt 中的专项部分；tlimit 为 0 时与 2.0 计算完全相同。
  tlimit = 0;
  tdebt = 0;
  tdraws = 0;
  tpeak = 0;
  gpeak = 0;
  constructor(
    own: number,
    reserve: number,
    public limit: number,
    public rate: number,
  ) {
    this.cash = own - reserve;
    this.reserve = reserve;
  }
  general() {
    return this.draw_enabled
      ? Math.max(this.limit - (this.debt - this.tdebt), 0)
      : 0;
  }
  funds(tranche = false) {
    if (!this.tlimit)
      return (
        this.cash +
        (this.draw_enabled ? Math.max(this.limit - this.debt, 0) : 0)
      );
    return (
      this.cash +
      this.general() +
      (tranche ? Math.max(this.tlimit - this.tdraws, 0) : 0)
    );
  }
  pay(amount: number, mask: boolean, full = true, tranche = false) {
    if (!mask) return 0;
    const available = this.funds(tranche);
    const paid = full
      ? available + EPS >= amount
        ? amount
        : 0
      : Math.min(amount, available);
    const draw = Math.max(paid - this.cash, 0);
    if (this.tlimit && tranche && draw > 0) {
      // 先用一般额度剩余空间，不足部分才动用专项额度。
      const t = Math.max(draw - this.general(), 0);
      this.tdebt += t;
      this.tdraws += t;
      this.tpeak = Math.max(this.tpeak, this.tdebt);
    }
    this.debt += draw;
    this.draws += draw;
    this.cash += draw - paid;
    this.peak = Math.max(this.peak, this.debt);
    this.gpeak = Math.max(this.gpeak, this.debt - this.tdebt);
    return paid;
  }
  settleInterest(mask: boolean) {
    if (!mask) return;
    const due = this.accrued + this.interest_due;
    const a = Math.min(this.reserve, due);
    this.reserve -= a;
    const b = Math.min(this.cash, due - a);
    this.cash -= b;
    this.interest_paid += a + b;
    this.interest_due = Math.max(due - a - b, 0);
    this.accrued = 0;
  }
  close(day: number, expiry: number, freeze: boolean) {
    this.settleInterest((day > 0 && day % 30 === 0) || this.interest_due > EPS);
    const repay = Math.min(this.cash, this.debt);
    this.cash -= repay;
    this.debt -= repay;
    this.repays += repay;
    // 日终回笼资金优先归还专项部分。
    if (this.tdebt > 0) this.tdebt = Math.max(this.tdebt - repay, 0);
    if (repay > EPS && this.debt < EPS) {
      this.settleInterest(true);
      if (this.interest_due < EPS) this.last_clear = day;
    }
    if (freeze)
      this.draw_enabled = this.draw_enabled && this.interest_due < EPS;
    this.draw_enabled = this.draw_enabled && day < expiry;
  }
}
export interface DayRecord {
  day: number;
  A_cash: number;
  A_reserve: number;
  A_debt: number;
  A_tranche_debt: number;
  A_tranche_draws: number;
  tranche_open: boolean;
  B_cash: number;
  B_reserve: number;
  B_debt: number;
  A_interest_paid: number;
  B_interest_paid: number;
  A_interest_due: number;
  B_interest_due: number;
  A_interest_accrued: number;
  B_interest_accrued: number;
  ordered_tonnes: number;
  accepted_tonnes: number;
  finished_tonnes: number;
  tail_unpaid: number;
  invoice_unpaid: number;
  external_in: number;
  conservation: number;
  tail_paid: number[];
  invoice_paid: number[];
  advance_paid: number[];
  down_paid: boolean[];
  accepted: boolean[];
  ordered: number[];
  accept: number[];
  prod_finish: number[];
  internal_due: number[];
  external_actual: number[];
}
export interface Result {
  [key: string]: any;
  days: DayRecord[];
  prefix: number[][];
}
const banker = (x: number) => {
  const v = x * 100,
    f = Math.floor(v),
    d = v - f;
  return Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(v);
};
export function simulate(
  p: Plan,
  c: Config,
  s: Scenario = deterministic(),
  options: {
    trace?: boolean;
    snapshotDay?: number;
    collectPrefix?: boolean;
    referencePrefix?: number[][];
  } = {},
): Result | null {
  validate(c, p, s);
  const q = s.q,
    b = 5,
    H = c.horizon,
    snapshotDay = options.snapshotDay ?? 20;
  const A = new Wallet(
      c.own_A,
      c.interest_reserve_A,
      c.limit_A ?? Infinity,
      c.annual_rate_A,
    ),
    B = new Wallet(
      c.own_B,
      c.interest_reserve_B,
      c.limit_B ?? Infinity,
      c.annual_rate_B,
    );
  const earliest = p.purchase_override ?? PURCHASE_DAYS,
    terms = p.terms ?? Array(5).fill(p.term);
  const ordered = Array(b).fill(-1),
    depart = Array(b).fill(FAR),
    arrival = Array(b).fill(FAR),
    accept = Array(b).fill(FAR),
    accepted = Array(b).fill(false);
  const prod_start = Array(b).fill(-1),
    prod_finish = Array(b).fill(FAR),
    finished = Array(b).fill(false),
    external_due = Array(b).fill(FAR),
    external_actual = Array(b).fill(FAR),
    down_paid = Array(b).fill(false);
  const advance_paid = Array(b).fill(0),
    locked = Array(b).fill(0),
    invoice_paid = Array(b).fill(0),
    tail_paid = Array(b).fill(0),
    extra_due = Array(b).fill(0),
    extra_paid = Array(b).fill(0),
    internal_due = Array(b).fill(FAR);
  let accept_free = 0,
    prod_free = 0,
    Aexternal = 0,
    Bexternal = 0,
    external_in = 0,
    peak_joint = 0,
    loan_last_A = -1,
    loan_last_B = -1,
    business_last_open = -1,
    pending_purchase_days = 0,
    late_tail_days = 0,
    late_invoice_days = 0,
    maxError = 0,
    expiryA = c.limit_expiry,
    expiryB = c.limit_expiry;
  const T = c.tranche ?? null;
  if (T) A.tlimit = T.limit;
  let trancheOK = false,
    tailOK = false,
    tranche_due_at_maturity = 0,
    tranche_overdue_days = 0,
    tranche_blocked_days = 0,
    tranche_first_draw = -1,
    tranche_clear_day = -1;
  const days: DayRecord[] = [],
    prefix: number[][] = [];
  let prefixAt = 0,
    snapshot: any = null;
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  function peak() {
    peak_joint = Math.max(peak_joint, A.debt + B.debt);
  }
  function record(day: number) {
    if (
      day > snapshotDay ||
      (!options.collectPrefix && !options.referencePrefix)
    )
      return true;
    const v = [
      A.cash,
      A.reserve,
      A.debt,
      A.accrued,
      A.interest_due,
      B.cash,
      B.reserve,
      B.debt,
      B.accrued,
      B.interest_due,
      A.interest_paid,
      B.interest_paid,
      ...ordered,
      ...accept.map((x, j) => (accepted[j] ? x : -1)),
      ...prod_start,
      ...prod_finish.map((x, j) => (finished[j] ? x : -1)),
      ...advance_paid,
      ...invoice_paid,
      ...tail_paid,
      ...down_paid.map((x) => (x ? 1 : 0)),
    ].map(banker);
    if (options.referencePrefix) {
      const ref = options.referencePrefix[prefixAt++];
      if (!ref || v.some((x, k) => x !== ref[k])) return false;
    }
    if (options.collectPrefix) prefix.push(v);
    return true;
  }
  function advances(day: number) {
    for (let j = 0; j < b; j++)
      if (
        day >= (p.bulk_purchase ? 0 : earliest[j]) &&
        advance_paid[j] === 0 &&
        p.prepay_fraction > 0
      ) {
        const paid = B.pay(q[j] * p.price * p.prepay_fraction, true);
        advance_paid[j] += paid;
        locked[j] += paid;
        peak();
      }
  }
  function purchases(day: number, late = false) {
    const groups = p.bulk_purchase
      ? [[0, 1, 2, 3, 4]]
      : [[0], [1], [2], [3], [4]];
    for (const g of groups) {
      const j = g[0];
      if (
        ordered[j] >= 0 ||
        day < (p.bulk_purchase ? 0 : earliest[j]) ||
        (p.prepay_fraction > 0 && g.some((k) => advance_paid[k] <= 0))
      )
        continue;
      const amount =
          sum(g.map((k) => q[k])) *
            (c.prepaid_per_tonne + c.logistics_per_tonne) +
          c.setup_per_purchase,
        need = amount - sum(g.map((k) => locked[k])),
        useT =
          trancheOK && !!T && g.every((k) => T.batches.includes(k));
      if (A.funds(useT) + EPS < need) continue;
      const paid = A.pay(need, true, true, useT);
      if (paid + 1e-5 < need) continue;
      Aexternal += amount;
      for (const k of g) {
        ordered[k] = day;
        locked[k] = 0;
        depart[k] = Math.max(earliest[k], day + (late ? 1 : 0));
        const bin = Math.min(Math.floor(depart[k] / 10), s.border.length - 1);
        arrival[k] =
          depart[k] + c.transport_days + s.border[bin] + s.individual_border[k];
      }
      peak();
    }
  }
  function receipts(day: number) {
    for (let j = 0; j < b; j++)
      if (finished[j] && !down_paid[j] && external_actual[j] <= day) {
        const amount = q[j] * c.downstream_cash_per_raw_tonne;
        B.cash += amount;
        external_in += amount;
        down_paid[j] = true;
      }
  }
  function obligations() {
    for (let j = 0; j < b; j++) {
      const due =
        q[j] * (c.member_total_per_tonne - c.prepaid_per_tonne) - tail_paid[j];
      // 专项额度覆盖同一批次的成员收购尾款（该批采购既已获批融资，尾款属同一用途）。
      const paid = A.pay(
        Math.max(due, 0),
        accepted[j] && due > EPS,
        false,
        tailOK && T!.batches.includes(j),
      );
      tail_paid[j] += paid;
      Aexternal += paid;
    }
    for (let j = 0; j < b; j++) {
      const due = extra_due[j] - extra_paid[j];
      const paid = A.pay(Math.max(due, 0), accepted[j] && due > EPS, false);
      extra_paid[j] += paid;
      Aexternal += paid;
    }
    peak();
  }
  function transfer(day: number) {
    for (let j = 0; j < b; j++) {
      const due = q[j] * p.price - advance_paid[j] - invoice_paid[j];
      const paid = B.pay(
        Math.max(due, 0),
        accepted[j] && internal_due[j] <= day && due > EPS,
        false,
      );
      invoice_paid[j] += paid;
      A.cash += paid;
      peak();
    }
  }
  function processing(day: number) {
    for (let z = 0; z < b; z++) {
      let j = -1,
        best = Infinity;
      for (let k = 0; k < b; k++)
        if (accepted[k] && prod_start[k] < 0 && accept[k] + k * 0.0001 < best) {
          j = k;
          best = accept[k] + k * 0.0001;
        }
      if (j < 0 || prod_free > day) continue;
      const cost = q[j] * c.processing_cost,
        paid = B.pay(cost, true);
      Bexternal += paid;
      if (paid + 1e-5 >= cost) {
        prod_start[j] = day;
        prod_finish[j] = day + Math.ceil(q[j] / c.processing_capacity);
        prod_free = prod_finish[j];
      }
      peak();
    }
  }
  for (let day = 0; day <= H; day++) {
    for (const change of c.facility_changes ?? [])
      if (change.day === day) {
        const w = change.party === "A" ? A : B;
        w.limit = change.limit;
        if (change.party === "A") expiryA = change.maturityDay;
        else expiryB = change.maturityDay;
        w.draw_enabled =
          day < change.maturityDay &&
          (!c.freeze_new_draw_on_overdue_interest || w.interest_due < EPS);
      }
    for (const w of [A, B]) {
      if (day) {
        const charge = (w.debt * w.rate) / 365;
        w.accrued += charge;
        w.interest_total += charge;
      }
      w.draw_enabled = w.draw_enabled && day < (w === A ? expiryA : expiryB);
    }
    if (T) {
      // 日初判定专项提款条件；到期后仍有余额记为专项逾期。
      if (day === T.maturityDay) tranche_due_at_maturity = A.tdebt;
      if (day > T.maturityDay && A.tdebt > EPS) {
        tranche_overdue_days++;
        if (T.freezeGeneralOnOverdue) A.draw_enabled = false;
      }
      // internal：乙对甲有到期未付货款；chain：另含乙的下游客户到期未付。
      const internalOverdue = q.some(
          (v, j) =>
            accepted[j] &&
            internal_due[j] < day &&
            v * p.price - advance_paid[j] - invoice_paid[j] > EPS,
        ),
        chainOverdue =
          internalOverdue ||
          q.some((_, j) => finished[j] && !down_paid[j] && external_due[j] < day),
        overdue =
          T.overdueCheck === "chain"
            ? chainOverdue
            : T.overdueCheck === "internal"
              ? internalOverdue
              : false,
        // 还款来源批次须已验收，且其合同付款日早于专项到期日。
        source =
          accepted[T.sourceBatch] && internal_due[T.sourceBatch] < T.maturityDay;
      // 所有专项提款（含该批成员尾款）都限定在提款窗口内。
      tailOK =
        day >= T.openDay &&
        day <= T.closeDay &&
        day < T.maturityDay &&
        A.interest_due < EPS &&
        A.tdraws < T.limit - EPS;
      trancheOK =
        day >= T.openDay &&
        day <= T.closeDay &&
        day < T.maturityDay &&
        A.interest_due < EPS &&
        A.tdraws < T.limit - EPS &&
        source &&
        !overdue;
    }
    if (c.external_receipt_before_cutoff) receipts(day);
    obligations();
    advances(day);
    purchases(day);
    if (!record(day)) return null;
    for (let z = 0; z < b; z++) {
      let j = -1,
        best = FAR;
      for (let k = 0; k < b; k++)
        if (arrival[k] <= day && accept[k] === FAR && arrival[k] < best) {
          j = k;
          best = arrival[k];
        }
      if (j < 0) continue;
      accept[j] =
        Math.max(day, accept_free) + Math.ceil(q[j] / c.acceptance_capacity);
      accept_free = accept[j];
    }
    for (let j = 0; j < b; j++)
      if (accept[j] <= day && !accepted[j]) {
        accepted[j] = true;
        const delay = Math.max(
            accept[j] -
              (depart[j] +
                c.transport_days +
                Math.ceil(q[j] / c.acceptance_capacity)),
            0,
          ),
          hold = p.bulk_purchase ? Math.max(depart[j] - ordered[j], 0) : 0;
        extra_due[j] =
          q[j] *
          (hold * c.holding_per_tonne_day + delay * c.delay_per_tonne_day);
        if (!p.bulk_collection) internal_due[j] = accept[j] + terms[j];
      }
    if (p.bulk_collection && accepted.every(Boolean))
      internal_due.fill(Math.max(...accept) + p.term);
    for (let j = 0; j < b; j++)
      if (prod_finish[j] <= day && !finished[j]) {
        finished[j] = true;
        external_due[j] = day + c.downstream_term;
        const bin = Math.min(Math.floor(day / 10), s.downstream.length - 1);
        external_actual[j] = s.freeze_downstream[j]
          ? H + 1
          : external_due[j] + s.downstream[bin] + s.individual_down[j];
      }
    obligations();
    processing(day);
    if (!record(day)) return null;
    transfer(day);
    obligations();
    purchases(day, true);
    processing(day);
    if (!record(day)) return null;
    if (!c.external_receipt_before_cutoff) receipts(day);
    for (const w of [A, B])
      w.close(
        day,
        w === A ? expiryA : expiryB,
        c.freeze_new_draw_on_overdue_interest,
      );
    peak();
    if (T) {
      // 专项条件不满足、且指定批次日终仍未采购的天数。
      if (
        !trancheOK &&
        day >= T.openDay &&
        day <= T.closeDay &&
        T.batches.some((j) => ordered[j] < 0 && earliest[j] <= day)
      )
        tranche_blocked_days++;
      if (tranche_first_draw < 0 && A.tdraws > EPS) tranche_first_draw = day;
      if (tranche_first_draw >= 0 && tranche_clear_day < 0 && A.tdebt < EPS)
        tranche_clear_day = day;
    }
    const activeA = A.debt + A.accrued + A.interest_due > EPS,
      activeB = B.debt + B.accrued + B.interest_due > EPS;
    if (activeA) loan_last_A = day;
    if (activeB) loan_last_B = day;
    if (ordered.some((x, j) => x < 0 && earliest[j] <= day))
      pending_purchase_days++;
    const tailout = sum(
        q.map((v, j) =>
          accepted[j]
            ? v * (c.member_total_per_tonne - c.prepaid_per_tonne) -
              tail_paid[j]
            : 0,
        ),
      ),
      invout = sum(
        q.map((v, j) =>
          accepted[j] ? v * p.price - advance_paid[j] - invoice_paid[j] : 0,
        ),
      );
    if (
      !down_paid.every(Boolean) ||
      tailout > EPS ||
      invout > EPS ||
      sum(extra_due.map((x, j) => x - extra_paid[j])) > EPS ||
      activeA ||
      activeB
    )
      business_last_open = day;
    if (tailout > EPS) late_tail_days++;
    if (
      q.some(
        (v, j) =>
          accepted[j] &&
          internal_due[j] <= day &&
          v * p.price - advance_paid[j] - invoice_paid[j] > EPS,
      )
    )
      late_invoice_days++;
    const balance =
        A.cash + A.reserve + sum(locked) + B.cash + B.reserve - A.debt - B.debt,
      expected =
        c.own_A +
        c.own_B +
        external_in -
        Aexternal -
        Bexternal -
        A.interest_paid -
        B.interest_paid;
    maxError = Math.max(maxError, Math.abs(balance - expected));
    if (!record(day)) return null;
    if (day === snapshotDay)
      snapshot = {
        A_debt: A.debt,
        B_debt: B.debt,
        A_cash: A.cash,
        B_cash: B.cash,
      };
    if (options.trace)
      days.push({
        day,
        A_cash: A.cash,
        A_reserve: A.reserve,
        A_debt: A.debt,
        A_tranche_debt: A.tdebt,
        A_tranche_draws: A.tdraws,
        tranche_open: trancheOK,
        B_cash: B.cash,
        B_reserve: B.reserve,
        B_debt: B.debt,
        A_interest_paid: A.interest_paid,
        B_interest_paid: B.interest_paid,
        A_interest_due: A.interest_due,
        B_interest_due: B.interest_due,
        A_interest_accrued: A.accrued,
        B_interest_accrued: B.accrued,
        ordered_tonnes: sum(q.map((v, j) => (ordered[j] >= 0 ? v : 0))),
        accepted_tonnes: sum(q.map((v, j) => (accepted[j] ? v : 0))),
        finished_tonnes: sum(q.map((v, j) => (finished[j] ? v : 0))),
        tail_unpaid: tailout,
        invoice_unpaid: invout,
        external_in,
        conservation: balance - expected,
        tail_paid: [...tail_paid],
        invoice_paid: [...invoice_paid],
        advance_paid: [...advance_paid],
        down_paid: [...down_paid],
        accepted: [...accepted],
        ordered: [...ordered],
        accept: [...accept],
        prod_finish: [...prod_finish],
        internal_due: [...internal_due],
        external_actual: [...external_actual],
      });
  }
  const tailout = sum(
      q.map((v, j) =>
        accepted[j]
          ? Math.max(
              v * (c.member_total_per_tonne - c.prepaid_per_tonne) -
                tail_paid[j],
              0,
            )
          : 0,
      ),
    ),
    invoiceout = sum(
      q.map((v, j) =>
        accepted[j]
          ? Math.max(v * p.price - advance_paid[j] - invoice_paid[j], 0)
          : 0,
      ),
    ),
    extraout = sum(extra_due.map((x, j) => Math.max(x - extra_paid[j], 0)));
  const count = (mask: boolean[]) => sum(q.map((v, j) => (mask[j] ? v : 0)));
  const unfulfilled = 200 - count(accepted),
    complete =
      unfulfilled < EPS &&
      count(finished) > 200 - EPS &&
      down_paid.every(Boolean) &&
      tailout < EPS &&
      invoiceout < EPS &&
      extraout < EPS &&
      A.debt < EPS &&
      B.debt < EPS &&
      A.interest_due < EPS &&
      B.interest_due < EPS;
  return {
    peak_A: A.peak,
    peak_B: B.peak,
    peak_joint,
    interest_A: A.interest_total,
    interest_B: B.interest_total,
    interest_paid_A: A.interest_paid,
    interest_paid_B: B.interest_paid,
    interest_due_A: A.interest_due,
    interest_due_B: B.interest_due,
    cash_A: A.cash + A.reserve,
    cash_B: B.cash + B.reserve,
    debt_A: A.debt,
    debt_B: B.debt,
    tail_unpaid: tailout,
    invoice_unpaid: invoiceout,
    downstream_AR: sum(
      q.map((v, j) =>
        finished[j] && !down_paid[j] ? v * c.downstream_cash_per_raw_tonne : 0,
      ),
    ),
    unfulfilled_tonnes: unfulfilled,
    ordered_tonnes: count(ordered.map((x) => x >= 0)),
    accepted_tonnes: count(accepted),
    finished_tonnes: count(finished),
    late_target_tonnes: count(prod_finish.map((x, j) => x > BASE_FINISH[j])),
    late_finished_tonnes: count(
      prod_finish.map((x, j) => x > BASE_FINISH[j] + c.delivery_grace_days),
    ),
    pending_purchase_days,
    late_tail_days,
    late_invoice_days,
    complete,
    profit_A: complete
      ? A.cash + A.reserve + sum(locked) - A.debt - c.own_A
      : null,
    profit_B: complete ? B.cash + B.reserve - B.debt - c.own_B : null,
    settlement_day_A:
      A.debt + A.accrued + A.interest_due < EPS ? loan_last_A + 1 : Infinity,
    settlement_day_B:
      B.debt + B.accrued + B.interest_due < EPS ? loan_last_B + 1 : Infinity,
    business_settlement_day: complete ? business_last_open + 1 : Infinity,
    order_days: ordered,
    accept_days: accept.map((x, j) => (accepted[j] ? x : FAR)),
    production_start: prod_start,
    production_finish: prod_finish,
    external_receipt_days: external_actual,
    internal_due,
    actual_internal_paid: invoice_paid.map((x, j) => x + advance_paid[j]),
    actual_tail_paid: tail_paid,
    conservation_max_abs_error: maxError,
    general_peak_A: T ? A.gpeak : A.peak,
    tranche_limit: T ? T.limit : 0,
    tranche_draws: A.tdraws,
    tranche_peak: A.tpeak,
    tranche_debt: A.tdebt,
    tranche_due_at_maturity,
    tranche_overdue_days,
    tranche_blocked_days,
    tranche_first_draw_day: tranche_first_draw,
    tranche_clear_day:
      tranche_first_draw < 0 ? -1 : tranche_clear_day < 0 ? Infinity : tranche_clear_day,
    snapshot,
    days,
    prefix,
  };
}
