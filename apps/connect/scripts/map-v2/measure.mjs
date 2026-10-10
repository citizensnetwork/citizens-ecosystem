// M1, M3, M4, M6 on the page as it stands (tracker Appendix C). Works for v1 and,
// with --flag=v2, for the Map v2 sheet. Output is JSON on stdout.
//
//   node scripts/map-v2/measure.mjs [--flag=v2] [--tiles=mock|real] [--pins=150] [--runs=10] [--only=m1,m3,m4,m6]
//
// Profile (Appendix C): Chromium via CDP, CPU x4, DevTools "Fast 4G" values,
// 390x844, device scale factor 3, mobile touch. Mock tiles = the base map draws
// nothing, so M3 then measures what Map v2 adds (the DOM markers); `--tiles=real`
// adds the real MapTiler tile work and uses the .env.local key (a handful of
// tile requests, run it once, not in a loop).
import { openSession, openMap, jumpTo, percentile, FAST_4G, FIXED_NOW } from './harness.mjs';
import { makeSeed, smallSeed, PRETORIA } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const flag = args.flag || '';
const tiles = args.tiles || 'mock';
const pins = Number(args.pins || 150);
const runs = Number(args.runs || 10);
const only = (args.only || 'm1,m3,m4,m6').split(',');
const query = flag ? `/?map=${flag}` : '/';

const profile = { viewport: '390x844', dsf: 3, cpu: 4, network: FAST_4G, tiles, flag: flag || '(never set)', fixedNow: new Date(FIXED_NOW).toISOString() };
const out = { profile };

async function m1m4() {
  const seed = smallSeed(FIXED_NOW);
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, cpu: 4, network: true, tiles, seed });
  try {
    await openMap(s.page, query, { minMarkers: 8 });
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 15.5 });
    // Page-side probes: pointerup mark, header appearance (double rAF), layout shifts since the tap.
    await s.page.evaluate(() => {
      window.__m = { tap: null, header: null, cls: 0, shifts: [] };
      document.addEventListener('pointerup', () => {
        window.__m.tap = performance.now(); window.__m.header = null; window.__m.cls = 0; window.__m.shifts = [];
        const poll = () => {
          // v1: the EntityCard; v2: the sheet's header (data-map-sheet-header) - whichever shows first.
          const hit = document.querySelector('[data-map-sheet-header], [data-entity-card]');
          if (hit) requestAnimationFrame(() => requestAnimationFrame(() => { window.__m.header = performance.now(); }));
          else requestAnimationFrame(poll);
        };
        poll();
      }, true);
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput && window.__m.tap != null && e.startTime >= window.__m.tap) { window.__m.cls += e.value; window.__m.shifts.push(+e.value.toFixed(4)); }
      }).observe({ type: 'layout-shift', buffered: false });
    });
    const times = []; const cls = [];
    for (let i = 0; i < runs; i++) {
      const pin = s.page.locator('.maplibregl-marker:has([data-cc-pin^="contributor"])').first();
      const b = await pin.boundingBox();
      await s.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await s.page.waitForFunction(() => window.__m.header != null, undefined, { timeout: 10_000 });
      await s.page.waitForTimeout(1500); // let content settle so CLS covers load too
      const r = await s.page.evaluate(() => ({ dt: window.__m.header - window.__m.tap, cls: window.__m.cls }));
      times.push(r.dt); cls.push(r.cls);
      // Deselect: tap empty map, wait until the surface is gone.
      await s.page.mouse.click(195, 200);
      await s.page.waitForFunction(() => !document.querySelector('[data-map-sheet-header], [data-entity-card]'), undefined, { timeout: 5000 }).catch(() => {});
      await s.page.waitForTimeout(300);
    }
    const sorted = [...times].sort((a, b) => a - b);
    out.m1_tap_to_header_ms = { runs: times.map((t) => +t.toFixed(1)), median: +percentile(sorted, 50).toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1) };
    out.m4_cls = { runs: cls.map((c) => +c.toFixed(4)), worst: Math.max(...cls) };
  } finally { await s.close(); }
}

