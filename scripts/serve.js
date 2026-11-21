// Minimal static server for the browser demo (no dependencies): serves the repo root on 127.0.0.1.
// Usage: node scripts/serve.js [port]   then open http://127.0.0.1:8765/demo/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/demo/' }); return res.end(); }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).on('error', (e) => { console.error(`Cannot listen on 127.0.0.1:${PORT} (${e.code}). Pass another port: node scripts/serve.js 9000`); process.exit(1); })
  .listen(PORT, '127.0.0.1', () => console.log(`demo: http://127.0.0.1:${PORT}/demo/`));
