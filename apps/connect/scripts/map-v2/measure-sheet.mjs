// M1, M2, M4, M6 for the Map v2 sheet on the baseline profile (tracker Appendix C):
// CPU x4, DevTools "Fast 4G" values, 390 x 844 at x3, mobile touch, GPU flags.
//   node scripts/map-v2/measure-sheet.mjs [--runs=10] [--out=docs/audit/data/m3-sheet.json]
//
// Photos are real HTTP responses from a throwaway local server (port 3199), so the network throttle
// applies to them; JPEGs are generated in the page (about 40-60 KB each, the weight P1-09 asks for). The
// per-slug detail call is answered by the page route, so its round trip is modelled as a 200 ms delay
// (Fast 4G latency is 165 ms): say so wherever the number is quoted. Each run opens a DIFFERENT Contributor
// (the sheet caches a Contributor's detail for the session).
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { openSession, openMap, jumpTo, percentile, FIXED_NOW } from './harness.mjs';
import { makeSeed } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); const k = a.replace(/^--/, '').split('=')[0]; return [k, i < 0 ? true : a.slice(i + 1)]; }));
const RUNS = Number(args.runs || 10);
const PORT = 3199;
const GALLERY = 12;
const API_DELAY_MS = 200;

// 1. images
const probe = await openSession({ viewport: { width: 400, height: 400 }, dsf: 1, tiles: 'mock' });
const jpegs = [];
try {
  await probe.page.goto('about:blank');
  for (let n = 0; n < GALLERY; n++) {
    const b64 = await probe.page.evaluate((seedN) => {
      const c = document.createElement('canvas');
      c.width = 600; c.height = 800;
      const g = c.getContext('2d');
      let r = seedN * 9301 + 49297;
      const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      g.fillStyle = `hsl(${seedN * 31}, 40%, 40%)`; g.fillRect(0, 0, 600, 800);
      for (let i = 0; i < 700; i++) { g.fillStyle = `hsl(${Math.floor(rnd() * 360)}, 50%, ${30 + Math.floor(rnd() * 40)}%)`; g.fillRect(rnd() * 600, rnd() * 800, 8 + rnd() * 40, 8 + rnd() * 40); }
      return c.toDataURL('image/jpeg', 0.55).split(',')[1];
    }, n + 1);
    jpegs.push(Buffer.from(b64, 'base64'));
  }
} finally { await probe.close(); }
const server = http.createServer((req, res) => {
  const m = /\/img\/(\d+)\.jpg/.exec(req.url);
  if (!m) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }).end(jpegs[(Number(m[1]) - 1) % GALLERY]);
}).listen(PORT);
const sizes = jpegs.map((j) => j.length).sort((a, b) => a - b);

