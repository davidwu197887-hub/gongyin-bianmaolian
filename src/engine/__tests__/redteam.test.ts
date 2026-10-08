import { describe, it, expect } from 'vitest';
import { CashFlowEvent, TradeScenario } from '../../types';
import { scenarioA, scenarioB, scenarioBSplit, scenarioBSplitDraft } from '../../data/presets';
import { buildEvents, cashAsOf, evaluateParty, evaluateScenario, simulate } from '../calculationEngine';
import { initialNeed, translate } from '../financialTranslator';
import { compareScenarios } from '../scenarioEngine';
import { createEmptyRuleBook, createRuleV1, confirmParty, makeEffective, proposeDraft, adoptDraft, confirmDraftParty, effectiveScenario } from '../ruleVersionEngine';
import { fulfillmentScenario, remainingExtension, draftComparison } from '../workflowEngine';
import { snapshotAt, buildTimeline, buildEvents as fulfillmentEvents } from '../eventEngine';
import { submitFinancialNeed } from '../mockBankApi';

const event = (day: number, amount: number): CashFlowEvent => ({ party: 'JIA', day, amount, kind: 'OTHER_COST', label: '独立现金流样本' });
const options = { rate: 0.04, minSafe: 0, horizon: 100 };
const needOf = (patch: Partial<TradeScenario> = {}, afterPatch: Partial<TradeScenario> = {}) => translate({
  before: { ...scenarioBSplit(), ...patch }, after: { ...scenarioBSplitDraft(), ...patch, ...afterPatch },
  triggerText: '真实条件变化', previousFinancingStatus: '模拟计划',
});
const effectiveBook = (s = scenarioBSplit()) => makeEffective(createEmptyRuleBook(), confirmParty(confirmParty(createRuleV1(s), 'JIA'), 'YI'));

describe('独立数学核验：明确列出各段本金及天数，未调用被测函数生成expected', () => {
  it.each([
    ['A', scenarioA, 82 * 20 * .04 / 365 + 86 * 40 * .04 / 365, 105 * 20 * .04 / 365, 6, 10],
    ['B', scenarioB, 82 * 20 * .04 / 365 + 86 * 5 * .04 / 365, 91 * 15 * .04 / 365 + 104 * 40 * .04 / 365, 5, 11],
  ] as const)('%s 分段利息/经营结余', (_id, factory, jiaInterest, yiInterest, jiaNet, yiNet) => {
    const r = evaluateScenario(factory());
    expect(r.jia.totalInterest).toBeCloseTo(jiaInterest, 10);
    expect(r.yi.totalInterest).toBeCloseTo(yiInterest, 10);
    expect(r.jia.operatingBalance).toBeCloseTo(jiaNet - jiaInterest, 10);
    expect(r.yi.operatingBalance).toBeCloseTo(yiNet - yiInterest, 10);
  });
  it('split的贷款、利息、Day25/35及缺口精确核验', () => {
    const interest = (82 * 20 + 85.76 * 5) * .04 / 365;
    const jia = evaluateParty(scenarioBSplit(), 'JIA');
    expect(cashAsOf(jia.points, 25)).toBeCloseTo(104.34 - 85.76 - interest, 10);
    expect(cashAsOf(jia.points, 35)).toBeCloseTo(104.34 - 85.76 - interest - .24 + 6.66, 10);
    expect(needOf().amount).toBeCloseTo(Math.round((20 - (104.34 - 85.76 - interest - .24)) * 100) / 100, 10);
  });
});

