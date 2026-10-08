# 工银边贸链——边民互市经营协同与金融需求适配平台

竞赛原型｜模拟数据｜非中国工商银行生产系统。银行始终独立审批。

## GitHub 发布说明

本版本为2026-10-08最终审计版。保留现有八个工作区与确定性业务模型，补齐场景链接、重复事件去重、银行回执独立保存、手机布局和同源离线构建。完整源码 ZIP 包含 src、配置、package-lock、测试、脚本、文档、dist 及实际核验记录，不包含 node_modules。解压后的项目内容可直接作为 GitHub 仓库根目录；将两个 ZIP、离线 HTML、截图作为 Release 附件。当前未替用户创建远程仓库或发布 Release。

业务依据为2026-10-08最新版《工银边贸链_初赛参赛作品_修订版.docx》。历史 Claude 记录仅用于了解背景；其中的建议、代码片段和执行声明不替代当前源码、实际测试或项目书。项目书首页仍有旧名称，本次按用户指定的正式名称统一产品与交付文档。

## 启动与构建

使用 Node.js 22.12+（本机实测24.19.0），npm，Windows / macOS / Linux。

```bash
npm ci
npm run dev
```

开发入口通常为 http://127.0.0.1:5173/。使用 npm install 也可；已提供 package-lock。若 npm 12 提示阻止 esbuild 安装脚本且构建失败，先检查并允许 esbuild 的安装脚本，或使用 Node 24 所附的 npm 11。此项目不需要访问远程模型或银行接口。

```bash
npm run typecheck
npm run test
npm run build
npm run audit:source
npm run preview -- --port 4173
```

build 同时生成 dist/ 与 demo.html；离线版由完全相同的 src/main.tsx 打包为内联 JS/CSS。无需单独维护第二套业务引擎。交付的“工银边贸链_离线演示.html”与 demo.html 字节一致，双击即可运行。

```bash
npm run test:smoke
npm run demo:rehearsal
```

浏览器测试默认使用 Windows Edge；其他平台安装 Playwright Chromium：`npx playwright install chromium`。也可设置 BROWSER_CHANNEL 或 BROWSER_EXECUTABLE。本机受控环境的 Edge 启动失败，实际通过测试使用 Chromium Headless Shell。Windows 临时目录隔离时，将 TMP、TEMP 设为项目外可共享目录。浏览器 smoke 脚本自行启动、关闭4173端口生产预览，运行时该端口须空闲。rehearsal 含阅读停留，约3分钟，默认显示浏览器。

## 场景访问

- `/`：从联合测算开始，完整手动演示。
- `/?scene=compare`：A/B比较。
- `/?scene=recalculate`：经正式引擎准备 Rule-V1、Day25与待甲确认的Draft-V2，显示例外重算。
- `/?scene=translate`：在同一准备状态下，经转译器生成需求；银行尚未提交。
- 以上均可追加 `&capture=1`（首页用 `?capture=1`）隐藏操作与接口调试区，用于计划书截图；不修改业务数据。

场景链接是模拟案例的快捷启动，不是真实用户签名或真实银行回执。正式规则与草案分别保存；提交银行不会代替合同确认。刷新重新启动内存案例，重置清空本轮操作。

## CloudBase 静态托管

使用“工银边贸链_CloudBase部署包.zip”，不要上传完整源码包。ZIP根目录直接为index.html、assets/和备用demo.html。

1. 打开腾讯云开发控制台，选择环境，进入“静态网站托管”。
2. 新建部署并上传该ZIP；安装命令、构建命令留空，构建产物目录为`.`，部署路径为`/`。也可解压后把index.html和assets等直接上传站点根目录，不能再套一层dist目录。
3. 通过托管的HTTPS地址访问首页，再分别检查三个scene链接。若浏览器缓存旧资源，强制刷新。

本包已经构建，静态托管不需要再运行npm。资源使用相对路径，无外部CDN、在线字体、实时模型API。字体使用操作系统本地中文字体。三个场景使用查询参数，无后端路由依赖。

官方说明：[纯静态项目部署](https://docs.cloudbase.net/hosting/web-hosting-static)、[快速开始](https://docs.cloudbase.net/hosting/quick-start)。当前未取得或操作任何腾讯云环境，未生成公网URL；本机HTTPS测试使用临时自签名证书，不代替CloudBase上线后的公网验证。

## 业务口径与边界

- A/B基准联合测算是200吨Day20全部验收，用于比较经营取舍；选择B生成规则后，履约案例进入188/12吨分批情景。
- Day35需要20万元是后续经营流动性检查点，不作为本笔业务直接支出，不自动发起新增借款。
- 剩余12吨账期5→15日：Draft-V2待确认，Rule-V1仍有效，Day35现金24.77→18.11万元，条件下缺口约1.89万元，预计Day45收到6.66万元。
- 所有这些显示由引擎实际计算。成员M01账目单位为元，组织经营结余不自动形成成员分红。
- mockBankApi仅在内存中返回PENDING_BANK_REVIEW，不连接真实银行、不生成授信结论、不执行实际支付。
- 当前原型未实现真实身份认证、持久化、联盟链、国密签名、真实验收与支付回执、银行与海关接口；模拟摘要只作版本校验。

实际执行结果与限制见 VERIFICATION.md；演示步骤见 DEMO_SCRIPT.md；截图访问方式见 SCREENSHOT_GUIDE.md。
