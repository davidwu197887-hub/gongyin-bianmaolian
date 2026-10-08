import { Store } from '../useStore';
import { buildMemberView } from '../engine/memberLedger';

export default function MemberPage({ store }: { store: Store }) {
  const m = store.member;
  const v = buildMemberView(m);

  return (
    <div>
      <h2 className="page-title">成员明白账（M01）</h2>
      <p className="page-desc">
        成员款项以<strong>元</strong>为单位，与主体经营的"万元"严格区分。清楚区分商品货款、服务报酬、经营结余与依法形成的盈余分配，
        不把合作组织的经营利润直接显示为成员分红。
      </p>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h3 className="panel-title">M01 款项卡（单位：元）</h3>
          <table>
            <tbody>
              <tr><td style={{ color: '#868e96', width: 160 }}>参与商品</td><td>首批中的 {m.participatedTons} 吨大豆</td></tr>
              <tr><td style={{ color: '#868e96' }}>境外采购支出</td><td>{m.procureCostYuan.toLocaleString()} 元</td></tr>
              <tr><td style={{ color: '#868e96' }}>境内收购价款</td><td>{m.purchasePriceYuan.toLocaleString()} 元</td></tr>
              <tr><td style={{ color: '#868e96' }}>已预付</td><td>{m.prepaidYuan.toLocaleString()} 元</td></tr>
              <tr><td style={{ color: '#868e96' }}>本次应付尾款</td><td>{m.tailYuan.toLocaleString()} 元</td></tr>
              <tr><td style={{ color: '#868e96' }}>尾款触发</td><td>Day{m.tailTriggerDay} 完成交割验收后形成</td></tr>
              <tr>
                <td style={{ color: '#868e96' }}>实际支付状态</td>
                <td>
                  {v.tailPaid ? <span className="badge ok">已支付（关联本人收款回执·模拟）</span> : <span className="badge gray">待 Day20 验收后支付</span>}
                </td>
              </tr>
            </tbody>
          </table>
          <div className={v.reconciles ? 'callout green' : 'callout'}>
            对账校验：已预付 {m.prepaidYuan.toLocaleString()} + 尾款 {m.tailYuan.toLocaleString()} =
            收购价款 {m.purchasePriceYuan.toLocaleString()} 元，{v.reconciles ? '一致 ✓' : '不一致 ✗'}
          </div>
          <p className="hint">
            在"履约沙盘"推进到 Day20 后，本人尾款状态将由代码联动更新为已支付。
          </p>
        </div>

        <div className="panel">
          <h3 className="panel-title">款项性质区分</h3>
          <div className="callout">{v.classification.goodsPayment}</div>
          <div className="callout amber">{v.classification.serviceReward}</div>
          <div className="callout amber">{v.classification.operatingBalance}</div>
          <div className="callout">{v.classification.surplusDistribution}</div>
          <p className="hint">
            剩余 12 吨在途、乙提出账期调整，均不改变 M01 已经形成的尾款义务，也无需等待乙 Day80 的成品销售回款。
          </p>
        </div>
      </div>
    </div>
  );
}
