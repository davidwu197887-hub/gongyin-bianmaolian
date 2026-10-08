// ============================================================================
// 工银边贸链——边民互市经营协同与金融需求适配平台
// 核心数据结构定义（所有金额单位默认 万元；成员明白账单独使用 元）
// ============================================================================

export type Party = 'JIA' | 'YI';

/** 业务主体 */
export interface BusinessParty {
  id: Party;
  name: string;
  role: string;
  ownFunds: number; // 自有资金（万元）
}

/** 现金流事件类型 */
export type CashEventKind =
  | 'OWN_FUNDS'        // 自有资金注入（资本项，不计入经营结余）
  | 'MEMBER_PREPAY'    // 向成员预付收购款
  | 'MEMBER_TAIL'      // 成员尾款
  | 'OTHER_COST'       // 物流/组织等费用
  | 'SALE_RECEIPT'     // 甲收到乙支付的销售货款
  | 'PURCHASE_PAYMENT' // 乙向甲支付货款
  | 'PROCESSING_COST'  // 乙加工及后续费用
  | 'SALES_REVENUE';   // 乙成品销售回款

/** 现金流事件（金额带符号：+ 流入 / - 流出） */
export interface CashFlowEvent {
  party: Party;
  day: number;
  amount: number;
  kind: CashEventKind;
  label: string;
  batchId?: string;
}

/** 分批交割批次 */
export interface Batch {
  id: string;
  tons: number;
  verifyDay: number;
  /** 单批次付款账期覆盖（天）。用于 Draft-V2 仅改变某一批次账期而不动其他批次 */
  paymentDaysOverride?: number;
}

export type PaymentMode = 'PER_BATCH' | 'WHOLE_AFTER_VERIFY';

/** 经营方案（联合测算的输入） */
export interface TradeScenario {
  id: string;
  name: string;

  // 价格与付款
  salePriceJiaToYi: number;   // 甲向乙销售价款
  paymentMode: PaymentMode;   // 分批付款 / 整批验收后付款
  paymentDays: number;        // 验收后 N 日付款（账期）

  // 商品与成员收购
  totalTons: number;
  memberProcureCost: number;  // 成员境外采购支出合计（信息项）
  jiaPurchaseTotal: number;   // 甲境内收购价款合计
  memberPrepay: number;       // 第 0 日预付
  memberPrepayDay: number;
  jiaOtherCost: number;       // 甲第 0 日物流/组织等费用
  jiaOtherCostDay: number;

  // 自有资金
  jiaOwnFunds: number;
  yiOwnFunds: number;

  // 乙经营条件
  yiProcessingCost: number;   // 加工及后续费用
  yiProcessingDay: number;
  yiSalesRevenue: number;     // 成品销售回款
  yiSalesDay: number;

  // 融资
  annualRate: number;         // 年利率（例如 0.04）
  minSafeBalance: number;     // 最低安全余额

  // 甲下一笔经营安排
  nextBusinessAmount: number; // 下一笔经营所需可用资金
  nextBusinessDay: number;

  // 分批
  batches: Batch[];
}

/** 单日现金/融资快照 */
export interface DayPoint {
  day: number;
  cash: number;
  loan: number;
}

/** 单主体现金流测算结果 */
export interface PartyCashFlow {
  party: Party;
  points: DayPoint[];
  peakLoan: number;                 // 峰值融资缺口
  peakLoanDay: number;
  firstShortfallDay: number | null; // 融资需求首次出现日
  financingDurationDays: number;    // 融资占用持续天数
  minCash: number;                  // 最低现金余额
  totalInterest: number;            // 融资利息
  operatingInflow: number;
  operatingOutflow: number;
  operatingBalance: number;         // 经营结余 = 经营流入 - 经营流出 - 利息
  cashAtNextBusiness: number;       // 下一笔经营发生日的可用资金
  nextBusinessRequirement: number;
  nextBusinessGap: number;          // max(0, 需求 - 可用)
  nextBusinessAffected: boolean;
  events: CashFlowEvent[];
}

/** 方案整体测算结果 */
export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  jia: PartyCashFlow;
  yi: PartyCashFlow;
  combinedBalance: number;
}

