"""把 results/financing_study.json 打印为对照表（UTF-8 文本），供设计文档引用。"""
import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
d = json.loads((Path(__file__).resolve().parent / 'results/financing_study.json').read_text(encoding='utf-8'))
ks = list(d['arrangements'])
print('安排：', '；'.join(ks))
print('\n== 确定性基准（第20日草案）')
for k in ks:
    r = d['deterministic'][k]
    print(k, '采购日', r['order_days'], '甲峰值', r['peak_A'], '一般部分', r['general_peak_A'], '专项提款', r['tranche_draws'],
          '甲利息', round(r['interest_A'], 2), '甲清偿', r['settlement_day_A'], '业务结清', r['business_settlement_day'],
          '迟于目标吨', r['late_target_tonnes'], '专项首提/归还', r['tranche_first_draw_day'], r['tranche_clear_day'])
print('\n== 下游持续拖欠压力（确定性）')
for k in ks:
    r = d['stress_freeze'][k]
    print(k, '采购日', r['order_days'], '甲峰值', r['peak_A'], '期末甲本金', r['debt_A'], '乙本金', r['debt_B'],
          '专项提款', r['tranche_draws'], '专项到期余额', r['tranche_due_at_maturity'], '专项逾期日', r['tranche_overdue_days'],
          '受阻日', r['tranche_blocked_days'], '乙欠甲', r['invoice_unpaid'], '成员欠付', r['tail_unpaid'], '甲利息', round(r['interest_A'], 1))
cols = ['on_plan_pct', 'purchase5_p50', 'purchase5_p90', 'late_beyond_grace_pct', 'peak_A_p50', 'peak_A_p90',
        'general_peak_A_p90', 'peak_B_p90', 'interest_A_mean', 'interest_B_mean', 'clear_A_p90', 'clear_A_by_120_pct',
        'tail_unpaid_pct', 'invoice_unpaid_pct', 'tranche_drawn_pct', 'tranche_draw_p50_if_drawn', 'tranche_blocked_pct',
        'tranche_overdue_pct', 'tranche_due_at_maturity_max', 'extra_limit_wan_days_mean', 'vs_A1_purchase5_earlier_pct',
        'vs_A1_purchase5_later_pct', 'vs_A1_interestA_extra_mean', 'complete_pct', 'profit_A_mean_complete']
for name, rows in d['samples'].items():
    print(f'\n== {name}（{rows["_paths"]}条）')
    print('%-30s' % '指标' + ''.join('%10s' % k[:3] for k in ks))
    for c in cols:
        vals = [rows[k].get(c) for k in ks]
        print('%-30s' % c + ''.join('%10s' % ('-' if v is None else '%.3f' % v) for v in vals))
print('\n== 专项额度金额敏感性')
for name, rows in d['amount_sweep'].items():
    for r in rows: print(name, r)
