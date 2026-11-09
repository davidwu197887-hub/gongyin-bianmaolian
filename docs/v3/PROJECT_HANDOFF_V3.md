# PROJECT_HANDOFF_V3：工银边贸智链 Demo 3.0 工程交接

编写：ClawsGO Science Agent，2026-11-10。2.0 的交接文件 `PROJECT_HANDOFF.md` 保留原文，本文只写 3.0 新增和改变的部分。

## 1. 版本与位置

| 项目 | 内容 |
| --- | --- |
| 仓库 | https://github.com/davidwu197887-hub/gongyin-bianmaolian |
| 3.0 分支 | `feature/financing-mode-v3`，自 2.0 分支 `1c0eebc` 创建 |
| 3.0 提交 | `929a3d0` 引擎与论证；`8bddccb` 功能与测试；`50e7a6b` 文档修正；`9835793` 同步根目录 `index.html`；其后为交付文档提交（以 `git log` 为准） |
| Pull Request | #2，`feature/financing-mode-v3` → `feature/demo-v2-integration`，OPEN。#1（2.0 → `main`）仍 OPEN |
| `main` | 仍为 `0fb4914`（v1.0），未改动 |
| 本地开发目录 | `半决赛\demo-v2-workspace\repo`（与 2.0 同一工作区，已切换到 3.0 分支） |
| 交付目录 | `半决赛\交付成果\Demo3.0\` |
| 构建产物 | `dist/index.html` 1 950 708 字节，SHA-256 `d7b35375c70c9c349b2cf56bbba55e162694c56f2dee01dcdf567d72026b390e` |

## 2. 环境

与 2.0 相同：Node.js 22.22.2、npm 10.9.7、TypeScript 5.9.3、Playwright 1.63（Windows Edge）；Python 3.13.5、numpy 2.3.5、pandas 2.2.3。本机 PATH 中没有 node，开发时使用 `~/.workbuddy/binaries/node/versions/22.22.2`；Python 使用 `demo-v2-workspace/_buildcheck/.venv`（miniconda 环境缺 pandas）。

## 3. 机制要点（详见 `授信模式设计与创新性对照.md`）

批次回款衔接的专项提款安排（模拟）：由联合台账找出"计划采购日前已验收、尚未到付款日"的批次应收，作为待启动批次采购的还款依据。专项只给甲，只用于该批采购及该批成员尾款，不循环；先用现金和一般额度，不足部分才动用专项；日终回笼先还专项。平台给出缺口、还款来源、额度区间、期限、条件和提示；银行决定额度、期限、产品形式和是否批准。

## 4. 模型

### 4.1 引擎参数（`src/engine.ts` 的 `Tranche`；Python 端 `simulate(..., financing={'tranche': {...}})`）

| 字段 | 含义 | 演示取值 |
| --- | --- | --- |
| `party` | 只能为 `"A"` | A |
| `limit` | 专项额度（元），累计提款上限 | 136080 |
| `batches` | 可使用专项的采购批次（0起） | [4] |
| `openDay` / `closeDay` | 提款窗口（含两端） | 21 / 50 |
| `maturityDay` | 到期日；之后仍有专项本金记为逾期 | 62 |
| `sourceBatch` | 还款来源批次 | 2 |
| `overdueCheck` | `none` / `internal`（乙对甲到期未付）/ `chain`（另含下游） | internal |
| `freezeGeneralOnOverdue` | 专项逾期时冻结甲一般额度新提款 | true |

日初提款条件：在窗口内且早于到期日；甲无欠息；累计提款未满；`sourceBatch` 已验收且其合同付款日早于到期日；按 `overdueCheck` 无逾期。采购付款和该批成员尾款都受这些条件约束（尾款不要求还款来源条件）。

新增结果字段：`general_peak_A`、`tranche_limit`、`tranche_draws`、`tranche_peak`、`tranche_debt`、`tranche_due_at_maturity`、`tranche_overdue_days`、`tranche_blocked_days`（条件不满足且该批当日最终仍未采购的天数）、`tranche_first_draw_day`、`tranche_clear_day`。逐日记录新增 `A_tranche_debt`、`A_tranche_draws`、`tranche_open`。

不传入 `tranche` 时，`Wallet.funds()` 走 2.0 原表达式，计算逐位不变。

Python 端同时补齐了 2.0 只在 TS 中存在的 `facility_changes`；`Config` 数据类没有改动，避免 `asdict(Config)` 变化影响参考数据。

### 4.2 流程（`src/workflow.ts`）

| 函数 | 说明 |
| --- | --- |
| `execConfig(s, rule)` | 执行投影配置：`facilityChanges`，以及 `ruleHash` 与 `rule.hash` 相同时的专项 |
| `financingPlan(s)` | 方案说明：`applicable`、`reason`、`targetBatch`、`plannedDay`、`delayedDay`、`sourceBatch`、`sourceAcceptDay`、`sourceDueDay`、`receivable`、`purposeAmount`、`lower`、`upper`、`openDay`、`closeDay`、`maturityDay`、`conditions[]` |
| `confirmReceivable(s)` | 乙确认还款来源批次的应付金额与付款日，写入 `state.confirmations` |
| `reviewSignals(s)` | 复核提示：还款来源到期未收、专项到期投影余额、证据差异、下游回款逾期、采购未启动。只提示，不改状态 |
| `arrangements(s, f)` / `trancheOf()` / `extraLimitDays()` | 安排对照：原账期、草案原额度、一般提额、专项 |
| `submitBank(s, party, kind, structure)` | `structure` 默认 `GENERAL`，与 2.0 调用兼容；`TRANCHE` 时保存方案快照 |
| `bankDecision(s, id, status, feedback, limit, terms)` | 专项批准须填 `terms`；校验见第6节 |
| `acknowledgeBank(s, id)` | 专项写入 `state.tranche`，`openDay` 为回执次日 |

状态新增：`State.tranche`（`ActiveTranche`）、`State.confirmations`；`BankCase.structure`、`plan`、`terms`；证据类型 `TRANCHE_DRAW`、`TRANCHE_REPAY`。浏览器存储 `localStorage["bianmao.v3"]`，`schema: 3`。

### 4.3 情景（`src/study.ts`）

`financingStudy(req)`：`req.kind === "financing"`，在同一组路径（可按第20日历史匹配）上逐一运行 `arrangements`，返回按计划比例、采购日P90、超宽限、峰值P90、平均利息、专项提用/受阻/逾期比例、额外承诺。`worker.ts` 按 `kind` 分派。

### 4.4 离线研究（`model/`）

| 脚本 | 输出 |
| --- | --- |
| `financing_study.py` | `results/financing_study.json` 与 `verification/financing_reference.json`：11种安排 × 匹配3969条、基准12000条、严峻6000条，加确定性与持续拖欠压力、额度敏感性 |
| `report_financing.py` | 文本对照表 |
| `export_financing_crosscheck.py` | `results/financing_crosscheck.json`（约41MB，不入库） |
| `compare_study.py` | 2.0 研究结果与 `expected/` 比较 |

## 5. 页面

全部并入"金融转译与核查"工作区：融资结构选择（甲、新增融资时）→ 方案说明与提款前条件 → 确定性安排对照与情景对照按钮 → 银行办理（专项时为额度、截止日、到期日输入）→ 按获批条件执行的前后对照与复核提示。乙视图出现"确认第N批应付"按钮。履约台账出现专项提款与归还的模拟凭证。快捷场景 `?scene=financing`、`?scene=financing-stress`。

## 6. 防错规则

1. 同一业务依据（规则摘要＋草案摘要）下，同一主体只能有一项未被拒绝的融资申请。
2. 专项到期前，甲不能再申请融资（一般或专项）。
3. 专项批准须：乙已确认应付；`0 < limit ≤ min(还款来源应收, 用途支出)`；`closeDay ≥ openDay` 且晚于当前日；`maturityDay` 晚于截止日和还款来源付款日，且不晚于一般额度到期日；业务依据未变化；没有生效的专项。
4. 审批后、回执前不进入执行投影；回执后，依据规则生效前不进入执行投影。
5. 只有客户经理能作出、回填银行结论；只有乙能确认应付；只有甲能提交专项。
6. 已办结事项不能改写。
7. 引擎只用已到账现金和可提额度付款，未到账回款不能支付现实支出。

## 7. 实现状态

已实现（全部为模拟）：第1—6节内容；29项流程与不变量检查；129项情景统计对照；44组融资逐路径对照；3项新增浏览器测试。

未实现：真实银行、支付、受托支付接口；多笔专项并存；乙方专项；以多个批次合并作为还款来源；专项展期与部分提前还款；专项利率与一般额度不同的定价；信用评分、自动审批、自动提额（不应实现）。

## 8. 已知限制

- 额度区间、期限规则（截止＝计划采购日＋10日，到期＝还款来源付款日＋20日）是演示设定，不是银行政策。
- "额外承诺（万元·日）"是比较指标，不等于资本占用。
- 提款条件中的"采购单据已登记"只展示，模型不以它为提款前提。
- 情景分布未用真实样本校准。
- 安排对照的一般提额取"现有额度＋待筹峰值，向上取整到万元"，本例为31万元，与 2.0 的模拟批准一致。
- 单文件约1.95MB；手机宽度下新增宽表格同样需要在容器内横向滑动。
- 未在 CloudBase 公网环境验证 3.0；未测试 Edge 以外的浏览器。

## 9. 下一阶段（第三个 Work）需要更新的计划书内容

见 `计划书拟增补内容与位置.md`。原则：摘要不动；新增或实质修改语句以 #E2F0D9 底纹标记；已实现、模拟验证、未来规划分开写；不修改 2.0 的计算结果。

## 10. 复现命令

```sh
npm ci
npm run typecheck
npm test                         # 2.0 参考路径与流程 + 3.0 专项流程（29项）
npm run test:study
npm run test:invariants
npm run test:financing           # 29项 + 129项情景统计
python model/run_study.py && python model/compare_study.py
python model/export_crosscheck.py && npm run test:crosscheck
cd model && python financing_study.py && python export_financing_crosscheck.py && cd ..
npm run test:financing-crosscheck
npm run build
npm run test:e2e
```
