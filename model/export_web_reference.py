from pathlib import Path
import sys,json,base64,math,shutil
from dataclasses import asdict,replace
import numpy as np
W=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(W/'model'))
from joint_model import Config,Plan,simulate,deterministic,make_scenarios,Q,PURCHASE
O=W
def clean(v):
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
 if isinstance(v,(list,tuple)):return [clean(x) for x in v]
 if isinstance(v,np.ndarray):return clean(v.tolist())
 if isinstance(v,(np.integer,np.floating,np.bool_)):return clean(v.item())
 if isinstance(v,float) and not math.isfinite(v):return None
 return v
packs={}
for regime,n,seed in [('base',12000,20261106),('mild',6000,20261107),('severe',6000,20261107)]:
 s=make_scenarios(n,seed=seed,regime=regime)
 packs[regime]={'n':n,'seed':seed,**{k:base64.b64encode(s[k].astype('uint8').tobytes()).decode() for k in ['border','downstream','individual_border','individual_down']}}
(O/'src/scenarios.ts').write_text('export const scenarioInputs = '+json.dumps(packs,separators=(',',':'))+' as const;\n', encoding='utf-8')
base=Config(limit_expiry=181);cap=Config(limit_A=200000,limit_B=200000,limit_expiry=120)
fast=Plan('短账期');slow=Plan('长账期',price=3800,term=15)
cases=[('fast_plan',fast,base,deterministic()),('fast_cap',fast,cap,deterministic()),('slow_plan',slow,base,deterministic()),('slow_cap',slow,cap,deterministic()),('advance_cap',replace(slow,prepay_fraction=.3),cap,deterministic()),('draft_plan',replace(fast,terms=(5,5,15,15,15)),base,deterministic()),('draft_cap',replace(fast,terms=(5,5,15,15,15)),cap,deterministic()),('freeze_cap',fast,cap,deterministic(freeze_batch=slice(None))),('cutoff_cap',fast,replace(cap,external_receipt_before_cutoff=False),deterministic()),('zero_funds',fast,replace(cap,own_A=0,interest_reserve_A=0),deterministic())]
for bulk in [False,True]:
 for collect in [False,True]:cases.append((f'bulk_{bulk}_{collect}',replace(fast,price=3800,bulk_purchase=bulk,bulk_collection=collect),base,deterministic()))
s=make_scenarios(40)
for k in range(16):cases.append((f'random_{k}',[fast,slow,replace(slow,prepay_fraction=.3)][k%3],cap if k%2 else base,{a:b[k:k+1] for a,b in s.items()}))
keys=['peak_A','peak_B','peak_joint','interest_A','interest_B','interest_paid_A','interest_paid_B','cash_A','cash_B','debt_A','debt_B','tail_unpaid','invoice_unpaid','downstream_AR','unfulfilled_tonnes','ordered_tonnes','accepted_tonnes','finished_tonnes','late_target_tonnes','complete','profit_A','profit_B','settlement_day_A','settlement_day_B','business_settlement_day','order_days','accept_days','production_start','production_finish','external_receipt_days','internal_due','actual_internal_paid','actual_tail_paid']
fixtures=[]
for name,p,c,s in cases:
 r=simulate(p,c,s,trace=True)
 fixtures.append(clean({'name':name,'plan':asdict(p),'config':asdict(c),'scenario':{k:v[0] for k,v in s.items()},'expected':{k:r[k][0] for k in keys},'trace':r['trace'].query('phase=="17_close" and day in [0,8,20,40,44,54,65,120,180]').to_dict('records')}))
(O/'tests/reference.json').write_text(json.dumps(fixtures,ensure_ascii=False,separators=(',',':')), encoding='utf-8')
shutil.copy2(W/'model/joint_model.py',O/'verification/reference_model.py')
shutil.copy2(W/'model/results/study_results.json',O/'verification/reference_results.json')
print('Reference cases:',len(fixtures),'scenario packs:',{k:v['n'] for k,v in packs.items()})
