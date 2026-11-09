"""Reproducible, scenario-based study. No fitted real-world loss probabilities."""
import json, math
from pathlib import Path
from dataclasses import replace
import numpy as np
import pandas as pd
from joint_model import *

OUT=ROOT/'results';OUT.mkdir(exist_ok=True)
BASE=Config(limit_expiry=181)
CAP=replace(BASE,limit_A=200000,limit_B=200000,limit_expiry=120)
FAST=Plan('短账期',price=3780,term=5)
SLOW=Plan('长账期',price=3800,term=15)
ADVANCE=Plan('长账期_三成预付款',price=3800,term=15,prepay_fraction=.3)
DRAFT=Plan('后续三批改为15日_草案',price=3780,terms=(5,5,15,15,15),counterfactual=True)

def scalar(r):
    keys=['peak_A','peak_B','peak_joint','sum_individual_peaks','interest_A','interest_B',
          'profit_A','profit_B','late_target_tonnes','late_finished_tonnes',
          'pending_purchase_days','late_tail_days','late_invoice_days','complete',
          'settlement_day_A','settlement_day_B','business_settlement_day',
          'tail_unpaid','invoice_unpaid','debt_A','debt_B','downstream_AR',
          'interest_due_A','interest_due_B','unfulfilled_tonnes']
    d={k:float(r[k][0]) for k in keys}
    for k in ['order_days','accept_days','production_finish','external_receipt_days','internal_due']:
        d[k]=r[k][0].tolist()
    return d

def wilson(mask):
    n=len(mask);p=float(np.mean(mask));z=1.96
    centre=(p+z*z/(2*n))/(1+z*z/n)
    half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    return [100*(centre-half),100*(centre+half)]

def covered(r,ka,kb,t):
    return (r['peak_A']<=ka)&(r['peak_B']<=kb)&(r['settlement_day_A']<=t)&(r['settlement_day_B']<=t)

def stats(r):
    d=summarise(r['plan']['name'],r)
    for k in ['peak_A','peak_B','peak_joint','settlement_day_A','settlement_day_B','business_settlement_day']:
        x=r[k]
        for pct in [50,90,95]:
            # Discrete empirical order statistics retain right-censoring.
            v=np.sort(x)[max(0,math.ceil(pct/100*len(x))-1)]
            d[f'{k}_p{pct}']=float(v/(10000 if k.startswith('peak') else 1))
    for ka,kb,t in [(20,20,60),(20,20,90),(20,20,120),(30,30,90),(40,40,90),(40,40,120)]:
        hit=covered(r,ka*1e4,kb*1e4,t)
        d[f'coverage_{ka}_{kb}_{t}']=float(100*hit.mean())
        d[f'coverage_{ka}_{kb}_{t}_MC95']=wilson(hit)
    d['same_time_peak_not_sum_of_peaks_pct']=float(100*np.mean(r['peak_joint']+1e-6<r['sum_individual_peaks']))
    d['unpaid_interest_pct']=float(100*np.mean(r['interest_due_A']+r['interest_due_B']>1e-6))
    d['unpaid_member_pct']=float(100*np.mean(r['tail_unpaid']>1e-6))
    d['unpaid_invoice_pct']=float(100*np.mean(r['invoice_unpaid']>1e-6))
    d['unfinished_tonnes_mean']=float(r['unfulfilled_tonnes'].mean())
    return d

