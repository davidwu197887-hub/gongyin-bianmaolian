import { Store } from '../useStore';

export default function RulePage({ store }: { store: Store }) {
  const { book } = store;
  const draftV1 = book.drafts.find((d) => d.version === 'Rule-V1');
  const effective = book.effective;
  const current = effective ?? draftV1;

  const modeLabel = (m: string) => (m === 'PER_BATCH' ? '每批验收后付款' : '整批验收后付款');

  return (
    <div>
      <h2 className="page-title">共同规则（Rule-V1）</h2>
      <p className="page-desc">
        经营主体选定方案后固化价格、账期、批次与付款条件，生成规则版本并按责确认。只模拟数字确认与版本管理，不涉及真实法律签名。
      </p>

      {!current && (
        <div className="panel">
          <h3 className="panel-title">选定方案，生成 Rule-V1</h3>
          <p className="hint">选择方案 B（分批结算）作为共同执行依据，系统将以 188/12 吨分批履约版落地。</p>
          <div className="btn-row">
            <button className="btn" onClick={() => store.chooseScenarioForRule('B')}>选择方案 B，生成 Rule-V1</button>
          </div>
        </div>
      )}

      {current && (
        <>
          <div className="panel">
            <h3 className="panel-title">
              {current.version}
              <span className={`badge ${effective ? 'ok' : 'warn'}`} style={{ marginLeft: 8 }}>
                {effective ? '已生效（当前有效规则）' : '待确认'}
              </span>
            </h3>
            <table>
              <tbody>
                <tr><td style={{ width: 180, color: '#868e96' }}>销售价款</td><td>{current.rule.salePrice} 万元</td></tr>
                <tr><td style={{ color: '#868e96' }}>付款方式</td><td>{modeLabel(current.rule.paymentMode)}</td></tr>
                <tr><td style={{ color: '#868e96' }}>账期</td><td>{current.rule.batches.map((b) => `${b.id}：验收后${b.paymentDaysOverride ?? current.rule.paymentDays}日付款`).join('；')}</td></tr>
                <tr>
                  <td style={{ color: '#868e96' }}>分批交割</td>
                  <td>{current.rule.batches.map((b) => `${b.tons}吨/D${b.verifyDay}`).join('，')}</td>
                </tr>
                <tr><td style={{ color: '#868e96' }}>合同版本</td><td>{current.rule.contractDoc}</td></tr>
                <tr><td style={{ color: '#868e96' }}>版本摘要（模拟可信登记）</td><td className="mono">{current.hash}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3 className="panel-title">按责确认</h3>
            <table>
              <thead>
                <tr><th>确认主体</th><th>责任范围</th><th>状态</th><th></th></tr>
              </thead>
              <tbody>
                {(effective ?? draftV1)!.confirmations.map((c) => (
                  <tr key={c.partyId}>
                    <td>{c.partyName}</td>
                    <td>{c.responsibility}</td>
                    <td>
                      {c.confirmed ? <span className="badge ok">已确认</span> : <span className="badge gray">待确认</span>}
                    </td>
                    <td>
                      {!effective && !c.confirmed && (
                        <button className="btn ghost" onClick={() => store.confirmRuleParty(c.partyId)}>确认</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!effective && draftV1?.status === 'CONFIRMED' && (
              <div className="btn-row">
                <button className="btn" onClick={store.effectuateRule}>各方已确认，使 Rule-V1 生效</button>
              </div>
            )}
            {effective && (
              <div className="callout green">
                {effective.version} 已生效，成为当前有效规则。未完成必要确认的变更草案不会覆盖有效规则（见“例外重算”）。
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
