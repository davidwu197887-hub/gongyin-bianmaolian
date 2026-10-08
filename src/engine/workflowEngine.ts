import { RuleBook, TradeScenario } from '../types';
import { copyScenario, validateScenario } from './validation';

/** 将单批计划落地为案例的两批履约，保留用户的经营参数；自定义多批计划原样保留。 */
export function fulfillmentScenario(selected: TradeScenario): TradeScenario {
  validateScenario(selected);
  const s = copyScenario(selected);
  if (s.id === 'B' && s.batches.length === 1) {
    const first = s.batches[0];
    const firstTons = s.totalTons * (188 / 200);
    s.batches = [
      { ...first, id: 'B1', tons: firstTons },
      { ...first, id: 'B2', tons: s.totalTons - firstTons, verifyDay: first.verifyDay + 10 },
    ];
  }
  return s;
}

export function remainingExtension(s: TradeScenario, currentDay: number, extraDays = 10): { scenario: TradeScenario; trigger: string } {
  validateScenario(s);
  if (s.paymentMode !== 'PER_BATCH') throw new Error('该例外仅适用于分批付款规则');
  const changed = copyScenario(s);
  const remaining = changed.batches.filter((b) => b.verifyDay + (b.paymentDaysOverride ?? s.paymentDays) > currentDay);
  if (!remaining.length) throw new Error('没有待付款批次可调整');
  const batch = remaining[remaining.length - 1];
  const oldDays = batch.paymentDaysOverride ?? s.paymentDays;
  batch.paymentDaysOverride = oldDays + extraDays;
  changed.id = `${s.id}-DRAFT`;
  changed.name = `${s.name}·账期变更草案`;
  validateScenario(changed);
  return { scenario: changed, trigger: `剩余${batch.tons}吨货款账期由验收后${oldDays}日拟调整为${batch.paymentDaysOverride}日` };
}

export function draftComparison(book: RuleBook): { before: TradeScenario; after: TradeScenario; trigger: string } | null {
  const draft = book.drafts.find((d) => d.version === 'Draft-V2');
  if (draft && book.effective && draft.basedOnHash === book.effective.hash) {
    return { before: copyScenario(book.effective.scenario), after: copyScenario(draft.scenario), trigger: draft.note };
  }
  const adopted = book.effective;
  const prior = book.history.find((h) => h.version === adopted?.basedOn && h.hash === adopted.basedOnHash);
  if (adopted?.version === 'Draft-V2' && prior) {
    return { before: copyScenario(prior.scenario), after: copyScenario(adopted.scenario), trigger: adopted.note };
  }
  return null;
}
