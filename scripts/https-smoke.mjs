import https from 'node:https';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

if (!process.env.TEST_CERT_DIR) throw new Error('设置 TEST_CERT_DIR 指向仅用于本机测试的 cert.pem / key.pem 目录');
const root = path.resolve('dist');
const server = https.createServer({
  cert: await readFile(path.join(process.env.TEST_CERT_DIR, 'cert.pem')),
  key: await readFile(path.join(process.env.TEST_CERT_DIR, 'key.pem')),
}, async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('invalid path');
    const bytes = await readFile(file);
    const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const errors = [], externalRequests = [], scenes = [];
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE,
  channel: process.env.BROWSER_EXECUTABLE ? undefined : process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin)) externalRequests.push(r.url()); });
  for (const [scene, heading, values] of [
    ['compare', '方案对比', ['5.44', '9.77', '4.77', '10.39']],
    ['recalculate', '例外重算', ['24.77', '18.11', '1.89', '当前有效规则仍为 Rule-V1']],
    ['translate', '金融需求转译', ['1.89', 'Day45', '6.66', '10天']],
  ]) {
    await page.goto(`${origin}/?scene=${scene}`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(heading);
    for (const value of values) await expect(page.locator('main')).toContainText(value);
    if (scene === 'translate') {
      await page.getByRole('button', { name: '提交金融需求包', exact: true }).click();
      await expect(page.locator('main')).toContainText('PENDING_BANK_REVIEW');
    }
    scenes.push({ scene, passed: true });
  }
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  const report = { at: new Date().toISOString(), passed: true, localHttps: true, selfSignedCertificate: true,
    publiclyDeployed: false, scenes, errors, externalRequests };
  await writeFile('verification/https-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