describe('现金流边界与融资时长', () => {
  it('同日多笔收支按净额合并且与顺序无关', () => {
    const es = [event(0, 20), event(0, -12), event(0, -11), event(0, 5)];
    const r = simulate(es, options);
    expect(r.peakLoan).toBe(0);
    expect(r.points[0].cash).toBe(2);
    expect(simulate(es.reverse(), options)).toEqual(r);
  });
  it('没有现金流不虚构融资', () => expect(simulate([], options).peakLoan).toBe(0));
  it('完全无需融资且无利息', () => {
    const r = simulate([event(0, 200), event(5, -100), event(30, 110)], options);
    expect(r.peakLoan).toBe(0); expect(r.firstShortfall).toBeNull(); expect(r.totalInterest).toBe(0); expect(r.financingDuration).toBe(0);
  });
  it('部分偿还先还利息，本金分段变化，时长包含结清日', () => {
    const r = simulate([event(0, -100), event(10, 30), event(20, 100)], options);
    const firstInt = 100 * .04 * 10 / 365;
    const remaining = 70 + firstInt;
    expect(r.points.find((p) => p.day === 10)?.loan).toBeCloseTo(remaining, 10);
    expect(r.totalInterest).toBeCloseTo(firstInt + remaining * .04 * 10 / 365, 10);
    expect(r.financingDuration).toBe(20);
  });
  it('贷款未结清，截止日余额和占用天数真实保留', () => {
    const r = simulate([event(0, -100), event(10, 30)], options);
    const remaining = 70 + 100 * .04 * 10 / 365;
    expect(r.points[r.points.length - 1]?.day).toBe(100);
    expect(r.points[r.points.length - 1]?.loan).toBeCloseTo(remaining, 10);
    expect(r.totalInterest).toBeCloseTo(100 * .04 * 10 / 365 + remaining * .04 * 90 / 365, 10);
    expect(r.financingDuration).toBe(100);
  });
  it('两段融资之间无贷款的时间不计入融资持续时间', () => {
    const r = simulate([event(0, -10), event(10, 10), event(30, -10), event(40, 10)], { ...options, rate: 0 });
    expect(r.financingDuration).toBe(20);
  });
  it('paymentDays=0，验收日收支净额同日结算', () => {
    const s = { ...scenarioB(), paymentDays: 0 };
    expect(evaluateParty(s, 'JIA').points.find((p) => p.day === 20)?.loan).toBe(0);
    expect(evaluateParty(s, 'JIA').financingDurationDays).toBe(20);
  });
  it.each([0, 1e-12, 2])('极低/极高利率%s保持有限结果', (annualRate) => {
    const r = evaluateParty({ ...scenarioB(), annualRate }, 'JIA');
    expect(Number.isFinite(r.operatingBalance)).toBe(true);
    expect(r.totalInterest).toBeCloseTo((82 * 20 + 86 * 5) * annualRate / 365, 10);
  });
  it('自有资金为零', () => expect(evaluateParty({ ...scenarioB(), jiaOwnFunds: 0 }, 'JIA').peakLoan).toBe(106));
  it('多批数量变化仍守恒，尾款与回款按比例分配', () => {
    const s = { ...scenarioBSplit(), batches: [{ id: 'X', tons: 100, verifyDay: 20 }, { id: 'Y', tons: 50, verifyDay: 25 }, { id: 'Z', tons: 50, verifyDay: 30 }] };
    const es = buildEvents(s, 'JIA');
    expect(es.filter((e) => e.kind === 'SALE_RECEIPT').reduce((a, e) => a + e.amount, 0)).toBe(111);
    expect(es.filter((e) => e.kind === 'MEMBER_TAIL').reduce((a, e) => a - e.amount, 0)).toBe(4);
  });
  it('付款日大于原horizon，截止日仍覆盖所有现金流', () => {
    const r = evaluateParty({ ...scenarioB(), paymentDays: 300 }, 'JIA');
    expect(r.financingDurationDays).toBe(320);
    expect(r.points[r.points.length - 1]?.day).toBe(340);
  });
  it('安全余额不得作为下一笔经营可用款项', () => {
    const r = evaluateParty({ ...scenarioBSplitDraft(), minSafeBalance: 5 }, 'JIA');
    expect(r.cashAtNextBusiness).toBeCloseTo(cashAsOf(r.points, 35) - 5, 10);
    expect(snapshotAt({ ...scenarioBSplitDraft(), minSafeBalance: 5 }, 35, 'X').jiaCash).toBeCloseTo(Math.round(r.cashAtNextBusiness * 100) / 100, 2);
  });
  it('履约时间轴包含修改后的加工支出日，事件金额随参数变化', () => {
    const s = { ...scenarioBSplit(), yiProcessingDay: 41, yiProcessingCost: 15 };
    expect(buildTimeline(s)).toContain(41);
    expect(fulfillmentEvents(s).find((e) => e.kind === 'PROCESSING')).toMatchObject({ day: 41, detail: '加工及后续费用15万元' });
  });
});

