// M3 comparison with interleaved repeats and the no-marker floor: node scripts/map-v2/m3-compare.mjs <variantsJson> [reps]
import { openSession, openMap, jumpTo, percentile, FIXED_NOW } from './harness.mjs';
import { makeSeed, PRETORIA } from './fixtures.mjs';
const seed = makeSeed({ contributors: 50, places: 75, events: 25, now: FIXED_NOW, spread: 0.12, seed: 99 });
const variants = JSON.parse(process.argv[2]);   // { name: {q, css} }
const reps = Number(process.argv[3] || 5);
const res = {}; Object.keys(variants).forEach((k) => (res[k] = []));
for (let i = 0; i < reps; i++) {
  for (const [name, v] of Object.entries(variants)) {
    const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 3, cpu: 4, network: false, tiles: 'mock', seed, extraRoutes: v.abortCss ? async (page) => { await page.route('**/map-v2.css**', (r) => r.abort()); } : undefined });
    try {
      await openMap(s.page, v.q, { minMarkers: 150 });
      if (v.css) await s.page.addStyleTag({ content: v.css });
      if (v.js) await s.page.evaluate(v.js);
      await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 13 });
      const r = await s.page.evaluate(() => new Promise((resolve) => {
        const map = window.__ccMap; const d = []; let last = performance.now(); const t0 = last; const c = map.getCenter();
        const f = (t) => { d.push(t - last); last = t; const k = (t - t0) / 1000; map.jumpTo({ center: [c.lng + Math.sin(k * 1.3) * 0.012, c.lat + Math.cos(k * 0.9) * 0.008] }, { originalEvent: {} }); if (t - t0 < 4000) requestAnimationFrame(f); else resolve(d.slice(2)); };
        requestAnimationFrame(f);
      }));
      const sorted = [...r].sort((a, b) => a - b);
      res[name].push([percentile(sorted, 50), percentile(sorted, 95)]);
    } finally { await s.close(); }
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const [k, a] of Object.entries(res)) console.log(k.padEnd(20), 'median p50', med(a.map((x) => x[0])).toFixed(0), 'median p95', med(a.map((x) => x[1])).toFixed(0), ' all p95:', a.map((x) => x[1].toFixed(0)).join(','));
