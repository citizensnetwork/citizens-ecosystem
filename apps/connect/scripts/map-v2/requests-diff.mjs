// "Flag off adds no network requests" (tracker P1-01 Accept): load the map screen on two
// servers with the same fixture and compare what was requested.
//   MAPV2_A=http://localhost:3102 MAPV2_B=http://localhost:3100 node scripts/map-v2/requests-diff.mjs [query]
// A = the pre-change build (served from a temp build of the base commit), B = this branch.
// Hashed bundle names are normalised; everything else must match one for one.
import { openSession, FIXED_NOW } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';

const query = process.argv[2] || '';
const norm = (u) =>
  u
    .replace(/^https?:\/\/localhost:\d+/, '')
    .replace(/(bundle|auth-client|capacitor-bridge)\.[0-9a-f]{6,}\.js/, '$1.<hash>.js')
    .replace(/\?v=[^&]*/, '?v=*')
    .replace(/key=[^&]+/, 'key=<k>');

async function run(base) {
  process.env.MAPV2_BASE_URL = base;
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 1, tiles: 'mock', seed: smallSeed(FIXED_NOW) });
  try {
    await s.page.goto(base + '/' + query, { waitUntil: 'domcontentloaded' });
    await s.page.waitForSelector('[data-screen="discover"]', { timeout: 30_000 });
    await s.page.waitForFunction(() => document.querySelectorAll('.maplibregl-marker').length >= 8, undefined, { timeout: 20_000 });
    await s.page.waitForTimeout(1500);
    const urls = s.log.requests.map((r) => norm(r.url));
    return { urls, console: s.log.console, pageErrors: s.log.pageErrors };
  } finally {
    await s.close();
  }
}

const a = await run(process.env.MAPV2_A);
const b = await run(process.env.MAPV2_B);
const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const ca = count(a.urls);
const cb = count(b.urls);
const onlyA = Object.keys(ca).filter((k) => ca[k] !== cb[k] && !(k in cb));
const onlyB = Object.keys(cb).filter((k) => cb[k] !== ca[k] && !(k in ca));
const diffCount = Object.keys({ ...ca, ...cb }).filter((k) => k in ca && k in cb && ca[k] !== cb[k]);
console.log(JSON.stringify({ query: query || '(none)', requestsA: a.urls.length, requestsB: b.urls.length, onlyInA: onlyA, onlyInB: onlyB, differentCounts: diffCount, consoleA: a.console.length, consoleB: b.console.length, pageErrorsB: b.pageErrors }, null, 2));
process.exit(a.urls.length === b.urls.length && !onlyA.length && !onlyB.length && !diffCount.length ? 0 : 1);
