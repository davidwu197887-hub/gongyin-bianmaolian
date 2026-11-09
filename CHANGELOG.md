# 版本说明与新旧差异

## 3.0.0（2026-11-09，`feature/financing-mode-v3`，基于 2.0 分支 `1c0eebc`）

### 新增

- 引擎：可选的批次专项额度 `Config.tranche`（TS）与 `simulate(..., financing=)`（Python）。专项只能由甲用于指定批次的采购及该批成员尾款；不循环；在提款窗口内、无欠息、还款来源批次已验收且付款日早于到期日、当日乙对甲无逾期应付时才可提；先用现金和一般额度；日终回笼先还专项。新增结果字段 `general_peak_A`、`tranche_*`。
- Python 端补齐 2.0 只在 TS 中存在的 `facility_changes`。
- 流程：`financingPlan()`、`confirmReceivable()`、`reviewSignals()`、`arrangements()`、`execConfig()`；`submitBank()` 增加融资结构参数，`bankDecision()` 增加专项条件参数，`acknowledgeBank()` 写入 `state.tranche`。专项只在其依据规则生效后进入执行投影。
- 防错：同一业务依据不能重复申请融资；专项存续期间不能再申请；银行条件超出还款来源或用途、到期日早于还款来源付款日或晚于一般额度到期日时拒绝；乙未确认应付时不能批准；经营角色不能作出或回填银行结论。
- 页面（并入"金融转译与核查"）：融资支持方案说明、提款前条件、确定性安排对照、计算线程情景对照、银行专项条件输入、按获批条件执行的前后对照、复核提示。
- 履约台账：专项提款与归还的模拟银行凭证。
- 快捷场景 `?scene=financing`、`?scene=financing-stress`。
- 研究脚本 `model/financing_study.py` 及对照脚本；测试 `scripts/check-financing.mjs`、`check-financing-study.mjs`、`check-financing-crosscheck.mjs`、`e2e/financing.spec.ts`。
- 文档 `docs/v3/`。

### 未改变

- 2.0 的参数、情景样本、30条参考路径、2874个研究字段、12项不变量与33项流程检查全部保持；不传入专项时引擎计算与 2.0 逐位相同。
- 一般额度调整（2.0 的31万元模拟批准流程）作为可选融资结构保留。

### 兼容性

- 本地存储改为 `bianmao.v3`（`schema: 3`），不读取 2.0 的 `bianmao.v2` 记录。
- 单文件 HTML 约1.95MB。

## 2.0.0

### 版本来源核验（2026-11-09）

| 对象 | 核验方式 | 结论 |
| --- | --- | --- |
| GitHub `main`（`0fb4914`，2026-10-08） | 75个跟踪文件逐一计算 Git blob 哈希，与《旧版demo_完整源码.zip》比较 | 75个文件内容全部一致；ZIP另含未入库的 `.gitignore`、`MANIFEST.sha256` 和 `dist/`（4个文件） |
| 原 CloudBase 网站 | 只读下载首页及 `assets/index-B4Pu-eMX.js`、`assets/index-CKwsZsmV.css`，计算 SHA-256 | 三个文件与旧版 ZIP 的 `dist/` 逐字节一致，线上为 v1.0 |
| 《工银边贸智链_新版演示(1).html》 | SHA-256 | 与复现包 `04_web_CH2_CH3_CH5/dist/index.html`、`demo.html`、`index.html` 一致（`bdba5ad9…71b0b5`） |
| 复现包前端源码 | 在独立目录 `npm ci` 后重新 `npm run build` | 生成的 HTML 与交付 HTML 字节一致，源码完整且可独立构建 |
| 复现包 Python 模型 | `export_web_reference.py` 重新生成前端情景输入与参考路径 | `src/scenarios.ts`、`tests/reference.json` 去除换行差异后与交付文件一致；`verification/reference_model.py` 与 `joint_model.py` 字节一致 |

### 新增功能（2.0）

- 五批连续采购（32、44、36、48、40吨）的逐日事件仿真，甲乙双主体分别记账，付息准备金、计息、结息、清偿和额度到期分别处理（`src/engine.ts`）。
- 规划口径（不设额度，识别维持采购日历的资金需要）与受限执行口径（甲乙各20万元、第120日到期）分开计算。
- 蒙特卡洛情景：基准12000条、温和与严峻各6000条固定样本；P50/P90/P95、同步峰值与联合覆盖；浏览器独立计算线程（`src/study.ts`、`src/worker.ts`）。
- 第20日历史匹配：逐项比对截至观察日的资金、数量和收付款，保留3969条兼容路径，原安排与草案共用样本。
- 独立风险核查（`RISK_REVIEW`），新增融资金额为0时也可提交。
- 银行办理状态：等待核查、待补充材料、已批准（模拟）、未获批准（模拟）、核查完成、办理回执已回填；客户补件后重新进入核查。
- 获批额度通过办理回执写入 `facilityChanges`，自下一日用于执行投影；已发生的本金记录保持不变。
- 履约证据分为待核验、存在差异、已核验三种状态；银行日终对账仅能由客户经理视图核验。
- 成员核对申请与合作组织回复；成员角色只开放“成员明白账”。
- Python 离线参考模型（`model/`）及与前端共用的情景样本和30条参考路径。
- `?scene=risk` 快捷场景；浏览器本地保存演示状态（`localStorage` 键 `bianmao.v2`，`schema: 2`）。

