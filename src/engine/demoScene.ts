import { scenarioA, scenarioB, memberM01 } from '../data/presets';
import { createEmptyRuleBook, createRuleV1, confirmParty, makeEffective, proposeDraft } from './ruleVersionEngine';
import { fulfillmentScenario, remainingExtension, draftComparison } from './workflowEngine';
import { translate } from './financialTranslator';
import { markTailPaid } from './memberLedger';
import { FinancialNeed } from '../types';

/** 场景链接复用正式引擎，启动一份内存中的案例；刷新不保存经营决定。 */
export function initializeScene(search: string) {
  const query = new URLSearchParams(search);
  const scene = query.get('scene');
  let book = createEmptyRuleBook();
  let need: FinancialNeed | null = null;
  let currentDay = 0;
  let member = memberM01();
  const page = scene === 'compare' ? 'compare' : scene === 'recalculate' ? 'exception' : scene === 'translate' ? 'translate' : 'calc';
  if (scene === 'recalculate' || scene === 'translate') {
    const rule = confirmParty(confirmParty(createRuleV1(fulfillmentScenario(scenarioB())), 'JIA'), 'YI');
    book = makeEffective(book, rule);
    currentDay = 25;
    member = markTailPaid(member, true);
    const change = remainingExtension(book.effective!.scenario, currentDay);
    book = proposeDraft(book, change.scenario, 'Draft-V2', change.trigger);
    if (scene === 'translate') {
      const comparison = draftComparison(book)!;
      need = translate({ ...comparison, triggerText: comparison.trigger, previousFinancingStatus: '已结清' });
    }
  }
  return { page, book, need, currentDay, member, scenarios: [scenarioA(), scenarioB()], captureMode: query.get('capture') === '1' } as const;
}
