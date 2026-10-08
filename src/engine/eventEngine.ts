// ============================================================================
// eventEngine —— 履约事件驱动引擎
// 以当前有效方案为基准，按时间轴推进，输出各节点业务状态快照。
// 所有金额来自 calculationEngine，不在此写死。
// ============================================================================

import { TradeScenario, FulfillmentEvent, FulfillmentSnapshot } from '../types';
import { buildEvents as cashEvents, evaluateParty, cashAsOf, loanAsOf, round } from './calculationEngine';
import { nonNegative } from './validation';

/** 根据方案生成履约时间轴关键节点 */
export function buildTimeline(s: TradeScenario): number[] {
  const set = new Set<number>([0]);
  [...cashEvents(s, 'JIA'), ...cashEvents(s, 'YI')].forEach((e) => set.add(e.day));
  for (const b of s.batches) {
    set.add(b.verifyDay);
    set.add(
      s.paymentMode === 'PER_BATCH'
        ? b.verifyDay + (b.paymentDaysOverride ?? s.paymentDays)
        : Math.max(...s.batches.map((x) => x.verifyDay)) + s.paymentDays,
    );
  }
  set.add(s.nextBusinessDay);
  set.add(s.yiSalesDay);
  return [...set].sort((a, b) => a - b);
}

/** 生成事件详情列表 */
export function buildEvents(s: TradeScenario): FulfillmentEvent[] {
  cashEvents(s, 'JIA'); // 共用输入校验
  const ev: FulfillmentEvent[] = [];
  const tailTotal = s.jiaPurchaseTotal - s.memberPrepay;
  const lastVerify = Math.max(...s.batches.map((b) => b.verifyDay));

  ev.push({ day: 0, kind: 'IN_TRANSIT', title: '业务启动', detail: '注入自有资金，开始模拟履约' });
  ev.push({ day: s.memberPrepayDay, kind: 'COST', title: '预付成员收购款', detail: `甲预付${s.memberPrepay}万元` });
  ev.push({ day: s.jiaOtherCostDay, kind: 'COST', title: '甲支付组织费用', detail: `物流/组织等费用${s.jiaOtherCost}万元` });
  ev.push({ day: s.yiProcessingDay, kind: 'PROCESSING', title: '乙支付加工及后续费用', detail: `加工及后续费用${s.yiProcessingCost}万元` });

  for (const b of s.batches) {
    ev.push({
      day: b.verifyDay,
      kind: 'VERIFY',
      title: `${b.tons}吨完成交割验收`,
      detail: `批次${b.id}验收，成员尾款${round((tailTotal * b.tons) / s.totalTons)}万元满足支付条件`,
    });
    const payDay =
      s.paymentMode === 'PER_BATCH'
        ? b.verifyDay + (b.paymentDaysOverride ?? s.paymentDays)
        : lastVerify + s.paymentDays;
    ev.push({
      day: payDay,
      kind: 'PAY_RECEIPT',
      title: `乙支付${b.tons}吨货款`,
      detail: `货款${round((s.salePriceJiaToYi * b.tons) / s.totalTons)}万元到账，甲按规则偿还对应融资`,
    });
  }
  ev.push({
    day: s.nextBusinessDay,
    kind: 'LOAN_SETTLE',
    title: '甲下一笔经营安排',
    detail: `需要可用资金${s.nextBusinessAmount}万元`,
  });
  ev.push({ day: s.yiSalesDay, kind: 'SALES', title: '乙成品销售回款', detail: `回款${s.yiSalesRevenue}万元` });

  return ev.sort((a, b) => a.day - b.day);
}

/** 推进到指定日，输出业务状态快照 */
export function snapshotAt(s: TradeScenario, day: number, activeVersion: string): FulfillmentSnapshot {
  nonNegative(day, '履约日', true);
  const jia = evaluateParty(s, 'JIA');

  const fulfilled = s.batches.filter((b) => b.verifyDay <= day);
  const inTransit = s.batches.filter((b) => b.verifyDay > day);
  const fulfilledTons = fulfilled.reduce((a, b) => a + b.tons, 0);
  const inTransitTons = inTransit.reduce((a, b) => a + b.tons, 0);

  const tailTotal = s.jiaPurchaseTotal - s.memberPrepay;
  const memberTailPaid = round((tailTotal * fulfilledTons) / s.totalTons);
  const memberTailRemaining = round((tailTotal * inTransitTons) / s.totalTons);

  const lastVerify = Math.max(...s.batches.map((b) => b.verifyDay));
  const payDayOf = (b: (typeof s.batches)[number]) =>
    s.paymentMode === 'PER_BATCH'
      ? b.verifyDay + (b.paymentDaysOverride ?? s.paymentDays)
      : lastVerify + s.paymentDays;

  let received = 0;
  let pending = 0;
  for (const b of s.batches) {
    const amt = (s.salePriceJiaToYi * b.tons) / s.totalTons;
    if (payDayOf(b) <= day) received += amt;
    else pending += amt;
  }

  const timeline = buildTimeline(s);
  const nextEventDay = timeline.find((d) => d > day) ?? null;

  const lines: string[] = [
    `当前有效规则：${activeVersion}`,
    `已验收 ${fulfilledTons} 吨 / 在途 ${inTransitTons} 吨`,
    `甲可用现金 ${round(Math.max(0, cashAsOf(jia.points, day) - s.minSafeBalance))} 万元`,
    `甲融资余额 ${round(loanAsOf(jia.points, day))} 万元`,
    `成员尾款已付 ${memberTailPaid} 万元 / 待付 ${memberTailRemaining} 万元`,
    `已收乙货款 ${round(received)} 万元 / 待收 ${round(pending)} 万元`,
  ];

  return {
    currentDay: day,
    activeRuleVersion: activeVersion,
    fulfilledTons,
    inTransitTons,
    jiaCash: round(Math.max(0, cashAsOf(jia.points, day) - s.minSafeBalance)),
    jiaLoan: round(loanAsOf(jia.points, day)),
    memberTailPaid,
    memberTailRemaining,
    receivedFromYi: round(received),
    pendingFromYi: round(pending),
    nextEventDay,
    lines,
  };
}
