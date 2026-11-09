import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NAV = ["联合测算", "方案对比", "共同规则", "履约台账", "变化重算", "金融转译与核查", "成员明白账", "版本与留痕"];
const shots = "verification/screenshots";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
  return errors;
}
const nav = (page: Page, name: string) => page.locator("nav button", { hasText: name }).click();
const role = (page: Page, value: string) => page.getByLabel("演示角色").selectOption(value);
async function overflow(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
  });
}

test("首页、八个工作区与外部请求", async ({ page }) => {
  const errors = watchErrors(page);
  const external: string[] = [];
  page.on("request", (r) => !r.url().startsWith("http://127.0.0.1:4173") && !r.url().startsWith("data:") && !r.url().startsWith("blob:") && external.push(r.url()));
  await page.goto("/");
  await expect(page).toHaveTitle(/工银边贸智链/);
  await expect(page.locator(".prototype-bar")).toContainText("融资审批与实际支付由银行独立办理");
  await expect(page.locator("nav button")).toHaveCount(8);
  for (const name of NAV) {
    await nav(page, name);
    await expect(page.locator("main h2")).toHaveText(name);
    const o = await overflow(page);
    expect(o.scrollWidth, name + " 横向溢出").toBeLessThanOrEqual(o.clientWidth);
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("第20日案例：账期草案重算→融资需求→补件→模拟批准→回执→草案生效", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "载入第20日模拟案例 →" }).click();
  await expect(page.locator("main h2")).toHaveText("履约台账");
  await expect(page.locator(".context")).toContainText("Rule-V1 有效");
  await expect(page.locator(".context")).toContainText("观察时点 D20");
  await nav(page, "变化重算");
  await role(page, "FACTORY");
  await page.getByRole("button", { name: "生成变更草案并重算" }).click();
  await expect(page.locator(".context")).toContainText("Draft-V2 待确认");
  const cards = page.locator(".compare-cards");
  await expect(cards).toContainText("17.064");
  await expect(cards).toContainText("30.672");
  const table = page.locator("table", { hasText: "甲对照额度的待筹峰值" });
  await expect(table.locator("tr", { hasText: "甲对照额度的待筹峰值" })).toContainText("10.672");
  await expect(table.locator("tr", { hasText: "第五批采购日" })).toContainText("第40日第42日");
  await expect(table.locator("tr", { hasText: "第五批成品回款" })).toContainText("第65日第68日");
  await expect(table.locator("tr", { hasText: "甲本组借款最终清偿" })).toContainText("第44日第54日");
  await page.screenshot({ path: `${shots}/desktop-04-recalculate.png`, fullPage: true });

  await role(page, "COOP");
  await nav(page, "金融转译与核查");
  const needTable = page.locator("table", { hasText: "需求主体" });
  await expect(needTable).toContainText("17.064 / 30.672万元");
  await expect(needTable).toContainText("13.608 / 10.672万元");
  await expect(needTable).toContainText("第40日至第42日");
  await expect(needTable).toContainText("第44日 → 第54日");
  await expect(needTable).toContainText("14.664万元");
  await page.getByRole("button", { name: "提交融资需求包" }).click();
  await expect(page.locator(".case-selector")).toContainText("融资 · 甲 · 等待银行核查");
  await page.getByRole("button", { name: "进入客户经理视图" }).click();
  await page.getByLabel("核查意见").fill("请补充企业其他收支与全口径债务");
  await page.getByRole("button", { name: "要求补充材料" }).click();
  await expect(page.locator(".case-selector")).toContainText("待补充材料");
  await role(page, "COOP");
  await page.getByPlaceholder("填写补充材料名称、来源与核对说明").fill("已补充销售合同与债务清单（模拟）");
  await page.getByRole("button", { name: "提交补充材料" }).click();
  await expect(page.locator(".case-selector")).toContainText("等待银行核查");
  await role(page, "BANK");
  await page.getByLabel("核查意见").fill("依据模拟材料批准总额度31万元");
  await page.getByRole("button", { name: "记录批准结果（模拟）" }).click();
  await expect(page.locator(".case-selector")).toContainText("已批准（模拟）");
  await expect(page.locator(".context")).toContainText("Draft-V2 待确认");
  await page.getByRole("button", { name: "回填办理回执" }).click();
  await expect(page.locator(".case-selector")).toContainText("办理回执已回填");
  await expect(page.locator("table", { hasText: "办理编号" })).toContainText("RCPT-");
  await page.screenshot({ path: `${shots}/desktop-05-bank-feedback.png`, fullPage: true });

  await role(page, "COOP");
  await nav(page, "变化重算");
  await page.getByRole("button", { name: /身份确认草案/ }).click();
  await page.getByRole("button", { name: "使已确认草案生效" }).click();
  await expect(page.locator(".context")).toContainText("Draft-V2 有效");
  await nav(page, "版本与留痕");
  await expect(page.locator("main")).toContainText("Rule-V1");
  await expect(page.locator("main")).toContainText("办理回执回填");
  expect(errors).toEqual([]);
});

