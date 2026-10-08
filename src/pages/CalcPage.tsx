import { Store } from '../useStore';
import { TradeScenario } from '../types';
import { evaluateScenario, round } from '../engine/calculationEngine';
import LineChart from '../components/LineChart';

export default function CalcPage({ store }: { store: Store }) {
  const s = store.activeCalcScenario;
  const result = evaluateScenario(s);
  const { jia, yi } = result;

  const num = (id: keyof TradeScenario, label: string, step = 1) => (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        aria-label={label}
        min={0}
        step={step}
        value={s[id] as number}
        onChange={(e) => store.updateScenario(s.id, { [id]: e.target.valueAsNumber } as Partial<TradeScenario>)}
      />
    </div>
  );

  const maxDay = Math.max(...jia.points.map((p) => p.day), ...yi.points.map((p) => p.day)) + 5;
  const markers = [
    { day: 20, label: 'D20' },
    { day: s.nextBusinessDay, label: `D${s.nextBusinessDay}` },
    { day: s.yiSalesDay, label: `D${s.yiSalesDay}` },
  ];

  return (
    <div>
      <h2 className="page-title">联合测算</h2>
      <p className="page-desc">
        调整多主体经营参数，实时重算甲、乙现金流、经营结余与资金缺口。
      </p>

      <div className="grid-2">
        {/* 左：参数 */}
        <div className="panel">
          <h3 className="panel-title">经营参数</h3>
          <div className="field">
            <label>当前方案</label>
            <select aria-label="当前方案" value={s.id} onChange={(e) => store.setActiveCalcId(e.target.value)}>
              {store.scenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.name}</option>
              ))}
            </select>
          </div>

          {num('salePriceJiaToYi', '甲向乙销售价款（万元）')}
          <div className="field">
            <label>付款方式</label>
            <select
              value={s.paymentMode}
              onChange={(e) => store.updateScenario(s.id, { paymentMode: e.target.value as TradeScenario['paymentMode'] })}
            >
              <option value="PER_BATCH">每批验收后付款</option>
              <option value="WHOLE_AFTER_VERIFY">整批验收后付款</option>
            </select>
          </div>
          {num('paymentDays', '验收后付款天数（账期）')}
          <div className="field-row">
            {num('memberPrepay', '成员预付款（万元）')}
            {num('jiaOtherCost', '甲组织费用（万元）')}
          </div>
          <div className="field-row">
            {num('jiaOwnFunds', '甲自有资金（万元）')}
            {num('yiOwnFunds', '乙自有资金（万元）')}
          </div>
          <div className="field-row">
            {num('annualRate', '年利率', 0.01)}
            {num('minSafeBalance', '最低安全余额（万元）')}
          </div>
          <div className="field-row">
            {num('nextBusinessAmount', '甲下一笔经营所需（万元）')}
            {num('nextBusinessDay', '下一笔经营发生日')}
          </div>
          <div className="field-row">
            {num('yiProcessingCost', '乙加工费用（万元）')}
            {num('yiProcessingDay', '乙加工发生日')}
          </div>
          <div className="field-row">
            {num('yiSalesRevenue', '乙成品回款（万元）')}
            {num('yiSalesDay', '乙回款日')}
          </div>

          <div className="btn-row">
            <button className="btn ghost" onClick={() => store.addScenarioCopy(s.id)}>复制为新方案</button>
          </div>
          <p className="hint">提示：分批交货数量/到货日在"方案对比/履约沙盘"中以 188/12 吨履约版演示。</p>
        </div>

        {/* 右：结果 */}
        <div>
          <div className="panel">
            <h3 className="panel-title">经营结余与资金缺口（实时计算）</h3>
            <div className="grid-cards">
              <div className="metric">
                <div className="k">甲经营结余</div>
                <div className="v">{round(jia.operatingBalance)}<small> 万元</small></div>
              </div>
              <div className="metric">
                <div className="k">乙经营结余</div>
                <div className="v">{round(yi.operatingBalance)}<small> 万元</small></div>
              </div>
              <div className="metric">
                <div className="k">甲峰值融资缺口</div>
                <div className="v">{round(jia.peakLoan)}<small> 万元</small></div>
              </div>
              <div className="metric">
                <div className="k">甲融资成本</div>
                <div className="v">{round(jia.totalInterest)}<small> 万元</small></div>
              </div>
              <div className="metric">
                <div className="k">缺口首次出现</div>
                <div className="v">{jia.firstShortfallDay !== null ? `D${jia.firstShortfallDay}` : '—'}</div>
              </div>
              <div className="metric">
                <div className="k">融资持续</div>
                <div className="v">{jia.financingDurationDays}<small> 天</small></div>
              </div>
              <div className="metric">
                <div className="k">甲最低现金</div>
                <div className="v">{round(jia.minCash)}<small> 万元</small></div>
              </div>
              <div className={`metric ${jia.nextBusinessAffected ? 'alert' : 'good'}`}>
                <div className="k">Day{s.nextBusinessDay} 可用资金</div>
                <div className="v">{round(jia.cashAtNextBusiness)}<small> 万元</small></div>
              </div>
            </div>
            <div className={jia.nextBusinessAffected ? 'callout' : 'callout green'}>
              {jia.nextBusinessAffected
                ? `甲在 Day${s.nextBusinessDay} 可用资金 ${round(jia.cashAtNextBusiness)} 万元，低于后续经营所需 ${s.nextBusinessAmount} 万元，形成约 ${round(jia.nextBusinessGap)} 万元新增资金缺口 → 可能形成新增金融需求。`
                : `甲在 Day${s.nextBusinessDay} 可用资金 ${round(jia.cashAtNextBusiness)} 万元，可覆盖后续经营所需 ${s.nextBusinessAmount} 万元，暂无新增金融需求。`}
            </div>
            <p className="hint">Day{s.nextBusinessDay} 所需 {s.nextBusinessAmount} 万元是后续经营的流动性检查点，不作为本笔业务直接支出，也不自动新增借款。</p>
          </div>

          <div className="panel">
            <h3 className="panel-title">现金流时间序列</h3>
            <div className="legend">
              <span><i style={{ background: '#c7000b' }} />甲 现金余额</span>
              <span><i style={{ background: '#1a4fa0' }} />乙 现金余额</span>
              <span><i style={{ background: '#b7791f' }} />甲 融资余额</span>
            </div>
            <LineChart
              maxDay={maxDay}
              markers={markers}
              series={[
                { name: '甲现金', color: '#c7000b', points: jia.points, field: 'cash' },
                { name: '乙现金', color: '#1a4fa0', points: yi.points, field: 'cash' },
                { name: '甲融资', color: '#b7791f', points: jia.points, field: 'loan' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
