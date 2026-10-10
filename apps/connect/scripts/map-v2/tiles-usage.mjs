// P0-02: how many MapTiler requests does one map view cost? One run, real tiles.
//   node scripts/map-v2/tiles-usage.mjs
// Counts requests to api.maptiler.com (the unit the free tier meters: tile, glyph,
// sprite and style requests), for: first view, a short browse (3 pans, 1 zoom in),
// and a switch to the dark style on the same map. The key comes from .env.local and is not printed.
import { openSession, openMap, jumpTo, settle } from './harness.mjs';
import { smallSeed, PRETORIA } from './fixtures.mjs';
import { FIXED_NOW } from './harness.mjs';

const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, tiles: 'real', seed: smallSeed(FIXED_NOW), bypassCSP: false });
const kinds = (reqs) => {
  const k = { style: 0, tiles: 0, glyphs: 0, sprite: 0, other: 0 };
  for (const r of reqs) {
    const u = r.url;
    if (!u.includes('api.maptiler.com')) continue;
    if (/style\.json/.test(u)) k.style++; else if (/\/tiles\//.test(u) || /\/tiles\.json/.test(u) || /\.(pbf|mvt|png|webp|jpg)(\?|$)/.test(u)) k.tiles++; else if (/\/fonts\//.test(u)) k.glyphs++; else if (/sprite/.test(u)) k.sprite++; else k.other++;
  }
  k.total = k.style + k.tiles + k.glyphs + k.sprite + k.other;
  return k;
};
const mark = () => s.log.requests.length;
try {
  await openMap(s.page, '/', { minMarkers: 8 });
  await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 12 });
  await s.page.waitForTimeout(2500);
  const first = kinds(s.log.requests);
  let m = mark();
  for (const [dx, dy] of [[0.02, 0], [0, 0.02], [-0.02, -0.02]]) {
    await s.page.evaluate(([a, b]) => { const c = window.__ccMap.getCenter(); window.__ccMap.jumpTo({ center: [c.lng + a, c.lat + b] }, { originalEvent: {} }); }, [dx, dy]);
    await settle(s.page, 800);
  }
  await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 14 });
  await s.page.waitForTimeout(1500);
  const browse = kinds(s.log.requests.slice(m));
  m = mark();
  const darkId = process.argv[2] || 'dataviz-dark';
  const swapped = await s.page.evaluate(async (id) => {
    const key = window.__CC_ENV.MAPTILER_KEY;
    window.__ccMap.setStyle('https://api.maptiler.com/maps/' + id + '/style.json?key=' + key);
    await new Promise((res) => { window.__ccMap.once('idle', res); setTimeout(res, 6000); });
    return true;
  }, darkId);
  await s.page.waitForTimeout(1500);
  const dark = kinds(s.log.requests.slice(m));
  console.log(JSON.stringify({ firstView: first, browse3PansAndZoom: browse, switchToDarkOnSameMap: dark, darkStyle: darkId, swapped }, null, 2));
} finally { await s.close(); }
