# 部署说明：手动上传 Demo 2.0 到腾讯云 CloudBase 静态网站托管

编写：ClawsGO Science Agent，2026-11-09。本次任务未登录或修改任何腾讯云环境；以下步骤由有权限的人员在确认后自行操作。

## 1. 上传什么

上传“CloudBase_静态部署文件”目录中的内容，或其压缩副本“CloudBase_静态部署包.zip”。不要上传完整源码 ZIP。

| 文件 | 说明 |
| --- | --- |
| `index.html` | 站点入口。单文件页面，内嵌全部脚本、样式、计算线程与情景数据，1 916 000 字节 |
| `demo.html` | 与 `index.html` 字节一致。保留此文件名，使旧版指向 `/demo.html` 的链接继续可用 |
| `THIRD_PARTY_NOTICES.txt` | 第三方许可声明，公开发布时保留 |
| `SHA256SUMS.txt` | 上述文件的 SHA-256，用于上传后核对 |

2.0 页面不引用任何 `assets/` 文件、外部 CDN、在线字体或后端接口。计算线程通过页面内的 Blob URL 创建，不需要单独的 Worker 文件。快捷场景使用查询参数（`?scene=compare` 等），不需要服务器路由配置。

## 2. 上传前

1. 确认目标环境。原演示地址 `https://bianmaolian-demo-d3ewx9xaf72c1b0-1501621896.tcloudbaseapp.com/` 当前为 v1.0，覆盖 `index.html` 后二维码将直接打开 2.0。若需保留 v1.0 线上访问，先在控制台下载备份现有 `index.html`、`demo.html` 与 `assets/`，或改用新的环境或子目录。
2. 核对文件：在部署目录中运行 `certutil -hashfile index.html SHA256`（Windows）或 `sha256sum index.html`，结果应为 `bdba5ad99a99873b18f4ff8b24bf1d2754e1674a3bfdc1fa909e78e18e71b0b5`。

## 3. 控制台上传

依据腾讯云开发官方文档[纯静态项目部署](https://docs.cloudbase.net/hosting/web-hosting-static#1)与[部署方式](https://docs.cloudbase.net/hosting/web-hosting#1)：

1. 登录腾讯云开发控制台，选择原演示所在环境，进入左侧“静态网站托管”。
2. 方式一（逐个文件）：在站点根目录点击“上传文件”，选择 `index.html`、`demo.html`、`THIRD_PARTY_NOTICES.txt`，同名文件覆盖。
3. 方式二（部署包）：点击“新建部署”，选择上传代码包，上传 `CloudBase_静态部署包.zip`。该 ZIP 根目录直接是 `index.html` 等文件，安装命令和构建命令留空，产物目录填 `.`，部署路径填 `/`。
4. 不要再套一层 `dist/` 目录；`index.html` 必须位于站点根目录。
5. 原有 `assets/index-B4Pu-eMX.js` 等 v1.0 文件不会被 2.0 引用，可保留作备份，也可在确认 2.0 正常后删除。

## 4. 上传后验证

1. 用无痕窗口打开站点根地址，页面标题为“工银边贸智链｜边民互市经营协同与融资需求联动平台”，顶部显示“竞赛原型 · 模拟业务与银行回执”，导航为八个工作区，标签显示“珲春俄豆 · 五批连续业务”。如仍看到旧页面，强制刷新或等待 CDN 缓存更新。
2. 打开 `?scene=recalculate`：变化重算页显示甲资金需要 17.064 → 30.672 万元。
3. 打开 `?scene=translate`：金融转译页显示待筹 10.672 万元、第40日至第42日、清偿第44日 → 第54日。
4. 在“方案对比”运行情景分析（12000条），确认进度条走完并出现 P50/P90 表格，说明计算线程在该域名下可用。
5. 用手机扫码打开，确认可以切换工作区。
6. 可下载线上 `index.html` 计算 SHA-256，与第2节的值比对。

## 5. 回退

若需恢复 v1.0：重新上传第2节备份的 `index.html`、`demo.html` 与 `assets/`；或从仓库 `main` 分支（提交 `0fb4914`）执行 `npm ci && npm run build`，上传其 `dist/` 内容（本次未验证该重新构建结果是否与线上旧文件一致）。

## 6. 本地预览（不经过 CloudBase）

在部署目录执行 `python -m http.server 8000`，访问 `http://127.0.0.1:8000/`。也可直接双击 `demo.html` 用 Edge 或 Chrome 打开（已实测 `file://` 下计算线程可运行）。
