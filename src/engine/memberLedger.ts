// ============================================================================
// memberLedger —— 成员明白账（单位：元，与主体经营的"万元"严格区分）
// 清楚区分：商品货款 / 服务报酬 / 经营结余 / 依法形成的盈余分配。
// ============================================================================

import { MemberPayment } from '../types';

export interface MemberLedgerView {
  memberId: string;
  participatedTons: number;
  // 商品货款部分（元）
  purchasePriceYuan: number;
  prepaidYuan: number;
  tailYuan: number;
  tailTriggerDay: number;
  tailPaid: boolean;
  // 校验：预付 + 尾款 == 收购价款
  reconciles: boolean;
  // 性质区分说明
  classification: {
    goodsPayment: string;
    serviceReward: string;
    operatingBalance: string;
    surplusDistribution: string;
  };
}

export function buildMemberView(m: MemberPayment): MemberLedgerView {
  return {
    memberId: m.memberId,
    participatedTons: m.participatedTons,
    purchasePriceYuan: m.purchasePriceYuan,
    prepaidYuan: m.prepaidYuan,
    tailYuan: m.tailYuan,
    tailTriggerDay: m.tailTriggerDay,
    tailPaid: m.tailPaid,
    reconciles: Math.abs(m.prepaidYuan + m.tailYuan - m.purchasePriceYuan) < 1e-6,
    classification: {
      goodsPayment: `商品货款：${m.purchasePriceYuan}元，依据有效收购合同（已预付${m.prepaidYuan}元 + 尾款${m.tailYuan}元）`,
      serviceReward: '服务报酬：本例成员未承担服务事项，无服务报酬',
      operatingBalance: '经营结余：属于合作组织甲的经营测算结果，不等于成员应得款项，不可直接作为分红',
      surplusDistribution: '盈余分配：须在相应条件与有效决定形成后才记为应付款项，当前尚未形成',
    },
  };
}

/** 标记尾款已支付（履约事件触发） */
export function markTailPaid(m: MemberPayment, triggered: boolean): MemberPayment {
  return { ...m, tailPaid: triggered };
}
