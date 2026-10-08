import { useState, useCallback, useMemo, useRef } from 'react';
import { TradeScenario, RuleBook, FinancialNeed, BankApiResponse, MemberPayment } from './types';
import { scenarioA, scenarioB, memberM01 } from './data/presets';
import { createEmptyRuleBook, createRuleV1, confirmParty, makeEffective, proposeDraft, confirmDraftParty, adoptDraft } from './engine/ruleVersionEngine';
import { translate } from './engine/financialTranslator';
import { submitFinancialNeed } from './engine/mockBankApi';
import { AuditTrail } from './engine/auditTrail';
import { markTailPaid } from './engine/memberLedger';
import { fulfillmentScenario, remainingExtension, draftComparison } from './engine/workflowEngine';
import { validateScenario } from './engine/validation';
import { evaluateParty, evaluateScenario, loanAsOf } from './engine/calculationEngine';
import { initializeScene } from './engine/demoScene';
import { EventGate } from './engine/eventGate';

export type Page = 'calc' | 'compare' | 'rule' | 'fulfillment' | 'exception' | 'translate' | 'member' | 'audit';

export function useStore() {
  const [initial] = useState(() => initializeScene(window.location.search));
  const [page, setPage] = useState<Page>(initial.page);
  const [scenarios, setScenarios] = useState<TradeScenario[]>([...initial.scenarios]);
  const [activeCalcId, setActiveCalcId] = useState('B');
  const [book, setBook] = useState<RuleBook>(initial.book);
  const [currentDay, setCurrentDay] = useState(initial.currentDay);
  const [need, setNeed] = useState<FinancialNeed | null>(initial.need);
  const [bankResp, setBankResp] = useState<BankApiResponse | null>(null);
  const [error, setError] = useState('');
  const [member, setMember] = useState<MemberPayment>(initial.member);
  const gate = useRef(new EventGate());
  const bankReceipts = useRef(new Map<string, BankApiResponse>());
  const [audit] = useState(() => {
    const trail = new AuditTrail();
    if (initial.book.effective) trail.add('SCENE', initial.page, '场景链接经正式引擎初始化：Rule-V1 已有效、Day25、Draft-V2 待甲确认；银行尚未提交');
    return trail;
  });
  const [, forceAudit] = useState(0);
  const logAudit = useCallback((type: string, ref: string, detail: string) => {
    audit.add(type, ref, detail); forceAudit((x) => x + 1);
  }, [audit]);
  const clearNeed = () => { setNeed(null); setBankResp(null); };
  const activeCalcScenario = scenarios.find((s) => s.id === activeCalcId) ?? scenarios[0];
  const comparison = useMemo(() => draftComparison(book), [book]);

  function updateScenario(id: string, patch: Partial<TradeScenario>) {
    const updated = scenarios.map((s) => s.id === id ? { ...s, ...patch } : s);
    try { updated.forEach((s) => { validateScenario(s); evaluateScenario(s); }); setScenarios(updated); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  function addScenarioCopy(fromId: string) {
    const src = scenarios.find((s) => s.id === fromId);
    if (!src) return;
    const id = String.fromCharCode(Math.max(...scenarios.map((s) => s.id.charCodeAt(0))) + 1);
    setScenarios([...scenarios, { ...src, id, name: `方案${id}·自定义`, batches: src.batches.map((b) => ({ ...b })) }]);
    setActiveCalcId(id);
  }
  function chooseScenarioForRule(id: string) {
    if (book.effective) { setError('已有有效规则，需通过变更草案调整'); return; }
    const selected = scenarios.find((s) => s.id === id);
    if (!selected) return;
    const chosen = fulfillmentScenario(selected);
    const v1 = createRuleV1(chosen);
    gate.current.clear(); bankReceipts.current.clear();
    setBook({ effective: null, drafts: [v1], history: [] });
    setCurrentDay(0); setMember(memberM01());
    clearNeed(); setError('');
    logAudit('RULE', 'Rule-V1', `由${chosen.name}生成 Rule-V1（待确认）摘要 ${v1.hash}`);
  }
  function confirmRuleParty(partyId: 'JIA' | 'YI') {
    const draft = book.drafts.find((d) => d.version === 'Rule-V1');
    if (!draft) return;
    const updated = confirmParty(draft, partyId);
    if (!gate.current.accept(`confirm:Rule-V1:${partyId}`) || updated === draft) return;
    setBook({ ...book, drafts: book.drafts.map((d) => d.version === 'Rule-V1' ? updated : d) });
    logAudit('CONFIRM', 'Rule-V1', `${partyId}确认责任`);
  }
  function effectuateRule() {
    const draft = book.drafts.find((d) => d.version === 'Rule-V1');
    if (!draft) return;
    try {
      const next = makeEffective(book, draft);
      if (!gate.current.accept(`effective:${draft.hash}`)) return;
      setBook(next); setError('');
    }
    catch (e) { setError((e as Error).message); return; }
    logAudit('EFFECTIVE', 'Rule-V1', 'Rule-V1 全部确认后生效');
  }
  function proposeExtension() {
    if (!book.effective || book.effective.version !== 'Rule-V1') return;
    if (book.drafts.some((d) => d.version === 'Draft-V2')) return;
    try {
      const change = remainingExtension(book.effective.scenario, currentDay);
      const next = proposeDraft(book, change.scenario, 'Draft-V2', change.trigger);
      if (!gate.current.accept(`draft:${book.effective.hash}`)) return;
      setBook(next);
      clearNeed(); setError('');
      logAudit('DRAFT', 'Draft-V2', change.trigger);
    } catch (e) { setError((e as Error).message); }
  }
  function confirmDraft(partyId: 'JIA' | 'YI') {
    const draft = book.drafts.find((d) => d.version === 'Draft-V2');
    if (!draft || draft.confirmations.some((c) => c.partyId === partyId && c.confirmed) || !gate.current.accept(`confirm:Draft-V2:${partyId}`)) return;
    setBook(confirmDraftParty(book, 'Draft-V2', partyId));
    logAudit('CONFIRM', 'Draft-V2', `${partyId}确认草案`);
  }
  function adoptV2() {
    try {
      const next = adoptDraft(book, 'Draft-V2');
      if (!gate.current.accept(`adopt:${next.effective!.hash}`)) return;
      setBook(next); setError('');
    }
    catch (e) { setError((e as Error).message); return; }
    logAudit('EFFECTIVE', 'Draft-V2', 'Draft-V2 全部确认后生效，Rule-V1 进入历史');
  }
  function runTranslate() {
    if (!comparison) { setError('请先生效规则并生成变更草案'); return; }
    const loan = loanAsOf(evaluateParty(comparison.before, 'JIA').points, currentDay);
    const n = translate({ before: comparison.before, after: comparison.after, triggerText: comparison.trigger,
      previousFinancingStatus: currentDay === 0 ? '尚未开始履约（模拟融资计划）' : loan > 1e-9 ? `未结清，余额${loan.toFixed(2)}万元` : '已结清' });
    setNeed(n); setBankResp(bankReceipts.current.get(n.needId) ?? null); setError('');
    if (gate.current.accept(`need:${n.needId}`)) logAudit('NEED', n.needId, `生成金融需求：${n.subject} ${n.amount}万元 / Day${n.startDay}`);
    return n;
  }
  function submitToBank() {
    if (!need?.createsNewFinancialNeed || bankResp) return;
    const resp = submitFinancialNeed(need);
    if (!gate.current.accept(`bank:${need.needId}`)) return;
    bankReceipts.current.set(need.needId, resp);
    setBankResp(resp);
    logAudit('BANK_API', resp.requestId, `提交 mock-bank-api，回执状态 ${resp.status}`);
  }
  function advanceDay(day: number) {
    if (!Number.isInteger(day) || day < 0) { setError('履约日必须是非负整数'); return; }
    setCurrentDay(day);
    setMember((m) => markTailPaid(m, m.tailPaid || (!!book.effective && day >= m.tailTriggerDay)));
    if (gate.current.accept(`event:${book.effective?.basedOnHash ?? book.effective?.hash ?? 'preview'}:Day${day}`)) logAudit('EVENT', `Day${day}`, `履约时间轴推进至Day${day}（模拟事件及回执）`);
  }
  function reset() {
    setScenarios([scenarioA(), scenarioB()]); setActiveCalcId('B'); setBook(createEmptyRuleBook());
    setCurrentDay(0); clearNeed(); setMember(memberM01()); setError('');
    audit.clear(); forceAudit((x) => x + 1); setPage('calc');
    gate.current.clear(); bankReceipts.current.clear();
    const url = new URL(window.location.href); url.searchParams.delete('scene');
    window.history.replaceState(null, '', url.href);
  }
  return { page, setPage, captureMode: initial.captureMode, error, comparison, scenarios, activeCalcId, setActiveCalcId, activeCalcScenario,
    updateScenario, addScenarioCopy, book, chooseScenarioForRule, confirmRuleParty, effectuateRule,
    proposeExtension, confirmDraft, adoptV2, currentDay, advanceDay, need, runTranslate, bankResp,
    submitToBank, member, audit: audit.list(), logAudit, reset };
}
export type Store = ReturnType<typeof useStore>;