test("零新增融资：独立发起风险核查并回填回执", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=risk");
  await nav(page, "金融转译与核查");
  await page.getByLabel("办理类型").selectOption("RISK_REVIEW");
  await expect(page.locator("table", { hasText: "需求主体" })).toContainText("0元，提交风险核查事项");
  await page.getByRole("button", { name: "发起风险核查" }).click();
  await expect(page.locator(".case-selector")).toContainText("核查 · 甲 · 等待银行核查");
  await role(page, "BANK");
  await expect(page.getByRole("button", { name: "记录批准结果（模拟）" })).toHaveCount(0);
  await page.getByLabel("核查意见").fill("核对回款与既有借款，按约跟踪");
  await page.getByRole("button", { name: "记录核查完成" }).click();
  await page.getByRole("button", { name: "回填办理回执" }).click();
  const t = page.locator("table", { hasText: "办理编号" });
  await expect(t).toContainText("核查完成");
  await expect(t).toContainText("第25日");
  await expect(t).toContainText("RCPT-");
  expect(errors).toEqual([]);
});

test("浏览器计算线程：12000条情景与第20日历史匹配（保留3969条）", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=recalculate");
  await nav(page, "方案对比");
  const panel = page.locator(".panel, section", { hasText: "未来情景与滚动区间" }).last();
  await page.getByLabel("按第20日已核验历史匹配").check();
  await page.getByRole("button", { name: "运行情景分析" }).click();
  await expect(page.locator("main")).toContainText("共12,000条先验路径，匹配后保留3,969条", { timeout: 90000 });
  const result = page.locator("table", { hasText: "甲需求峰值P50（万元）" });
  await expect(result.locator("tr", { hasText: "甲需求峰值P50（万元）" })).toContainText("17.1030.67");
  await expect(result.locator("tr", { hasText: "甲需求峰值P90（万元）" })).toContainText("17.7030.76");
  await expect(panel).toBeVisible();
  await page.screenshot({ path: `${shots}/desktop-02-scenarios.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("成员视图：只开放成员明白账，查询第1批款项", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=risk");
  await role(page, "MEMBER");
  await expect(page.locator("main h2")).toHaveText("成员明白账");
  await expect(page.locator("nav button", { hasText: "变化重算" })).toBeDisabled();
  await expect(page.locator("main")).toContainText("已支付（模拟回执已核验）");
  await page.getByPlaceholder("例如：本人批次已验收，尾款支付记录仍需核对").fill("请核对尾款支付依据");
  await page.getByRole("button", { name: "以成员身份提出核对" }).click();
  await expect(page.locator("main")).toContainText("请核对尾款支付依据");
  expect(errors).toEqual([]);
});

test("手机尺寸 390×844：各工作区无页面级横向溢出", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto("/?scene=translate");
  const found: string[] = [];
  for (const [i, name] of NAV.entries()) {
    await nav(page, name);
    await expect(page.locator("main h2")).toHaveText(name);
    const o = await overflow(page);
    if (o.scrollWidth > o.clientWidth) found.push(`${name}: ${o.scrollWidth}>${o.clientWidth}`);
    if ([0, 4, 5].includes(i)) await page.screenshot({ path: `${shots}/mobile-0${i + 1}-${name}.png`, fullPage: true });
  }
  expect(found).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("单文件 demo.html 以 file:// 打开并运行计算线程", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(pathToFileURL(path.resolve("demo.html")).href);
  await expect(page).toHaveTitle(/工银边贸智链/);
  await nav(page, "方案对比");
  await page.locator("label", { hasText: "样本数" }).locator("select").selectOption("1000");
  await page.getByRole("button", { name: "运行情景分析" }).click();
  await expect(page.locator("main")).toContainText("共1,000条先验路径", { timeout: 60000 });
  expect(errors).toEqual([]);
});
