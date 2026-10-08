// ============================================================================
// financialTranslator —— 本项目最核心模块
// 把【经营条件变化 -> 现金流变化 -> 资金缺口】确定性地翻译为
// 标准化 FinancialNeed 对象。金额/期限全部来自 calculationEngine，
// 本模块不自行生成数字，不输出授信结论。
// ============================================================================

import { TradeScenario, FinancialNeed } from '../types';
import { evaluateParty, cashAsOf, round } from './calculationEngine';
import { digest } from './hash';

export interface TranslateInput {
  before: TradeScenario;   // 当前有效规则（如 Rule-V1）
  after: TradeScenario;    // 变更草案（如 Draft-V2）
  triggerText: string;     // 经营语言触发原因
  previousFinancingStatus: string; // 原融资状态，如 "已结清"
}

/**
 * 对比变更前后，在“下一笔经营发生日”形成的资金缺口，输出 FinancialNeed。
 */
export function translate(input: TranslateInput): FinancialNeed {
  const { before, after } = input;

  const jiaBefore = evaluateParty(before, 'JIA');
  const jiaAfter = evaluateParty(after, 'JIA');

  const day = after.nextBusinessDay;
  const beforeCash = Math.max(0, cashAsOf(jiaBefore.points, day) - before.minSafeBalance);
  const afterCash = Math.max(0, cashAsOf(jiaAfter.points, day) - after.minSafeBalance);
  const requirement = after.nextBusinessAmount;

  const gap = Math.max(0, requirement - afterCash);
  const beforeGap = Math.max(0, before.nextBusinessAmount - beforeCash);
  const changeOnReceiptDelay = round(beforeCash - afterCash);

  // 还款来源：变更后在该缺口之后、到下一笔经营发生日之后首个到账的销售货款批次
  const repayment = gap > 1e-9 ? findRepayment(after, day, requirement) : { day: null, amount: 0, source: '无新增缺口，无需匹配还款来源' };

  const createsNew = gap > 1e-9;
  // 两位小数若会把真实正缺口变成零，保留精度，避免生成不可提交的零金额需求。
  const amount = round(gap) || (createsNew ? gap : 0);

  return {
    needId: digest({ before, after, day, gap }),
    subject: '合作组织甲',
    trigger: input.triggerText,
    amount,
    amountUnit: '万元',
    startDay: day,
    expectedEndDay: repayment.day,
    expectedDurationDays: repayment.day === null ? null : repayment.day - day,
    purpose: '下一笔原料经营安排（短期周转）',
    repaymentSource: repayment.source,
    repaymentAmount: round(repayment.amount),
    expectedRepaymentDay: repayment.day,
    previousFinancingStatus: input.previousFinancingStatus,
    affectsExistingFacility: affectsFacility(jiaBefore.peakLoan, jiaAfter.peakLoan) ||
      Math.abs(jiaBefore.totalInterest - jiaAfter.totalInterest) > 1e-9 ||
      jiaBefore.financingDurationDays !== jiaAfter.financingDurationDays,
    createsNewFinancialNeed: createsNew,
    suggestedNeedCategory: createsNew ? '短期经营周转类需求' : '无新增融资需求',
    requiredMaterials: [
      '有效交易合同',
      '条件变更草案（Draft-V2）',
      '履约记录（分批验收/付款回执）',
      '最新现金流测算',
      '预计回款依据',
    ],
    cashFlowImpact: {
      beforeCash: round(beforeCash),
      afterCash: round(afterCash),
      requirement: round(requirement),
      gap: amount,
      beforeGap: round(beforeGap),
      incrementalGap: round(Math.max(0, gap - beforeGap)),
      changeOnReceiptDelay,
    },
  };
}

/** 找出“下一笔经营发生日”之后首个到账的销售货款批次（作为还款来源） */
function findRepayment(s: TradeScenario, afterDay: number, requiredCash: number): { day: number | null; amount: number; source: string } {
  const jia = evaluateParty(s, 'JIA');
  const receipts = jia.events.filter((e) => e.kind === 'SALE_RECEIPT' && e.day > afterDay);
  const days = [...new Set(receipts.map((e) => e.day))].sort((a, b) => a - b);
  let amount = 0;
  const sources: string[] = [];
  for (const day of days) {
    const group = receipts.filter((e) => e.day === day);
    const gross = group.reduce((a, e) => a + e.amount, 0);
    amount += gross;
    sources.push(`Day${day}批次${group.map((e) => e.batchId).join('/')}销售回款${round(gross)}万元`);
    // 同日收支、成员尾款及原融资本息先由主引擎结算；不能把已用于还贷的货款重复当作可用来源。
    const point = jia.points.find((p) => p.day === day)!;
    if (point.loan < 1e-9 && point.cash - s.minSafeBalance >= requiredCash - 1e-9) {
      return { day, amount, source: sources.join('；') };
    }
  }
  return { day: null, amount, source: sources.length ? `${sources.join('；')}；预计可用回款不足以覆盖需求，期限待核实` : '无后续销售回款依据，期限待核实' };
}

function affectsFacility(peakBefore: number, peakAfter: number): boolean {
  return peakAfter - peakBefore > 1e-9;
}

/** 由选定方案生成“初始金融需求”（签约前，供银行审核输入） */
export function initialNeed(s: TradeScenario): FinancialNeed {
  const jia = evaluateParty(s, 'JIA');
  const repayment = jia.peakLoan > 1e-9 ? findRepayment(s, jia.firstShortfallDay ?? 0, 0) : { day: null, amount: 0, source: '无需融资' };
  return {
    needId: digest({ init: s.id, peak: round(jia.peakLoan) }),
    subject: '合作组织甲',
    trigger: '签约前原料收购与经营支出融资安排',
    amount: round(jia.peakLoan),
    amountUnit: '万元',
    startDay: jia.firstShortfallDay ?? 0,
    expectedEndDay: repayment.day,
    expectedDurationDays: repayment.day === null ? null : repayment.day - (jia.firstShortfallDay ?? 0),
    purpose: '成员收购价款及相关经营支出',
    repaymentSource: repayment.source,
    repaymentAmount: round(repayment.amount),
    expectedRepaymentDay: repayment.day,
    previousFinancingStatus: '无在贷',
    affectsExistingFacility: false,
    createsNewFinancialNeed: jia.peakLoan > 1e-9,
    suggestedNeedCategory: '采购备货短期融资',
    requiredMaterials: ['有效交易合同', '成员参与与授权记录', '收付款安排', '现金流测算'],
    cashFlowImpact: {
      beforeCash: 0,
      afterCash: 0,
      requirement: 0,
      gap: round(jia.peakLoan),
      beforeGap: 0,
      incrementalGap: round(jia.peakLoan),
      changeOnReceiptDelay: 0,
    },
  };
}
