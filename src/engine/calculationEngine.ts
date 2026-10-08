// ============================================================================
// calculationEngine —— 确定性现金流与经营测算引擎
// 所有金额由本模块计算产生，UI 只读取结果，严禁在展示层写死数字。
//
// 融资计息口径：实际借款余额 × 实际占用天数 × 年利率 / 365，分段累计。
// ============================================================================

import {
  TradeScenario,
  CashFlowEvent,
  Party,
  DayPoint,
  PartyCashFlow,
  ScenarioResult,
} from '../types';

const DAYS_PER_YEAR = 365;
import { nonNegative, validateScenario } from './validation';

/** 由方案参数生成某主体的现金流事件序列 */
export function buildEvents(s: TradeScenario, party: Party): CashFlowEvent[] {
  validateScenario(s);
  if (party !== 'JIA' && party !== 'YI') throw new Error('非法主体');
  const ev: CashFlowEvent[] = [];
  const lastVerifyDay = Math.max(...s.batches.map((b) => b.verifyDay));
  const tailTotal = s.jiaPurchaseTotal - s.memberPrepay; // 成员尾款合计

  const payDayOf = (b: { verifyDay: number; paymentDaysOverride?: number }) =>
    s.paymentMode === 'PER_BATCH'
      ? b.verifyDay + (b.paymentDaysOverride ?? s.paymentDays)
      : lastVerifyDay + s.paymentDays;

  if (party === 'JIA') {
    ev.push({ party, day: 0, amount: s.jiaOwnFunds, kind: 'OWN_FUNDS', label: '自有资金注入' });
    ev.push({
      party,
      day: s.memberPrepayDay,
      amount: -s.memberPrepay,
      kind: 'MEMBER_PREPAY',
      label: '向成员预付收购款',
    });
    ev.push({
      party,
      day: s.jiaOtherCostDay,
      amount: -s.jiaOtherCost,
      kind: 'OTHER_COST',
      label: '物流/组织等费用',
    });
    for (const b of s.batches) {
      ev.push({
        party,
        day: b.verifyDay,
        amount: -(tailTotal * b.tons) / s.totalTons,
        kind: 'MEMBER_TAIL',
        label: `成员尾款(${b.tons}吨)`,
        batchId: b.id,
      });
    }
    for (const b of s.batches) {
      ev.push({
        party,
        day: payDayOf(b),
        amount: (s.salePriceJiaToYi * b.tons) / s.totalTons,
        kind: 'SALE_RECEIPT',
        label: `乙支付货款(${b.tons}吨)`,
        batchId: b.id,
      });
    }
  } else {
    ev.push({ party, day: 0, amount: s.yiOwnFunds, kind: 'OWN_FUNDS', label: '自有资金注入' });
    for (const b of s.batches) {
      ev.push({
        party,
        day: payDayOf(b),
        amount: -(s.salePriceJiaToYi * b.tons) / s.totalTons,
        kind: 'PURCHASE_PAYMENT',
        label: `向甲支付货款(${b.tons}吨)`,
        batchId: b.id,
      });
    }
    ev.push({
      party,
      day: s.yiProcessingDay,
      amount: -s.yiProcessingCost,
      kind: 'PROCESSING_COST',
      label: '加工及后续费用',
    });
    ev.push({
      party,
      day: s.yiSalesDay,
      amount: s.yiSalesRevenue,
      kind: 'SALES_REVENUE',
      label: '成品销售回款',
    });
  }
  return ev.sort((a, b) => a.day - b.day);
}

export interface SimOptions {
  rate: number;
  minSafe: number;
  horizon: number;
}

export interface SimResult {
  points: DayPoint[];
  peakLoan: number;
  peakLoanDay: number;
  minCash: number;
  firstShortfall: number | null;
  totalInterest: number;
  financingDuration: number;
}

/**
 * 现金流模拟：按日处理净现金变动，自动按最低安全余额融资/还款，分段计息。
 */
