import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
try { await import('./rehearsal.mjs'); }
finally {
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
