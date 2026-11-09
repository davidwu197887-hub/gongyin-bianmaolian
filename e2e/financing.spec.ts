import { test, expect, Page } from "@playwright/test";

// 3.0 批次专项提款安排（模拟）浏览器测试。2.0 的原有测试保留在 demo.spec.ts。
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
const planTable = (page: Page) => page.locator("table", { hasText: "缺口形态" });
const row = (page: Page, table: string, name: string) =>
  page.locator("table", { hasText: table }).locator("tr", { hasText: name });

test("专项方案：方案说明→乙确认应付→提交→银行条件校验→批准→回执→草案生效后按条件执行", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=financing");
  await expect(page.locator("main h2")).toHaveText("金融转译与核查");
  await expect(page.getByLabel("融资结构")).toHaveValue("TRANCHE");
  const plan = planTable(page);
  await expect(plan).toContainText("第5批采购由第40日顺延至第42日");
  await expect(plan).toContainText("第3批第27日验收，乙应于第42日付甲13.608万元");
  await expect(plan).toContainText("下限10.672万元");
  await expect(plan).toContainText("上限13.608万元");
  await expect(plan).toContainText("第21日）起可提，第50日提款截止，第62日到期");
  await expect(row(page, "甲没有欠息", "乙确认第3批应付")).toContainText("待满足");
  const cmp = page.locator("table", { hasText: "额外承诺（万元·日）" }).first();
  await expect(cmp.locator("tr", { hasText: "一般额度提至31万元" })).toContainText("1089.0");
  await expect(cmp.locator("tr", { hasText: "专项13.608万元" })).toContainText("285.8");
  await page.screenshot({ path: `${shots}/v3-01-financing-plan.png`, fullPage: true });

  // 甲视图没有应付确认按钮；乙确认
  await expect(page.getByRole("button", { name: /确认第3批应付/ })).toHaveCount(0);
  await role(page, "FACTORY");
  await page.getByRole("button", { name: /确认第3批应付/ }).click();
  await expect(row(page, "甲没有欠息", "乙确认第3批应付")).toContainText("满足");
  await role(page, "COOP");
  await page.getByRole("button", { name: "提交专项提款方案" }).click();
  await expect(page.locator(".case-selector")).toContainText("专项 · 甲 · 等待银行核查");
  // 重复提交不新增事项；改为一般额度申请被拒绝
  await page.getByRole("button", { name: "提交专项提款方案" }).click();
  await expect(page.locator(".case-selector button")).toHaveCount(1);
  await page.getByLabel("融资结构").selectOption("GENERAL");
  await page.getByRole("button", { name: "提交融资需求包" }).click();
  await expect(page.getByRole("alert")).toContainText("请勿重复提交");
  await page.getByLabel("融资结构").selectOption("TRANCHE");

  // 经营角色看不到银行条件输入
  await expect(page.getByLabel("专项额度")).toHaveCount(0);
  await role(page, "BANK");
  await expect(page.getByLabel("专项额度")).toHaveValue("13.608");
  await page.getByLabel("核查意见").fill("依据第3批应付确认，模拟批准专项");
  await page.getByLabel("专项额度").fill("14");
  await page.getByRole("button", { name: "记录批准结果（模拟）" }).click();
  await expect(page.getByRole("alert")).toContainText("不超过还款来源与用途的较小者13.608万元");
  await page.getByLabel("专项额度").fill("13.608");
  await page.getByLabel("专项到期日").fill("40");
  await page.getByRole("button", { name: "记录批准结果（模拟）" }).click();
  await expect(page.getByRole("alert")).toContainText("到期日应晚于");
  await page.getByLabel("专项到期日").fill("62");
  await page.getByRole("button", { name: "记录批准结果（模拟）" }).click();
  await expect(page.locator(".case-selector")).toContainText("已批准（模拟）");
  await expect(page.locator(".context")).toContainText("Draft-V2 待确认");
  await page.getByRole("button", { name: "回填办理回执" }).click();
  await expect(page.locator(".case-selector")).toContainText("办理回执已回填");
  await expect(row(page, "办理编号", "模拟获批专项")).toContainText("13.608万元；第21日起可提，第50日截止，第62日到期");
  await expect(row(page, "获批前（现有额度）", "专项状态")).toContainText("相关规则生效后进入执行投影");

  // 银行批准不代替合同确认；甲确认草案后专项进入执行投影
  await role(page, "COOP");
  await nav(page, "变化重算");
  await page.getByRole("button", { name: /身份确认草案/ }).click();
  await page.getByRole("button", { name: "使已确认草案生效" }).click();
  await expect(page.locator(".context")).toContainText("Draft-V2 有效");
  await nav(page, "金融转译与核查");
  await expect(row(page, "获批前（现有额度）", "第5批采购")).toContainText("第42日第40日");
  await expect(row(page, "获批前（现有额度）", "第5批成品回款")).toContainText("第68日第65日");
  await expect(row(page, "获批前（现有额度）", "专项提款 / 归还")).toContainText("第40日提用10.672万元；第42日归还");
  await expect(row(page, "获批前（现有额度）", "甲借款峰值")).toContainText("20.000 / 30.672万元");
  await expect(row(page, "获批前（现有额度）", "专项到期余额")).toContainText("0.000万元");
  await page.screenshot({ path: `${shots}/v3-02-financing-executed.png`, fullPage: true });

  // 履约台账出现模拟放款与还款凭证；留痕保留应付确认与回执
  await nav(page, "履约台账");
  // 观察日仍为第20日时，第40日的提款属于未来事项，台账不显示
  await expect(page.locator("main")).not.toContainText("专项提款（受托支付至采购收款方）");
  await page.getByRole("button", { name: "D42", exact: true }).click();
  await page.getByRole("button", { name: "载入截至本日模拟履约记录" }).click();
  await expect(page.locator("main")).toContainText("专项提款（受托支付至采购收款方）");
  await expect(page.locator("main")).toContainText("专项本金归还（回笼账户日终扣划）");
  await nav(page, "版本与留痕");
  await expect(page.locator("main")).toContainText("应付确认");
  await expect(page.locator("main")).toContainText("办理回执回填");
  expect(errors).toEqual([]);
});

