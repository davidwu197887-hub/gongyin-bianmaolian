import { Store } from '../useStore';
import { MOCK_ENDPOINT } from '../engine/mockBankApi';

export default function TranslatePage({ store }: { store: Store }) {
  const need = store.need;

  return (
    <div>
      <h2 className="page-title">金融需求转译</h2>
      <p className="page-desc">
        将经营条件变化、现金流影响和资金缺口转译为结构化金融需求，提交银行独立审核。
      </p>

      {!need && (
        <div className="panel">
          <h3 className="panel-title">生成金融需求</h3>
          <p className="hint">读取 Rule-V1 与 Draft-V2 的现金流差异，形成金融需求说明。</p>
          <div className="btn-row">
            <button className="btn" disabled={!store.comparison} onClick={store.runTranslate}>翻译为金融需求</button>
          </div>
        </div>
      )}

      {need && (
        <>
          <div className="panel">
            <h3 className="panel-title">
              经营语言 → 金融语言（四段式转换）
              <button style={{ marginLeft: 'auto' }} className="btn" onClick={store.submitToBank} disabled={!!store.bankResp || !need.createsNewFinancialNeed}>
                {store.bankResp ? '已提交' : '提交金融需求包'}
              </button>
            </h3>
            {store.bankResp && <div className="callout amber"><strong>{store.bankResp.status}</strong> · 等待银行独立审核；合同变更仍须主体确认</div>}
            <div className="translate-flow">
              <div className="tf-step biz">
                <div className="tf-tag">① 经营语言</div>
                <div className="tf-body">{need.trigger}</div>
              </div>
              <div className="tf-arrow">↓</div>
              <div className="tf-step cash">
                <div className="tf-tag">② 现金流影响</div>
                <div className="tf-body">
                  Day{need.startDay} 甲可用现金由约 <strong>{need.cashFlowImpact.beforeCash}</strong> 万元
                  变化为 <strong>{need.cashFlowImpact.afterCash}</strong> 万元
                  （回款推迟影响约 {need.cashFlowImpact.changeOnReceiptDelay} 万元）。
                </div>
              </div>
              <div className="tf-arrow">↓</div>
              <div className="tf-step result">
                <div className="tf-tag">③ 经营结果</div>
                <div className="tf-body">
                  Day{need.startDay} 后续经营需要 {need.cashFlowImpact.requirement} 万元，
                  {need.createsNewFinancialNeed ? <>产生约 <strong>{need.amount}</strong> 万元临时缺口。</> : '可用现金足以覆盖，无新增金融需求。'}
                </div>
              </div>
              <div className="tf-arrow">↓</div>
              <div className="tf-step fin">
                <div className="tf-tag">④ 金融语言</div>
                <div className="tf-body">
                  {need.subject} 形成约 <strong>{need.amount} {need.amountUnit}</strong>、
                  预计期限 <strong>{need.expectedDurationDays === null ? (need.createsNewFinancialNeed ? '待核实' : '无需融资') : `${need.expectedDurationDays}天`}</strong>；{need.suggestedNeedCategory}。
                  还款依据：{need.repaymentSource}。
                </div>
              </div>
              <div className="tf-arrow">↓</div>
              <div className="tf-step bank">
                <div className="tf-tag">⑤ 银行接口</div>
                <div className="tf-body">形成金融需求材料，提交工行既有金融服务<strong>独立审核</strong>（系统不作授信结论）。</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">结构化金融需求包</h3>
            <dl className="need-grid">
              <dt>金融需求主体</dt><dd>{need.subject}</dd>
              <dt>触发原因</dt><dd>{need.trigger}</dd>
              <dt>草案条件下资金缺口</dt><dd><strong style={{ color: '#c7000b' }}>{need.amount} {need.amountUnit}</strong></dd>
              <dt>较原条件缺口增量</dt><dd>{need.cashFlowImpact.incrementalGap} {need.amountUnit}（原缺口{need.cashFlowImpact.beforeGap}）</dd>
              <dt>缺口出现日</dt><dd>第 {need.startDay} 日</dd>
              <dt>预计持续</dt><dd>{need.expectedEndDay === null ? (need.createsNewFinancialNeed ? '待核实' : '无需融资') : `约${need.expectedDurationDays}日（至第${need.expectedEndDay}日）`}</dd>
              <dt>资金用途</dt><dd>{need.purpose}</dd>
              <dt>预计还款来源</dt><dd>{need.repaymentSource}</dd>
              <dt>预计回款日</dt><dd>{need.expectedRepaymentDay === null ? (need.createsNewFinancialNeed ? '无足额回款匹配' : '无需融资') : `第${need.expectedRepaymentDay}日`}</dd>
              <dt>原融资状态</dt><dd>{need.previousFinancingStatus}</dd>
              <dt>是否影响原有融资</dt><dd>{need.affectsExistingFacility ? '是' : '否'}</dd>
              <dt>是否形成新增需求</dt><dd>{need.createsNewFinancialNeed ? '是' : '否'}</dd>
              <dt>需求类型建议</dt><dd>{need.suggestedNeedCategory}</dd>
              <dt>需银行核验材料</dt>
              <dd>
                <ul className="clean" style={{ margin: 0 }}>
                  {need.requiredMaterials.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </dd>
            </dl>
            <div className="callout green" style={{ marginTop: 14 }}>
              {need.createsNewFinancialNeed ? '已形成金融需求说明，可提交银行独立审核。' : '可用资金覆盖经营需要，无新增金融需求，无需提交银行。'}
            </div>
          </div>

          <div className="panel debug-panel">
            <h3 className="panel-title">提交模拟银行接口</h3>
            <div className="code-block">{MOCK_ENDPOINT}</div>
            {store.bankResp && (
              <div style={{ marginTop: 12 }}>
                <div className="code-block">
{JSON.stringify(
  {
    received: store.bankResp.received,
    status: store.bankResp.status,
    message: store.bankResp.message,
    requestId: store.bankResp.requestId,
  },
  null,
  2,
)}
                </div>
                <div className="callout amber" style={{ marginTop: 12 }}>
                  银行回执状态为 <strong>PENDING_BANK_REVIEW（等待银行独立审核）</strong>。
                  产品适配与授信审批由银行独立完成。
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