def run_validation():
    checks=[]
    def ck(name,condition):
        assert condition,name
        checks.append(dict(check=name,status='PASS'))
    s=deterministic();r=simulate(FAST,BASE,s,trace=True)
    ck('手工核对基准甲借款峰值170640元',abs(r['peak_A'][0]-170640)<.01)
    ck('基准全部200吨加工与付款完成',r['complete'][0] and r['finished_tonnes'][0]==200)
    ck('验收与产能队列日期符合手工基准',r['accept_days'][0].tolist()==[8,17,27,39,48] and r['production_finish'][0].tolist()==[10,20,29,42,50])
    ck('经营现金与5000元自有利息准备金没有重复计入',abs(r['profit_A'][0]-(200*(3780-3600-100)-3000-r['interest_A'][0]))<.01)
    ck('基准计提与实付利息相等',abs(r['interest_A'][0]-r['interest_paid_A'][0])<1e-6)
    manual_principal_days=4*133000+4*12040+2*16440+3*146640+157320+7*21240+26040+4*170640
    ck('独立分段手工计息核对甲226.58元利息',abs(r['interest_A'][0]-manual_principal_days*.04/365)<1e-6)
    tr=r['trace'];change=tr.A_interest_paid.diff().fillna(tr.A_interest_paid)>1e-6
    bad=tr[change & ~((tr.day%30==0)|((tr.phase=='17_close')&(tr.A_debt<1e-6)))]
    ck('利息只在约定结息日或清偿时支付',len(bad)==0)
    w=Wallet(1,0,0,100,1);w.pay(np.array([100.]),np.array([True]));w.accrued[:]=10;w.close_day(30,120,True)
    ck('欠息不并入本金且不新增借款付息',w.debt[0]==100 and w.interest_due[0]==10 and w.draws[0]==100)
    ck('欠息按设定冻结新提款',not w.draw_enabled[0])
    zero=replace(BASE,own_A=0,interest_reserve_A=0,limit_A=0,own_B=0,interest_reserve_B=0,limit_B=0)
    rz=simulate(FAST,zero,s)
    ck('没有现金与额度就不虚构采购',rz['ordered_tonnes'][0]==0)
    ck('无原料不产生加工及成品回款',rz['finished_tonnes'][0]==0 and rz['external_in'][0]==0)
    ck('未完成路径不输出伪造的经营利润',not rz['complete'][0] and np.isnan(rz['profit_A'][0]))
    rl=simulate(SLOW,CAP,s)
    ck('融资受限使长账期采购真实后移',rl['order_days'][0].tolist()==[0,9,23,32,47])
    ck('不能把融资受限后的低借款写成同等履约优化',rl['peak_A'][0]<simulate(SLOW,BASE,s)['peak_A'][0] and rl['late_target_tonnes'][0]>0)
    rf=simulate(FAST,replace(CAP,limit_B=0),deterministic(freeze_batch=slice(None)))
    ck('客户不付款时未结应收保留',rf['downstream_AR'][0]>0 and not rf['complete'][0])
    ck('乙资金不足的欠款不会自动消失',rf['invoice_unpaid'][0]>0)
    ck('未清偿的资金期限保留为无穷/右删失',np.isinf(rf['settlement_day_A'][0]) or np.isinf(rf['settlement_day_B'][0]))
    rr=simulate(FAST,replace(CAP,own_A=5000,interest_reserve_A=5000,limit_A=117000),s,trace=True)
    rr8=rr['trace'].query('day==8 and phase=="17_close"').iloc[0]
    ck('已验收成员尾款不足2000元时保留真实欠付',abs(rr8.tail_unpaid-2000)<.01 and rr['late_tail_days'][0]>=5)
    rs=simulate(FAST,replace(BASE,processing_capacity=2),s)
    ck('较低加工能力增加完工时间',rs['production_finish'][0,-1]>r['production_finish'][0,-1])
    rd=simulate(DRAFT,CAP,s)
    ck('草案不改写已发生的前20日历史',rd['snapshot']['signature'][0]==simulate(FAST,CAP,s)['snapshot']['signature'][0])
    ck('不同条件按同一情景比较而非分别抽签',np.array_equal(r['accept_days'],simulate(FAST,BASE,s)['accept_days']))
    ck('各主体现金守恒误差小于0.01元',r['conservation_max_abs_error']<.01)
    ck('同步融资峰值不是主体峰值简单相加',r['peak_joint'][0] <= r['sum_individual_peaks'][0]+1e-7)
    # Per-actor money, physical conservation and credit limits are asserted inside
    # every simulation, across all tested paths, not merely these examples.
    pd.DataFrame(checks).to_csv(OUT/'validation_checks.csv',index=False)
    return checks

