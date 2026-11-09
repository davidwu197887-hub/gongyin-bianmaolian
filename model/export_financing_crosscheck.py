"""导出 3.0 融资安排的 Python 逐路径结果，供 scripts/check-financing-crosscheck.mjs 与前端引擎对照。

覆盖 financing_study.ARRANGEMENTS 的全部安排 × 基准12000条与严峻6000条情景（受限执行口径）。
另含确定性基准与下游持续拖欠压力两条路径。输出写入 model/results/，不改变模型参数。
"""
import json, math
from dataclasses import asdict
import numpy as np
from joint_model import simulate, make_scenarios, deterministic
from financing_study import ARRANGEMENTS, CAP, OUT, clean

FIELDS = ['peak_A', 'general_peak_A', 'peak_B', 'peak_joint', 'interest_A', 'interest_B', 'settlement_day_A',
          'settlement_day_B', 'business_settlement_day', 'debt_A', 'debt_B', 'tail_unpaid', 'invoice_unpaid',
          'pending_purchase_days', 'complete', 'tranche_draws', 'tranche_peak', 'tranche_debt',
          'tranche_due_at_maturity', 'tranche_overdue_days', 'tranche_blocked_days', 'tranche_first_draw_day',
          'tranche_clear_day', 'conservation_max_abs_error']
ARRAYS = ['order_days', 'accept_days', 'internal_due', 'external_receipt_days']
out = []
cases = [('base', make_scenarios(12000)), ('severe', make_scenarios(6000, seed=20261107, regime='severe'))]
for regime, s in cases + [('deterministic', deterministic()), ('freeze', deterministic(freeze_batch=slice(None)))]:
    for name, (p, fin) in ARRANGEMENTS.items():
        r = simulate(p, CAP, s, financing=fin)
        item = {'regime': regime, 'arrangement': name, 'paths': int(len(r['peak_A'])), 'plan': asdict(p),
                'config': asdict(CAP), 'financing': fin}
        item.update({k: r[k] for k in FIELDS if k != 'conservation_max_abs_error'})
        item.update({k: r[k] for k in ARRAYS})
        item['conservation_max_abs_error'] = r['conservation_max_abs_error']
        out.append(clean(item))
    print(regime, 'done', flush=True)
(OUT / 'financing_crosscheck.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')),
                                               encoding='utf-8')
print('PASS 导出', len(out), '组融资安排逐路径结果')