describe('拒绝非法输入', () => {
  it.each([
    { jiaOwnFunds: -1 }, { annualRate: NaN }, { annualRate: Infinity }, { totalTons: 0 },
    { paymentDays: -1 }, { paymentDays: 1.5 }, { memberPrepay: 105 },
    { batches: [] }, { batches: [{ id: 'B', tons: 199, verifyDay: 20 }] },
    { batches: [{ id: 'B', tons: -200, verifyDay: 20 }] },
    { batches: [{ id: 'B', tons: 200, verifyDay: -20 }] },
    { batches: [{ id: 'B', tons: 200, verifyDay: 20, paymentDaysOverride: -1 }] },
    { batches: [{ id: 'B', tons: 100, verifyDay: 20 }, { id: 'B', tons: 100, verifyDay: 30 }] },
  ])('方案非法参数 %#', (patch) => expect(() => evaluateScenario({ ...scenarioB(), ...patch })).toThrow());
  it.each([event(-1, 5), event(1.5, 5), event(0, Infinity), event(101, 5)])('现金事件非法%#', (e) => expect(() => simulate([e], options)).toThrow());
  it('非法利率/截止日', () => {
    expect(() => simulate([], { ...options, rate: -1 })).toThrow();
    expect(() => simulate([], { ...options, horizon: NaN })).toThrow();
  });
});

describe('financialTranslator非默认参数，禁止固定缺口/期限/来源', () => {
  it('后续需要20改25：金额随实际差额变为6.89；区分已有缺口与增量', () => {
    const n = needOf({ nextBusinessAmount: 25 });
    expect(n.amount).toBeCloseTo(6.89, 2); expect(n.cashFlowImpact.beforeGap).toBeCloseTo(.23, 2);
    expect(n.cashFlowImpact.incrementalGap).toBeCloseTo(6.66, 2);
  });
  it('自有资金增加减少缺口；充足资金无需融资', () => {
    expect(needOf({ jiaOwnFunds: 21 }).amount).toBeLessThan(needOf().amount);
    const n = needOf({ jiaOwnFunds: 200 });
    expect(n.amount).toBe(0); expect(n.createsNewFinancialNeed).toBe(false); expect(n.expectedDurationDays).toBeNull();
    expect(initialNeed({ ...scenarioB(), jiaOwnFunds: 200 }).amount).toBe(0);
    expect(() => submitFinancialNeed(n)).toThrow();
  });
  it('售价变化同时影响缺口和还款金额', () => {
    const n = needOf({ salePriceJiaToYi: 112 });
    expect(n.amount).toBeLessThan(needOf().amount); expect(n.repaymentAmount).toBeCloseTo(6.72, 2); expect(n.repaymentSource).toContain('6.72');
  });
  it('利率变化影响现金及缺口', () => expect(needOf({ annualRate: .08 }).amount).toBeGreaterThan(needOf().amount));
  it('剩余回款由Day45改Day50，期限随之变为15天', () => {
    const after = scenarioBSplitDraft(); after.batches[1].paymentDaysOverride = 20;
    const n = needOf({}, { batches: after.batches });
    expect(n.startDay).toBe(35); expect(n.expectedRepaymentDay).toBe(50); expect(n.expectedDurationDays).toBe(15); expect(n.repaymentSource).toContain('Day50');
  });
  it('经营日提前，startDay与duration重新计算', () => {
    const n = needOf({ nextBusinessDay: 28 });
    expect(n.startDay).toBe(28); expect(n.expectedDurationDays).toBe(17); expect(n.amount).toBeCloseTo(1.65, 2);
  });
  it.each([45, 50])('经营日在回款当天或之后%s无新增需求，不能重复使用该回款', (nextBusinessDay) => {
    const n = needOf({ nextBusinessDay });
    expect(n.amount).toBe(0); expect(n.expectedRepaymentDay).toBeNull(); expect(n.repaymentAmount).toBe(0);
  });
  it('回款不足以覆盖需求时不伪造10天可偿还结论', () => {
    const n = needOf({ nextBusinessAmount: 30 });
    expect(n.expectedRepaymentDay).toBeNull(); expect(n.expectedDurationDays).toBeNull(); expect(n.repaymentSource).toContain('不足');
  });
  it('同日多批回款合并；不足首批不得当作足额还款来源', () => {
    const after = scenarioBSplitDraft();
    after.batches = [{ id: 'B1', tons: 188, verifyDay: 20 }, { id: 'B2a', tons: 6, verifyDay: 30, paymentDaysOverride: 15 }, { id: 'B2b', tons: 6, verifyDay: 30, paymentDaysOverride: 15 }];
    expect(needOf({}, { batches: after.batches }).repaymentAmount).toBeCloseTo(6.66, 2);
    after.batches[2].paymentDaysOverride = 20;
    const n = needOf({ nextBusinessAmount: 23 }, { batches: after.batches });
    expect(n.expectedRepaymentDay).toBe(50); expect(n.repaymentAmount).toBeCloseTo(6.66, 2);
  });
  it('回款账期变更虽不改变融资峰值，仍影响初始融资期限', () => {
    const before = scenarioA(); const after = { ...before, paymentDays: 50 };
    const n = translate({ before, after, triggerText: '延长全部账期', previousFinancingStatus: '未结清' });
    expect(n.affectsExistingFacility).toBe(true);
  });
});

