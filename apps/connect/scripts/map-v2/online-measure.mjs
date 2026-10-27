// "Online in this area" (issue #259, PR C): does the globe cost the map anything, and what does it ask for?
// Local tool, not shipped, not a test. Output is JSON on stdout.
//
//   MAPV2_BASE_URL=http://localhost:3217 node scripts/map-v2/online-measure.mjs [--pins=50,150] [--runs=3] [--zooms=13,15.5]
//
// The same page, the same seed, the same sine-sweep pan as M3 in measure.mjs (CPU x4, Fast 4G, 390x844 at 3x, mock tiles, the GPU
// flags in harness.mjs; headless software GL would measure the wrong thing), run in two modes, alternating so a slow minute on the
// machine hits both:
//   off  the globe is switched off for this page (MapV2.onlineGlobe = false before any app script runs): the map as it was
//   on   the globe is on and the area in view is served, so it resolves the area, asks for the list, draws the button, and keeps
//        listening to the map while it is panned for ten seconds
// Per run: frame-time p50/p95/p99/max and the count of frames above 32 ms, plus every request the globe made. "Added per settle" is
// the requests of mode on minus mode off, divided by the number of times the map settled in a NEW area (the sweep never leaves one
// area, so a settle in the same area must add nothing).
import { openSession, openMap, jumpTo, percentile, FIXED_NOW } from './harness.mjs';
import { makeSeed, PRETORIA } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pinCounts = String(args.pins || '50,150').split(',').map(Number);
const runs = Number(args.runs || 3);
const zooms = String(args.zooms || '13,15.5').split(',').map(Number);

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const area = (id, name, level, parent, c, b) => ({ id, name, level, parent_id: parent, slug: name.toLowerCase(), sort: 0, centroid_lat: c[0], centroid_lng: c[1], bbox_south: b[0], bbox_west: b[1], bbox_north: b[2], bbox_east: b[3] });
const GP = U(1), PTA = U(3);
const AREAS = [
  area(GP, 'Gauteng', 'province', null, [-26.2, 28.1], [-26.9, 27.2, -25.1, 29.0]),
  area(PTA, 'Pretoria', 'place', GP, [-25.7479, 28.2293], [-25.9, 28.05, -25.62, 28.4]),
];
const person = (n, name, presence) => ({ id: U(100 + n), name, slug: null, kind: null, category: 'worship', avatar_url: null, logo_url: null, presence, served: { id: PTA, name: 'Pretoria', level: 'place' } });
const SERVING = { area: { id: PTA, name: 'Pretoria', slug: 'pretoria', level: 'place' }, main: [person(1, 'Daily Word Online', 'online'), person(2, 'Mobile Food Outreach', 'no_fixed_place'), person(3, 'Faith and Work Podcast', 'online')], also_served_by: [] };

const routes = async (page) => {
  await page.route('**/api/v1/service-areas**', (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({ json: { data: u.searchParams.get('parent') ? [] : AREAS, meta: { count: AREAS.length, limit: 500, offset: 0 } } });
  });
  await page.route('**/api/v1/serving**', (route) => route.fulfill({ json: { data: SERVING } }));
};
// MapV2.onlineGlobe is read from window.MapV2 the moment map-v2-lib.jsx publishes it, so a setter installed first can override it.
const forceGlobe = (page, value) => page.addInitScript((v) => {
  let store;
  Object.defineProperty(window, 'MapV2', { configurable: true, get() { return store; }, set(x) { store = x; if (x && typeof x === 'object') x.onlineGlobe = v; } });
}, value);

async function run(mode, pins, zoom) {
  const nC = Math.round(pins / 3), nP = Math.round(pins / 2);
  const seed = makeSeed({ contributors: nC, places: nP, events: pins - nC - nP, now: FIXED_NOW, spread: 0.12, seed: 99 });
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, cpu: 4, network: true, tiles: 'mock', seed, extraRoutes: routes });
  await forceGlobe(s.page, mode === 'on');
  const mine = [];
  s.page.on('request', (r) => { const u = r.url(); if (/\/api\/v1\/(service-areas|serving)/.test(u)) mine.push(new URL(u).pathname + new URL(u).search); });
  try {
    await openMap(s.page, '/?map=v2', { minMarkers: pins });
    await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom });
    if (mode === 'on') await s.page.waitForSelector("[data-mv2='globe']", { timeout: 15_000 });
    const before = mine.length;
    const r = await s.page.evaluate(() => new Promise((resolve) => {
      const map = window.__ccMap; const deltas = []; let last = performance.now(); const t0 = last; let moves = 0;
      map.on('moveend', () => { moves += 1; });
      const c = map.getCenter();
      const frame = (t) => {
        deltas.push(t - last); last = t;
        const k = (t - t0) / 1000; // a sine sweep, so the pan never stops or leaves the data (and never leaves Pretoria)
        map.jumpTo({ center: [c.lng + Math.sin(k * 1.3) * 0.012, c.lat + Math.cos(k * 0.9) * 0.008] }, { originalEvent: {} });
        if (t - t0 < 10_000) requestAnimationFrame(frame); else resolve({ deltas: deltas.slice(2), moves });
      };
      requestAnimationFrame(frame);
    }));
    await s.page.waitForTimeout(700); // the map is still: the globe's single look may happen now
    const sorted = [...r.deltas].sort((a, b) => a - b);
    return {
      gpu: s.gpu, frames: r.deltas.length, moveendsDuringPan: r.moves,
      p50: +percentile(sorted, 50).toFixed(1), p95: +percentile(sorted, 95).toFixed(1), p99: +percentile(sorted, 99).toFixed(1), above32ms: r.deltas.filter((d) => d > 32).length, max: +sorted[sorted.length - 1].toFixed(1),
      requestsBeforePan: before, requestsDuringAndAfterPan: mine.length - before, requests: mine,
    };
  } finally { await s.close(); }
}

const out = { profile: { viewport: '390x844', dsf: 3, cpu: 4, network: 'Fast 4G (harness)', tiles: 'mock', fixedNow: new Date(FIXED_NOW).toISOString(), runs }, results: {} };
for (const pins of pinCounts) {
  for (const zoom of zooms) {
    const key = `${pins}pins_z${zoom}`;
    const acc = { off: [], on: [] };
    for (let i = 0; i < runs; i++) for (const mode of ['off', 'on']) acc[mode].push(await run(mode, pins, zoom));
    const med = (mode, k) => +percentile([...acc[mode].map((x) => x[k])].sort((a, b) => a - b), 50).toFixed(1);
    out.results[key] = {
      off: { p50: med('off', 'p50'), p95: med('off', 'p95'), p99: med('off', 'p99'), above32ms: med('off', 'above32ms'), runs: acc.off.map((x) => ({ p50: x.p50, p95: x.p95, p99: x.p99, max: x.max, above32ms: x.above32ms })) },
      on: { p50: med('on', 'p50'), p95: med('on', 'p95'), p99: med('on', 'p99'), above32ms: med('on', 'above32ms'), runs: acc.on.map((x) => ({ p50: x.p50, p95: x.p95, p99: x.p99, max: x.max, above32ms: x.above32ms })) },
      globeRequestsOn: acc.on.map((x) => x.requests),
      globeRequestsOff: acc.off.map((x) => x.requests),
      moveendsDuringOnePan: acc.on[0].moveendsDuringPan,
    };
    console.error('done', key);
  }
}
console.log(JSON.stringify(out, null, 2));
