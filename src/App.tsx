import { useStore, Page } from './useStore';
import CalcPage from './pages/CalcPage';
import ComparePage from './pages/ComparePage';
import RulePage from './pages/RulePage';
import FulfillmentPage from './pages/FulfillmentPage';
import ExceptionPage from './pages/ExceptionPage';
import TranslatePage from './pages/TranslatePage';
import MemberPage from './pages/MemberPage';
import AuditPage from './pages/AuditPage';

const NAV: { id: Page; label: string }[] = [
  { id: 'calc', label: '联合测算' },
  { id: 'compare', label: '方案对比' },
  { id: 'rule', label: '共同规则' },
  { id: 'fulfillment', label: '履约沙盘' },
  { id: 'exception', label: '例外重算' },
  { id: 'translate', label: '金融需求转译' },
  { id: 'member', label: '成员明白账' },
  { id: 'audit', label: '审计与版本' },
];

export default function App() {
  const store = useStore();
  const { page, setPage } = store;

  return (
    <div className={`app page-${page}${store.captureMode ? ' capture-view' : ''}`}>
      <div className="disclaimer-bar">
        <strong>竞赛原型</strong>｜<strong>模拟数据</strong>｜<strong>非中国工商银行生产系统</strong> · 银行始终独立审批
      </div>

      <header className="header">
        <div className="logo-mark">工</div>
        <div>
          <h1>工银边贸链——边民互市经营协同与金融需求适配平台</h1>
          <div className="sub">经营协同 · 现金流重算 · 金融需求适配</div>
        </div>
        <div className="spacer" />
        <div className="tag">珲春俄豆案例</div>
        <button className="btn gray" style={{ marginLeft: 10 }} onClick={store.reset}>
          重置演示
        </button>
      </header>

      <nav className="nav">
        {NAV.map((n, i) => (
          <button
            key={n.id}
            className={page === n.id ? 'active' : ''}
            onClick={() => setPage(n.id)}
          >
            <span className="step-no">{i + 1}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {store.error && <div className="callout amber" role="alert">{store.error}；已保留原有效数据。</div>}
        {page === 'calc' && <CalcPage store={store} />}
        {page === 'compare' && <ComparePage store={store} />}
        {page === 'rule' && <RulePage store={store} />}
        {page === 'fulfillment' && <FulfillmentPage store={store} />}
        {page === 'exception' && <ExceptionPage store={store} />}
        {page === 'translate' && <TranslatePage store={store} />}
        {page === 'member' && <MemberPage store={store} />}
        {page === 'audit' && <AuditPage store={store} />}
      </main>
    </div>
  );
}
