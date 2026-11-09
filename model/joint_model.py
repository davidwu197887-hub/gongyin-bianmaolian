"""Joint A/B operating-event simulation with limited credit and noncapitalised interest.

All micro-contract terms and random laws are illustrative, not fitted Hunchun data.
No rule change, credit approval or payment instruction is effected by this program.
"""
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parent
Q=np.array([32.,44.,36.,48.,40.])
PURCHASE=np.array([0,9,19,31,40])
BASE_ACCEPT=np.array([8,17,27,39,48])
BASE_FINISH=BASE_ACCEPT+np.ceil(Q/20).astype(int)
INF_DAY=10000

@dataclass(frozen=True)
class Config:
    horizon:int=180
    own_A:float=150000
    own_B:float=200000
    interest_reserve_A:float=5000
    interest_reserve_B:float=5000
    limit_A:float=float('inf')
    limit_B:float=float('inf')
    annual_rate_A:float=.04
    annual_rate_B:float=.04
    limit_expiry:int=120
    prepaid_per_tonne:float=3500
    member_total_per_tonne:float=3600
    logistics_per_tonne:float=100
    setup_per_purchase:float=600
    holding_per_tonne_day:float=1
    delay_per_tonne_day:float=2
    transport_days:int=6
    acceptance_capacity:float=30
    processing_capacity:float=20
    processing_cost:float=200
    downstream_cash_per_raw_tonne:float=4200
    downstream_term:int=15
    delivery_grace_days:int=10
    external_receipt_before_cutoff:bool=True
    freeze_new_draw_on_overdue_interest:bool=True

@dataclass(frozen=True)
class Plan:
    name:str
    price:float=3780
    term:int=5
    prepay_fraction:float=0
    bulk_purchase:bool=False
    bulk_collection:bool=False
    terms:tuple|None=None
    purchase_override:tuple|None=None
    rule_id:str='Rule-V1'
    counterfactual:bool=False

def make_scenarios(n,seed=20261106,regime='base',quantity_variation=False):
    rng=np.random.default_rng(seed)
    initial={'mild':[.90,.08,.018,.002], 'base':[.80,.14,.05,.01],
             'severe':[.65,.22,.10,.03]}[regime]
    transition=np.array([[.80,.14,.05,.01],[.35,.45,.16,.04],
                         [.18,.35,.35,.12],[.12,.23,.35,.30]])
    # Sensitivity changes persistent future conditions, not just day-zero weights.
    if regime!='base':
        transition=.65*transition+.35*np.asarray(initial)[None,:]
    bins=21
    def markov(values):
        st=np.zeros((n,bins),int)
        st[:,0]=(rng.random(n)[:,None]>np.cumsum(initial)[None,:]).sum(1)
        for k in range(1,bins):
            probs=transition[st[:,k-1]]
            st[:,k]=(rng.random(n)[:,None]>np.cumsum(probs,axis=1)).sum(1)
        return np.asarray(values)[st]
    border=markov([0,4,10,18])
    downstream=markov([0,3,10,20])
    individual_border=rng.choice([0,2,5,12],(n,5),p=[.65,.25,.08,.02])
    individual_down=rng.choice([0,2,5],(n,5),p=[.80,.15,.05])
    q=np.broadcast_to(Q,(n,5)).copy()
    if quantity_variation:
        q*=rng.uniform(.99,1.01,(n,5));q*=200/q.sum(1,keepdims=True)
    return dict(q=q,border=border,downstream=downstream,
                individual_border=individual_border,individual_down=individual_down,
                freeze_downstream=np.zeros((n,5),bool))

def deterministic(n=1,border=0,downstream=0,freeze_batch=None):
    s=dict(q=np.broadcast_to(Q,(n,5)).copy(),
           border=np.full((n,21),border,int),downstream=np.full((n,21),downstream,int),
           individual_border=np.zeros((n,5),int),individual_down=np.zeros((n,5),int),
           freeze_downstream=np.zeros((n,5),bool))
    if freeze_batch is not None:s['freeze_downstream'][:,freeze_batch]=True
    return s

