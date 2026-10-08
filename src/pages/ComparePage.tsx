import { Store } from '../useStore';
import { compareScenarios } from '../engine/scenarioEngine';

export default function ComparePage({ store }: { store: Store }) {
  const metrics = compareScenarios(store.scenarios);

  const rows: { key: string; label: string; fmt: (m: (typeof metrics)[number]) => string; dir?: 'hi' | 'lo' }[] = [
    { key: 'jiaBalance', label: '甲经营结余（万元）', fmt: (m) => m.jiaBalance.toFixed(2), dir: 'hi' },
    { key: 'yiBalance', label: '乙经营结余（万元）', fmt: (m) => m.yiBalance.toFixed(2), dir: 'hi' },
    { key: 'combinedBalance', label: '双方合计结余（万元）', fmt: (m) => m.combinedBalance.toFixed(2), dir: 'hi' },
    { key: 'jiaMinCash', label: '甲最低现金（万元）', fmt: (m) => m.jiaMinCash.toFixed(2) },
    { key: 'yiMinCash', label: '乙最低现金（万元）', fmt: (m) => m.yiMinCash.toFixed(2) },
    { key: 'peakFinancing', label: '甲峰值融资需求（万元）', fmt: (m) => m.peakFinancing.toFixed(2), dir: 'lo' },
    { key: 'financingCost', label: '甲融资成本（万元）', fmt: (m) => m.financingCost.toFixed(3), dir: 'lo' },
    { key: 'nextBusinessGap', label: '后续经营资金缺口（万元）', fmt: (m) => m.nextBusinessGap.toFixed(2), dir: 'lo' },
    { key: 'jiaCashAtNextBusiness', label: '后续经营日甲可用资金（万元）', fmt: (m) => m.jiaCashAtNextBusiness.toFixed(2), dir: 'hi' },
    { key: 'nextBusinessAffected', label: '是否影响后续经营', fmt: (m) => (m.nextBusinessAffected ? '是' : '否') },
    { key: 'createsNewFinancialNeed', label: '是否出现新增金融需求', fmt: (m) => (m.createsNewFinancialNeed ? '是' : '否') },
  ];

  return (
    <div>
      <h2 className="page-title">方案对比</h2>
      <p className="page-desc">
        并排比较各方案的收益—流动性—融资需求取舍。系统只提供"存在更优替代"的 Pareto 辅助提示，不作推荐，经营选择由主体自行作出。
      </p>

      <div className="panel">
        <h3 className="panel-title">多方案指标对照</h3>
        <table>
          <thead>
            <tr>
              <th>指标</th>
              {metrics.map((m) => (
                <th key={m.scenarioId} className="num">{m.scenarioName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.key === 'jiaCashAtNextBusiness' ? 'highlight' : ''}>
                <td>{r.label}</td>
                {metrics.map((m) => (
                  <td key={m.scenarioId} className="num">{r.fmt(m)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td>Pareto 辅助</td>
              {metrics.map((m) => (
                <td key={m.scenarioId} className="num">
                  {m.dominatedBy ? (
                    <span className="badge warn">存在更优替代</span>
                  ) : (
                    <span className="badge gray">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot><tr><td>主体自主选择</td>{metrics.map((m) => <td key={m.scenarioId} className="num"><button className="btn ghost" disabled={!!store.book.effective} onClick={() => { store.chooseScenarioForRule(m.scenarioId); store.setPage('rule'); }}>选择方案 {m.scenarioId}，生成 Rule-V1</button></td>)}</tr></tfoot>
        </table>
      </div>

      <div className="panel">
        <h3 className="panel-title">甲为什么可能减少经营结余仍选择方案 B？</h3>
        {(() => {
          const a = metrics.find((m) => m.scenarioId === 'A');
          const b = metrics.find((m) => m.scenarioId === 'B');
          if (!a || !b) return <p className="hint">需同时存在方案 A 与方案 B。</p>;
          const diff = (b.jiaBalance - a.jiaBalance).toFixed(2);
          const bs = store.scenarios.find((s) => s.id === 'B')!;
          return (
            <>
              <div className="callout amber">
                方案 B 下甲经营结余 {b.jiaBalance.toFixed(2)} 万元，方案 A 为 {a.jiaBalance.toFixed(2)} 万元；变化 {diff} 万元。
                双方合计结余（{a.combinedBalance.toFixed(2)} → {b.combinedBalance.toFixed(2)} 万元）。
              </div>
              <div className="callout green">
                方案 B 下，货款在{bs.paymentMode === 'PER_BATCH' ? '每批' : '整批'}验收后 {bs.paymentDays} 日回笼；Day{bs.nextBusinessDay} 甲可用资金为 {b.jiaCashAtNextBusiness.toFixed(2)} 万元
                （方案 A 为 {a.jiaCashAtNextBusiness.toFixed(2)} 万元）；后续经营需 {bs.nextBusinessAmount} 万元，{b.nextBusinessAffected ? '尚有资金缺口' : '可用现金能够覆盖'}。
              </div>
              <p className="hint">
                这是<strong>流动性与下一笔经营机会</strong>之间的取舍，由经营主体权衡后自行选择，<strong>并非系统判断 B 更优</strong>。
                系统只呈现取舍，不替主体决策。
              </p>
            </>
          );
        })()}
      </div>
    </div>
  );
}
