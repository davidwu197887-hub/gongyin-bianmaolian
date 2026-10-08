import { TradeScenario } from '../types';

export function nonNegative(value: number, label: string, integer = false): void {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${label}必须为有限非负${integer ? '整数' : '数'}`);
  }
}

export function validateScenario(s: TradeScenario): void {
  const days = ['paymentDays', 'memberPrepayDay', 'jiaOtherCostDay', 'yiProcessingDay', 'yiSalesDay', 'nextBusinessDay'] as const;
  const amounts = ['salePriceJiaToYi', 'memberProcureCost', 'jiaPurchaseTotal', 'memberPrepay', 'jiaOtherCost', 'jiaOwnFunds', 'yiOwnFunds', 'yiProcessingCost', 'yiSalesRevenue', 'annualRate', 'minSafeBalance', 'nextBusinessAmount'] as const;
  days.forEach((k) => nonNegative(s[k], k, true));
  amounts.forEach((k) => nonNegative(s[k], k));
  if (!Number.isFinite(s.totalTons) || s.totalTons <= 0) throw new Error('totalTons必须大于0');
  if (!['PER_BATCH', 'WHOLE_AFTER_VERIFY'].includes(s.paymentMode)) throw new Error('非法付款方式');
  if (s.memberPrepay > s.jiaPurchaseTotal) throw new Error('成员预付不得超过收购价款');
  if (!s.batches.length) throw new Error('必须有交割批次');
  const ids = new Set<string>();
  for (const b of s.batches) {
    if (!b.id || ids.has(b.id)) throw new Error('批次ID不得为空或重复');
    ids.add(b.id);
    if (!Number.isFinite(b.tons) || b.tons <= 0) throw new Error('批次数量必须大于0');
    nonNegative(b.verifyDay, '验收日', true);
    if (b.paymentDaysOverride !== undefined) nonNegative(b.paymentDaysOverride, '批次账期', true);
    if (s.memberPrepayDay > b.verifyDay) throw new Error('成员预付日不得晚于验收日');
  }
  const sum = s.batches.reduce((a, b) => a + b.tons, 0);
  if (Math.abs(sum - s.totalTons) > 1e-8 * Math.max(1, s.totalTons)) throw new Error('batches合计必须等于totalTons');
}

export function copyScenario(s: TradeScenario): TradeScenario {
  return { ...s, batches: s.batches.map((b) => ({ ...b })) };
}
