import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function sources(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') list.push(...await sources(name)); }
    else list.push(name);
  }
  return list.sort();
}
const hash = createHash('sha256');
for (const file of await sources('src')) hash.update(file.replaceAll('\\', '/')).update(await readFile(file));
const result = await build({
  entryPoints: ['src/main.tsx'], bundle: true, write: false, outfile: 'demo.js',
  format: 'iife', minify: true, target: 'es2020', legalComments: 'inline',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;
const html = `<!doctype html>
<!-- Generated from src by npm run build. Source SHA-256: ${hash.digest('hex')} -->
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>工银边贸链——边民互市经营协同与金融需求适配平台</title><link rel="icon" href="data:,"><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>`;
await writeFile('demo.html', html, 'utf8');
await writeFile('dist/demo.html', html, 'utf8');
console.log(`demo.html generated from the same React/TypeScript source (${Buffer.byteLength(html)} bytes; no external assets).`);
