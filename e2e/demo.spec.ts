import { test, expect, Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function nav(page: Page, name: string) {
  await page.locator('nav').getByRole('button', { name: new RegExp(name) }).click();
}
async function establish(page: Page) {
  await nav(page, '方案对比');
  await page.getByRole('button', { name: '选择方案 B，生成 Rule-V1', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).first().click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '各方已确认，使 Rule-V1 生效' }).click();
}
const variants = [
  { name: 'production', url: '/' },
  { name: 'single-file-http', url: '/demo.html' },
  { name: 'single-file-offline', url: pathToFileURL(path.resolve('demo.html')).href },
];
for (const variant of variants) {
  test(`${variant.name}: 八工作区及核心验收链`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
    const started = Date.now();
    await page.goto(variant.url);
    await expect(page.locator('.disclaimer-bar')).toContainText('竞赛原型');
    await expect(page.locator('.disclaimer-bar')).toContainText('模拟数据');
    await expect(page.locator('.disclaimer-bar')).toContainText('非中国工商银行生产系统');
    await expect(page.locator('svg path').first()).toBeVisible();
    for (const name of ['方案对比', '共同规则', '履约沙盘', '例外重算', '金融需求转译', '成员明白账', '审计与版本', '联合测算']) {
      await nav(page, name); await expect(page.getByRole('heading', { level: 2 })).toContainText(name);
    }
    await nav(page, '金融需求转译');
    await expect(page.getByRole('button', { name: '翻译为金融需求', exact: true })).toBeDisabled();
    await nav(page, '成员明白账');
    await expect(page.locator('main')).toContainText('待 Day20 验收后支付');
    await nav(page, '方案对比');
    for (const value of ['5.44', '9.77', '4.77', '10.39', '15.21', '15.17', '-0.67']) await expect(page.locator('main')).toContainText(value);
    await establish(page);
    await nav(page, '履约沙盘');
    await page.getByRole('button', { name: 'Day 20', exact: true }).click();
    for (const value of ['188', '12', '85.76', '3.76', '0.24']) await expect(page.locator('main')).toContainText(value);
    await page.getByRole('button', { name: 'Day 25', exact: true }).click();
    await expect(page.locator('main')).toContainText('18.35');
    await expect(page.locator('main')).toContainText('104.34');
    await nav(page, '例外重算');
    await page.getByRole('button', { name: '乙提出账期变更 → 生成 Draft-V2' }).click();
    await expect(page.locator('main')).toContainText('当前有效规则仍为 Rule-V1');
    for (const value of ['24.77', '18.11', '1.89']) await expect(page.locator('main')).toContainText(value);
    await page.getByRole('button', { name: '翻译为金融需求 →' }).click();
    for (const value of ['经营语言', '现金流影响', '经营结果', '金融语言', '1.89', '6.66', 'Day45', '10天']) await expect(page.locator('main')).toContainText(value);
    await page.getByRole('button', { name: '提交金融需求包', exact: true }).click();
    await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    await expect(page.getByRole('button', { name: '已提交', exact: true })).toBeDisabled();
    await page.screenshot({ path: `verification/${variant.name}-financial-need.png`, fullPage: true });
    await nav(page, '履约沙盘');
    await page.getByRole('button', { name: 'Day 35', exact: true }).click();
    await expect(page.locator('main')).toContainText('24.77');
    await nav(page, '成员明白账');
    for (const value of ['M01', '5000', '5200', '200']) await expect(page.locator('main')).toContainText(value);
    await nav(page, '审计与版本'); await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    await page.getByRole('button', { name: '重置演示' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('联合测算');
    await page.getByRole('button', { name: '复制为新方案' }).click();
    await expect(page.getByRole('combobox', { name: '当前方案' })).toHaveValue('C');
    expect(errors).toEqual([]);
    console.log(`${variant.name}: core UI chain and smoke completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  });
  test(`${variant.name}: 修改参数贯穿规则、草案、金融需求；确认后生效`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(variant.url);
    await page.getByRole('spinbutton', { name: '甲下一笔经营所需（万元）' }).fill('25');
    await page.getByRole('spinbutton', { name: '甲向乙销售价款（万元）' }).fill('112');
    await establish(page);
    await nav(page, '履约沙盘'); await page.getByRole('button', { name: 'Day 25', exact: true }).click();
    await nav(page, '例外重算'); await page.getByRole('button', { name: '乙提出账期变更 → 生成 Draft-V2' }).click();
    await expect(page.locator('.diff-box.after')).toContainText('25 万元');
    await expect(page.locator('.diff-box.after')).toContainText('5.95 万元');
    await page.getByRole('button', { name: '翻译为金融需求 →' }).click();
    await expect(page.locator('dl')).toContainText('5.95'); await expect(page.locator('dl')).toContainText('6.72');
    await nav(page, '例外重算');
    await page.getByRole('button', { name: '（可选）甲确认接受新账期' }).click();
    await page.getByRole('button', { name: '采纳 Draft-V2（Rule-V1 进入历史）', exact: true }).click();
    await expect(page.locator('main')).toContainText('Draft-V2 已经共同确认并采纳');
    await nav(page, '共同规则'); await expect(page.locator('main')).toContainText('Draft-V2 已生效');
    await nav(page, '履约沙盘'); await page.getByRole('button', { name: 'Day 35', exact: true }).click();
    await expect(page.locator('main')).toContainText('19.05');
    await nav(page, '联合测算'); await page.getByRole('spinbutton', { name: '甲自有资金（万元）' }).fill('-1');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: '甲自有资金（万元）' })).toHaveValue('20');
    await page.getByRole('spinbutton', { name: '年利率', exact: true }).fill('1e308');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: '年利率', exact: true })).toHaveValue('0.04');
    expect(errors).toEqual([]);
  });
}