test("专项方案：计算线程在第20日历史匹配情景中对照四种安排", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=financing");
  await page.getByRole("button", { name: "在第20日历史匹配情景中对照" }).click();
  await expect(page.locator("main")).toContainText("按第20日已核验历史匹配后保留3,969条", { timeout: 90000 });
  const t = page.locator("table", { hasText: "专项条件受阻" });
  await expect(t.locator("tr", { hasText: "Rule-V1，现有额度" })).toContainText("89.9%");
  await expect(t.locator("tr", { hasText: "Draft-V2，现有额度" })).toContainText("0.0%");
  await expect(t.locator("tr", { hasText: "一般额度提至31万元" })).toContainText("100.0%");
  const tr = t.locator("tr", { hasText: "专项13.608万元" });
  await expect(tr).toContainText("98.2%");
  await expect(tr).toContainText("99.4%");
  await expect(tr).toContainText("1.8%");
  await expect(tr).toContainText("317");
  await page.screenshot({ path: `${shots}/v3-03-financing-scenarios.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("下游持续拖欠：专项获批后复核提示给出下游逾期与到期余额，提示不改变额度", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?scene=financing-stress");
  await expect(page.getByLabel("融资结构")).toHaveValue("TRANCHE");
  await role(page, "FACTORY");
  await page.getByRole("button", { name: /确认第3批应付/ }).click();
  await role(page, "COOP");
  await page.getByRole("button", { name: "提交专项提款方案" }).click();
  await role(page, "BANK");
  await page.getByLabel("核查意见").fill("模拟批准");
  await page.getByRole("button", { name: "记录批准结果（模拟）" }).click();
  await page.getByRole("button", { name: "回填办理回执" }).click();
  await role(page, "COOP");
  await nav(page, "变化重算");
  await page.getByRole("button", { name: /身份确认草案/ }).click();
  await page.getByRole("button", { name: "使已确认草案生效" }).click();
  await nav(page, "金融转译与核查");
  const list = page.locator(".signal-list");
  await expect(list).toContainText("专项到期日第62日仍有本金3.500万元");
  await expect(list).toContainText("下游回款");
  await role(page, "BANK");
  await page.getByRole("button", { name: "依据提示发起风险核查" }).click();
  await expect(page.locator(".case-selector")).toContainText("核查 · 甲 · 等待银行核查");
  await expect(row(page, "办理编号", "模拟获批专项")).toHaveCount(0);
  expect(errors).toEqual([]);
});