// M3 as written (CPU x4, programmatic jumpTo on every frame, 10 s) has a floor: the
// same pan with every marker hidden already costs more than the 20 ms target on a
// laptop GPU (P0-04, 2026-10-10), so each run reports three numbers per zoom:
//   p95 at the profile (CPU x4) | the no-marker floor at CPU x4 | p95 at CPU x1.
// What the pins add is the difference between the first two.
async function pan(cpu, hideMarkers, seed, zoom) {
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, cpu, network: cpu > 1, tiles, seed });
  try {
    await openMap(s.page, query, { minMarkers: pins });
    if (hideMarkers) await s.page.addStyleTag({ content: '.maplibregl-marker{display:none!important}' });
    await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom });
    const r = await s.page.evaluate(() => new Promise((resolve) => {
      const map = window.__ccMap; const deltas = []; let last = performance.now(); const t0 = last;
      const c = map.getCenter();
      const frame = (t) => {
        deltas.push(t - last); last = t;
        const k = (t - t0) / 1000; // a sine sweep, so the pan never stops or leaves the data
        map.jumpTo({ center: [c.lng + Math.sin(k * 1.3) * 0.012, c.lat + Math.cos(k * 0.9) * 0.008] }, { originalEvent: {} });
        if (t - t0 < 10_000) requestAnimationFrame(frame); else resolve(deltas.slice(2));
      };
      requestAnimationFrame(frame);
    }));
    const sorted = [...r].sort((a, b) => a - b);
    return { gpu: s.gpu, frames: r.length, p50: +percentile(sorted, 50).toFixed(1), p95: +percentile(sorted, 95).toFixed(1), p99: +percentile(sorted, 99).toFixed(1), above32ms: r.filter((d) => d > 32).length, max: +sorted[sorted.length - 1].toFixed(1) };
  } finally { await s.close(); }
}

async function m3() {
  const nC = Math.round(pins / 3), nP = Math.round(pins / 2);
  const seed = makeSeed({ contributors: nC, places: nP, events: pins - nC - nP, now: FIXED_NOW, spread: 0.12, seed: 99 });
  const res = { pins };
  for (const zoom of [13, 15.5]) {
    res[`z${zoom}`] = {
      profile_cpu4: await pan(4, false, seed, zoom),
      floor_cpu4_no_markers: await pan(4, true, seed, zoom),
      cpu1: await pan(1, false, seed, zoom),
    };
  }
  out.m3_pan_frame_ms = res;
}

async function m6() {
  const seed = smallSeed(FIXED_NOW);
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, tiles, seed });
  try {
    await openMap(s.page, query, { minMarkers: 8 });
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 15.5 });
    const grab = () => s.page.evaluate(() => {
      const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).trim().slice(0, 28);
      const rows = [];
      document.querySelectorAll('button, a[href], input, [role="button"], .maplibregl-marker').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // A marker's tap target is its wrapper (the hit area); also report the drawn pin.
        const drawn = el.matches('.maplibregl-marker') ? el.querySelector('[data-cc-pin]') : null;
        const d = drawn ? drawn.getBoundingClientRect() : null;
        rows.push({ el: el.matches('.maplibregl-marker') ? 'pin:' + (drawn ? drawn.getAttribute('data-cc-pin') : '?') : label(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), drawn: d ? [+d.width.toFixed(1), +d.height.toFixed(1)] : undefined });
      });
      return rows;
    });
    const before = await grab();
    const pin = s.page.locator('.maplibregl-marker:has([data-cc-pin^="contributor"])').first();
    const b = await pin.boundingBox();
    await s.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await s.page.waitForSelector('[data-map-sheet-header], [data-entity-card]', { timeout: 5000 });
    await s.page.waitForTimeout(800);
    const after = await grab();
    const under = (rows) => rows.filter((r) => Math.min(r.w, r.h) < 44);
    out.m6_tap_targets = { total_before_open: before.length, under44_map_screen: under(before), total_after_open: after.length, under44_with_surface_open: under(after) };
  } finally { await s.close(); }
}

if (only.includes('m1') || only.includes('m4')) await m1m4();
if (only.includes('m3')) await m3();
if (only.includes('m6')) await m6();
console.log(JSON.stringify(out, null, 2));
