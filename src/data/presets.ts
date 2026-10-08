// ============================================================================
// 珲春俄豆业务 —— 第四章案例预设（模拟数据）
// 金额单位：万元。所有结果由 calculationEngine 实时计算，此处仅为输入参数。
// ============================================================================

import { TradeScenario, BusinessParty, MemberPayment } from '../types';

export const PARTIES: BusinessParty[] = [
  { id: 'JIA', name: '合作组织甲', role: '集中收购并向加工企业销售', ownFunds: 20 },
  { id: 'YI', name: '加工企业乙', role: '承接原料加工与成品销售', ownFunds: 20 },
];

/** 公共基准参数（俄豆案例 表4-1） */
const BASE = {
  totalTons: 200,
  memberProcureCost: 100,
  jiaPurchaseTotal: 104,
  memberPrepay: 100,
  memberPrepayDay: 0,
  jiaOtherCost: 2,
  jiaOtherCostDay: 0,
  jiaOwnFunds: 20,
  yiOwnFunds: 20,
  yiProcessingCost: 13,
  yiProcessingDay: 40,
  yiSalesRevenue: 135,
  yiSalesDay: 80,
  annualRate: 0.04,
  minSafeBalance: 0,
  nextBusinessAmount: 20,
  nextBusinessDay: 35,
};

/** 方案 A：整批验收后 40 日付款，售价 112 */
export function scenarioA(): TradeScenario {
  return {
    id: 'A',
    name: '方案A·整批结算',
    salePriceJiaToYi: 112,
    paymentMode: 'WHOLE_AFTER_VERIFY',
    paymentDays: 40,
    ...BASE,
    batches: [{ id: 'ALL', tons: 200, verifyDay: 20 }],
  };
}

/** 方案 B：每批验收后 5 日付款，售价 111 */
export function scenarioB(): TradeScenario {
  return {
    id: 'B',
    name: '方案B·分批结算',
    salePriceJiaToYi: 111,
    paymentMode: 'PER_BATCH',
    paymentDays: 5,
    ...BASE,
    batches: [{ id: 'ALL', tons: 200, verifyDay: 20 }],
  };
}

/**
 * 履约版方案 B：实际分批 188 吨(Day20) + 12 吨(Day30)。
 * 用于履约沙盘与例外重算。
 */
export function scenarioBSplit(): TradeScenario {
  return {
    ...scenarioB(),
    id: 'B-SPLIT',
    name: '方案B·分批履约(188/12)',
    batches: [
      { id: 'B1', tons: 188, verifyDay: 20 },
      { id: 'B2', tons: 12, verifyDay: 30 },
    ],
  };
}

/** Draft-V2：剩余 12 吨账期由验收后 5 日改为 15 日 */
export function scenarioBSplitDraft(): TradeScenario {
  const s = scenarioBSplit();
  return {
    ...s,
    id: 'B-SPLIT-DRAFT',
    name: '方案B·Draft-V2(剩余12吨账期15日)',
    batches: [
      { id: 'B1', tons: 188, verifyDay: 20 },
      { id: 'B2', tons: 12, verifyDay: 30, paymentDaysOverride: 15 },
    ],
  };
}

/** 成员明白账 M01（单位：元） */
export function memberM01(): MemberPayment {
  return {
    memberId: 'M01',
    participatedTons: 1,
    procureCostYuan: 5000,
    purchasePriceYuan: 5200,
    prepaidYuan: 5000,
    tailYuan: 200,
    tailTriggerDay: 20,
    tailPaid: false,
    actualReceiptNote: '关联本人收款回执（模拟）',
  };
}
