// Tiny static server for a built `public/` (or the raw `src/frontend/` for the Babel dev path)
// with an SPA fallback to index.html. Used to compare the pre-change build with the current one.
//   node scripts/map-v2/serve-static.mjs <dir> <port>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const [dir, port] = [process.argv[2], Number(process.argv[3] || 3102)];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
  // read first and fall back on the error (no stat-then-read gap): a directory or a missing file serves
  // index.html, which is what an SPA route (/c/<slug>, /e/<id>) needs
  let body;
  let served = file;
  try {
    body = await readFile(file);
  } catch {
    served = join(dir, 'index.html');
    try { body = await readFile(served); } catch { res.writeHead(404).end('not found'); return; }
  }
  res.writeHead(200, { 'content-type': TYPES[extname(served)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
