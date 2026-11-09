// 将 Playwright JSON 报告中的本机绝对路径替换为仓库相对路径，避免提交用户名和目录结构。
import fs from "node:fs";
import os from "node:os";
const file = "verification/e2e-results.json";
let text = fs.readFileSync(file, "utf8");
for (const [from, to] of [
  [process.cwd(), "."],
  [os.homedir(), "~"],
])
  for (const v of [from, from.replaceAll("\\", "/"), JSON.stringify(from).slice(1, -1)])
    text = text.split(v).join(to);
fs.writeFileSync(file, text);
console.log("已脱敏", file);
