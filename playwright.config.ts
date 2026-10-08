import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 30000,
  reporter: [['list'], ['json', { outputFile: 'verification/smoke-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.BROWSER_EXECUTABLE ? undefined : process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE },
    headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.SMOKE_EXTERNAL_SERVER ? undefined : { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