describe('真实工作流及规则隔离', () => {
  it('唯一验收链：Draft→重算→FinancialNeed→mock回执，Rule-V1保留有效', () => {
    const book = effectiveBook();
    const change = remainingExtension(book.effective!.scenario, 25);
    const proposed = proposeDraft(book, change.scenario, 'Draft-V2', change.trigger);
    const c = draftComparison(proposed)!;
    expect(() => adoptDraft(proposed, 'Draft-V2')).toThrow();
    expect(effectiveScenario(proposed)?.batches[1].paymentDaysOverride).toBeUndefined();
    expect(snapshotAt(effectiveScenario(proposed)!, 35, 'Rule-V1').jiaCash).toBeCloseTo(24.77, 2);
    const need = translate({ ...c, triggerText: c.trigger, previousFinancingStatus: '已结清' });
    expect(need.cashFlowImpact.afterCash).toBeCloseTo(18.11, 2); expect(need.amount).toBeCloseTo(1.89, 2);
    expect(submitFinancialNeed(need).status).toBe('PENDING_BANK_REVIEW');
    expect(proposed.effective?.version).toBe('Rule-V1');
    const adopted = adoptDraft(confirmDraftParty(proposed, 'Draft-V2', 'JIA'), 'Draft-V2');
    expect(adopted.effective?.version).toBe('Draft-V2'); expect(adopted.history[0].status).toBe('SUPERSEDED');
    expect(draftComparison(adopted)?.before).toEqual(c.before);
  });
  it('选择/生成草案保留实验参数，随后编辑实验不会污染规则', () => {
    const selected = { ...scenarioB(), nextBusinessAmount: 25, salePriceJiaToYi: 112, jiaOwnFunds: 21, annualRate: .08 };
    const plan = fulfillmentScenario(selected); const book = effectiveBook(plan);
    selected.nextBusinessAmount = 99; plan.batches[0].tons = 0;
    const changed = remainingExtension(book.effective!.scenario, 25);
    const n = translate({ before: book.effective!.scenario, after: changed.scenario, triggerText: changed.trigger, previousFinancingStatus: '已结清' });
    expect(n.amount).not.toBeCloseTo(1.89, 2); expect(n.cashFlowImpact.requirement).toBe(25); expect(n.repaymentAmount).toBeCloseTo(6.72, 2);
    expect(book.effective?.scenario.batches[0].tons).toBe(188);
  });
  it('空确认数组/伪造CONFIRMED不能生效', () => {
    const v = { ...createRuleV1(scenarioBSplit()), status: 'CONFIRMED' as const, confirmations: [] };
    expect(() => makeEffective(createEmptyRuleBook(), v)).toThrow();
  });
  it('确认后修改条款，采纳失败', () => {
    let book = proposeDraft(effectiveBook(), scenarioBSplitDraft(), 'Draft-V2', '延长账期');
    book = confirmDraftParty(book, 'Draft-V2', 'JIA');
    book.drafts[0].scenario.salePriceJiaToYi = 999;
    expect(() => adoptDraft(book, 'Draft-V2')).toThrow();
  });
  it('确认后修改测算条件也必须重新确认；生效副本隔离旧草案引用', () => {
    let book = proposeDraft(effectiveBook(), scenarioBSplitDraft(), 'Draft-V2', '延长账期');
    book = confirmDraftParty(book, 'Draft-V2', 'JIA');
    const adopted = adoptDraft(book, 'Draft-V2');
    book.drafts[0].scenario.annualRate = .1;
    expect(adopted.effective?.scenario.annualRate).toBe(.04);
    expect(() => adoptDraft(book, 'Draft-V2')).toThrow();
  });
  it('过期草案不得覆盖新有效版本', () => {
    let book = proposeDraft(effectiveBook(), scenarioBSplitDraft(), 'Draft-V2', '延长');
    book = proposeDraft(book, scenarioBSplitDraft(), 'Draft-V3', '另一个草案');
    book = confirmDraftParty(confirmDraftParty(book, 'Draft-V2', 'JIA'), 'Draft-V3', 'JIA');
    book = adoptDraft(book, 'Draft-V2');
    expect(() => adoptDraft(book, 'Draft-V3')).toThrow();
  });
  it('effectiveScenario返回副本，外部编辑不能污染有效版本', () => {
    const book = effectiveBook(); const s = effectiveScenario(book)!; s.batches[0].tons = 1;
    expect(book.effective?.scenario.batches[0].tons).toBe(188);
  });
  it('重复版本和无待付款批次禁止变更', () => {
    expect(() => proposeDraft(effectiveBook(), scenarioBSplitDraft(), 'Rule-V1', 'x')).toThrow();
    expect(() => remainingExtension(scenarioBSplit(), 80)).toThrow();
  });
});

