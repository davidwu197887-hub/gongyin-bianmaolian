"""3.0 融资安排反事实比较（模拟）。

同一经营条件、同一组未来情景下比较：
  A0 原安排：短账期（全部5日），甲乙各20万元，第120日到期
  A1 草案＋原额度：第三至第五批15日，额度不变（受限执行）
  A2 草案＋一般额度提高：甲总额度第21日起提至31万元（2.0 模拟批准口径）
  A3 草案＋第五批专项额度10.672万元：第21—50日可提，第62日到期，提款日乙对甲无逾期应付
另做敏感性：A3 额度13.608万元、取消“无逾期”条件、到期日第90日。
情景：第20日历史匹配路径、基准12000条、严峻6000条，以及确定性基准与“下游持续拖欠”压力。
结果是给定模型假设下的模拟表现，不是已观察到的融资效果，也不构成授信建议。
"""
import json, math
from pathlib import Path
from dataclasses import replace
import numpy as np
from joint_model import Config, Plan, simulate, make_scenarios, deterministic, subset

R = Path(__file__).resolve().parent
OUT = R / 'results'; OUT.mkdir(exist_ok=True)
CAP = Config(limit_A=200000, limit_B=200000, limit_expiry=120)
FAST = Plan('短账期')
DRAFT = replace(FAST, terms=(5, 5, 15, 15, 15), counterfactual=True, name='账期调整草案')


def tranche(limit=136080, close=50, maturity=62, check='internal', freeze=True, source=2):
    return dict(party='A', limit=limit, batches=[4], openDay=21, closeDay=close, maturityDay=maturity,
                sourceBatch=source, overdueCheck=check, freezeGeneralOnOverdue=freeze)


# A3 额度取还款来源（第3批乙对甲货款 36吨×3780元=13.608万元）为上限；S1 取确定性待筹峰值10.672万元。
ARRANGEMENTS = {
    'A0_原安排': (FAST, None),
    'A1_草案_原额度': (DRAFT, None),
    'A2_草案_一般额度31万': (DRAFT, {'facility_changes': [dict(day=21, party='A', limit=310000, maturityDay=120)]}),
    'A3_草案_第五批专项13.608万': (DRAFT, {'tranche': tranche()}),
    'A4_原安排_乙一般额度30万': (FAST, {'facility_changes': [dict(day=21, party='B', limit=300000, maturityDay=120)]}),
    'A5_原安排_第五批专项10万': (FAST, {'tranche': tranche(limit=100000, maturity=64, source=3)}),
    'S1_专项10.672万': (DRAFT, {'tranche': tranche(limit=106720)}),
    'S2_不核对逾期': (DRAFT, {'tranche': tranche(check='none')}),
    'S3_核对至下游回款': (DRAFT, {'tranche': tranche(check='chain')}),
    'S4_第90日到期': (DRAFT, {'tranche': tranche(maturity=90)}),
    'S5_专项逾期不冻结一般额度': (DRAFT, {'tranche': tranche(freeze=False)}),
}
AMOUNTS = [106720, 115000, 125000, 136080]


def q(x, p):
    x = np.sort(np.asarray(x, float))
    return float(x[max(0, math.ceil(p * len(x)) - 1)])


def pct(mask): return float(100 * np.mean(mask))


def extra_limit_days(fin, r):
    """银行为本组交易额外承诺的额度×天数（万元·日）：一般额度按可提期间，专项额度按实际占用期。"""
    if not fin: return np.zeros(len(r['peak_A']))
    if 'facility_changes' in fin:
        ch = fin['facility_changes'][0]
        if ch['party'] == 'B': return np.full(len(r['peak_A']), (ch['limit'] - 200000) / 1e4 * (ch['maturityDay'] - ch['day']))
        return np.full(len(r['peak_A']), (ch['limit'] - 200000) / 1e4 * (ch['maturityDay'] - ch['day']))
    t = fin['tranche']; first = r['tranche_first_draw_day']; clear = r['tranche_clear_day']
    end = np.where(first < 0, t['closeDay'] + 1, np.where(np.isfinite(clear), clear, 181))
    return t['limit'] / 1e4 * (end - t['openDay'])


