import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { build } from 'esbuild';

async function walk(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') found.push(...await walk(file)); }
    else found.push(file);
  }
  return found.sort();
}
const files = await walk('src');
const hash = createHash('sha256');
const violations = [];
let importCount = 0;
const forbiddenAmounts = /\b(?:24\.77|18\.11|1\.89|85\.76|104\.34|6\.66|3\.76|0\.24)\b/g;
for (const file of files) {
  const content = await readFile(file, 'utf8');
  hash.update(file.replaceAll('\\', '/')).update(await readFile(file));
  if (forbiddenAmounts.test(content)) violations.push(`${file}: 演示输出常量出现在正式源码`);
  forbiddenAmounts.lastIndex = 0;
  for (const m of content.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    const candidates = [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')];
    if (!(await Promise.all(candidates.map((name) => stat(name).then((s) => s.isFile()).catch(() => false)))).some(Boolean)) violations.push(`${file}: 无法解析${m[1]}`);
    importCount++;
  }
  if (file.includes(`${path.sep}pages${path.sep}`) && /AI推荐|最佳方案|系统建议选择|AI授信|可授信|贷款批准|批准贷款|APPROVED|GRANTED|系统自动放款/.test(content)) violations.push(`${file}: 越界金融结论`);
}
const sourceSha256 = hash.digest('hex');
const index = await readFile('dist/index.html', 'utf8');
for (const match of index.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const resource = match[1];
  if (resource.startsWith('data:')) continue;
  if (!resource.startsWith('./assets/')) violations.push(`dist/index.html: 非随包静态资源 ${resource}`);
  else if (!(await stat(path.join('dist', resource)).then(s => s.isFile()).catch(() => false))) violations.push(`dist/index.html: 缺失资源 ${resource}`);
}
for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (/https?:\/\/|@import\s+url\(|\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(content)) violations.push(`${file}: 检出外部网络或实时接口引用，请人工复核`);
}
const demo = await readFile('demo.html', 'utf8');
if (!demo.includes(`Source SHA-256: ${sourceSha256}`)) violations.push('demo.html与当前src源摘要不一致，请重新build');
if (demo !== await readFile('dist/demo.html', 'utf8')) violations.push('dist/demo.html与根demo.html不一致');
if (/<script[^>]+src=|<link[^>]+href=["'](?!data:)/i.test(demo)) violations.push('单文件demo存在外部资源依赖');
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import {scenarioA,scenarioB,scenarioBSplit,scenarioBSplitDraft} from './src/data/presets';
import {evaluateScenario, evaluateParty, cashAsOf, loanAsOf} from './src/engine/calculationEngine';
import {translate} from './src/engine/financialTranslator';
import {submitFinancialNeed} from './src/engine/mockBankApi';
const a=evaluateScenario(scenarioA()), b=evaluateScenario(scenarioB()), split=evaluateParty(scenarioBSplit(),'JIA');
const need=translate({before:scenarioBSplit(),after:scenarioBSplitDraft(),triggerText:'审计复算',previousFinancingStatus:'已结清'});
export const math={a:{jia:a.jia.operatingBalance,yi:a.yi.operatingBalance,combined:a.combinedBalance,peak:a.jia.peakLoan},
b:{jia:b.jia.operatingBalance,yi:b.yi.operatingBalance,combined:b.combinedBalance,peak:b.jia.peakLoan},
split:{loanDay20:loanAsOf(split.points,20),cashDay25:cashAsOf(split.points,25),cashDay35:cashAsOf(split.points,35)},need,bank:submitFinancialNeed(need)};
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const { math } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const report = { at: new Date().toISOString(), passed: violations.length === 0, formalSourceFiles: files.length, resolvedRelativeImports: importCount,
  sourceSha256, demoSameSource: true, violations, math };
await writeFile('verification/source-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (violations.length) process.exitCode = 1;
