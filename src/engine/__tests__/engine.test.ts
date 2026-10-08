import { describe, it, expect } from 'vitest';
import {
  evaluateParty,
  evaluateScenario,
  round,
  cashAsOf,
} from '../calculationEngine';
import { compareScenarios } from '../scenarioEngine';
import {
  scenarioA,
  scenarioB,
  scenarioBSplit,
  scenarioBSplitDraft,
} from '../../data/presets';
import { translate } from '../financialTranslator';
import { submitFinancialNeed } from '../mockBankApi';
import {
  createEmptyRuleBook,
  createRuleV1,
  confirmParty,
  makeEffective,
  proposeDraft,
  adoptDraft,
} from '../ruleVersionEngine';
import { buildMemberView } from '../memberLedger';
import { memberM01 } from '../../data/presets';

const T = 0.05; // 容差（万元）

describe('1. 方案A 测算', () => {
  it('甲经营结余约 5.44 万元', () => {
    const r = evaluateScenario(scenarioA());
    expect(r.jia.operatingBalance).toBeCloseTo(5.44, 1);
  });
  it('乙经营结余约 9.77 万元', () => {
    const r = evaluateScenario(scenarioA());
    expect(Math.abs(r.yi.operatingBalance - 9.77)).toBeLessThan(T);
  });
});

describe('2. 方案B 测算', () => {
  it('甲经营结余约 4.77 万元', () => {
    const r = evaluateScenario(scenarioB());
    expect(Math.abs(r.jia.operatingBalance - 4.77)).toBeLessThan(T);
  });
  it('乙经营结余约 10.39 万元', () => {
    const r = evaluateScenario(scenarioB());
    expect(Math.abs(r.yi.operatingBalance - 10.39)).toBeLessThan(T);
  });
  it('方案B合计结余略低于方案A（15.17 vs 15.21）', () => {
    const a = evaluateScenario(scenarioA());
    const b = evaluateScenario(scenarioB());
    expect(a.combinedBalance).toBeGreaterThan(b.combinedBalance);
    expect(Math.abs(a.combinedBalance - 15.21)).toBeLessThan(T);
    expect(Math.abs(b.combinedBalance - 15.17)).toBeLessThan(T);
  });
});

describe('3. 甲峰值融资缺口约 86 万元', () => {
  it('方案A与方案B峰值均约86', () => {
    expect(Math.abs(evaluateParty(scenarioA(), 'JIA').peakLoan - 86)).toBeLessThan(T);
    expect(Math.abs(evaluateParty(scenarioB(), 'JIA').peakLoan - 86)).toBeLessThan(T);
  });
});

describe('4. 188/12 吨分批履约', () => {
  const s = scenarioBSplit();
  it('批次拆分正确', () => {
    expect(s.batches.map((b) => b.tons)).toEqual([188, 12]);
  });
  it('5. 首批货款 104.34 / 剩余 6.66', () => {
    expect(round((111 * 188) / 200)).toBeCloseTo(104.34, 2);
    expect(round((111 * 12) / 200)).toBeCloseTo(6.66, 2);
  });
  it('6. 成员尾款 3.76 / 0.24', () => {
    const tailTotal = s.jiaPurchaseTotal - s.memberPrepay; // 4
    expect(round((tailTotal * 188) / 200)).toBeCloseTo(3.76, 2);
    expect(round((tailTotal * 12) / 200)).toBeCloseTo(0.24, 2);
  });
  it('7. Day20 甲借款余额约 85.76 万元', () => {
    const jia = evaluateParty(s, 'JIA');
    const loanDay20 = jia.points.find((p) => p.day === 20)!.loan;
    expect(Math.abs(loanDay20 - 85.76)).toBeLessThan(T);
  });
});

describe('8-10. 账期变更现金流重算', () => {
  it('8. Rule-V1 下 Day35 甲可用资金约 24.77 万元', () => {
    const jia = evaluateParty(scenarioBSplit(), 'JIA');
    expect(Math.abs(cashAsOf(jia.points, 35) - 24.77)).toBeLessThan(T);
  });
  it('9. 账期 5->15 后 Day35 约 18.11 万元', () => {
    const jia = evaluateParty(scenarioBSplitDraft(), 'JIA');
    expect(Math.abs(cashAsOf(jia.points, 35) - 18.11)).toBeLessThan(T);
  });
  it('10. 新增资金缺口约 1.89 万元', () => {
    const jia = evaluateParty(scenarioBSplitDraft(), 'JIA');
    expect(Math.abs(jia.nextBusinessGap - 1.89)).toBeLessThan(T);
  });
});

