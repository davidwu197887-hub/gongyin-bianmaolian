import { Store } from '../useStore';

export default function AuditPage({ store }: { store: Store }) {
  const { book } = store;
  const draftV1 = book.drafts.find((d) => d.version === 'Rule-V1');
  const draftV2 = book.drafts.find((d) => d.version === 'Draft-V2');

  const versions = [
    draftV1,
    book.effective,
    draftV2,
    ...book.history,
  ].filter(Boolean) as NonNullable<typeof book.effective>[];

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'gray', CONFIRMED: 'warn', EFFECTIVE: 'ok', SUPERSEDED: 'red',
    };
    const label: Record<string, string> = {
      DRAFT: '待确认', CONFIRMED: '已确认', EFFECTIVE: '生效中', SUPERSEDED: '已被替代',
    };
    return <span className={`badge ${map[s]}`}>{label[s]}</span>;
  };

  return (
    <div>
      <h2 className="page-title">审计与版本</h2>
      <p className="page-desc">
        记录规则版本、确认状态、业务事件、金融需求生成与银行回执。关键对象附模拟可信登记摘要（版本校验），不冒充真实联盟链接入。
      </p>

      <div className="panel">
        <h3 className="panel-title">规则版本</h3>
        <table>
          <thead>
            <tr><th>版本</th><th>状态</th><th>基于</th><th>账期</th><th>确认情况</th><th>摘要</th></tr>
          </thead>
          <tbody>
            {versions.length === 0 && <tr><td colSpan={6} className="hint">尚无规则版本，请先在"共同规则"生成 Rule-V1。</td></tr>}
            {versions.map((v) => (
              <tr key={v.version + v.status}>
                <td><strong>{v.version}</strong></td>
                <td>{statusBadge(v.status)}</td>
                <td>{v.basedOn ?? '—'}</td>
                <td>{v.rule.batches.map((b) => `${b.id}：验收后${b.paymentDaysOverride ?? v.rule.paymentDays}日`).join('；')}</td>
                <td>{v.confirmations.filter((c) => c.confirmed).length}/{v.confirmations.length} 已确认</td>
                <td className="mono">{v.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Draft-V2 在全部确认前不会覆盖 Rule-V1（由 ruleVersionEngine 从代码层面强制约束）。</p>
      </div>

      <div className="panel">
        <h3 className="panel-title">金融需求与银行回执</h3>
        {!store.need && <p className="hint">尚未生成金融需求。</p>}
        {store.need && (
          <table>
            <tbody>
              <tr><td style={{ color: '#868e96', width: 160 }}>需求编号</td><td className="mono">{store.need.needId}</td></tr>
              <tr><td style={{ color: '#868e96' }}>需求主体 / 金额</td><td>{store.need.subject} / {store.need.amount} 万元</td></tr>
              <tr><td style={{ color: '#868e96' }}>银行接口</td><td>POST /mock-bank-api/financial-needs</td></tr>
              <tr>
                <td style={{ color: '#868e96' }}>回执状态</td>
                <td>{store.bankResp ? <span className="badge warn">{store.bankResp.status}</span> : <span className="badge gray">未提交</span>}</td>
              </tr>
              {store.bankResp && <tr><td style={{ color: '#868e96' }}>回执编号</td><td className="mono">{store.bankResp.requestId}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3 className="panel-title">操作与事件记录</h3>
        <table>
          <thead>
            <tr><th>#</th><th>类型</th><th>对象</th><th>说明</th><th>摘要</th></tr>
          </thead>
          <tbody>
            {store.audit.length === 0 && <tr><td colSpan={5} className="hint">暂无记录。</td></tr>}
            {store.audit.map((e) => (
              <tr key={e.seq}>
                <td>{e.seq}</td>
                <td><span className="badge gray">{e.type}</span></td>
                <td className="mono">{e.ref}</td>
                <td>{e.detail}</td>
                <td className="mono">{e.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