def subset(s,idx):return {k:v[idx].copy() for k,v in s.items()}

class Wallet:
    def __init__(self,n,own,reserve,limit,rate):
        assert own>=reserve>=0
        self.cash=np.full(n,own-reserve,float)
        self.reserve=np.full(n,reserve,float)
        self.debt=np.zeros(n);self.accrued=np.zeros(n);self.interest_due=np.zeros(n)
        self.interest_total=np.zeros(n);self.interest_paid=np.zeros(n)
        self.draws=np.zeros(n);self.repays=np.zeros(n);self.limit=limit;self.rate=rate
        self.last_clear=np.full(n,-1,int)
        self.peak=np.zeros(n);self.overdue_interest_seen=np.zeros(n,bool)
        self.draw_enabled=np.ones(n,bool)
        # v3 batch tranche: tdebt is the tranche part of debt; tlimit=0 keeps v2 arithmetic.
        self.tlimit=0;self.tdebt=np.zeros(n);self.tdraws=np.zeros(n)
        self.tpeak=np.zeros(n);self.gpeak=np.zeros(n)
    def general(self):
        return np.where(self.draw_enabled,np.maximum(self.limit-(self.debt-self.tdebt),0),0)
    def funds(self,tranche=None):
        if not self.tlimit:
            cap=np.maximum(self.limit-self.debt,0)
            return self.cash+np.where(self.draw_enabled,cap,0)
        room=np.maximum(self.tlimit-self.tdraws,0)
        return self.cash+self.general()+(0 if tranche is None else np.where(tranche,room,0))
    def pay(self,amount,mask,full=True,eligible=True,tranche=None):
        amount=np.asarray(amount,float)
        available=self.funds(tranche) if eligible else self.cash
        if full:
            paid=np.where(mask&(available+1e-7>=amount),amount,0)
        else:paid=np.where(mask,np.minimum(amount,available),0)
        draw=np.maximum(paid-self.cash,0)
        assert eligible or np.all(draw<1e-7)
        if self.tlimit and tranche is not None:
            # General headroom first; only the remainder uses the tranche.
            t=np.where(tranche&(draw>0),np.maximum(draw-self.general(),0),0)
            self.tdebt+=t;self.tdraws+=t;self.tpeak=np.maximum(self.tpeak,self.tdebt)
        self.debt+=draw;self.draws+=draw
        self.cash+=draw-paid
        self.peak=np.maximum(self.peak,self.debt)
        self.gpeak=np.maximum(self.gpeak,self.debt-self.tdebt)
        return paid
    def settle_interest(self,mask,day):
        amount=np.where(mask,self.accrued+self.interest_due,0)
        from_reserve=np.minimum(self.reserve,amount)
        self.reserve-=from_reserve
        remaining=amount-from_reserve
        from_cash=np.minimum(self.cash,remaining)
        self.cash-=from_cash
        paid=from_reserve+from_cash
        self.interest_paid+=paid
        self.interest_due=np.where(mask,np.maximum(amount-paid,0),self.interest_due)
        self.accrued=np.where(mask,0,self.accrued)
        return paid
    def close_day(self,day,expiry,freeze_on_arrears):
        n=len(self.cash)
        # Monthly interest, plus outstanding due interest. No new loan for interest.
        if day>0 and day%30==0:
            self.settle_interest(np.ones(n,bool),day)
        else:
            self.settle_interest(self.interest_due>1e-7,day)
        repay=np.minimum(self.cash,self.debt)
        self.cash-=repay;self.debt-=repay;self.repays+=repay
        if self.tlimit:self.tdebt=np.maximum(self.tdebt-repay,0)
        # Agreed close-out of accrued interest when this borrowing episode clears.
        cleared=(repay>1e-7)&(self.debt<1e-7)
        self.settle_interest(cleared,day)
        self.last_clear[cleared&(self.interest_due<1e-7)]=day
        self.overdue_interest_seen|=self.interest_due>1e-7
        if freeze_on_arrears:
            self.draw_enabled&=self.interest_due<1e-7
        self.draw_enabled&=day<expiry
        assert np.all(self.cash>=-1e-5) and np.all(self.reserve>=-1e-5)
        assert np.all(self.debt-self.tdebt<=self.limit+1e-5)
        assert not self.tlimit or np.all(self.tdraws<=self.tlimit+1e-5)