/** 方案对比指标行 */
export interface ScenarioMetric {
  scenarioId: string;
  scenarioName: string;
  jiaBalance: number;
  yiBalance: number;
  combinedBalance: number;
  jiaMinCash: number;
  yiMinCash: number;
  peakFinancing: number;
  financingCost: number;
  nextBusinessGap: number;
  jiaCashAtNextBusiness: number;
  nextBusinessAffected: boolean;
  createsNewFinancialNeed: boolean;
  /** Pareto 辅助：是否存在在所有主维度上均不劣的其他方案 */
  dominatedBy: string | null;
}

// ------------------------- 规则与版本 -------------------------

export type RuleStatus = 'DRAFT' | 'CONFIRMED' | 'EFFECTIVE' | 'SUPERSEDED';

export interface Confirmation {
  partyId: Party;
  partyName: string;
  responsibility: string;
  confirmed: boolean;
  confirmedAt?: string;
}

/** 合同规则条款快照 */
export interface ContractRule {
  salePrice: number;
  paymentMode: PaymentMode;
  paymentDays: number;
  batches: Batch[];
  contractDoc: string;   // 合同版本号
}

/** 规则版本对象 */
export interface RuleVersion {
  version: string;        // Rule-V1 / Draft-V2 ...
  status: RuleStatus;
  scenario: TradeScenario;
  rule: ContractRule;
  confirmations: Confirmation[];
  basedOn?: string;
  basedOnHash?: string;
  createdAt: string;
  hash: string;
  note: string;
}

export interface RuleBook {
  effective: RuleVersion | null;
  drafts: RuleVersion[];
  history: RuleVersion[];
}

// ------------------------- 履约事件 -------------------------

export type FulfillmentKind =
  | 'VERIFY' | 'PAY_RECEIPT' | 'LOAN_SETTLE' | 'MEMBER_TAIL_PAY' | 'IN_TRANSIT' | 'SALES' | 'COST' | 'PROCESSING';

export interface FulfillmentEvent {
  day: number;
  kind: FulfillmentKind;
  title: string;
  detail: string;
}

/** 时间轴推进后的业务状态快照 */
export interface FulfillmentSnapshot {
  currentDay: number;
  activeRuleVersion: string;
  fulfilledTons: number;
  inTransitTons: number;
  jiaCash: number;
  jiaLoan: number;
  memberTailPaid: number;
  memberTailRemaining: number;
  receivedFromYi: number;
  pendingFromYi: number;
  nextEventDay: number | null;
  lines: string[];
}

// ------------------------- 金融需求 -------------------------

export interface FinancialNeed {
  needId: string;
  subject: string;              // 需求主体
  trigger: string;             // 触发原因
  amount: number;              // 新增资金缺口（万元）
  amountUnit: string;
  startDay: number;            // 缺口出现日
  expectedEndDay: number | null;      // 未有足额预计回款时为null
  expectedDurationDays: number | null;
  purpose: string;             // 资金用途
  repaymentSource: string;     // 预计还款来源
  repaymentAmount: number;
  expectedRepaymentDay: number | null;
  previousFinancingStatus: string; // 原融资状态
  affectsExistingFacility: boolean; // 是否影响原有融资条件
  createsNewFinancialNeed: boolean; // 是否形成新增金融需求
  suggestedNeedCategory: string;    // 需求类型建议
  requiredMaterials: string[];      // 需银行进一步核验的材料
  // 经营语言 -> 金融语言 的四段式解释支撑
  cashFlowImpact: {
    beforeCash: number;
    afterCash: number;
    requirement: number;
    gap: number;
    beforeGap: number;
    incrementalGap: number;
    changeOnReceiptDelay: number; // 回款推迟的影响金额
  };
}

export interface BankApiResponse {
  received: boolean;
  status: 'PENDING_BANK_REVIEW';
  message: string;
  requestId: string;
  submittedAt: string;
  echo: {
    subject: string;
    amount: number;
    startDay: number;
    category: string;
  };
}

// ------------------------- 成员明白账 -------------------------

export interface MemberPayment {
  memberId: string;
  participatedTons: number;
  procureCostYuan: number;     // 境外采购支出（元）
  purchasePriceYuan: number;   // 境内收购价款（元）
  prepaidYuan: number;         // 已预付（元）
  tailYuan: number;            // 尾款（元）
  tailTriggerDay: number;      // 尾款触发日（批次验收日）
  tailPaid: boolean;
  actualReceiptNote: string;
}

// ------------------------- 审计 -------------------------

export interface AuditEntry {
  seq: number;
  at: string;
  type: string;
  ref: string;
  hash: string;
  detail: string;
}
