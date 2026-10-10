// P1-13 QA matrix: the Map v2 map screen and sheet at five viewports, light and dark, with touch where it
// applies, a keyboard-only pass and a clean-console check.
//   node scripts/map-v2/qa-matrix.mjs [--out=docs/audit/data/phase1-qa-matrix.json] [--shots=docs/audit/img]
// Hermetic (no real Supabase); tiles are the mocked blank base, so contrast on real tiles is measured by
// pin-contrast.mjs, not here. Rows: PASS / FAIL with the reason.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openSession, openMap, jumpTo, FIXED_NOW } from './harness.mjs';
import { makeSeed } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.replace(/^--/, '').split('=')[0], i < 0 ? true : a.slice(i + 1)]; }));
const VIEWPORTS = { '360x800': [360, 800], '390x844': [390, 844], '412x915': [412, 915], '768x1024': [768, 1024], '1280x800': [1280, 800] };
const SHOT_VPS = new Set(['360x800', '390x844', '768x1024']);
const shotsDir = args.shots ? resolve(args.shots) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const seed = makeSeed({ contributors: 3, places: 3, events: 2, now: FIXED_NOW, spread: 0.004, seed: 11 });
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="hsl(${(n * 53) % 360} 45% 45%)"/></svg>`;
const rows = [];
const check = (vp, theme, name, ok, detail = '') => rows.push({ vp, theme, check: name, result: ok ? 'PASS' : 'FAIL', detail });

for (const [vpName, [width, height]] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark']) {
    const mobile = width < 768;
    const s = await openSession({
      viewport: { width, height }, dsf: 1, mobile, tiles: 'mock', seed, colorScheme: theme, bypassCSP: true,
      extraRoutes: async (page) => {
        await page.route('**/fixture-img/*.svg', (r) => r.fulfill({ contentType: 'image/svg+xml', body: svg(1) }));
        await page.route('**/api/v1/contributors/*', (route) => {
          const slug = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
          const profile = seed.contributors.find((c) => c.contributor_slug === slug);
          return route.fulfill({ json: { data: { profile: { ...profile, gallery_urls: [1, 2, 3].map((n) => `http://localhost:3100/fixture-img/${n}.svg`) }, upcoming_events: [], past_events: [], places: [], counts: {} } } });
        });
      },
    });
    const p = s.page;
    try {
      await openMap(p, '/?map=v2', { minMarkers: 8 });
      if (theme === 'dark') await p.evaluate(() => window.MapV2.setTheme('dark'));
      check(vpName, theme, 'data-theme matches the chosen look', (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === theme);
      const c = seed.contributors[1];
      await jumpTo(p, { lng: c.physical_longitude, lat: c.physical_latitude, zoom: 16 });
      const pin = p.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`);

      // open: a tap on a touch screen, a click elsewhere
      const box = await pin.boundingBox();
      if (mobile) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); else await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForSelector("[data-mv2='sheet']", { timeout: 5000 });
      await p.waitForTimeout(900);
      const sheet = await p.evaluate(() => {
        const e = document.querySelector("[data-mv2='sheet']");
        const r = e.getBoundingClientRect();
        const head = document.querySelector('[data-map-sheet-header]').getBoundingClientRect();
        return { w: Math.round(r.width), top: Math.round(r.top), headVisible: head.top >= 0 && head.bottom <= innerHeight, wide: e.hasAttribute('data-wide'), overflowX: document.documentElement.scrollWidth > innerWidth };
      });
      check(vpName, theme, 'the sheet opens on a ' + (mobile ? 'tap' : 'click') + ' and its header is on screen', sheet.headVisible, JSON.stringify(sheet));
      check(vpName, theme, mobile ? 'bottom sheet spans the width' : 'side panel is 380 px wide', mobile ? sheet.w === width : sheet.w === 380 && sheet.wide, `w=${sheet.w}`);
      check(vpName, theme, 'no horizontal scroll', !sheet.overflowX);

      // every control in the sheet is a 44 px target (or has a padded hit area)
      const small = await p.evaluate(() => {
        const bad = [];
        document.querySelectorAll("[data-mv2='sheet'] button, [data-mv2='sheet'] a[href], [data-mv2='sheet'] [role='tab']").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || Math.min(r.width, r.height) >= 44) return;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const ok = [[0, -21], [0, 21]].every(([dx, dy]) => { const h = document.elementFromPoint(cx + dx, cy + dy); return h && (h === el || el.contains(h)); });
          if (!ok) bad.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
        return bad;
      });
      check(vpName, theme, 'sheet controls are 44 px targets', small.length === 0, small.join('; '));

      if (shotsDir && SHOT_VPS.has(vpName)) writeFileSync(join(shotsDir, `qa-${vpName}-${theme}.png`), await p.screenshot({ animations: 'disabled', caret: 'hide' }));

      // keyboard only: Escape closes and returns focus to the pin; Tab reaches pins; Enter opens
      await p.keyboard.press('Escape');
      check(vpName, theme, 'Escape closes the sheet', (await p.locator("[data-mv2='sheet']").count()) === 0);
      await p.waitForTimeout(150);
      let reached = false;
      for (let i = 0; i < 80 && !reached; i++) {
        await p.keyboard.press('Tab');
        reached = await p.evaluate(() => !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('mv2-marker')));
      }
      check(vpName, theme, 'Tab reaches a map pin', reached);
      if (reached) {
        const ring = await p.evaluate(() => { const st = getComputedStyle(document.activeElement); return st.outlineStyle + ' ' + st.outlineWidth; });
        check(vpName, theme, 'the focused pin shows a 2 px focus ring', ring === 'solid 2px', ring);
        await p.keyboard.press('Enter');
        await p.waitForSelector("[data-mv2='sheet']", { timeout: 5000 });
        await p.waitForTimeout(400);
        const inside = await p.evaluate(() => document.querySelector("[data-mv2='sheet']").contains(document.activeElement));
        check(vpName, theme, 'Enter opens the sheet and moves focus inside it', inside);
        const rings = await p.evaluate(() => {
          const items = [...document.querySelectorAll("[data-mv2='sheet'] button, [data-mv2='sheet'] a[href]")].filter((e) => e.getBoundingClientRect().width);
          return items.length;
        });
        check(vpName, theme, 'the sheet has focusable controls', rings >= 4, 'count=' + rings);
        await p.keyboard.press('Escape');
        await p.waitForTimeout(200);
        const back = await p.evaluate(() => !!(document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-cc-id')));
        check(vpName, theme, 'focus returns to the pin on close', back);
      }
      const errors = s.log.pageErrors.concat(s.log.console.filter((m) => m.startsWith('error')));
      check(vpName, theme, 'console clean: no page errors and no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    } catch (e) {
      check(vpName, theme, 'run completed', false, String(e.message || e).slice(0, 200));
    } finally { await s.close(); }
  }
}
const failed = rows.filter((r) => r.result === 'FAIL');
const out = { fixedNow: new Date(FIXED_NOW).toISOString(), total: rows.length, failed: failed.length, rows };
console.log(JSON.stringify({ total: out.total, failed: out.failed, failures: failed }, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
process.exit(failed.length ? 1 : 0);
