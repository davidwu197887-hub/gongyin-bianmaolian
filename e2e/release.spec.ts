import { test, expect, Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const names = ['联合测算', '方案对比', '共同规则', '履约沙盘', '例外重算', '金融需求转译', '成员明白账', '审计与版本'];
const nav = (page: Page, name: string) => page.locator('nav').getByRole('button', { name: new RegExp(name) }).click();

for (const offline of [false, true]) {
  const base = offline ? pathToFileURL(path.resolve('demo.html')).href : '/';
  test(`${offline ? 'offline' : 'production'}: 三场景链接、回执独立、事件不重放`, async ({ page }) => {
    const errors: string[] = [];
    const remote: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173/')) remote.push(r.url()); });
    await page.goto(`${base}?scene=compare`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('方案对比');
    for (const value of ['5.44', '9.77', '4.77', '10.39', '15.21', '15.17']) await expect(page.locator('main')).toContainText(value);
    await page.goto(`${base}?scene=recalculate`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('例外重算');
    for (const value of ['24.77', '18.11', '1.89', '当前有效规则仍为 Rule-V1', '流动性检查点']) await expect(page.locator('main')).toContainText(value);
    await page.goto(`${base}?scene=translate`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('金融需求转译');
    await page.getByRole('button', { name: '提交金融需求包', exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    await nav(page, '履约沙盘');
    await page.getByRole('button', { name: 'Day 35', exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    await expect(page.locator('main')).toContainText('24.77');
    await nav(page, '例外重算');
    await page.getByRole('button', { name: '翻译为金融需求 →' }).click();
    await expect(page.getByRole('button', { name: '已提交', exact: true })).toBeDisabled();
    await nav(page, '例外重算');
    await page.getByRole('button', { name: '（可选）甲确认接受新账期' }).click();
    await page.getByRole('button', { name: '采纳 Draft-V2（Rule-V1 进入历史）', exact: true }).click();
    await nav(page, '金融需求转译');
    await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    await nav(page, '审计与版本');
    const records = page.locator('.panel').filter({ has: page.getByRole('heading', { name: '操作与事件记录' }) });
    await expect(records.locator('tr').filter({ has: page.getByText('BANK_API', { exact: true }) })).toHaveCount(1);
    await expect(records.locator('tr').filter({ has: page.getByText('Day35', { exact: true }) })).toHaveCount(1);
    await page.getByRole('button', { name: '重置演示' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('联合测算');
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  });
  test(`${offline ? 'offline' : 'production'}: 手机八工作区无页面横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?scene=translate`);
    for (const name of names) {
      await nav(page, name);
      await expect(page.getByRole('heading', { level: 2 })).toContainText(name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBe(true);
    }
    await nav(page, '金融需求转译');
    await page.getByRole('button', { name: '提交金融需求包', exact: true }).click();
    await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    await page.screenshot({ path: `verification/${offline ? 'offline' : 'production'}-mobile.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('计划书截图：同一生产构建的三个实际页面', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const scenes = [
    { search: '?capture=1', name: '联合测算', file: '01_联合测算.png' },
    { search: '?scene=recalculate&capture=1', name: '例外重算', file: '02_例外重算.png' },
    { search: '?scene=translate&capture=1', name: '金融需求转译', file: '03_金融需求转译.png' },
  ];
  for (const scene of scenes) {
    await page.goto(`/${scene.search}`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(scene.name);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('工银边贸链——边民互市经营协同与金融需求适配平台');
    await expect(page.getByRole('button', { name: '重置演示' })).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `verification/${scene.file}`, fullPage: true });
  }
});
