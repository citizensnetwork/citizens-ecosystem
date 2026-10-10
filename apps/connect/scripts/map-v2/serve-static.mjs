// Tiny static server for a built `public/` (or the raw `src/frontend/` for the Babel dev path)
// with an SPA fallback to index.html. Used to compare the pre-change build with the current one.
//   node scripts/map-v2/serve-static.mjs <dir> <port>
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const [dir, port] = [process.argv[2], Number(process.argv[3] || 3102)];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dir, 'index.html'); // SPA fallback (/c/<slug>, /e/<id>, ...)
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
