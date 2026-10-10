// Does the DEV path (raw src/frontend served as-is: Babel-standalone compiles the .jsx tags
// in the browser) render with the flag on and off? The production path is `next dev` / the build.
//   node scripts/map-v2/serve-static.mjs src/frontend 3103   (in another shell)
//   MAPV2_DEV_URL=http://localhost:3103 node scripts/map-v2/dev-path-check.mjs
import { openSession, FIXED_NOW } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';

const base = process.env.MAPV2_DEV_URL || 'http://localhost:3103';
const out = {};
for (const q of ['/', '/?map=v2', '/?map=v1']) {
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 1, tiles: 'mock', seed: smallSeed(FIXED_NOW) });
  try {
    await s.page.goto(base + q, { waitUntil: 'domcontentloaded' });
    await s.page.waitForSelector('[data-screen="discover"]', { timeout: 60_000 });
    await s.page.waitForFunction(() => document.querySelectorAll('.maplibregl-marker').length >= 8, undefined, { timeout: 30_000 });
    out[q] = await s.page.evaluate(() => ({
      markers: document.querySelectorAll('.maplibregl-marker').length,
      badge: !!document.getElementById('cc-map-v2-badge'),
      theme: document.documentElement.getAttribute('data-theme'),
      babel: !!document.querySelector('script[type="text/babel"]'),
      flag: window.isMapV2 && window.isMapV2(),
    }));
    out[q].pageErrors = s.log.pageErrors;
    out[q].mapV2CssRequests = s.log.requests.filter((r) => r.url.includes('map-v2.css')).length;
  } finally { await s.close(); }
}
console.log(JSON.stringify(out, null, 2));
