// ============================================================================
// ruleVersionEngine —— 规则版本状态机
// Rule-V1 为当前有效规则；Draft-V2 在确认前绝不覆盖 Rule-V1。
// ============================================================================

import {
  TradeScenario,
  RuleVersion,
  RuleBook,
  ContractRule,
  Confirmation,
} from '../types';
import { digest } from './hash';
import { copyScenario, validateScenario } from './validation';

function copyVersion(v: RuleVersion): RuleVersion {
  return { ...v, scenario: copyScenario(v.scenario), rule: { ...v.rule, batches: v.rule.batches.map((b) => ({ ...b })) }, confirmations: v.confirmations.map((c) => ({ ...c })) };
}

function assertConfirmed(rule: RuleVersion): void {
  validateScenario(rule.scenario);
  if (rule.status !== 'CONFIRMED' || rule.confirmations.length !== 2 ||
      !['JIA', 'YI'].every((id) => rule.confirmations.some((c) => c.partyId === id && c.confirmed))) {
    throw new Error('规则未完成全部必要主体确认，不能生效');
  }
  if (digest({ v: rule.version, rule: rule.rule, scenario: rule.scenario }) !== rule.hash ||
      JSON.stringify(ruleFromScenario(rule.scenario, rule.rule.contractDoc)) !== JSON.stringify(rule.rule)) {
    throw new Error('确认后的规则内容发生变化，必须重新确认');
  }
}

function ruleFromScenario(s: TradeScenario, contractDoc: string): ContractRule {
  return {
    salePrice: s.salePriceJiaToYi,
    paymentMode: s.paymentMode,
    paymentDays: s.paymentDays,
    batches: s.batches.map((b) => ({ ...b })),
    contractDoc,
  };
}

export function createEmptyRuleBook(): RuleBook {
  return { effective: null, drafts: [], history: [] };
}

/** 由选定方案创建 Rule-V1（初始为 DRAFT，待确认） */
export function createRuleV1(s: TradeScenario): RuleVersion {
  validateScenario(s);
  const rule = ruleFromScenario(s, 'Contract-V1');
  const confirmations: Confirmation[] = [
    { partyId: 'JIA', partyName: '合作组织甲', responsibility: '确认购销价格与分批付款条件', confirmed: false },
    { partyId: 'YI', partyName: '加工企业乙', responsibility: '确认按验收后约定账期付款', confirmed: false },
  ];
  const draft: RuleVersion = {
    version: 'Rule-V1',
    status: 'DRAFT',
    scenario: copyScenario(s),
    rule,
    confirmations,
    createdAt: new Date().toISOString(),
    hash: digest({ v: 'Rule-V1', rule, scenario: s }),
    note: '由选定方案生成，等待各责任主体按责确认',
  };
  return draft;
}

/** 确认某主体责任 */
export function confirmParty(rule: RuleVersion, partyId: 'JIA' | 'YI'): RuleVersion {
  if (!['DRAFT', 'CONFIRMED'].includes(rule.status)) throw new Error('只能确认草案');
  if (rule.confirmations.some((c) => c.partyId === partyId && c.confirmed)) return rule;
  const confirmations = rule.confirmations.map((c) =>
    c.partyId === partyId ? { ...c, confirmed: true, confirmedAt: new Date().toISOString() } : c,
  );
  const allConfirmed = confirmations.every((c) => c.confirmed);
  return {
    ...copyVersion(rule),
    confirmations,
    status: allConfirmed ? 'CONFIRMED' : 'DRAFT',
  };
}

/** 将已确认的规则置为生效（放入 RuleBook.effective） */
export function makeEffective(book: RuleBook, rule: RuleVersion): RuleBook {
  if (book.effective) throw new Error('已有有效规则，变更必须通过adoptDraft');
  assertConfirmed(rule);
  const effective: RuleVersion = { ...copyVersion(rule), status: 'EFFECTIVE' };
  return { ...book, effective, drafts: book.drafts.filter((d) => d.version !== rule.version) };
}

/**
 * 提出条件变更 -> 生成 Draft-V2。
 * 关键约束：Draft 进入 book.drafts，不触碰 book.effective。
 */
export function proposeDraft(
  book: RuleBook,
  changed: TradeScenario,
  version: string,
  note: string,
): RuleBook {
  if (!book.effective) throw new Error('无有效规则，不能提出变更草案');
  validateScenario(changed);
  if (version === book.effective.version || book.history.some((h) => h.version === version)) throw new Error('版本名不得与有效或历史版本重复');
  const rule = ruleFromScenario(changed, 'Contract-V2(草案)');
  const draft: RuleVersion = {
    version,
    status: 'DRAFT',
    scenario: copyScenario(changed),
    rule,
    confirmations: [
      { partyId: 'JIA', partyName: '合作组织甲', responsibility: '确认是否接受剩余批次新账期', confirmed: false },
      { partyId: 'YI', partyName: '加工企业乙', responsibility: '提出剩余批次账期变更', confirmed: true, confirmedAt: new Date().toISOString() },
    ],
    basedOn: book.effective.version,
    basedOnHash: book.effective.hash,
    createdAt: new Date().toISOString(),
    hash: digest({ v: version, rule, scenario: changed }),
    note,
  };
  const existing = book.drafts.find((d) => d.version === version);
  if (existing) {
    if (existing.hash === draft.hash && existing.basedOnHash === draft.basedOnHash) return book;
    throw new Error('该草案版本已存在；不同条件必须使用新版本并重新确认');
  }
  return { ...book, drafts: [...book.drafts.filter((d) => d.version !== version), draft] };
}

/** 确认草案中的某主体 */
export function confirmDraftParty(book: RuleBook, version: string, partyId: 'JIA' | 'YI'): RuleBook {
  const drafts = book.drafts.map((d) => (d.version === version ? confirmParty(d, partyId) : d));
  return { ...book, drafts };
}

/**
 * 生效草案：仅当草案已全部确认，才将其置为有效，原有效规则进入历史。
 * 若未确认，抛错 —— 从代码层面保证 Draft 不会覆盖 Rule-V1。
 */
export function adoptDraft(book: RuleBook, version: string): RuleBook {
  const draft = book.drafts.find((d) => d.version === version);
  if (!draft) throw new Error(`未找到草案 ${version}`);
  assertConfirmed(draft);
  if (!book.effective || draft.basedOn !== book.effective.version || draft.basedOnHash !== book.effective.hash) throw new Error('草案基于旧版本，必须重新测算并确认');
  const superseded: RuleVersion | null = book.effective
    ? { ...copyVersion(book.effective), status: 'SUPERSEDED' }
    : null;
  return {
    effective: { ...copyVersion(draft), status: 'EFFECTIVE' },
    drafts: book.drafts.filter((d) => d.version !== version),
    history: superseded ? [...book.history, superseded] : book.history,
  };
}

/** 读取当前有效方案（供计算引擎使用） */
export function effectiveScenario(book: RuleBook): TradeScenario | null {
  return book.effective ? copyScenario(book.effective.scenario) : null;
}
