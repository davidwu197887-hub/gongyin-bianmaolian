import { Store } from '../useStore';
import { evaluateParty, round } from '../engine/calculationEngine';

export default function ExceptionPage({ store }: { store: Store }) {
  const draft = store.book.drafts.find((d) => d.version === 'Draft-V2');
  const comparison = store.comparison;
  if (!comparison) return (
    <div>
      <h2 className="page-title">例外重算</h2>
      <p className="page-desc">乙提出剩余批次付款账期延长。系统保留有效规则，生成独立草案并重算现金流。</p>
      <div className="panel">
        <h3 className="panel-title">条件变更处理</h3>
        {!store.book.effective ? <div className="callout amber">请先在“共同规则”确认并生效 Rule-V1。</div> :
          <button className="btn" onClick={store.proposeExtension}>乙提出账期变更 → 生成 Draft-V2</button>}
      </div>
    </div>
  );
  const { before, after, trigger } = comparison;
  const oldResult = evaluateParty(before, 'JIA');
  const newResult = evaluateParty(after, 'JIA');
  const day = after.nextBusinessDay;
  const oldCash = round(oldResult.cashAtNextBusiness);
  const newCash = round(newResult.cashAtNextBusiness);
  const gap = round(newResult.nextBusinessGap);
  const changedBatch = after.batches.find((b) => b.paymentDaysOverride !== before.batches.find((old) => old.id === b.id)?.paymentDaysOverride)!;
  const oldBatch = before.batches.find((b) => b.id === changedBatch.id)!;
  const oldReceipt = oldResult.events.find((e) => e.kind === 'SALE_RECEIPT' && e.batchId === changedBatch.id)!;
  const newReceipt = newResult.events.find((e) => e.kind === 'SALE_RECEIPT' && e.batchId === changedBatch.id)!;
  const adopted = store.book.effective?.version === 'Draft-V2';
  return (
    <div>
      <h2 className="page-title">例外重算</h2>
      <p className="page-desc">{trigger}。这是条件变更；未完成必要确认的草案不覆盖有效规则。</p>
      <div className="panel">
        <h3 className="panel-title">条件变更处理</h3>
        <div className="callout">
          {adopted ? 'Draft-V2 已经共同确认并采纳，旧 Rule-V1 已进入历史。' : <>已生成 <strong>Draft-V2</strong>，{draft?.status === 'CONFIRMED' ? '已全部确认，待采纳' : '待甲确认'}；当前有效规则仍为 <strong>{store.book.effective?.version}</strong>。</>}
        </div>
      </div>
      <div className="panel">
        <h3 className="panel-title">现金流重算：变更前 vs 变更后（Day{day}）</h3>
        <div className="diff-row">
          <div className="diff-box before">
            <div className="badge gray">原规则 · 验收后{oldBatch.paymentDaysOverride ?? before.paymentDays}日</div>
            <table><tbody>
              <tr><td>剩余{changedBatch.tons}吨货款到账</td><td className="num">Day{oldReceipt.day}</td></tr>
              <tr><td>Day{day} 可用资金</td><td className="num"><strong>{oldCash} 万元</strong></td></tr>
              <tr><td>后续经营需要</td><td className="num">{before.nextBusinessAmount} 万元</td></tr>
              <tr><td>资金缺口</td><td className="num">{round(oldResult.nextBusinessGap)} 万元</td></tr>
            </tbody></table>
          </div>
          <div className="diff-arrow">→</div>
          <div className="diff-box after">
            <div className="badge warn">Draft-V2 · 验收后{changedBatch.paymentDaysOverride}日</div>
            <table><tbody>
              <tr><td>剩余{changedBatch.tons}吨货款到账</td><td className="num">Day{newReceipt.day}</td></tr>
              <tr><td>Day{day} 可用资金</td><td className="num"><strong>{newCash} 万元</strong></td></tr>
              <tr><td>后续经营需要</td><td className="num">{after.nextBusinessAmount} 万元</td></tr>
              <tr><td>资金缺口</td><td className="num"><strong>{gap} 万元</strong></td></tr>
            </tbody></table>
          </div>
        </div>
        <div className={newResult.nextBusinessAffected ? 'callout' : 'callout green'}>
          Day{day} 可用资金 <strong>{oldCash}</strong> → <strong>{newCash}</strong> 万元；后续经营需要 {after.nextBusinessAmount} 万元，资金缺口 <strong>{gap}</strong> 万元。
          {round(newReceipt.amount)} 万元货款由 Day{oldReceipt.day} 推迟至 Day{newReceipt.day}。
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => { store.runTranslate(); store.setPage('translate'); }}>翻译为金融需求 →</button>
          {draft?.status === 'DRAFT' && <button className="btn ghost" onClick={() => store.confirmDraft('JIA')}>（可选）甲确认接受新账期</button>}
          {draft?.status === 'CONFIRMED' && <button className="btn ghost" onClick={store.adoptV2}>采纳 Draft-V2（Rule-V1 进入历史）</button>}
        </div>
        <p className="hint">Day{day} 的 {after.nextBusinessAmount} 万元是流动性检查点，不计入本笔业务支出。银行审核等待状态与甲是否接受合同变更相互独立。</p>
      </div>
      <div className="panel">
        <h3 className="panel-title">确认范围（按责）</h3>
        <ul className="clean">
          <li>已完成的批次交易与支付保留原有记录，不受影响。</li>
          <li>甲对成员的收购尾款义务继续按各自合同履行。</li>
          <li>仅剩余批次甲、乙的付款条件需要确认；重算不自动改写合同。</li>
        </ul>
        <p className="hint">本例预设银行尚未承诺额外融资。可维持原账期，或将测算形成的资金需求提交银行独立复核；经营选择由主体作出。</p>
      </div>
    </div>
  );
}
