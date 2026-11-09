"""对应：第三章3.2；第四章4.1—4.6及表4-1—4-9。金额原始单位为元。"""
from pathlib import Path
from dataclasses import asdict,replace
import json,csv,math
import numpy as np
import pandas as pd
from joint_model import *
from run_study import BASE,CAP,FAST,SLOW,ADVANCE,DRAFT,scalar
R=Path(__file__).resolve().parent
O=R/'article_outputs';O.mkdir(exist_ok=True)
I=R/'inputs';I.mkdir(exist_ok=True)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [clean(v) for v in x]
 if isinstance(x,np.ndarray):return clean(x.tolist())
 if isinstance(x,np.generic):return clean(x.item())
 if isinstance(x,float) and not math.isfinite(x):return None
 return x
def js(path,x):path.write_text(json.dumps(clean(x),ensure_ascii=False,indent=2),encoding='utf-8')
def write(name,rows,header):
 with (O/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f);w.writerow(header);w.writerows(rows)
s=deterministic();current=simulate(FAST,CAP,s,trace=True)
rr={p.name+'_'+mode:simulate(p,c,s,trace=True) for p in [FAST,SLOW,ADVANCE,DRAFT] for mode,c in [('plan',BASE),('execute',CAP)]}
write('表4-1_模型批次日历.csv',[[j+1,Q[j],PURCHASE[j],current['accept_days'][0,j],current['production_finish'][0,j],current['external_receipt_days'][0,j]] for j in range(5)],['批次','数量_吨','采购付款日','验收日','加工完成日','成品回款日'])
js(I/'model_parameters.json',dict(planning_config=asdict(BASE),execution_config=asdict(CAP),quantity_tonnes=Q,purchase_days=PURCHASE,plans=[asdict(p) for p in [FAST,SLOW,ADVANCE,DRAFT]]))
# Complete laws, inputs and exact path ordering, rather than just a random seed.
laws={'seed_base':20261106,'paths_base':12000,'seed_mild_severe':20261107,'paths_mild_severe':6000,'bin_days':10,'state_bins':21,
'initial_probabilities':{'base':[.80,.14,.05,.01],'mild':[.90,.08,.018,.002],'severe':[.65,.22,.10,.03]},
'base_transition':[[.80,.14,.05,.01],[.35,.45,.16,.04],[.18,.35,.35,.12],[.12,.23,.35,.30]],
'sensitivity_transition':'.65 * base_transition + .35 * initial_probability[None,:]',
'border_state_delay_days':[0,4,10,18],'downstream_state_delay_days':[0,3,10,20],
'batch_border_delay_days':[0,2,5,12],'batch_border_probabilities':[.65,.25,.08,.02],
'batch_downstream_delay_days':[0,2,5],'batch_downstream_probabilities':[.80,.15,.05],
'quantity_variation':'uniform(0.99,1.01) per batch; normalise row total to 200 tonnes',
'interpretation':'Scenario assumptions; not calibrated empirical default probabilities.'}
js(I/'scenario_laws.json',laws)
for regime,n,seed in [('base',12000,20261106),('mild',6000,20261107),('severe',6000,20261107),('independent',6000,20261109),('quantity',6000,20261108)]:
 x=make_scenarios(n,seed=seed,regime=regime if regime in ['base','mild','severe'] else 'base',quantity_variation=regime=='quantity')
 np.savez_compressed(I/('scenarios_'+regime+'.npz'),path_id=np.arange(n),**x)
np.savez_compressed(I/'observed_deterministic.npz',**s)
controls=[]
for bulk,whole in [(1,1),(1,0),(0,1),(0,0)]:
 r=simulate(Plan('control',price=3800,bulk_purchase=bool(bulk),bulk_collection=bool(whole)),BASE,s)
 controls.append([bulk,whole,r['peak_A'][0]/1e4,r['peak_B'][0]/1e4,r['peak_joint'][0]/1e4])
write('表4-3_两端分批对照_万元.csv',controls,['集中采购_1是','整批回款_1是','甲峰值_万元','乙峰值_万元','同步峰值_万元'])
keys=['peak_A','peak_B','peak_joint','profit_A','profit_B']
rows=[[k]+[rr[p.name+'_plan'][k][0]/1e4 for p in [FAST,SLOW,ADVANCE]] for k in keys]
write('表4-4_候选方案_万元.csv',rows,['指标','短账期','长账期','长账期_三成预付'])
js(O/'表4-5_规划与受限执行.json',{mode:scalar(rr['长账期_'+mode]) for mode in ['plan','execute']})
for name,r in rr.items():
 # Retain both four within-day stages and daily maxima; readers can independently rebuild plot4-1a.
 r['trace'].to_csv(O/(name+'_daily_events.csv'),index=False,encoding='utf-8-sig')
 r['trace'].groupby('day').agg(A_debt_max=('A_debt','max'),B_debt_max=('B_debt','max'),ordered_tonnes=('ordered_tonnes','max'),finished_tonnes=('finished_tonnes','max')).to_csv(O/(name+'_daily_maxima.csv'),encoding='utf-8-sig')
