import { defineConfig } from "@playwright/test";
// 浏览器测试针对构建产物 dist/（与静态托管上传内容相同）。默认使用 Windows Edge；
// 其他平台可设置 BROWSER_CHANNEL 或 BROWSER_EXECUTABLE，或运行 npx playwright install chromium。
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120000,
  reporter: [["list"], ["json", { outputFile: "verification/e2e-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.BROWSER_EXECUTABLE
      ? undefined
      : (process.env.BROWSER_CHANNEL ??
        (process.platform === "win32" ? "msedge" : undefined)),
    launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE },
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
