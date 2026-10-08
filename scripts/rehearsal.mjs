import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, channel: process.env.BROWSER_EXECUTABLE ? undefined : process.env.BROWSER_CHANNEL ?? 'msedge', headless: !process.argv.includes('--headed'), slowMo: 150 });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const actions = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
const start = Date.now();
const nav = async (name) => page.locator('nav').getByRole('button', { name: new RegExp(name) }).click();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stage(name, run, displayMs) {
  await run();
  const elapsedSeconds = (Date.now() - start) / 1000;
  actions.push({ name, elapsedSeconds });
  console.log(`${elapsedSeconds.toFixed(1)}s: ${name}`);
  await pause(displayMs);
}
await page.goto('http://127.0.0.1:4173/');
await stage('联合测算：模拟参数与甲乙现金流', async () => {}, 18000);
await stage('A/B对比：甲少赚约0.67万元，换取周转支持下一笔经营', async () => nav('方案对比'), 27000);
await stage('选择B，生成Rule-V1；甲乙按责确认并生效', async () => {
  await page.getByRole('button', { name: '选择方案 B，生成 Rule-V1', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).first().click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '各方已确认，使 Rule-V1 生效' }).click();
}, 17000);
await stage('Day20：188吨验收、12吨在途；借款85.76万元', async () => {
  await nav('履约沙盘'); await page.getByRole('button', { name: 'Day 20', exact: true }).click();
}, 16000);
await stage('Day25：首批104.34万元回款、借款结清、现金18.35万元', async () => {
  await page.getByRole('button', { name: 'Day 25', exact: true }).click();
}, 16000);
await stage('乙提出剩余12吨账期5→15日；Draft-V2独立保存；Rule-V1仍有效', async () => {
  await nav('例外重算'); await page.getByRole('button', { name: '乙提出账期变更 → 生成 Draft-V2' }).click();
  const content = await page.locator('main').innerText();
  for (const expected of ['24.77', '18.11', '1.89', '当前有效规则仍为 Rule-V1']) if (!content.includes(expected)) throw new Error(`演练未出现${expected}`);
  await page.screenshot({ path: 'verification/rehearsal-draft.png', fullPage: true });
}, 20000);
await stage('翻译为金融需求：经营语言→现金流影响→经营结果→金融语言', async () => {
  await page.getByRole('button', { name: '翻译为金融需求 →' }).click();
}, 22000);
await stage('提交mockBankApi：仅返回PENDING_BANK_REVIEW，银行独立审批', async () => {
  await page.getByRole('button', { name: '提交金融需求包', exact: true }).click();
  if (!(await page.locator('main').innerText()).includes('PENDING_BANK_REVIEW')) throw new Error('缺少真实mock回执');
}, 11000);
await stage('M01明白账：1吨、5000/5200元、200元尾款；组织结余不等于分红', async () => {
  await nav('成员明白账');
}, 13000);
await nav('金融需求转译');
await page.screenshot({ path: 'verification/rehearsal-final.png', fullPage: true });
const durationSeconds = (Date.now() - start) / 1000;
await writeFile('verification/rehearsal-results.json', JSON.stringify({ durationSeconds, errors, actions, finalBankStatus: 'PENDING_BANK_REVIEW' }, null, 2));
console.log(`Completed: ${durationSeconds.toFixed(1)}s; browser errors: ${errors.length}`);
await browser.close();
if (errors.length) process.exitCode = 1;
