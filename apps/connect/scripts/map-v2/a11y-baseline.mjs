// P0-05 (deep links) and P0-06 (accessibility baseline) on the flag-off page.
//   node scripts/map-v2/a11y-baseline.mjs
import { openSession, openMap, jumpTo, FIXED_NOW, BASE_URL, contrast } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';
import { readFileSync } from 'node:fs';

const out = {};
const seed = smallSeed(FIXED_NOW);

// ── P0-05: a real URL per type? (hermetic seed; example URLs contain no private data)
{
  const s = await openSession({
    viewport: { width: 390, height: 844 }, dsf: 1, tiles: 'mock', seed,
    // the per-slug detail route the deep link resolves a /c/<slug> through
    extraRoutes: async (page) => {
      await page.route('**/api/v1/contributors/*', (route) => {
        const slug = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
        const profile = seed.contributors.find((c) => c.contributor_slug === slug);
        return profile ? route.fulfill({ json: { data: { profile, upcoming_events: [], past_events: [], places: [], counts: {} } } }) : route.fulfill({ status: 404, json: { error: 'Contributor not found' } });
      });
    },
  });
  try {
    const res = {};
    const cases = {
      contributor: `/c/${seed.contributors[0].contributor_slug}`,
      place: `/p/${seed.places[0].id}`,
      event: `/e/${seed.events[0].id}`,
    };
    for (const [type, path] of Object.entries(cases)) {
      await s.page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded' });
      await s.page.waitForSelector('[data-screen]', { timeout: 20_000 });
      await s.page.waitForTimeout(1200);
      res[type] = { example: path.replace(seed.places[0].id, '<id>').replace(seed.events[0].id, '<id>'), screen: await s.page.getAttribute('[data-screen]', 'data-screen'), url: new URL(s.page.url()).pathname.replace(/[0-9a-f-]{36}/, '<id>') };
    }
    // legacy ?c= link still works
    await s.page.goto(BASE_URL + `/index.html?c=${seed.contributors[0].contributor_slug}`, { waitUntil: 'domcontentloaded' });
    await s.page.waitForSelector('[data-screen]', { timeout: 20_000 });
    await s.page.waitForTimeout(1200);
    res.legacy_c_param = { screen: await s.page.getAttribute('[data-screen]', 'data-screen'), url: new URL(s.page.url()).pathname };
    out.p0_05_deep_links = res;
  } finally { await s.close(); }
}

// ── P0-06: markers, focus, motion, labels
{
  const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 1, tiles: 'mock', seed });
  try {
    await openMap(s.page, '/', { minMarkers: 8 });
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 15.5 });
    out.p0_06_markers = await s.page.evaluate(() => {
      const el = document.querySelector('.maplibregl-marker');
      const cs = (n) => (n ? { role: n.getAttribute('role'), ariaLabel: n.getAttribute('aria-label'), tabindex: n.getAttribute('tabindex'), ariaHidden: n.getAttribute('aria-hidden') } : null);
      const svg = document.querySelector('.maplibregl-marker [data-cc-pin]');
      const label = document.querySelector('.cc-pin-label-text');
      return {
        markerWrapper: cs(el), pinGraphic: cs(svg),
        labelTextNode: label ? { text: label.textContent, ariaHidden: label.closest('[aria-hidden]') ? 'inside aria-hidden' : null } : null,
        focusableMarkers: [...document.querySelectorAll('.maplibregl-marker')].filter((m) => m.tabIndex >= 0).length,
        markerCount: document.querySelectorAll('.maplibregl-marker').length,
      };
    });
    // Tab to the first marker: is a focus indicator visible? (outline width on :focus-visible)
    await s.page.keyboard.press('Tab');
    const seq = [];
    for (let i = 0; i < 6; i++) {
      seq.push(await s.page.evaluate(() => { const a = document.activeElement; if (!a) return null; const st = getComputedStyle(a); return { tag: a.tagName, label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24), outline: st.outlineStyle + ' ' + st.outlineWidth, boxShadow: st.boxShadow === 'none' ? 'none' : 'set' }; }));
      await s.page.keyboard.press('Tab');
    }
    out.p0_06_tab_order_first_six = seq;
    // CSS inventory: how many rules mention :focus-visible and prefers-reduced-motion (index.html inline style + Tailwind-generated)
    out.p0_06_css = await s.page.evaluate(() => {
      let focusVisible = 0, reduced = 0, total = 0;
      for (const sheet of document.styleSheets) {
        let rules; try { rules = sheet.cssRules; } catch { continue; }
        const walk = (rs) => { for (const r of rs) { total++; const t = r.cssText || ''; if (/:focus-visible/.test(t)) focusVisible++; if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) reduced++; if (r.cssRules) walk(r.cssRules); } };
        walk(rules);
      }
      return { rulesScanned: total, focusVisibleRules: focusVisible, reducedMotionMediaBlocks: reduced };
    });
  } finally { await s.close(); }
}

// ── category colour contrast (M5 inputs): every category hex vs white and vs the map bases
{
  const src = readFileSync('src/frontend/app/data.jsx', 'utf8');
  const hexes = [...new Set([...src.matchAll(/hex: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase()))];
  const bases = { white: '#FFFFFF', 'prod-map-base hsl(60,23%,97%)': '#F9F9F6', '--map-bg': '#EDE5D4' };
  const rows = hexes.map((h) => ({ hex: h, ...Object.fromEntries(Object.entries(bases).map(([k, v]) => [k, +contrast(h, v).toFixed(2)])) }));
  out.p0_06_category_contrast = { count: rows.length, below3_vs_white: rows.filter((r) => r.white < 3).map((r) => r.hex), below3_vs_prod_base: rows.filter((r) => r['prod-map-base hsl(60,23%,97%)'] < 3).map((r) => r.hex), rows };
}
console.log(JSON.stringify(out, null, 2));
