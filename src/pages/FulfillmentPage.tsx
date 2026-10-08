import { Store } from '../useStore';
import { scenarioBSplit } from '../data/presets';
import { buildTimeline, buildEvents, snapshotAt } from '../engine/eventEngine';
import { effectiveScenario } from '../engine/ruleVersionEngine';

export default function FulfillmentPage({ store }: { store: Store }) {
  // 以当前有效规则为准；若尚未生效，用履约版方案 B 作为预览
  const scenario = effectiveScenario(store.book) ?? scenarioBSplit();
  const activeVersion = store.book.effective?.version ?? '（未生效，预览）';

  const timeline = buildTimeline(scenario);
  const events = buildEvents(scenario);
  const day = store.currentDay;
  const snap = snapshotAt(scenario, day, activeVersion);

  const nextDay = timeline.find((d) => d > day) ?? null;

  const eventsAt = (d: number) => events.filter((e) => e.day === d);

  return (
    <div>
      <h2 className="page-title">履约沙盘</h2>
      <p className="page-desc">
        沿时间轴推进模拟验收与付款回执。到货、验收、付款在有效规则范围内联动，更新履约数量、应付应收、可用现金与融资余额。
      </p>

      {!store.book.effective && (
        <div className="callout amber">当前 Rule-V1 尚未生效，以下为履约预览。建议先在"共同规则"中确认并生效 Rule-V1。</div>
      )}

      <div className="panel">
        <h3 className="panel-title">业务时间轴</h3>
        <div className="timeline">
          {timeline.map((d) => (
            <div key={d} className={`tl-node ${d < day ? 'done' : ''} ${d === day ? 'current' : ''}`}>
              <div className="tl-dot">{d <= day ? '✓' : ''}</div>
              <div className="tl-label">
                <div className="tl-day">Day {d}</div>
                <div>{eventsAt(d)[0]?.title ?? ''}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn gray" onClick={() => store.advanceDay(0)}>回到 Day 0</button>
          <button className="btn" disabled={nextDay === null} onClick={() => nextDay !== null && store.advanceDay(nextDay)}>
            {nextDay !== null ? `推进到下一事件（Day ${nextDay}）` : '已到最后事件'}
          </button>
          {timeline.map((d) => (
            <button key={d} className="btn ghost" onClick={() => store.advanceDay(d)}>Day {d}</button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h3 className="panel-title">当前业务状态（Day {day}）</h3>
          <div className="grid-cards">
            <div className="metric"><div className="k">已验收 / 在途</div><div className="v">{snap.fulfilledTons}<small> / {snap.inTransitTons} 吨</small></div></div>
            <div className="metric"><div className="k">甲可用现金</div><div className="v">{snap.jiaCash}<small> 万元</small></div></div>
            <div className="metric"><div className="k">甲融资余额</div><div className="v">{snap.jiaLoan}<small> 万元</small></div></div>
            <div className="metric"><div className="k">成员尾款已付/待付</div><div className="v">{snap.memberTailPaid}<small>/{snap.memberTailRemaining}</small></div></div>
            <div className="metric"><div className="k">已收乙货款</div><div className="v">{snap.receivedFromYi}<small> 万元</small></div></div>
            <div className="metric"><div className="k">待收乙货款</div><div className="v">{snap.pendingFromYi}<small> 万元</small></div></div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel-title">本节点事件详情</h3>
          {eventsAt(day).length === 0 && <p className="hint">该日无登记事件。</p>}
          {eventsAt(day).map((e, i) => (
            <div key={i} className="callout">
              <strong>{e.title}</strong>
              <div className="hint" style={{ marginTop: 2 }}>{e.detail}</div>
            </div>
          ))}
          <h4 style={{ fontSize: 13, margin: '14px 0 6px' }}>联动结果</h4>
          <ul className="clean">
            {snap.lines.map((l, i) => <li key={i} style={{ fontSize: 13 }}>{l}</li>)}
          </ul>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title">履约联动说明（Day20 / Day25）</h3>
        <ul className="clean">
          <li>Day20：188 吨完成验收，12 吨在途；首批货款、成员尾款、甲借款余额由代码按批次比例自动计算。</li>
          <li>Day25：乙支付首批货款，甲按规则偿还对应融资本息，借款状态、现金余额与剩余应收随之更新。</li>
          <li>后续 12 吨仍在途，不提前记为实收或损失；已满足条件的首批无须重新确认单价与账期。</li>
        </ul>
      </div>
    </div>
  );
}
