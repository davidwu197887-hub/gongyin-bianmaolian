"""对应3.2.3、4.5.2和图4-3：导出历史匹配行号及两种安排的逐路径结果。"""
from pathlib import Path
import numpy as np
import pandas as pd
from joint_model import *
from run_study import BASE,FAST,DRAFT
R=Path(__file__).resolve().parent
z=np.load(R/'inputs/scenarios_base.npz')
s={k:z[k] for k in z.files if k!='path_id'}
prior=simulate(FAST,BASE,s)
observed=simulate(FAST,BASE,deterministic())['snapshot']['signature'][0]
match=prior['snapshot']['signature']==observed
ids=np.flatnonzero(match)
assert len(ids)==3969,len(ids)
pd.DataFrame({'original_path_id':np.arange(len(match)),'matches_history_day20':match}).to_csv(R/'inputs/history_match_day20.csv',index=False,encoding='utf-8-sig')
pd.DataFrame({'conditional_row_id':np.arange(len(ids)),'original_path_id':ids}).to_csv(R/'inputs/retained_day20.csv',index=False,encoding='utf-8-sig')
cond=subset(s,ids)
np.savez_compressed(R/'inputs/scenarios_retained_day20.npz',original_path_id=ids,**cond)
for plan,label in [(FAST,'原安排'),(DRAFT,'账期草案')]:
 r=simulate(plan,BASE,cond)
 assert np.all(r['snapshot']['signature']==observed)
 np.savez_compressed(R/'results'/('rolling_'+label+'_paths.npz'),**{k:v for k,v in r.items() if isinstance(v,np.ndarray)})
print('PASS 导出3969条匹配路径索引、原安排与账期草案逐路径结果')