def main():
    result={'version':'v2','validation':run_validation(),'deterministic':{},'stochastic':{}}
    for p in [FAST,SLOW,ADVANCE,DRAFT]:
        for mode,c in [('plan',BASE),('execute',CAP)]:
            r=simulate(p,c,deterministic(),trace=True)
            key=p.name+'_'+mode;result['deterministic'][key]=scalar(r)
            r['trace'].to_csv(OUT/(key+'_events.csv'),index=False)
    print('deterministic and validation done',flush=True)
    controls=[]
    for bulk,whole in [(1,1),(1,0),(0,1),(0,0)]:
        p=Plan(f'采购集中{bulk}_回款整批{whole}',price=3800,bulk_purchase=bool(bulk),bulk_collection=bool(whole))
        r=simulate(p,BASE,deterministic());controls.append(dict(bulk_purchase=bulk,bulk_collection=whole,**scalar(r)))
    result['controls']=controls
    candidates=[]
    for term,price in [(5,3780),(10,3790),(15,3800)]:
        for advance in [0,.1,.2,.3,.4]:
            p=Plan(f'{term}日_{advance:.0%}预付',price=price,term=term,prepay_fraction=advance)
            r=simulate(p,CAP,deterministic());d=scalar(r)
            d.update(term=term,price=price,advance=advance,on_target=bool(r['late_target_tonnes'][0]==0 and r['late_invoice_days'][0]==0 and r['complete'][0]))
            candidates.append(d)
    result['candidates']=candidates;pd.json_normalize(candidates).to_csv(OUT/'contract_candidates.csv',index=False)
    # Broad discount sensitivity: price gap is a contractual offer, not a
    # measured financing spread or a knob chosen to prove one plan wins.
    discounts=[]
    for gap in [0,10,20,40,80]:
        r=simulate(replace(FAST,price=3800-gap),BASE,deterministic())
        discounts.append(dict(discount_per_tonne=gap,**scalar(r)))
    result['discount_sensitivity']=discounts
    n=12000;s=make_scenarios(n)
    arrays={}
    for p in [FAST,SLOW,ADVANCE]:
        for mode,c in [('plan',BASE),('execute',CAP)]:
            key=p.name+'_'+mode;r=simulate(p,c,s);arrays[key]=r
            result['stochastic'][key]=stats(r)
            np.savez_compressed(OUT/(key+'_paths.npz'),**{k:v for k,v in r.items() if isinstance(v,np.ndarray)})
            print(key,'done',flush=True)
    convergence=[]
    for count in [1000,3000,6000,12000]:
        r=arrays['短账期_plan'];hit=covered(r,300000,300000,90)[:count]
        convergence.append(dict(paths=count,A_p90=float(np.quantile(r['peak_A'][:count],.9)/1e4),B_p90=float(np.quantile(r['peak_B'][:count],.9)/1e4),coverage_30_30_90=float(100*hit.mean()),MC95=wilson(hit)))
    result['convergence']=convergence
    result['prior_sensitivity']={}
    for regime in ['mild','severe']:
        r=simulate(FAST,BASE,make_scenarios(6000,seed=20261107,regime=regime))
        result['prior_sensitivity'][regime]=stats(r)
    print('prior sensitivity done',flush=True)
    effective=arrays['短账期_plan'];observed=simulate(FAST,BASE,deterministic())['snapshot']
    idx=np.flatnonzero(effective['snapshot']['signature']==observed['signature'][0])
    assert len(idx)>=500,'Insufficient conditional particles; do not invent a posterior.'
    cond=subset(s,idx)
    rolling={}
    for p in [FAST,DRAFT]:
        r=simulate(p,BASE,cond)
        assert np.all(r['snapshot']['signature']==observed['signature'][0])
        rolling[p.name]=stats(r)
    # Independent full numeric trace comparison of the selected past on three
    # particles, beyond the fingerprint used for screening.
    base_trace=simulate(FAST,BASE,deterministic(),trace=True)['trace']
    for i in idx[:3]:
        for p in [FAST,DRAFT]:
            t=simulate(p,BASE,subset(s,[i]),trace=True)['trace']
            pd.testing.assert_frame_equal(t[t.day<=20].reset_index(drop=True),base_trace[base_trace.day<=20].reset_index(drop=True))
    result['rolling']=dict(observed_day=20,retained_particles=len(idx),prior_particles=n,comparison=rolling)
    # A/B forecasts are separate limits; joint amount-time coverage is NOT the
    # product of marginal probabilities, and censored closures count as failure.
    grid=[];r=arrays['短账期_plan']
    for ka in [20,30,40,50]:
        for kb in [20,30,40,50]:
            for t in [60,90,120]:
                hit=covered(r,ka*1e4,kb*1e4,t)
                grid.append(dict(A_limit=ka,B_limit=kb,close_by_day=t,coverage_pct=100*hit.mean(),MC95=wilson(hit)))
    result['joint_coverage_grid']=grid
    # Event cut-off and fixed-total +/-1% batch composition sensitivity.
    result['timing_sensitivity']=scalar(simulate(FAST,replace(BASE,external_receipt_before_cutoff=False),deterministic()))
    result['quantity_sensitivity']=stats(simulate(FAST,BASE,make_scenarios(6000,seed=20261108,quantity_variation=True)))
    frozen=simulate(FAST,CAP,deterministic(freeze_batch=slice(None)))
    result['nonpayment_stress']=scalar(frozen)
    secondary=make_scenarios(6000,seed=20261109)
    result['independent_seed']=stats(simulate(FAST,BASE,secondary))
    result['timing_stochastic_late_cutoff']=stats(simulate(FAST,replace(BASE,external_receipt_before_cutoff=False),secondary))
    r=arrays['短账期_plan'];ka=np.quantile(r['peak_A'],.9,method='higher');kb=np.quantile(r['peak_B'],.9,method='higher')
    hit=covered(r,ka,kb,90)
    result['marginal_p90_joint_check']=dict(A=float(ka),B=float(kb),both_and_day90_pct=float(hit.mean()*100))
    price_cases=[]
    for value in [3900,4000,4200,4400]:
        for p in [FAST,SLOW,ADVANCE]:
            r=simulate(p,replace(BASE,downstream_cash_per_raw_tonne=value),deterministic())
            price_cases.append(dict(downstream=value,plan=p.name,surplus_A=float(r['profit_A'][0]),surplus_B=float(r['profit_B'][0]),B_peak=float(r['peak_B'][0])))
    result['downstream_price_sensitivity']=price_cases
    # Avoid nonstandard Infinity/NaN in the public JSON.
    def clean(v):
        if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
        if isinstance(v,(list,tuple)):return [clean(x) for x in v]
        if isinstance(v,float) and not math.isfinite(v):return None
        return v
    (OUT/'study_results.json').write_text(json.dumps(clean(result),ensure_ascii=False,indent=2), encoding='utf-8')
    (OUT/'parameters.json').write_text(json.dumps(clean(dict(config=asdict(BASE),execution_config=asdict(CAP),quantity_tonnes=Q.tolist(),purchase_days=PURCHASE.tolist(),plans=[asdict(x) for x in [FAST,SLOW,ADVANCE,DRAFT]],scenario_seed=20261106,scenario_paths=n,scenario_laws='See make_scenarios source; declared assumptions, not empirical fit.')),ensure_ascii=False,indent=2), encoding='utf-8')
    print('all done; conditional paths',len(idx),flush=True)

if __name__=='__main__':main()