describe('Pareto方向及精度', () => {
  it('同时降低甲融资成本/峰值及后续缺口，结余不低则旧方案存在更优替代', () => {
    const base = scenarioA(); const improved = { ...base, id: 'C', name: '更多自有资金', jiaOwnFunds: 200 };
    const [a, c] = compareScenarios([base, improved]);
    expect(a.dominatedBy).toBe(improved.name); expect(c.dominatedBy).toBeNull();
  });
  it('方向不可反转，细小差异不因提前四舍五入而消失', () => {
    const s = scenarioB(); const better = { ...s, id: 'C', name: '精度样本', jiaOtherCost: s.jiaOtherCost - .0001 };
    const [b, c] = compareScenarios([s, better]); expect(b.dominatedBy).toBe(better.name); expect(c.dominatedBy).toBeNull();
  });
  it('A/B取舍不产生推荐结论或错误支配', () => expect(compareScenarios([scenarioA(), scenarioB()]).every((m) => m.dominatedBy === null)).toBe(true));
  it('资金缺口数值越小越优，即使两方案都有缺口', () => {
    const a = { ...scenarioBSplitDraft(), nextBusinessAmount: 30 };
    const b = { ...a, id: 'C', name: '缺口较小', nextBusinessAmount: 25 };
    expect(compareScenarios([a, b])[0].dominatedBy).toBe(b.name);
  });
});


