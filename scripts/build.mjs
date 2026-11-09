import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("dist", { recursive: true });
const worker = await build({
  entryPoints: ["src/worker.ts"],
  bundle: true,
  write: false,
  minify: true,
  target: "es2022",
  format: "iife",
  legalComments: "inline",
});
fs.writeFileSync(
  "src/workerCode.ts",
  "export const WORKER_CODE = " +
    JSON.stringify(worker.outputFiles[0].text) +
    ";\n",
);
const main = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  minify: true,
  target: "es2022",
  format: "iife",
  jsx: "automatic",
  outdir: "dist",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "inline",
});
const js = main.outputFiles
  .find((x) => x.path.endsWith(".js"))
  .text.replace(/<\/script/gi, "<\\/script");
const css = main.outputFiles.find((x) => x.path.endsWith(".css")).text;
const icon=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="7" fill="#b71c2c"/><text x="20" y="29" text-anchor="middle" font-size="27" fill="white">工</text></svg>').toString('base64');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="边民互市五批经营协同、现金流仿真与金融需求转译演示"><meta name="author" content="工银边贸智链项目组"><link rel="icon" href="data:image/svg+xml;base64,${icon}"><title>工银边贸智链｜边民互市经营协同与融资需求联动平台</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
fs.writeFileSync("dist/index.html", html);
fs.writeFileSync("demo.html", html);
console.log("Built standalone HTML:", Buffer.byteLength(html), "bytes");
