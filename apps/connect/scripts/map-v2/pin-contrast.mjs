// M5 for pins, from RENDERED pixels (tracker P1-04 / P1-12, Appendix B --pin-border): how well does a
// pin's outer edge separate from the map pixels around it?
//   node scripts/map-v2/pin-contrast.mjs [--theme=light|dark] [--out=docs/audit/data/pin-contrast-light.json]
// Real tiles (the production style from .env.local; a dozen tile requests). For each round pin (a
// Contributor disc at zoom 12 and 15.5, a Place circle) it casts rays from the pin centre, takes the
// darkest or lightest pixel across the pin's outer edge and compares it with the map pixel 5 CSS px
// beyond it (WCAG ratio). Reports min and median over the rays that do not cross the tail, label or
// another element. Pass = median >= 3:1.
import { writeFileSync } from 'node:fs';
import { openSession, openMap, jumpTo, FIXED_NOW } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const theme = args.theme || 'light';
const seed = smallSeed(FIXED_NOW);
const DSF = 3;
const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: DSF, tiles: 'real', seed, colorScheme: theme });
const out = { theme, dsf: DSF, results: {} };
try {
  await openMap(s.page, '/?map=v2', { minMarkers: 8 });
  if (theme === 'dark') {
    await s.page.evaluate(() => window.MapV2.setTheme('dark'));
    // the dark base style swap is P1-12: until it lands this samples the dark TOKENS over whatever base is drawn
    await s.page.waitForTimeout(1500);
  }
  const c0 = seed.contributors[0];
  const measure = async (zoom, selector, label, radiusOf, at = { lng: c0.physical_longitude, lat: c0.physical_latitude }) => {
    await jumpTo(s.page, { lng: at.lng, lat: at.lat, zoom });
    await s.page.waitForTimeout(2200); // tiles, logo fade
    // keep the pin away from the controls, then read where it is
    const info = await s.page.evaluate(([sel]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    }, [selector]);
    if (!info) return { error: 'selector not found: ' + selector };
    const R = radiusOf(info);
    const shot = await s.page.screenshot({ animations: 'disabled', caret: 'hide' });
    const res = await s.page.evaluate(async ([b64, cx, cy, R, dsf]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const g = cv.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const px = (x, y) => { const d = g.getImageData(Math.round(x * dsf), Math.round(y * dsf), 1, 1).data; return [d[0], d[1], d[2]]; };
      const lum = ([r, gg, b]) => { const v = [r, gg, b].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const rows = [];
      for (let deg = 0; deg < 360; deg += 15) {
        // skip the downward cone: the tail, the label and the +N / badge live there or at the corners
        if (deg > 60 && deg < 120) continue;
        const a = (deg * Math.PI) / 180;
        const at = (rr) => px(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        const base = at(R + 5);
        // the edge: scan R-1 .. R+2 for the pixel that differs most from the base
        let best = null;
        for (let rr = R - 1; rr <= R + 2; rr += 0.25) {
          const p = at(rr);
          const c = ratio(p, base);
          if (!best || c > best.c) best = { c, p };
        }
        rows.push({ deg, ratio: best.c });
      }
      const rs = rows.map((r) => r.ratio).sort((x, y) => x - y);
      return { rays: rows.length, min: rs[0], median: rs[Math.floor(rs.length / 2)], max: rs[rs.length - 1] };
    }, [shot.toString('base64'), info.cx, info.cy, R, DSF]);
    return { label, zoom, ...res, pass: res.median >= 3 };
  };
  // the name label: the pixel that differs most from the map around the text (the halo is part of the design,
  // so this is the contrast a reader actually gets), against the median of the ring just outside it
  const measureLabel = async (zoom, selector, label, at) => {
    await jumpTo(s.page, { lng: at.lng, lat: at.lat, zoom });
    await s.page.waitForTimeout(2200);
    const rect = await s.page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, selector);
    if (!rect) return { error: 'selector not found: ' + selector };
    const shot = await s.page.screenshot({ animations: 'disabled', caret: 'hide' });
    const res = await s.page.evaluate(async ([b64, r, dsf]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const g = cv.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const lum = (d, i) => { const v = [d[i], d[i + 1], d[i + 2]].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const px = (x, y, w, h) => g.getImageData(Math.round(x * dsf), Math.round(y * dsf), Math.max(1, Math.round(w * dsf)), Math.max(1, Math.round(h * dsf)));
      const inner = px(r.x, r.y, r.w, r.h);
      // ring: 3 CSS px bands above and below the text box
      const ringLums = [];
      for (const band of [px(r.x, r.y - 6, r.w, 3), px(r.x, r.y + r.h + 3, r.w, 3)]) for (let i = 0; i < band.data.length; i += 4) ringLums.push(lum(band.data, i));
      ringLums.sort((a, b) => a - b);
      const bg = ringLums[Math.floor(ringLums.length / 2)];
      let far = bg;
      for (let i = 0; i < inner.data.length; i += 4) { const l = lum(inner.data, i); if (Math.abs(l - bg) > Math.abs(far - bg)) far = l; }
      return { ratio: (Math.max(far, bg) + 0.05) / (Math.min(far, bg) + 0.05) };
    }, [shot.toString('base64'), rect, DSF]);
    return { label, zoom, ratio: res.ratio, pass: res.ratio >= 4.5 };
  };
  // contributor disc: 48 px, scaled 0.8333 (glyph state) or 1 (logo state), centred in the 48 x 56 body
  out.results.contributor_glyph_z12 = await measure(12, '.mv2-pin--contributor [data-mv2="disc"]', 'Contributor glyph pin', (i) => i.w / 2);
  out.results.contributor_logo_z15 = await measure(15.5, '.mv2-pin--contributor [data-mv2="disc"]', 'Contributor logo pin', (i) => i.w / 2);
  out.results.place_z15 = await measure(15.5, '.mv2-pin--place [data-mv2="body"]', 'Place circle', (i) => i.w / 2 - 3, { lng: seed.places[0].longitude, lat: seed.places[0].latitude });
  out.results.label_z15 = await measureLabel(15.5, '.mv2-pin--contributor [data-mv2="label-text"]', 'Pin name label (text vs the map around it)', { lng: c0.physical_longitude, lat: c0.physical_latitude });
  console.log(JSON.stringify(out, null, 2));
  if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
} finally { await s.close(); }
