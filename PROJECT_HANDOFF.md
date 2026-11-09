# PROJECT_HANDOFF：工银边贸智链 Demo 2.0 工程交接

> 3.0（`feature/financing-mode-v3`）的工程交接见 `docs/v3/PROJECT_HANDOFF_V3.md`。本文件记录 2.0 现状，保留原文。

编写：ClawsGO Science Agent，2026-11-09。供下一阶段授信模式研发使用。本文只描述 Demo 2.0 现状，不包含新的授信模式设计。

## 1. 版本与位置

| 项目 | 内容 |
| --- | --- |
| 仓库 | https://github.com/davidwu197887-hub/gongyin-bianmaolian |
| 默认分支 | `main`，仍为 v1.0（`0fb4914`，2026-10-08），本次未改动 |
| 2.0 分支 | `feature/demo-v2-integration` |
| 2.0 提交 | `ace5334` 按交付原样导入 2.0 源码；其后的提交补充测试与文档（以 `git log` 为准） |
| 本地开发目录 | `半决赛\demo-v2-workspace\repo` |
| 本地完整源码 | `半决赛\交付成果\Demo2.0_完整源码.zip`（不含 node_modules，可独立 `npm ci`） |
| 静态部署文件 | `半决赛\交付成果\CloudBase_静态部署文件\`、`CloudBase_静态部署包.zip` |
| 源码来源 | 《工银边贸智链_全文数据与代码复现包(1).zip》中 `04_web_CH2_CH3_CH5` 与 `02_model_CH3_CH4` |

## 2. 环境要求

- Node.js ≥ 22.12（实测 22.22.2），npm 10。依赖锁定在 `package-lock.json`，运行时只依赖 React 18。
- 浏览器测试：Playwright 1.63，默认调用 Windows Edge。
- Python 模型：Python 3.12+（实测 3.13.5），numpy 2.3.5，pandas 2.2.3（`model/requirements.txt` 另列 matplotlib、Pillow，仅交付包绘图使用）。
- 运行时不访问网络：无 CDN、无在线字体、无后端接口。

## 3. 模块结构

| 模块 | 职责 | 主要导出 |
| --- | --- | --- |
| `src/engine.ts` | 甲乙双主体五批逐日事件仿真；资金、额度、计息、清偿、数量链条与守恒校验 | `simulate`、`defaultConfig`、`plans`、`planOf`、`planningConfig`、`deterministic`、`validate`、`QUANTITIES`、`PURCHASE_DAYS` |
| `src/workflow.ts` | 规则版本、按责确认、证据登记核验、需求转译、银行办理、成员核对、操作留痕 | `createRule`、`confirmRule`、`activate`、`propose`、`withdraw`、`execution`、`evidenceSchedule`、`loadHistory`、`translateNeed`、`submitBank`、`bankDecision`、`supplement`、`acknowledgeBank`、`memberView`、`addDispute`、`replyDispute` |
| `src/study.ts` | 固定样本情景分析、分位数、覆盖率、第20日历史匹配 | `study`、`sampleAt`、`quantile` |
| `src/worker.ts` / `workerCode.ts` | 浏览器计算线程；`workerCode.ts` 由构建生成，勿手改 | — |
| `src/scenarios.ts` | 基准12000、温和6000、严峻6000条情景输入（base64），由 Python 生成 | `scenarioInputs` |
| `src/main.tsx` | 八个工作区页面、角色切换、快捷场景、本地存储 | — |
| `model/joint_model.py` | Python 参考引擎，与 `engine.ts` 逐路径一致 | `simulate`、`make_scenarios`、`Config`、`Plan` |
| `model/run_study.py` | 完整研究：候选方案、情景、敏感性、滚动匹配 | — |

函数均为纯函数风格：输入 `State` 返回新 `State`，权限不符或状态不允许时抛出中文错误。

## 4. 关键数据结构

- `Config`（`engine.ts`）：经营与资金参数，金额单位元。`limit_A/limit_B` 为 `null` 时表示不设额度（规划口径）。`facility_changes` 记录银行回执生效后的额度变更：`{day, party, limit, maturityDay}`。
- `Plan`：价格、账期、贸易预付比例、整批采购/整批收款开关、逐批账期 `terms`、`rule_id`、`counterfactual`。
- `Scenario`：五批数量 `q`（合计必须200吨）、口岸与下游延迟（21个10日区间）、逐批额外延迟、下游冻结标记。
- `Result`：峰值 `peak_A/peak_B/peak_joint`、利息、清偿日 `settlement_day_A/B`、业务结清日、逐批日期数组、守恒误差 `conservation_max_abs_error`；`trace: true` 时含逐日 `days`。
- `Rule`（`workflow.ts`）：`version`（`Rule-V1`、`Draft-V2`…）、`plan`、`config`、`hash`、`confirmed`（`["甲","乙"]`）、`basedOn`、`createdDay`。
- `Evidence`：`id`（如 `accept-0`、`tail-0-8`、`close-20`）、`kind`（PURCHASE、ACCEPT、MEMBER_PAY、TRADE_PAY、EXTERNAL_RECEIPT、BANK_CLOSE）、`status`（待核验 / 存在差异 / 已核验）、日终记录附 `balances`。
- `BankCase`：`kind`（FINANCING / RISK_REVIEW）、`party`、`amount`（元）、`need`（`translateNeed()` 快照）、`ruleHash`、`draftHash`、`status`（PENDING_BANK_REVIEW、NEEDS_MATERIAL、APPROVED、NOT_APPROVED、REVIEW_COMPLETED、EXECUTED）、`approvedLimit`、`followUpDay`、`receiptId`。
- `State`：`role`、`effective`、`initial`、`draft`、`history`、`day`、`facilityChanges`、`evidence`、`cases`、`audit`、`disputes`。浏览器保存在 `localStorage["bianmao.v2"]`，`schema: 2`。
- `translateNeed()` 返回：`subject`、`amount`、`originalPeak`、`proposedPeak`、`increment`、`waiting`、`startDay`、`endDay`、`purpose`、`receiptBatch/Day/Amount`、`existingDebt`、`existingConfirmed`、`maturityDay`、`clearBefore/After`、`duePrincipal`、`evidenceCount`、`verifiedCount`、`missing`、`needs`、`ruleHash`、`draftHash`。

## 5. 模型参数（`defaultConfig`，与 `model/joint_model.py` 一致）

| 参数 | 值 | 参数 | 值 |
| --- | --- | --- | --- |
| 观察期 | 180日 | 五批数量 | 32、44、36、48、40吨 |
| 计划采购日 | 第0、9、19、31、40日 | 甲 / 乙自有资金 | 15 / 20万元（含付息准备金各0.5万元） |
| 甲 / 乙额度 | 各20万元，第120日到期 | 年利率 | 甲乙各4%，按日计提，每30日或清偿时结息 |
| 成员预付 / 收购总价 | 3500 / 3600元/吨 | 物流 | 100元/吨；每次采购组织费600元 |
| 运输 | 6日 | 验收 / 加工能力 | 30 / 20吨/日 |
| 加工成本 | 200元/吨 | 成品回款 | 4200元/吨原料，账期15日 |
| 交付宽限 | 10日 | 逾期利息冻结新增提款 | 是 |
| 甲向乙售价 | 短账期3780元/吨、5日；长账期3800元/吨、15日 | 贸易预付 | 长账期方案可选30% |

情景：基准种子20261106（12000条），温和与严峻种子20261107（各6000条）；口岸与下游状态为四状态马尔可夫链，逐批额外延迟独立抽样。第20日历史匹配保留3969条。

## 6. 已实现与未实现

已实现（均为模拟数据与模拟办理）：五批连续采购与双主体现金流；规划需要与受限执行；三组经营方案比较与两端分批对照；Rule-V1 规则、按责确认、草案与生效；履约证据登记与核验；第20日例外重算与合同草案确认；蒙特卡洛情景 P50/P90/P95、覆盖率与第20日历史匹配；金融需求转译、证据状态与既有借款；零新增融资风险核查；银行补件、模拟批准/未批准、办理回执回填；成员款项查询、支付回执与核对申请；版本与操作留痕导出。

未实现：真实身份认证与授权；后端与数据库（状态只在浏览器本地）；真实银行审批、授信、支付与回执；海关、口岸、联盟链、国密签名等外部接口；信用评分、智能授信、自动审批、动态提额；多组交易或企业整体财务的合并分析；情景参数的真实样本校准；v1.0 的截图模式 `&capture=1`。

## 7. 测试状态（2026-11-09 实际运行，详见 VERIFICATION.md）

通过：`typecheck`；`npm test`（6540项参考路径数值、33项流程）；`test:study`（13项）；`test:invariants`（12项，含96000条路径逐日不变量）；Python 完整研究 2874 字段；`test:crosscheck`（192000条路径逐路径一致）；`build`（与交付 HTML 字节一致）；`test:e2e`（7项，Edge 桌面、手机 390×844、file://）。

尚存问题：手机宽度下长表格需在容器内横向滑动；`npm run dev` 显示的是已构建的 `index.html`；单文件约1.9MB；仅测试 Edge；未在 CloudBase 公网环境验证 2.0；v1.0 的 vitest 单元测试未移植。

## 8. 部署状态

- 原 CloudBase 网站（`bianmaolian-demo-…tcloudbaseapp.com`）仍为 v1.0：2026-11-09 只读下载的首页、JS、CSS 与旧版 `dist/` 逐字节一致，Last-Modified 为 2026-10-08。本次未登录或操作腾讯云。
- 2.0 静态部署文件已构建并在本地验证，上传步骤见《部署说明.md》。上传需用户授权并由有权限的人员操作。
- GitHub：2.0 位于 `feature/demo-v2-integration`，经 Pull Request 审查后再决定是否合并到 `main`。

## 9. 后续扩展融资支持机制时可复用的模块

- `simulate()`：任何新的融资安排都可表达为 `Config` 中的额度、到期日、利率或 `facility_changes`，在同一引擎上比较规划与执行结果。
- `translateNeed()`：从规则与草案差异生成需求主体、金额、窗口、回款依据与既有借款，可作为新机制的输入。
- `submitBank` / `bankDecision` / `supplement` / `acknowledgeBank`：模拟银行办理状态机，新增事项类型时沿用“经营主体提交、客户经理决定、回执生效”的分工。
- `study()`：在固定样本上比较不同安排的分位数与覆盖率；新机制应使用同一样本，便于对照。
- `model/joint_model.py` 与 `scripts/check-crosscheck.mjs`：修改引擎时保持 Python 与 TypeScript 同步，并用逐路径对照验证。
- `scripts/check-invariants.mjs`：作为回归测试，新增功能不应破坏其中任何一项。

## 10. 不得擅自改变的计算口径与审批边界

1. 金额以元计算，界面按万元显示；不得改为四舍五入后再计算。
2. 五批数量合计200吨、计划采购日、价格、账期、利率、额度、到期日、成本与回款参数，以本文第5节为准；改动须有产品计划书依据并同步修改 Python 模型与参考数据。
3. 规划口径（不设额度）识别资金需要；受限执行口径（20万元额度）反映实际可执行路径。17.064→30.672万元、待筹10.672万元属于规划口径；第五批40→42日、回款65→68日属于受限执行口径；不得混用。
4. 资金守恒、额度上限、到期后不新增提款、付息准备金包含在自有资金内，这些约束不能放宽。
5. 已发生的履约事实与已核验记录不能被草案或银行结果改写；已到期批次保留原依据。
6. 银行结论只能由客户经理角色作出；经营主体只能提交需求与补件。银行批准不代替甲乙对合同草案的确认。
7. 风险核查不产生额度变更，不能记录为“批准”。
8. 获批额度只能经办理回执自下一日起进入执行投影。
9. 所有银行办理、回执、合同与身份均为模拟；对外表述不得称已接入中国工商银行生产系统。
10. 不在 Demo 中加入信用评分、智能授信、自动审批或动态提额，除非经过论证并单独立项。
