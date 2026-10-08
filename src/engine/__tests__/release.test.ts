import { describe, it, expect } from 'vitest';
import { initializeScene } from '../demoScene';
import { EventGate } from '../eventGate';
import { proposeDraft, confirmDraftParty, adoptDraft } from '../ruleVersionEngine';
import { draftComparison } from '../workflowEngine';
import { evaluateParty, buildEvents } from '../calculationEngine';
import { submitFinancialNeed } from '../mockBankApi';
import { translate } from '../financialTranslator';

describe('最终发布场景与事件去重', () => {
  it.each(['', '?scene=unknown', '?scene=compare', '?scene=recalculate', '?scene=translate'])('场景 %s 经真实引擎启动', (search) => {
    const initial = initializeScene(search);
    if (search.includes('recalculate') || search.includes('translate')) {
      expect(initial.book.effective?.version).toBe('Rule-V1');
      expect(initial.book.drafts[0].status).toBe('DRAFT');
      const comparison = draftComparison(initial.book)!;
      expect(evaluateParty(comparison.before, 'JIA').cashAtNextBusiness).toBeCloseTo(24.77, 2);
      expect(evaluateParty(comparison.after, 'JIA').cashAtNextBusiness).toBeCloseTo(18.11, 2);
      expect(() => adoptDraft(initial.book, 'Draft-V2')).toThrow();
    } else expect(initial.book.effective).toBeNull();
    if (search.includes('translate')) expect(initial.need?.amount).toBeCloseTo(1.89, 2);
  });
  it('同一变更重复提出不撤销甲的确认，也不重建草案时间', () => {
    const initial = initializeScene('?scene=recalculate');
    const confirmed = confirmDraftParty(initial.book, 'Draft-V2', 'JIA');
    const draft = confirmed.drafts[0];
    const repeated = proposeDraft(confirmed, draft.scenario, draft.version, draft.note);
    expect(repeated).toBe(confirmed);
    expect(repeated.drafts[0].status).toBe('CONFIRMED');
    expect(confirmDraftParty(repeated, 'Draft-V2', 'JIA').drafts[0]).toBe(draft);
  });
  it('同版本不同条件不能覆盖已确认草案', () => {
    const initial = initializeScene('?scene=recalculate');
    const draft = initial.book.drafts[0];
    expect(() => proposeDraft(initial.book, { ...draft.scenario, salePriceJiaToYi: 120 }, draft.version, draft.note)).toThrow('新版本');
  });
  it('银行等待与合同采纳独立，回执不能使未确认草案生效', () => {
    const initial = initializeScene('?scene=translate');
    const response = submitFinancialNeed(initial.need!);
    expect(response.status).toBe('PENDING_BANK_REVIEW');
    expect(initial.book.effective?.version).toBe('Rule-V1');
    expect(() => adoptDraft(initial.book, 'Draft-V2')).toThrow();
    const adopted = adoptDraft(confirmDraftParty(initial.book, 'Draft-V2', 'JIA'), 'Draft-V2');
    expect(adopted.effective?.version).toBe('Draft-V2');
    expect(adopted.history[0].version).toBe('Rule-V1');
    expect(response.status).toBe('PENDING_BANK_REVIEW');
  });
  it('后续经营需要只检查可用流动性，不增加本笔现金支出或融资', () => {
    const scenario = initializeScene('?scene=recalculate').book.effective!.scenario;
    const changed = { ...scenario, nextBusinessAmount: 250 };
    expect(buildEvents(changed, 'JIA')).toEqual(buildEvents(scenario, 'JIA'));
    const a = evaluateParty(scenario, 'JIA'), b = evaluateParty(changed, 'JIA');
    expect(b.points).toEqual(a.points);
    expect(b.peakLoan).toBe(a.peakLoan);
    expect(b.nextBusinessGap).toBeGreaterThan(a.nextBusinessGap);
  });
  it('连续同事件只接受一次，独立事件与重置后事件仍可接受', () => {
    const gate = new EventGate();
    expect(gate.accept('day25')).toBe(true);
    expect(gate.accept('day25')).toBe(false);
    expect(gate.accept('day35')).toBe(true);
    gate.clear(); expect(gate.accept('day25')).toBe(true);
  });
  it('极小正缺口保留金额，避免四舍五入成零导致模拟提交异常', () => {
    const comparison = draftComparison(initializeScene('?scene=recalculate').book)!;
    const amount = evaluateParty(comparison.after, 'JIA').cashAtNextBusiness + 0.001;
    const need = translate({ ...comparison, after: { ...comparison.after, nextBusinessAmount: amount }, triggerText: comparison.trigger, previousFinancingStatus: '已结清' });
    expect(need.amount).toBeCloseTo(0.001, 8);
    expect(submitFinancialNeed(need).status).toBe('PENDING_BANK_REVIEW');
  });
});