def stats(r, fin, ref=None):
    o5 = np.where(r['order_days'][:, 4] < 0, np.inf, r['order_days'][:, 4]).astype(float)
    clearA = r['settlement_day_A']; drawn = r['tranche_draws'] > 1e-7
    d = dict(
        paths=int(len(o5)),
        on_plan_pct=pct(r['pending_purchase_days'] == 0),
        purchase5_p50=q(o5, .5), purchase5_p90=q(o5, .9),
        late_target_pct=pct(r['late_target_tonnes'] > 0),
        late_beyond_grace_pct=pct(r['late_finished_tonnes'] > 0),
        peak_A_p50=q(r['peak_A'], .5) / 1e4, peak_A_p90=q(r['peak_A'], .9) / 1e4, peak_A_p95=q(r['peak_A'], .95) / 1e4,
        general_peak_A_p90=q(r['general_peak_A'], .9) / 1e4,
        peak_B_p90=q(r['peak_B'], .9) / 1e4, peak_B_p50=q(r['peak_B'], .5) / 1e4,
        clear_B_p90=q(r['settlement_day_B'], .9), peak_joint_p90=q(r['peak_joint'], .9) / 1e4,
        interest_A_mean=float(r['interest_A'].mean()), interest_A_p90=q(r['interest_A'], .9),
        interest_B_mean=float(r['interest_B'].mean()),
        clear_A_p50=q(clearA, .5), clear_A_p90=q(clearA, .9),
        clear_A_by_120_pct=pct(clearA <= 120),
        debt_A_at_end_pct=pct(r['debt_A'] > 1e-7), debt_A_at_end_max=float(r['debt_A'].max()) / 1e4,
        business_clear_p90=q(r['business_settlement_day'], .9),
        complete_pct=pct(r['complete']),
        invoice_unpaid_pct=pct(r['invoice_unpaid'] > 1e-7), tail_unpaid_pct=pct(r['tail_unpaid'] > 1e-7),
        profit_A_mean_complete=float(np.nanmean(r['profit_A'])) if np.any(r['complete']) else None,
        tranche_drawn_pct=pct(drawn),
        tranche_draw_p50_if_drawn=q(r['tranche_draws'][drawn], .5) / 1e4 if drawn.any() else 0.0,
        tranche_draw_max=float(r['tranche_draws'].max()) / 1e4,
        tranche_blocked_pct=pct(r['tranche_blocked_days'] > 0),
        tranche_overdue_pct=pct(r['tranche_overdue_days'] > 0),
        tranche_due_at_maturity_max=float(r['tranche_due_at_maturity'].max()) / 1e4,
        extra_limit_wan_days_mean=float(extra_limit_days(fin, r).mean()),
        conservation_max_abs_error=r['conservation_max_abs_error'])
    if ref is not None:
        r5 = np.where(ref['order_days'][:, 4] < 0, np.inf, ref['order_days'][:, 4]).astype(float)
        d.update(vs_A1_purchase5_earlier_pct=pct(o5 < r5), vs_A1_purchase5_later_pct=pct(o5 > r5),
                 vs_A1_peakA_higher_pct=pct(r['peak_A'] > ref['peak_A'] + 1e-6),
                 vs_A1_interestA_extra_mean=float((r['interest_A'] - ref['interest_A']).mean()),
                 vs_A1_clearA_later_pct=pct(clearA > ref['settlement_day_A']))
    return d


def det(p, fin, s):
    r = simulate(p, CAP, s, financing=fin)
    keys = ['peak_A', 'general_peak_A', 'peak_B', 'interest_A', 'interest_B', 'settlement_day_A', 'settlement_day_B',
            'business_settlement_day', 'debt_A', 'debt_B', 'invoice_unpaid', 'tail_unpaid', 'downstream_AR',
            'tranche_draws', 'tranche_due_at_maturity', 'tranche_overdue_days', 'tranche_blocked_days',
            'tranche_first_draw_day', 'tranche_clear_day', 'late_target_tonnes', 'late_finished_tonnes',
            'pending_purchase_days', 'complete', 'profit_A', 'profit_B']
    d = {k: float(r[k][0]) for k in keys}
    for k in ['order_days', 'accept_days', 'internal_due', 'external_receipt_days']: d[k] = r[k][0].tolist()
    return d


def clean(v):
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [clean(x) for x in v]
    if isinstance(v, np.ndarray): return clean(v.tolist())
    if isinstance(v, (np.integer, np.floating, np.bool_)): return clean(v.item())
    if isinstance(v, float) and not math.isfinite(v): return None
    return v


def main():
    out = {'version': 'v3-financing', 'note': '模拟情景下的比较，不代表真实融资效果或授信结论',
           'arrangements': {k: {'plan': p.name, 'financing': f} for k, (p, f) in ARRANGEMENTS.items()},
           'deterministic': {}, 'stress_freeze': {}, 'samples': {}}
    for k, (p, f) in ARRANGEMENTS.items():
        out['deterministic'][k] = det(p, f, deterministic())
        out['stress_freeze'][k] = det(p, f, deterministic(freeze_batch=slice(None)))
    base = make_scenarios(12000); severe = make_scenarios(6000, seed=20261107, regime='severe')
    observed = simulate(FAST, CAP, deterministic())['snapshot']['signature'][0]
    full = simulate(FAST, CAP, base)
    idx = np.flatnonzero(full['snapshot']['signature'] == observed)
    for name, s in [('matched_day20', subset(base, idx)), ('base_12000', base), ('severe_6000', severe)]:
        res = {k: simulate(p, CAP, s, financing=f) for k, (p, f) in ARRANGEMENTS.items()}
        if name == 'matched_day20':
            for k, r in res.items():
                assert np.all(r['snapshot']['signature'] == observed), k + ' 改写了第20日前历史'
        out['samples'][name] = {k: stats(r, ARRANGEMENTS[k][1], None if k.startswith('A0') else res['A1_草案_原额度'])
                                for k, r in res.items()}
        out['samples'][name]['_paths'] = int(len(s['q']))
        sweep = []
        for lim in AMOUNTS:
            fin = {'tranche': tranche(limit=lim)}; r = simulate(DRAFT, CAP, s, financing=fin)
            sweep.append(dict(limit=lim / 1e4, on_plan_pct=pct(r['pending_purchase_days'] == 0),
                              tranche_drawn_pct=pct(r['tranche_draws'] > 1e-7),
                              tranche_overdue_pct=pct(r['tranche_overdue_days'] > 0),
                              interest_A_mean=float(r['interest_A'].mean()),
                              extra_limit_wan_days_mean=float(extra_limit_days(fin, r).mean())))
        out['amount_sweep'] = out.get('amount_sweep', {}); out['amount_sweep'][name] = sweep
        print(name, len(s['q']), 'done', flush=True)
    (OUT / 'financing_study.json').write_text(json.dumps(clean(out), ensure_ascii=False, indent=1), encoding='utf-8')
    print('PASS financing study; matched paths', len(idx))


if __name__ == '__main__':
    main()
