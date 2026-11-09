"""导出 Python 参考模型的逐路径结果，供 scripts/check-crosscheck.mjs 与前端引擎逐条对照。

覆盖基准12000条、温和与严峻各6000条情景；三组谈判候选及第三至第五批15日账期草案；
规划口径（不设额度）与受限执行口径（甲乙各20万元、第120日到期）。输出写入 model/results/，不改变任何模型参数。
"""
from pathlib import Path
import sys, json, math
from dataclasses import asdict, replace
import numpy as np
R = Path(__file__).resolve().parent
sys.path.insert(0, str(R))
from joint_model import Config, Plan, simulate, make_scenarios

FIELDS = ['peak_A', 'peak_B', 'peak_joint', 'interest_A', 'interest_B', 'settlement_day_A', 'settlement_day_B',
          'business_settlement_day', 'ordered_tonnes', 'accepted_tonnes', 'finished_tonnes', 'tail_unpaid',
          'invoice_unpaid', 'complete', 'conservation_max_abs_error']
ARRAYS = ['order_days', 'accept_days', 'external_receipt_days']


def clean(v):
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [clean(x) for x in v]
    if isinstance(v, np.ndarray): return clean(v.tolist())
    if isinstance(v, (np.integer, np.floating, np.bool_)): return clean(v.item())
    if isinstance(v, float) and not math.isfinite(v): return None
    return v


fast = Plan('短账期'); slow = Plan('长账期', price=3800, term=15)
plans = {'短账期': fast, '长账期': slow, '长账期＋30%贸易预付': replace(slow, prepay_fraction=.3),
         '账期草案': replace(fast, terms=(5, 5, 15, 15, 15), counterfactual=True)}
configs = {'plan': Config(limit_expiry=181), 'execute': Config(limit_A=200000, limit_B=200000, limit_expiry=120)}
out = []
for regime, n, seed in [('base', 12000, 20261106), ('mild', 6000, 20261107), ('severe', 6000, 20261107)]:
    s = make_scenarios(n, seed=seed, regime=regime)
    for pname, p in plans.items():
        for mode, c in configs.items():
            r = simulate(p, c, s)
            item = {'regime': regime, 'plan_name': pname, 'mode': mode, 'paths': n,
                    'plan': asdict(p), 'config': asdict(c)}
            item.update({k: r[k] for k in FIELDS if k != 'conservation_max_abs_error'})
            item.update({k: r[k] for k in ARRAYS})
            item['conservation_max_abs_error'] = r['conservation_max_abs_error']
            out.append(clean(item))
            print(regime, pname, mode, 'done', flush=True)
(R / 'results').mkdir(exist_ok=True)
(R / 'results/crosscheck_paths.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('PASS 导出', len(out), '组 × 逐路径结果')