### 修改的功能

| 项目 | v1.0（main） | v2.0（本分支） |
| --- | --- | --- |
| 贯穿案例 | 200吨 Day20 全部验收比较A/B；履约案例为188/12吨分批，Day35现金检查点 | 五批连续业务；第20日将第三至第五批账期由5日改为15日 |
| 关键数值 | 剩余12吨账期5→15日，Day35现金24.77→18.11万元，缺口约1.89万元 | 甲资金需要峰值17.064→30.672万元，对照20万元额度待筹10.672万元；受限执行下第五批采购40→42日、回款65→68日；甲清偿44→54日 |
| 方案比较 | A/B两方案 | 短账期、长账期、长账期＋30%贸易预付三组候选，含两端分批对照 |
| 金融需求对象 | `FinancialNeed`（金额单位万元，仅提交 `PENDING_BANK_REVIEW`） | `translateNeed()` 返回对象，存入 `BankCase.need`（金额单位元），银行状态可继续流转 |
| 银行接口 | `mockBankApi` 内存返回受理回执 | `workflow.ts` 中 `submitBank`、`bankDecision`、`supplement`、`acknowledgeBank` 模拟完整办理流程 |
| 摘要 | FNV-1a，键排序序列化，`0x` 前缀 | FNV-1a，按 `JSON.stringify` 序列化，`B` 前缀 |
| 工程结构 | Vite 多文件构建，`dist/index.html`＋`assets/` | esbuild 单文件构建，`dist/index.html` 内嵌脚本、样式、计算线程与情景数据（1 916 000 字节） |
| 测试 | vitest 单元测试、Playwright smoke/rehearsal、HTTPS 与源码审计脚本 | node 断言脚本：参考路径、业务流程、情景研究；本分支补充不变量、逐路径对照与 Playwright 浏览器测试 |

### 保留的功能与口径

- 八个工作区：联合测算、方案对比、共同规则、履约台账、变化重算、金融转译与核查、成员明白账、版本与留痕。
- `Rule-V1` 为首个有效规则；变更以 `Draft-V2` 等草案形式提出，甲乙均确认后才生效，草案依据变化时拒绝生效。
- 银行结论与合同确认分别记录；银行批准不代替经营主体确认。
- 已到期批次保留原依据；已发生的履约事实不被草案改写。
- 成员首批100元尾款：验收核验形成应付，独立支付回执核验后才记为实付。
- 快捷场景 `?scene=compare`、`?scene=recalculate`、`?scene=translate`。
- 页面顶部始终标明“竞赛原型 · 模拟业务与银行回执”，融资审批与实际支付由银行独立办理。

### 可能退化或需要注意的事项

- v1.0 的 `&capture=1` 截图模式在 v2.0 中不存在。
- v1.0 的 vitest 单元测试、红队测试、HTTPS smoke 和源码审计脚本未随 v2.0 交付；这些文件保留在 `0fb4914` 历史中，未移植到新引擎。
- v1.0 的“188/12吨、Day35”案例及其数值不再出现在界面和文档中，这是新版产品计划书口径的替换，不应与 v2.0 数值混用。
- `npm run dev` 打开的是已构建的单文件 `index.html`，源码修改需重新 `npm run build` 才能在页面看到。
- 手机宽度下宽表格在表格容器内横向滚动，页面本身无横向溢出；“业务说明”列的长文字需要横向滑动查看。
- 单文件 HTML 约1.9MB，情景数据在页面和计算线程中各内嵌一份。

### 数据结构兼容性

v2.0 未提供 v1.0 对象的读取或迁移代码。v1.0 的状态只保存在内存中，刷新即重置；v2.0 只读取 `localStorage` 中 `bianmao.v2` 且 `schema === 2` 的记录，因此没有需要迁移的旧版存储数据。若后续模块需要 v1.0 的 `FinancialNeed` 字段，可按下表从 `translateNeed()` 结果换算：

| v1.0 `FinancialNeed` | v2.0 `translateNeed()` |
| --- | --- |
| `subject` | `subject` |
| `amount`（万元） | `amount`（元，÷10000） |
| `startDay` / `expectedEndDay` | `startDay` / `endDay` |
| `purpose` | `purpose` |
| `repaymentAmount` / `expectedRepaymentDay` | `receiptAmount` / `receiptDay`（另有 `receiptBatch`） |
| `requiredMaterials` | `needs`、`missing` |
| `cashFlowImpact.beforeGap` / `incrementalGap` | `originalPeak`、`proposedPeak`、`increment`、`waiting` |
| `createsNewFinancialNeed` | `kind === "FINANCING"` 且 `amount > 0` |
| `trigger`、`suggestedNeedCategory`、`changeOnReceiptDelay` | 无对应字段 |