study=json.loads((R/'results/study_results.json').read_text(encoding='utf-8'))
st=study['stochastic'];ks=['peak_A_p50','peak_A_p90','peak_B_p50','peak_B_p90','peak_joint_p90']
write('表4-6_12000条情景资金峰值_万元.csv',[[k]+[st[p.name+'_plan'][k] for p in [FAST,SLOW,ADVANCE]] for k in ks],['指标','短账期','长账期','长账期_三成预付'])
write('表4-7_金额期限联合覆盖.csv',[[a,b,t,st['短账期_plan'][f'coverage_{a}_{b}_{t}']] for a,b,t in [(20,20,60),(20,20,90),(30,30,90),(40,40,90)]],['甲金额_万元','乙金额_万元','截止日','覆盖比例_pct'])
# Preserve numeric data under all sensitivity paragraphs in4.2.2 and4.4.2.
for key in ['discount_sensitivity','downstream_price_sensitivity','convergence','prior_sensitivity','joint_coverage_grid','timing_sensitivity','quantity_sensitivity','independent_seed','timing_stochastic_late_cutoff','nonpayment_stress','marginal_p90_joint_check','rolling']:
 v=study[key];js(O/(key+'.json'),v)
 if isinstance(v,list):pd.json_normalize(v).to_csv(O/(key+'.csv'),index=False,encoding='utf-8-sig')
 elif isinstance(v,dict):pd.json_normalize(v).to_csv(O/(key+'.csv'),index=False,encoding='utf-8-sig')
before=rr['短账期_plan'];after=rr['后续三批改为15日_草案_plan'];ex=rr['后续三批改为15日_草案_execute']
row=current['trace'].query('day==20 and phase=="17_close"').iloc[0]
need={'subject':'合作组织甲','observed_day':20,'original_peak_yuan':float(before['peak_A'][0]),'proposed_peak_yuan':float(after['peak_A'][0]),'increase_yuan':float(after['peak_A'][0]-before['peak_A'][0]),'existing_limit_yuan':CAP.limit_A,'waiting_peak_yuan':float(max(0,after['peak_A'][0]-CAP.limit_A)),
'pressure_day':40,'purpose':'第五批采购及物流组织费用','purchase_prepaid_yuan':40*3500,'logistics_yuan':40*100,'organisation_yuan':600,'total_outlay_yuan':40*3600+600,'receipt_batch':3,'receipt_quantity_tonnes':36,'receipt_day':int(after['internal_due'][0,2]),'receipt_yuan':float(Q[2]*DRAFT.price),
'existing_debt_yuan':float(row.A_debt),'loan_maturity_day':120,'effective_rule':'Rule-V1','draft_status':'pending_confirmation',
'original_last_purchase_day':int(current['order_days'][0,-1]),'draft_constrained_last_purchase_day':int(ex['order_days'][0,-1]),'original_last_external_receipt_day':int(current['external_receipt_days'][0,-1]),'draft_constrained_last_external_receipt_day':int(ex['external_receipt_days'][0,-1]),'original_A_clear_day':int(current['settlement_day_A'][0]),'draft_constrained_A_clear_day':int(ex['settlement_day_A'][0]),
'evidence_status':{'formed':['有效合同','前两批验收记录','首批付款记录','第三批采购凭证'],'pending_confirmation':['第三至第五批账期草案'],'future':['未来验收','后续回款']},'verification_items':['乙延期原因及付款安排','甲其他收支与全口径债务','账户可用资金及原融资清偿约束']}
js(O/'表4-8_表4-9_金融需求与还款影响.json',need)
write('表4-8_表4-9_金融需求字段.csv',[[k,json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v] for k,v in need.items()],['字段','结果'])
roll=study['rolling']['comparison']
write('图4-3_滚动P90_万元.csv',[[p,roll[p]['peak_A_p90'],roll[p]['peak_B_p90']] for p in ['短账期','后续三批改为15日_草案']],['安排','甲峰值P90_万元','乙峰值P90_万元'])
write('4.6_成员M01款项卡.csv',[['本人参与',1,'吨'],['境外采购与已预付',3500,'元'],['境内收购价款',3600,'元'],['验收后应付尾款',100,'元'],['对应验收日',8,'日'],['实付条件','独立银行回执核验','与应付记录分开']],['项目','数值或条件','单位或说明'])
print('PASS 已导出第四章表格、逐阶段路径、金融需求及原始随机输入')
