from pathlib import Path
import sys,json,math
from dataclasses import replace
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R))
import run_study as study
from joint_model import *
study.OUT=R/'validation';study.OUT.mkdir(exist_ok=True)
checks=study.run_validation()
c=Config(limit_A=200000,limit_B=200000,limit_expiry=120)
r=simulate(Plan('短账期',price=3780,term=5),c,deterministic(),trace=True)
d=simulate(Plan('账期草案',price=3780,terms=(5,5,15,15,15)),c,deterministic(),trace=True)
s=simulate(Plan('短账期_持续拖欠',price=3780,term=5),c,deterministic(freeze_batch=slice(None)),trace=True)
extra=[]
def ck(name,test):
 assert test,name
 extra.append({'check':name,'status':'PASS'})
get=lambda out,day:out['trace'].query('day==@day and phase=="17_close"').iloc[0]
ck('第20日甲借款余额146640元',abs(get(r,20).A_debt-146640)<.001)
ck('原安排最终清偿日44',r['settlement_day_A'][0]==44)
ck('账期草案受限路径最终清偿日54',d['settlement_day_A'][0]==54)
ck('草案与原安排前20日状态相同',d['snapshot']['signature'][0]==r['snapshot']['signature'][0])
z=get(s,120)
ck('持续拖欠第120日甲未偿本金76800元',abs(z.A_debt-76800)<.001)
ck('持续拖欠第120日乙未偿本金200000元',abs(z.B_debt-200000)<.001)
ck('第120日双方已付当期利息',z.A_interest_due<.001 and z.B_interest_due<.001 and z.A_interest_accrued<.001 and z.B_interest_accrued<.001)
ck('持续拖欠场景交易应收保留',abs(s['invoice_unpaid'][0]-232200)<.001 and abs(s['downstream_AR'][0]-470400)<.001)
ck('原安排与草案基准清偿均早于合同到期日120',r['settlement_day_A'][0]<120 and d['settlement_day_A'][0]<120)
for title,out in [('原约定',r),('账期草案',d),('下游持续拖欠',s)]:
 out['trace'].to_csv(R/'validation'/(title+'_events.csv'),index=False)
(R/'validation/risk_checks.json').write_text(json.dumps({'base_checks':checks,'risk_checks':extra,'numbers':{'A_day20_debt_yuan':float(get(r,20).A_debt),'original_settlement_day':44,'draft_constrained_settlement_day':54,'maturity_day':120,'stress_A_principal_yuan':float(z.A_debt),'stress_B_principal_yuan':float(z.B_debt),'stress_A_remaining_interest_reserve_yuan':float(z.A_reserve),'stress_B_remaining_interest_reserve_yuan':float(z.B_reserve)}},ensure_ascii=False,indent=2), encoding='utf-8')
print('PASS',len(checks),'existing cash-flow checks +',len(extra),'risk-link checks')
