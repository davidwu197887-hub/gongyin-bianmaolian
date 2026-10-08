import { preview } from 'vite';
import { spawn } from 'node:child_process';

// 在同一进程启动和关闭生产预览，避免 Windows taskkill 的进程树清理挂起。
const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
let code = 1;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
      stdio: 'inherit', env: { ...process.env, SMOKE_EXTERNAL_SERVER: '1' },
    });
    child.on('error', reject);
    child.on('exit', (value) => resolve(value ?? 1));
  });
} finally {
  server.httpServer.closeAllConnections();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
process.exitCode = code;