export function simulate(events: CashFlowEvent[], opts: SimOptions): SimResult {
  nonNegative(opts.rate, '年利率');
  nonNegative(opts.minSafe, '最低安全余额');
  nonNegative(opts.horizon, '测算截止日', true);
  const byDay = new Map<number, number>();
  for (const e of events) {
    nonNegative(e.day, '事件日', true);
    if (!Number.isFinite(e.amount)) throw new Error('现金流金额必须有限');
    if (e.day > opts.horizon) throw new Error('事件日超过测算截止日');
    byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.amount);
    if (!Number.isFinite(byDay.get(e.day))) throw new Error('同日现金流超过可计算范围');
  }
  if (events.length) byDay.set(opts.horizon, byDay.get(opts.horizon) ?? 0);
  const days = [...byDay.keys()].sort((a, b) => a - b);

  let cash = 0;
  let loan = 0;
  let accrued = 0;
  let lastDay = 0;
  let peakLoan = 0;
  let peakLoanDay = 0;
  let minCash = Infinity;
  let firstShortfall: number | null = null;
  let totalInterest = 0;
  let financingDuration = 0;
  const points: DayPoint[] = [];

  for (const day of days) {
    // 1) 对上一段占用期计息
    if (loan > 0 && day > lastDay) {
      financingDuration += day - lastDay;
      const inc = (loan * opts.rate * (day - lastDay)) / DAYS_PER_YEAR;
      accrued += inc;
      totalInterest += inc;
      if (!Number.isFinite(totalInterest)) throw new Error('利息超过可计算范围');
    }
    lastDay = day;

    // 2) 应用当日净现金
    cash += byDay.get(day)!;

    // 3) 融资 / 还款
    if (cash < opts.minSafe) {
      const need = opts.minSafe - cash;
      loan += need;
      cash += need;
      if (firstShortfall === null) firstShortfall = day;
    } else if (loan > 0 || accrued > 0) {
      const avail = cash - opts.minSafe;
      if (avail > 0) {
        const pay = Math.min(avail, loan + accrued);
        cash -= pay;
        const payInt = Math.min(pay, accrued); // 先还利息，再还本金
        accrued -= payInt;
        loan -= pay - payInt;
        if (loan < 1e-9) loan = 0;
      }
    }

    if (loan > peakLoan) {
      peakLoan = loan;
      peakLoanDay = day;
    }
    if (cash < minCash) minCash = cash;
    points.push({ day, cash, loan });
  }

  return {
    points,
    peakLoan,
    peakLoanDay,
    minCash: minCash === Infinity ? 0 : minCash,
    firstShortfall,
    totalInterest,
    financingDuration,
  };
}

/** 读取某一天（含当日事件）之后的现金余额 */
export function cashAsOf(points: DayPoint[], day: number): number {
  let v = 0;
  for (const p of points) {
    if (p.day <= day) v = p.cash;
    else break;
  }
  return v;
}

/** 读取某一天（含当日事件）之后的借款余额 */
export function loanAsOf(points: DayPoint[], day: number): number {
  let v = 0;
  for (const p of points) {
    if (p.day <= day) v = p.loan;
    else break;
  }
  return v;
}

function horizonOf(s: TradeScenario): number {
  return Math.max(s.yiSalesDay, s.nextBusinessDay, ...buildEvents(s, 'JIA').map((e) => e.day), ...buildEvents(s, 'YI').map((e) => e.day)) + 20;
}

/** 单主体经营测算 */
export function evaluateParty(s: TradeScenario, party: Party): PartyCashFlow {
  const events = buildEvents(s, party);
  const sim = simulate(events, {
    rate: s.annualRate,
    minSafe: s.minSafeBalance,
    horizon: horizonOf(s),
  });

  const operating = events.filter((e) => e.kind !== 'OWN_FUNDS');
  const operatingInflow = operating.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const operatingOutflow = operating
    .filter((e) => e.amount < 0)
    .reduce((a, e) => a - e.amount, 0);
  const operatingBalance = operatingInflow - operatingOutflow - sim.totalInterest;

  const cashAtNext = Math.max(0, cashAsOf(sim.points, s.nextBusinessDay) - s.minSafeBalance);
  const req = party === 'JIA' ? s.nextBusinessAmount : 0;
  const gap = Math.max(0, req - cashAtNext);

  return {
    party,
    points: sim.points,
    peakLoan: sim.peakLoan,
    peakLoanDay: sim.peakLoanDay,
    firstShortfallDay: sim.firstShortfall,
    financingDurationDays: sim.financingDuration,
    minCash: sim.minCash,
    totalInterest: sim.totalInterest,
    operatingInflow,
    operatingOutflow,
    operatingBalance,
    cashAtNextBusiness: cashAtNext,
    nextBusinessRequirement: req,
    nextBusinessGap: gap,
    nextBusinessAffected: gap > 1e-9,
    events,
  };
}

/** 方案整体测算 */
export function evaluateScenario(s: TradeScenario): ScenarioResult {
  const jia = evaluateParty(s, 'JIA');
  const yi = evaluateParty(s, 'YI');
  return {
    scenarioId: s.id,
    scenarioName: s.name,
    jia,
    yi,
    combinedBalance: jia.operatingBalance + yi.operatingBalance,
  };
}

/** 四舍五入到 n 位（仅用于展示/测试，不改变内部精度） */
export function round(x: number, n = 2): number {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
}
