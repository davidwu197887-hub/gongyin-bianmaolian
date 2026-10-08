// ============================================================================
// scenarioEngine —— 多方案测算、比较与 Pareto 辅助提示
// Pareto 仅作辅助提示，不替用户决策，不输出“推荐/最优”。
// ============================================================================

import { TradeScenario, ScenarioMetric } from '../types';
import { evaluateScenario } from './calculationEngine';

type MetricBase = Omit<ScenarioMetric, 'dominatedBy'>;

export function metricsOf(s: TradeScenario): MetricBase {
  const r = evaluateScenario(s);
  return {
    scenarioId: s.id,
    scenarioName: s.name,
    jiaBalance: r.jia.operatingBalance,
    yiBalance: r.yi.operatingBalance,
    combinedBalance: r.combinedBalance,
    jiaMinCash: r.jia.minCash,
    yiMinCash: r.yi.minCash,
    peakFinancing: r.jia.peakLoan,
    financingCost: r.jia.totalInterest,
    nextBusinessGap: r.jia.nextBusinessGap,
    jiaCashAtNextBusiness: r.jia.cashAtNextBusiness,
    nextBusinessAffected: r.jia.nextBusinessAffected,
    createsNewFinancialNeed: r.jia.nextBusinessGap > 1e-9,
  };
}

/**
 * Pareto 辅助：若方案 X 在所有主维度上均不优于方案 Y（且 Y 至少一项更优），
 * 则 X 被标记为“存在更优替代”。维度方向：
 *  - 甲结余、乙结余、合计结余、甲下一笔可用资金：越大越好
 *  - 峰值融资、融资成本：越小越好
 *  - 影响后续经营、新增金融需求：false 更好
 */
export function compareScenarios(scenarios: TradeScenario[]): ScenarioMetric[] {
  const base = scenarios.map(metricsOf);

  const betterOrEqual = (a: MetricBase, b: MetricBase) => {
    const geq = (x: number, y: number) => x >= y - 1e-9;
    const leq = (x: number, y: number) => x <= y + 1e-9;
    const boolBetterEq = (x: boolean, y: boolean) => x === y || !y; // b 的 false 不劣
    return (
      geq(b.jiaBalance, a.jiaBalance) &&
      geq(b.yiBalance, a.yiBalance) &&
      geq(b.combinedBalance, a.combinedBalance) &&
      geq(b.jiaCashAtNextBusiness, a.jiaCashAtNextBusiness) &&
      leq(b.peakFinancing, a.peakFinancing) &&
      leq(b.financingCost, a.financingCost) &&
      leq(b.nextBusinessGap, a.nextBusinessGap) &&
      boolBetterEq(a.nextBusinessAffected, b.nextBusinessAffected) &&
      boolBetterEq(a.createsNewFinancialNeed, b.createsNewFinancialNeed)
    );
  };

  const strictlyBetterSomewhere = (a: MetricBase, b: MetricBase) =>
    b.jiaBalance > a.jiaBalance + 1e-9 ||
    b.yiBalance > a.yiBalance + 1e-9 ||
    b.combinedBalance > a.combinedBalance + 1e-9 ||
    b.jiaCashAtNextBusiness > a.jiaCashAtNextBusiness + 1e-9 ||
    b.peakFinancing < a.peakFinancing - 1e-9 ||
    b.financingCost < a.financingCost - 1e-9 ||
    b.nextBusinessGap < a.nextBusinessGap - 1e-9 ||
    (a.nextBusinessAffected && !b.nextBusinessAffected) ||
    (a.createsNewFinancialNeed && !b.createsNewFinancialNeed);

  return base.map((a) => {
    let dominatedBy: string | null = null;
    for (const b of base) {
      if (b.scenarioId === a.scenarioId) continue;
      if (betterOrEqual(a, b) && strictlyBetterSomewhere(a, b)) {
        dominatedBy = b.scenarioName;
        break;
      }
    }
    return { ...a, dominatedBy };
  });
}

/** 复制方案并改名，生成方案 C / D ... */
export function cloneScenario(s: TradeScenario, newId: string, newName: string): TradeScenario {
  return {
    ...s,
    id: newId,
    name: newName,
    batches: s.batches.map((b) => ({ ...b })),
  };
}
