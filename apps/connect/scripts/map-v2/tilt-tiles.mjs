// R8: what does the fixed tilt cost in MapTiler requests? Same camera, same fake data, the real MapTiler style
// and tiles (the key comes from .env.local and is never printed), one fresh browser (empty cache) per run:
// pitch 0 (flat) against pitch 60 (the tilt), at three phone viewports.
//
//   node scripts/map-v2/serve-static.mjs public 3100        (a built public/, in another terminal)
//   node scripts/map-v2/tilt-tiles.mjs [out.json] [repeats=2] [--pitches=0,60]
//
// The pitch is switched with no rebuild: a setter on `window.MapV2` (installed before any page script) sets
// MapV2.PITCH to the value under test the moment map-v2-lib.jsx publishes it. Requests to api.maptiler.com are
// the unit the Free plan meters, so they are what is counted: style, tiles, glyphs, sprites, other.
//
// Scenarios: "first view" is what a visitor gets on arrival (the app's own framing of Pretoria's pins),
// "browse" is three pans and a zoom to 14 afterwards (what the first minute looks like), "pin" is opening
// a Contributor at zoom 16 (the sheet's own map move). Each is counted from the moment it starts.
import { writeFileSync } from 'node:fs';
import { openSession, openMap, jumpTo, settle, VIEWPORTS, FIXED_NOW } from './harness.mjs';
import { makeSeed, PRETORIA } from './fixtures.mjs';

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = pos[0];
const repeats = Number(pos[1] || 2);
const pitches = ((process.argv.find((a) => a.startsWith('--pitches=')) || '--pitches=0,60').split('=')[1]).split(',').map(Number);
const seed = makeSeed({ contributors: 12, places: 20, events: 8, now: FIXED_NOW });

const kind = (r) => {
  let host = '';
  try { host = new URL(r.url).hostname; } catch { /* not a URL */ }
  if (host !== 'api.maptiler.com') return null;
  const u = r.url;
  if (/style\.json/.test(u)) return 'style';
  if (/\/fonts\//.test(u)) return 'glyphs';
  if (/sprite/.test(u)) return 'sprite';
  if (/\/tiles\//.test(u) || /\/tiles\.json/.test(u) || /\.(pbf|mvt|png|webp|jpg)(\?|$)/.test(u)) return 'tiles';
  return 'other';
};
const count = (reqs) => {
  const k = { style: 0, tiles: 0, glyphs: 0, sprite: 0, other: 0, total: 0 };
  for (const r of reqs) { const t = kind(r); if (t) { k[t]++; k.total++; } }
  return k;
};

async function run(vpName, viewport, pitch) {
  const s = await openSession({ viewport, dsf: 2, tiles: 'real', seed, bypassCSP: false });
  const statuses = {};
  s.page.on('response', (r) => { if (kind({ url: r.url() })) statuses[r.status()] = (statuses[r.status()] || 0) + 1; });
  await s.page.addInitScript((p) => {
    let store;
    Object.defineProperty(window, 'MapV2', { configurable: true, get() { return store; }, set(v) { store = v; if (v && typeof v === 'object') v.PITCH = p; } });
  }, pitch);
  try {
    await openMap(s.page, '/', { minMarkers: 8 });
    await settle(s.page, 1500);
    const actual = await s.page.evaluate(() => window.__ccMap.getPitch());
    const first = count(s.log.requests);
    let m = s.log.requests.length;
    for (const [dx, dy] of [[0.02, 0], [0, 0.02], [-0.02, -0.02]]) {
      await s.page.evaluate(([a, b]) => { const c = window.__ccMap.getCenter(); window.__ccMap.jumpTo({ center: [c.lng + a, c.lat + b] }, { originalEvent: {} }); }, [dx, dy]);
      await settle(s.page, 900);
    }
    await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 14 });
    await settle(s.page, 1500);
    const browse = count(s.log.requests.slice(m));
    m = s.log.requests.length;
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 16 });
    await settle(s.page, 1500);
    const pin = count(s.log.requests.slice(m));
    return { viewport: vpName, requestedPitch: pitch, actualPitch: Math.round(actual * 10) / 10, firstView: first, browse, pin, statuses };
  } finally { await s.close(); }
}

const rows = [];
for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (let i = 0; i < repeats; i++) {
    for (const pitch of pitches) {
      const r = await run(vpName, viewport, pitch);
      rows.push(r);
      console.log(JSON.stringify({ vp: r.viewport, pitch: r.actualPitch, first: r.firstView.total, browse: r.browse.total, pin: r.pin.total, tiles: [r.firstView.tiles, r.browse.tiles, r.pin.tiles], statuses: r.statuses }));
    }
  }
}
const sum = (arr, f) => arr.reduce((n, r) => n + f(r), 0);
const summary = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const pitch of pitches) {
    const sel = rows.filter((r) => r.viewport === vp && r.requestedPitch === pitch);
    const avg = (f) => Math.round((sum(sel, f) / sel.length) * 10) / 10;
    summary[`${vp} pitch ${pitch}`] = { runs: sel.length, firstViewRequests: avg((r) => r.firstView.total), browseRequests: avg((r) => r.browse.total), pinRequests: avg((r) => r.pin.total), tilesFirst: avg((r) => r.firstView.tiles), tilesBrowse: avg((r) => r.browse.tiles), tilesPin: avg((r) => r.pin.tiles) };
  }
}
const result = { when: new Date().toISOString().slice(0, 10), note: 'MapTiler requests (api.maptiler.com) per scenario, real style and tiles, fresh browser each run, 12 contributors + 20 places + 8 events around Pretoria', summary, rows };
console.log(JSON.stringify(summary, null, 2));
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