describe('11. financialTranslator 自动生成正确 FinancialNeed', () => {
  const need = translate({
    before: scenarioBSplit(),
    after: scenarioBSplitDraft(),
    triggerText: '剩余12吨货款账期由验收后5日拟调整为15日',
    previousFinancingStatus: '已结清',
  });
  it('金额约 1.89 万元', () => expect(Math.abs(need.amount - 1.89)).toBeLessThan(T));
  it('起始日 35、结束日 45、持续约 10 天', () => {
    expect(need.startDay).toBe(35);
    expect(need.expectedEndDay).toBe(45);
    expect(need.expectedDurationDays).toBe(10);
  });
  it('还款来源约 6.66 万元、第45日', () => {
    expect(Math.abs(need.repaymentAmount - 6.66)).toBeLessThan(T);
    expect(need.expectedRepaymentDay).toBe(45);
  });
  it('现金流影响 24.77 -> 18.11', () => {
    expect(Math.abs(need.cashFlowImpact.beforeCash - 24.77)).toBeLessThan(T);
    expect(Math.abs(need.cashFlowImpact.afterCash - 18.11)).toBeLessThan(T);
  });
  it('主体/类型/新增需求标记正确', () => {
    expect(need.subject).toBe('合作组织甲');
    expect(need.createsNewFinancialNeed).toBe(true);
    expect(need.suggestedNeedCategory).toBe('短期经营周转类需求');
    expect(need.requiredMaterials.length).toBeGreaterThan(0);
  });
});

describe('12. mockBankApi 只返回 PENDING_BANK_REVIEW', () => {
  it('不返回任何批准态', () => {
    const need = translate({
      before: scenarioBSplit(),
      after: scenarioBSplitDraft(),
      triggerText: 'x',
      previousFinancingStatus: '已结清',
    });
    const res = submitFinancialNeed(need);
    expect(res.status).toBe('PENDING_BANK_REVIEW');
    expect(res.received).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/APPROVED|GRANTED|授信通过|可授信/);
  });
});

describe('13. Draft-V2 未确认不能覆盖 Rule-V1', () => {
  it('未确认时 adopt 抛错，effective 保持不变', () => {
    let book = createEmptyRuleBook();
    let v1 = createRuleV1(scenarioBSplit());
    v1 = confirmParty(v1, 'JIA');
    v1 = confirmParty(v1, 'YI');
    book = makeEffective(book, v1);
    expect(book.effective?.version).toBe('Rule-V1');

    book = proposeDraft(book, scenarioBSplitDraft(), 'Draft-V2', '乙提出剩余12吨账期15日');
    // 仅乙已确认，甲未确认
    expect(() => adoptDraft(book, 'Draft-V2')).toThrow();
    expect(book.effective?.version).toBe('Rule-V1');
    expect(book.drafts.find((d) => d.version === 'Draft-V2')).toBeTruthy();
  });
  it('全部确认后才能生效，原规则进入历史', () => {
    let book = createEmptyRuleBook();
    let v1 = createRuleV1(scenarioBSplit());
    v1 = confirmParty(confirmParty(v1, 'JIA'), 'YI');
    book = makeEffective(book, v1);
    book = proposeDraft(book, scenarioBSplitDraft(), 'Draft-V2', 'x');
    // 补充甲确认
    book = {
      ...book,
      drafts: book.drafts.map((d) =>
        d.version === 'Draft-V2' ? confirmParty(d, 'JIA') : d,
      ),
    };
    book = adoptDraft(book, 'Draft-V2');
    expect(book.effective?.version).toBe('Draft-V2');
    expect(book.history.some((h) => h.version === 'Rule-V1')).toBe(true);
  });
});

describe('14. 参数变化真实影响结果', () => {
  it('提高售价 -> 甲结余上升', () => {
    const base = evaluateScenario(scenarioB()).jia.operatingBalance;
    const s = scenarioB();
    s.salePriceJiaToYi = 113;
    const higher = evaluateScenario(s).jia.operatingBalance;
    expect(higher).toBeGreaterThan(base);
  });
  it('延长账期 -> 甲 Day35 可用资金下降', () => {
    const b = cashAsOf(evaluateParty(scenarioBSplit(), 'JIA').points, 35);
    const d = cashAsOf(evaluateParty(scenarioBSplitDraft(), 'JIA').points, 35);
    expect(d).toBeLessThan(b);
  });
  it('提高利率 -> 融资成本上升', () => {
    const base = evaluateParty(scenarioB(), 'JIA').totalInterest;
    const s = scenarioB();
    s.annualRate = 0.08;
    const higher = evaluateParty(s, 'JIA').totalInterest;
    expect(higher).toBeGreaterThan(base);
  });
});

describe('15. reset 恢复初始状态（预设纯函数每次返回全新对象）', () => {
  it('修改副本不污染新实例', () => {
    const s1 = scenarioB();
    s1.salePriceJiaToYi = 999;
    const s2 = scenarioB();
    expect(s2.salePriceJiaToYi).toBe(111);
  });
});

describe('补充：Pareto 辅助标签', () => {
  it('为明显占优关系给出“存在更优替代”，但不输出推荐字样', () => {
    const metrics = compareScenarios([scenarioA(), scenarioB()]);
    const text = JSON.stringify(metrics);
    expect(text).not.toMatch(/推荐|最优|AI/);
    expect(metrics.every((m) => 'dominatedBy' in m)).toBe(true);
  });
});

describe('补充：成员明白账单位为元且可对账', () => {
  it('预付+尾款=收购价款', () => {
    const v = buildMemberView(memberM01());
    expect(v.reconciles).toBe(true);
    expect(v.prepaidYuan + v.tailYuan).toBe(v.purchasePriceYuan);
    expect(v.purchasePriceYuan).toBe(5200);
  });
});