def simulate(p:Plan,c:Config,s:dict,snapshot_day=20,trace=False,financing=None):
    """financing (v3, optional) mirrors Config.facility_changes / Config.tranche in engine.ts:
    {'facility_changes':[{day,party,limit,maturityDay}], 'tranche':{party:'A',limit,batches,
    openDay,closeDay,maturityDay,sourceBatch,overdueCheck,freezeGeneralOnOverdue}}. None keeps v2."""
    q=s['q'];n,b=q.shape;row=np.arange(n);H=c.horizon
    assert b==5 and np.allclose(q.sum(1),200)
    assert 0<=p.prepay_fraction<1
    A=Wallet(n,c.own_A,c.interest_reserve_A,c.limit_A,c.annual_rate_A)
    B=Wallet(n,c.own_B,c.interest_reserve_B,c.limit_B,c.annual_rate_B)
    earliest=np.array(p.purchase_override or tuple(PURCHASE))
    term=np.array(p.terms or (p.term,)*5)
    ordered=np.full((n,b),-1,int);depart=np.full((n,b),INF_DAY,int)
    arrival=np.full((n,b),INF_DAY,int);accept=np.full((n,b),INF_DAY,int)
    accepted=np.zeros((n,b),bool);prod_start=np.full((n,b),-1,int)
    prod_finish=np.full((n,b),INF_DAY,int);finished=np.zeros((n,b),bool)
    external_due=np.full((n,b),INF_DAY,int);external_actual=np.full((n,b),INF_DAY,int)
    down_paid=np.zeros((n,b),bool);advance_paid=np.zeros((n,b));locked=np.zeros((n,b))
    invoice_paid=np.zeros((n,b));tail_paid=np.zeros((n,b));extra_due=np.zeros((n,b))
    extra_paid=np.zeros((n,b));accept_free=np.zeros(n,int);prod_free=np.zeros(n,int)
    internal_due=np.full((n,b),INF_DAY,int)
    Aexternal=np.zeros(n);Bexternal_out=np.zeros(n);external_in=np.zeros(n)
    pending_purchase_days=np.zeros(n,int);late_tail_days=np.zeros(n,int)
    late_invoice_days=np.zeros(n,int);late_finished_tonnes=np.zeros(n)
    peak_joint=np.zeros(n);peak_day_A=np.zeros(n,int);peak_day_B=np.zeros(n,int)
    any_A=np.zeros(n,bool);any_B=np.zeros(n,bool)
    loan_last_A=np.full(n,-1,int);loan_last_B=np.full(n,-1,int)
    business_last_open=np.full(n,-1,int)
    rows=[];sig=np.zeros(n,np.uint64);snapshot=None;peak_history=[]
    A_flow_cost=np.zeros(n);B_proc_cost=np.zeros(n)
    financing=financing or {}
    changes=financing.get('facility_changes') or []
    T=financing.get('tranche')
    expiry={'A':c.limit_expiry,'B':c.limit_expiry}
    tranche_ok=None;tail_ok=None;tbatches=[]
    if T:
        assert T['party']=='A' and T['limit']>0 and T['openDay']<=T['closeDay']<T['maturityDay']
        assert 0<=T['sourceBatch']<=4 and T['sourceBatch'] not in T['batches']
        assert T['overdueCheck'] in ('none','internal','chain')
        A.tlimit=T['limit'];tbatches=list(T['batches'])
    t_due_mat=np.zeros(n);t_overdue_days=np.zeros(n,int);t_blocked_days=np.zeros(n,int)
    t_first=np.full(n,-1,int);t_clear=np.full(n,-1,int)

    def joint_peak():
        nonlocal peak_joint
        peak_joint=np.maximum(peak_joint,A.debt+B.debt)

    def try_advances(day):
        for j in range(b):
            mask=(day>= (0 if p.bulk_purchase else earliest[j]))&(advance_paid[:,j]==0)&(p.prepay_fraction>0)
            target=q[:,j]*p.price*p.prepay_fraction
            paid=B.pay(target,mask,full=True)
            advance_paid[:,j]+=paid;locked[:,j]+=paid
            joint_peak()

    def try_purchases(day,late=False):
        nonlocal Aexternal,A_flow_cost
        groups=[tuple(range(b))] if p.bulk_purchase else [(j,) for j in range(b)]
        for group in groups:
            j=group[0]
            ready=(ordered[:,j]<0)&(day>=(0 if p.bulk_purchase else earliest[j]))
            if p.prepay_fraction:
                ready&=np.all(advance_paid[:,group]>0,axis=1)
            totalq=q[:,group].sum(1)
            cost=totalq*(c.prepaid_per_tonne+c.logistics_per_tonne)+c.setup_per_purchase
            use_locked=locked[:,group].sum(1)
            need=cost-use_locked
            use_t=tranche_ok if T and all(k in tbatches for k in group) else None
            feasible=ready&(A.funds(use_t)+1e-7>=need)
            paid=A.pay(need,feasible,full=True,tranche=use_t)
            completed=feasible&(paid+1e-5>=need)
            Aexternal+=np.where(completed,cost,0)
            A_flow_cost+=np.where(completed,totalq*c.logistics_per_tonne+c.setup_per_purchase,0)
            for k in group:
                ordered[completed,k]=day
                locked[completed,k]=0
                dispatch=np.maximum(earliest[k],day+int(late))
                depart[completed,k]=dispatch
                binid=np.minimum(dispatch//10,s['border'].shape[1]-1)
                travel=c.transport_days+s['border'][row,binid]+s['individual_border'][:,k]
                arrival[completed,k]=dispatch+travel[completed]
            joint_peak()

    def external_receipts(day):
        nonlocal external_in
        for j in range(b):
            mask=finished[:,j]&(~down_paid[:,j])&(external_actual[:,j]<=day)
            amount=np.where(mask,q[:,j]*c.downstream_cash_per_raw_tonne,0)
            B.cash+=amount;external_in+=amount;down_paid[mask,j]=True

    def pay_A_obligations(day):
        nonlocal Aexternal,A_flow_cost
        # Member commodity tails first; an unpaid obligation remains outstanding.
        for j in range(b):
            due=q[:,j]*(c.member_total_per_tonne-c.prepaid_per_tonne)-tail_paid[:,j]
            # v3: the tranche also covers the member tail of its own batch (same approved purpose).
            use_t=tail_ok if T and j in tbatches else None
            paid=A.pay(np.maximum(due,0),accepted[:,j]&(due>1e-7),full=False,tranche=use_t)
            tail_paid[:,j]+=paid;Aexternal+=paid
        for j in range(b):
            due=extra_due[:,j]-extra_paid[:,j]
            paid=A.pay(np.maximum(due,0),accepted[:,j]&(due>1e-7),full=False)
            extra_paid[:,j]+=paid;Aexternal+=paid;A_flow_cost+=paid
        joint_peak()

    def pay_internal(day):
        for j in range(b):
            due=q[:,j]*p.price-advance_paid[:,j]-invoice_paid[:,j]
            paid=B.pay(np.maximum(due,0),accepted[:,j]&(internal_due[:,j]<=day)&(due>1e-7),full=False)
            invoice_paid[:,j]+=paid;A.cash+=paid
            # Internal transfer is atomic in this illustrative settlement ledger.
            joint_peak()

    def start_processing(day):
        nonlocal Bexternal_out,B_proc_cost
        for _ in range(b):
            ready=accepted&(prod_start<0)
            score=np.where(ready,accept,INF_DAY)+np.arange(b)[None,:]*1e-4
            j=np.argmin(score,axis=1)
            possible=ready[row,j]&(prod_free<=day)
            cost=q[row,j]*c.processing_cost
            paid=B.pay(cost,possible,full=True)
            start=possible&(paid+1e-5>=cost)
            prod_start[row[start],j[start]]=day
            done=day+np.ceil(q[row,j]/c.processing_capacity).astype(int)
            prod_finish[row[start],j[start]]=done[start]
            prod_free[start]=done[start]
            Bexternal_out+=paid;B_proc_cost+=paid
            joint_peak()

    def record(day,phase):
        nonlocal sig
        # Fingerprint observed phase balances, incurred/paid interest, quantities
        # and per-batch facts. Only states already observable at this phase enter.
        vectors=[A.cash,A.reserve,A.debt,A.accrued,A.interest_due,
                 B.cash,B.reserve,B.debt,B.accrued,B.interest_due,
                 A.interest_paid,B.interest_paid]
        for arr in (ordered,np.where(accepted,accept,-1),prod_start,
                    np.where(finished,prod_finish,-1),advance_paid,invoice_paid,tail_paid,down_paid):
            vectors.extend(arr[:,j] for j in range(b))
        if day<=snapshot_day:
            with np.errstate(over='ignore'):
                for v in vectors:
                    z=np.rint(v*100).astype(np.int64).view(np.uint64)
                    sig=(sig ^ (z+np.uint64(0x9e3779b97f4a7c15)))*np.uint64(1099511628211)
        if trace and n==1:
            rows.append(dict(day=day,phase=phase,A_cash=A.cash[0],A_reserve=A.reserve[0],A_debt=A.debt[0],
                         B_cash=B.cash[0],B_reserve=B.reserve[0],B_debt=B.debt[0],
                         A_interest_due=A.interest_due[0],B_interest_due=B.interest_due[0],
                         A_interest_accrued=A.accrued[0],B_interest_accrued=B.accrued[0],
                         A_interest_paid=A.interest_paid[0],B_interest_paid=B.interest_paid[0],
                         ordered_tonnes=float(np.where(ordered[0]>=0,q[0],0).sum()),
                         accepted_tonnes=float(np.where(accepted[0],q[0],0).sum()),
                         finished_tonnes=float(np.where(finished[0],q[0],0).sum()),
                         tail_unpaid=float(np.where(accepted[0],q[0]*(c.member_total_per_tonne-c.prepaid_per_tonne)-tail_paid[0],0).sum())))

    for day in range(H+1):
        for ch in changes:
            if ch['day']==day:
                w=A if ch['party']=='A' else B
                w.limit=ch['limit'];expiry[ch['party']]=ch['maturityDay']
                w.draw_enabled=(day<ch['maturityDay'])&((not c.freeze_new_draw_on_overdue_interest)|(w.interest_due<1e-7))
        for w,k in ((A,'A'),(B,'B')):
            if day:
                charge=w.debt*w.rate/365
                w.accrued+=charge;w.interest_total+=charge
            w.draw_enabled &= day<expiry[k]
        if T:
            # Start-of-day drawdown conditions; tranche principal left after maturity is overdue.
            if day==T['maturityDay']:t_due_mat=A.tdebt.copy()
            if day>T['maturityDay']:
                od=A.tdebt>1e-7;t_overdue_days+=od
                if T['freezeGeneralOnOverdue']:A.draw_enabled&=~od
            internal=np.any(accepted&(internal_due<day)&(q*p.price-advance_paid-invoice_paid>1e-7),axis=1)
            chain=internal|np.any(finished&(~down_paid)&(external_due<day),axis=1)
            overdue={'chain':chain,'internal':internal}.get(T['overdueCheck'],np.zeros(n,bool))
            sb=T['sourceBatch']
            source=accepted[:,sb]&(internal_due[:,sb]<T['maturityDay'])
            # All tranche draws, including the batch's member tail, stay inside the drawdown window.
            window=T['openDay']<=day<=T['closeDay'] and day<T['maturityDay']
            tail_ok=window&(A.interest_due<1e-7)&(A.tdraws<T['limit']-1e-7)
            tranche_ok=window&(A.interest_due<1e-7)&(A.tdraws<T['limit']-1e-7)&source&~overdue
        if c.external_receipt_before_cutoff:external_receipts(day)
        pay_A_obligations(day)
        try_advances(day)
        try_purchases(day,late=False)
        record(day,'09_purchase')
        # FIFO acceptance resource; only arrived cargo is assigned a slot.
        for _ in range(b):
            ready=(arrival<=day)&(accept==INF_DAY)
            j=np.argmin(np.where(ready,arrival,INF_DAY),axis=1)
            mask=ready[row,j]
            finish=np.maximum(day,accept_free)+np.ceil(q[row,j]/c.acceptance_capacity).astype(int)
            accept[row[mask],j[mask]]=finish[mask]
            accept_free[mask]=finish[mask]
        new=(accept<=day)&(~accepted)
        for j in range(b):
            mask=new[:,j]
            accepted[mask,j]=True
            delay=np.maximum(accept[:,j]-(depart[:,j]+c.transport_days+np.ceil(q[:,j]/c.acceptance_capacity)),0)
            hold=np.maximum(depart[:,j]-ordered[:,j],0) if p.bulk_purchase else np.zeros(n)
            extra_due[mask,j]=q[mask,j]*(hold[mask]*c.holding_per_tonne_day+delay[mask]*c.delay_per_tonne_day)
            if not p.bulk_collection:internal_due[mask,j]=accept[mask,j]+term[j]
        if p.bulk_collection:
            allacc=accepted.all(1)
            finaldue=accept.max(1)+p.term
            internal_due[allacc]=finaldue[allacc,None]
        for j in range(b):
            done=(prod_finish[:,j]<=day)&(~finished[:,j])
            finished[done,j]=True
            external_due[done,j]=day+c.downstream_term
            bins=np.minimum(day//10,s['downstream'].shape[1]-1)
            dates=day+c.downstream_term+s['downstream'][:,bins]+s['individual_down'][:,j]
            dates=np.where(s['freeze_downstream'][:,j],H+1,dates)
            external_actual[done,j]=dates[done]
        pay_A_obligations(day)
        start_processing(day)
        record(day,'12_accept_produce')
        # In late-cutoff sensitivity receipts are observable only after transfers.
        pay_internal(day)
        pay_A_obligations(day)
        try_purchases(day,late=True)
        start_processing(day)
        record(day,'16_transfer')
        if not c.external_receipt_before_cutoff:external_receipts(day)
        for w,k in ((A,'A'),(B,'B')):w.close_day(day,expiry[k],c.freeze_new_draw_on_overdue_interest)
        joint_peak()
        if T:
            if T['openDay']<=day<=T['closeDay']:
                waiting=np.any((ordered[:,tbatches]<0)&(earliest[tbatches][None,:]<=day),axis=1)
                t_blocked_days+=(~tranche_ok)&waiting
            t_first[(t_first<0)&(A.tdraws>1e-7)]=day
            t_clear[(t_first>=0)&(t_clear<0)&(A.tdebt<1e-7)]=day
        any_A|=A.debt>1e-7;any_B|=B.debt>1e-7
        activeA=(A.debt+A.accrued+A.interest_due)>1e-7
        activeB=(B.debt+B.accrued+B.interest_due)>1e-7
        loan_last_A[activeA]=day;loan_last_B[activeB]=day
        pending_purchase_days+=np.any((ordered<0)&(earliest[None,:]<=day),axis=1)
        tailout=np.where(accepted,q*(c.member_total_per_tonne-c.prepaid_per_tonne)-tail_paid,0).sum(1)
        invout=np.where(accepted,q*p.price-advance_paid-invoice_paid,0).sum(1)
        opened=(~down_paid.all(1))|(tailout>1e-7)|(invout>1e-7)|((extra_due-extra_paid).sum(1)>1e-7)|activeA|activeB
        business_last_open[opened]=day
        late_tail_days+=tailout>1e-7
        late_invoice_days+=np.any(accepted&(internal_due<=day)&(q*p.price-advance_paid-invoice_paid>1e-7),axis=1)
        record(day,'17_close')
        if day==snapshot_day:
            snapshot=dict(signature=sig.copy(),A_debt=A.debt.copy(),B_debt=B.debt.copy(),
                A_cash=A.cash.copy(),B_cash=B.cash.copy(),ordered=ordered.copy(),
                accepted=np.where(accepted,accept,-1).copy(),
                advanced=advance_paid.copy(),invoices_paid=invoice_paid.copy())
        if trace and n==1:peak_history.append((day,A.peak[0],B.peak[0],peak_joint[0]))
    tailout=np.maximum(np.where(accepted,q*(c.member_total_per_tonne-c.prepaid_per_tonne)-tail_paid,0),0).sum(1)
    invoiceout=np.maximum(np.where(accepted,q*p.price-advance_paid-invoice_paid,0),0).sum(1)
    extraout=np.maximum(extra_due-extra_paid,0).sum(1)
    downAR=np.where(finished&(~down_paid),q*c.downstream_cash_per_raw_tonne,0).sum(1)
    unearned=np.where(~accepted,advance_paid,0).sum(1)
    boughtq=np.where(ordered>=0,q,0).sum(1)
    acceptedq=np.where(accepted,q,0).sum(1)
    startedq=np.where(prod_start>=0,q,0).sum(1)
    finishedq=np.where(finished,q,0).sum(1)
    unfulfilled=np.maximum(200-acceptedq,0)
    notontime=(prod_finish>BASE_FINISH[None,:]+c.delivery_grace_days)
    late_finished_tonnes=np.where(notontime,q,0).sum(1)
    late_target_tonnes=np.where(prod_finish>BASE_FINISH[None,:],q,0).sum(1)
    # Auditable material and external/internal money conservation.
    assert np.all(boughtq+1e-8>=acceptedq)
    assert np.all(acceptedq+1e-8>=startedq)
    assert np.all(startedq+1e-8>=finishedq)
    balances=A.cash+A.reserve+locked.sum(1)+B.cash+B.reserve-A.debt-B.debt
    expected=c.own_A+c.own_B+external_in-Aexternal-Bexternal_out-A.interest_paid-B.interest_paid
    assert np.allclose(balances,expected,atol=1e-5)
    internal_total=(advance_paid+invoice_paid).sum(1)
    assert np.allclose(A.cash+A.reserve+locked.sum(1)-A.debt,
                       c.own_A+internal_total-Aexternal-A.interest_paid,atol=1e-5)
    assert np.allclose(B.cash+B.reserve-B.debt,
                       c.own_B+external_in-Bexternal_out-internal_total-B.interest_paid,atol=1e-5)
    complete=(unfulfilled<1e-7)&(finishedq>200-1e-7)&down_paid.all(1)&(tailout<1e-7)&(invoiceout<1e-7)&(extraout<1e-7)&(A.debt<1e-7)&(B.debt<1e-7)&(A.interest_due<1e-7)&(B.interest_due<1e-7)
    # Cash surplus equals profit only on fully settled paths under declared costs.
    surplusA=A.cash+A.reserve+locked.sum(1)-A.debt-c.own_A
    surplusB=B.cash+B.reserve-B.debt-c.own_B
    profitA=np.where(complete,surplusA,np.nan);profitB=np.where(complete,surplusB,np.nan)
    results=dict(peak_A=A.peak,peak_B=B.peak,peak_joint=peak_joint,
        sum_individual_peaks=A.peak+B.peak,interest_A=A.interest_total,interest_B=B.interest_total,
        interest_paid_A=A.interest_paid,interest_paid_B=B.interest_paid,
        interest_due_A=A.interest_due,interest_due_B=B.interest_due,
        cash_A=A.cash+A.reserve,cash_B=B.cash+B.reserve,
        debt_A=A.debt,debt_B=B.debt,
        tail_unpaid=tailout,invoice_unpaid=invoiceout,external_fee_unpaid=extraout,downstream_AR=downAR,
        unearned_advance_A=unearned,unfulfilled_tonnes=unfulfilled,
        raw_inventory_B=acceptedq-startedq,WIP_tonnes=startedq-finishedq,
        ordered_tonnes=boughtq,accepted_tonnes=acceptedq,finished_tonnes=finishedq,
        late_finished_tonnes=late_finished_tonnes,late_target_tonnes=late_target_tonnes,pending_purchase_days=pending_purchase_days,
        late_tail_days=late_tail_days,late_invoice_days=late_invoice_days,
        complete=complete,profit_A=profitA,profit_B=profitB,
        settlement_day_A=np.where((A.debt+A.accrued+A.interest_due)<1e-7,loan_last_A+1,np.inf),
        settlement_day_B=np.where((B.debt+B.accrued+B.interest_due)<1e-7,loan_last_B+1,np.inf),
        business_settlement_day=np.where(complete,business_last_open+1,np.inf),
        snapshot=snapshot,order_days=ordered,accept_days=np.where(accepted,accept,INF_DAY),
        production_start=prod_start,production_finish=prod_finish,
        external_receipt_days=external_actual,internal_due=internal_due,
        actual_internal_paid=invoice_paid+advance_paid,actual_tail_paid=tail_paid,
        counterfactual=p.counterfactual,rule_id=p.rule_id,config=asdict(c),plan=asdict(p),
        A_external=Aexternal,B_external=Bexternal_out,external_in=external_in,
        conservation_max_abs_error=float(np.max(np.abs(balances-expected))),
        general_peak_A=A.gpeak if T else A.peak,tranche_limit=np.full(n,float(T['limit'] if T else 0)),
        tranche_draws=A.tdraws,tranche_peak=A.tpeak,tranche_debt=A.tdebt,
        tranche_due_at_maturity=t_due_mat,tranche_overdue_days=t_overdue_days,
        tranche_blocked_days=t_blocked_days,tranche_first_draw_day=t_first,
        tranche_clear_day=np.where(t_first<0,-1,np.where(t_clear<0,np.inf,t_clear)))
    if trace:
        import pandas as pd
        results['trace']=pd.DataFrame(rows)
    return results

def summarise(name,r):
    z=dict(plan=name,paths=len(r['complete']),complete_pct=float(r['complete'].mean()*100),
      peak_A_p50=float(np.quantile(r['peak_A'],.5)/1e4),peak_A_p90=float(np.quantile(r['peak_A'],.9)/1e4),
      peak_B_p50=float(np.quantile(r['peak_B'],.5)/1e4),peak_B_p90=float(np.quantile(r['peak_B'],.9)/1e4),
      peak_joint_p50=float(np.quantile(r['peak_joint'],.5)/1e4),peak_joint_p90=float(np.quantile(r['peak_joint'],.9)/1e4),
      tail_unpaid_mean=float(r['tail_unpaid'].mean()),invoice_unpaid_mean=float(r['invoice_unpaid'].mean()),
      delayed_purchase_pct=float((r['pending_purchase_days']>0).mean()*100),
      late_delivery_pct=float((r['late_finished_tonnes']>0).mean()*100),
      late_target_pct=float((r['late_target_tonnes']>0).mean()*100),
      A_profit_if_complete=float(np.nanmean(r['profit_A'])) if np.any(r['complete']) else None,
      B_profit_if_complete=float(np.nanmean(r['profit_B'])) if np.any(r['complete']) else None,
      conservation_max_abs_error=r['conservation_max_abs_error'])
    return z