// 2. runs
const seed = makeSeed({ contributors: RUNS, places: 4, events: 0, now: FIXED_NOW, spread: 0.01, seed: 5 });
const s = await openSession({
  viewport: { width: 390, height: 844 }, dsf: 3, cpu: Number(args.cpu || 4), network: true, tiles: 'mock', seed, bypassCSP: true,
  extraRoutes: async (page) => {
    await page.route('**/api/v1/contributors/*', async (route) => {
      const slug = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
      const profile = seed.contributors.find((c) => c.contributor_slug === slug);
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
      if (!profile) return route.fulfill({ status: 404, json: { error: 'x' } });
      const gallery = Array.from({ length: GALLERY }, (_, i) => `http://localhost:${PORT}/img/${i + 1}.jpg?c=${slug}`);
      return route.fulfill({ json: { data: { profile: { ...profile, gallery_urls: gallery, cover_photo_urls: [] }, upcoming_events: [], past_events: [], places: [], counts: {} } } });
    });
  },
});
const out = { profile: { viewport: '390x844', dsf: 3, cpu: Number(args.cpu || 4), apiDelayMs: API_DELAY_MS, galleryTiles: GALLERY, jpegBytes: { min: sizes[0], median: sizes[Math.floor(sizes.length / 2)], max: sizes[sizes.length - 1] }, gpu: s.gpu } };
try {
  await openMap(s.page, '/?map=v2', { minMarkers: seed.contributors.length + 4 });
  await s.page.evaluate(() => {
    window.__m = { tap: null, header: null, skeleton: null, tile: null, cls: 0 };
    document.addEventListener('pointerup', () => { window.__m = Object.assign(window.__m, { tap: performance.now(), header: null, skeleton: null, tile: null, cls: 0 }); poll(); }, true);
    const after = (k) => requestAnimationFrame(() => requestAnimationFrame(() => { if (window.__m[k] == null) window.__m[k] = performance.now(); }));
    function poll() {
      const m = window.__m;
      if (m.header == null && document.querySelector('[data-map-sheet-header]')) after('header');
      if (m.skeleton == null && document.querySelector('[data-mv2="sheet"] [data-skeleton]')) after('skeleton');
      if (m.tile == null) {
        const img = document.querySelector('[data-mv2="sheet"] [data-mv2="tile-img"]');
        if (img && img.complete && img.naturalWidth > 0) after('tile');
      }
      if (m.tile == null && m.tap != null && performance.now() - m.tap < 8000) requestAnimationFrame(poll);
    }
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput && window.__m.tap != null && e.startTime >= window.__m.tap) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: false });
  });
  if (args.pre) await s.page.evaluate(args.pre); // experiments: e.g. --pre="window.__ccMap.easeTo=()=>{}"
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    const c = seed.contributors[i];
    await jumpTo(s.page, { lng: c.physical_longitude, lat: c.physical_latitude, zoom: 15.5 });
    const pin = s.page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`);
    const b = await pin.boundingBox();
    await s.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    try { await s.page.waitForFunction(() => window.__m.tile != null, undefined, { timeout: 15_000 }); } catch (e) {
      console.error('no tile', JSON.stringify(await s.page.evaluate(() => ({ m: window.__m, sheet: !!document.querySelector('[data-mv2="sheet"]'), text: (document.querySelector('[data-mv2="sheet"]') || {}).innerText, imgs: [...document.querySelectorAll('[data-mv2="tile-img"]')].map((i) => [i.complete, i.naturalWidth, i.src.slice(0, 60)]) }))), s.log.console.slice(-5), s.log.pageErrors);
      throw e;
    }
    await s.page.waitForTimeout(1200);
    rows.push(await s.page.evaluate(() => ({ header: window.__m.header - window.__m.tap, skeleton: window.__m.skeleton == null ? null : window.__m.skeleton - window.__m.tap, tile: window.__m.tile - window.__m.tap, cls: window.__m.cls })));
    await s.page.keyboard.press('Escape');
    await s.page.waitForFunction(() => !document.querySelector('[data-mv2="sheet"]'));
    await s.page.waitForTimeout(250);
  }
  const col = (k) => rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b);
  const sum = (k) => { const a = col(k); return a.length ? { runs: a.map((x) => +x.toFixed(1)), median: +percentile(a, 50).toFixed(1), worst: +a[a.length - 1].toFixed(1) } : null; };
  out.m1_tap_to_header_ms = sum('header');
  out.m2_tap_to_skeleton_ms = sum('skeleton');
  out.m2_tap_to_first_tile_ms = sum('tile');
  out.m4_cls = { runs: rows.map((r) => +r.cls.toFixed(4)), worst: Math.max(...rows.map((r) => r.cls)) };

  if (args.quick) { console.log(JSON.stringify({ pre: args.pre || '', m1: out.m1_tap_to_header_ms && out.m1_tap_to_header_ms.median, skeleton: out.m2_tap_to_skeleton_ms && out.m2_tap_to_skeleton_ms.median, tile: out.m2_tap_to_first_tile_ms && out.m2_tap_to_first_tile_ms.median, cls: out.m4_cls.worst })); await s.close(); server.close(); process.exit(0); }
  // M6: every interactive element in the open sheet, at half and at full
  const c0 = seed.contributors[0];
  await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 15.5 });
  const pin = s.page.locator(`.maplibregl-marker[data-cc-id="${c0.id}"]`);
  const b = await pin.boundingBox();
  await s.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await s.page.waitForSelector('[data-mv2="tile-img"]');
  await s.page.waitForTimeout(800);
  const grab = () => s.page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[data-mv2="sheet"] button, [data-mv2="sheet"] a[href], [data-mv2="sheet"] [role="tab"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // a padded hit area (the handle's ::before) counts: hit-test 21 px either side of the centre
      let hit = true;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.min(r.width, r.height) < 44) for (const [dx, dy] of [[0, -21], [0, 21], [-21, 0], [21, 0]]) { const e = document.elementFromPoint(cx + dx, cy + dy); if (!e || (e !== el && !el.contains(e))) hit = false; }
      rows.push({ el: (el.getAttribute('aria-label') || el.getAttribute('data-mv2') || el.textContent || '').trim().slice(0, 24), w: +r.width.toFixed(1), h: +r.height.toFixed(1), under44: Math.min(r.width, r.height) < 44, hitOk: hit });
    });
    return rows;
  });
  out.m6_tap_targets_half = await grab();
  await s.page.locator('[data-mv2="handle"]').click();
  await s.page.waitForTimeout(500);
  out.m6_tap_targets_full = await grab();
  out.m6_summary = { half_under44_without_padded_hit_area: out.m6_tap_targets_half.filter((r) => r.under44 && !r.hitOk).map((r) => r.el + ' ' + r.w + 'x' + r.h), full_under44_without_padded_hit_area: out.m6_tap_targets_full.filter((r) => r.under44 && !r.hitOk).map((r) => r.el + ' ' + r.w + 'x' + r.h), total_half: out.m6_tap_targets_half.length, total_full: out.m6_tap_targets_full.length };
  console.log(JSON.stringify(out, null, 2));
  if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
} finally {
  await s.close();
  server.close();
}
