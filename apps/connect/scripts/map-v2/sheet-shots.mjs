// Evidence screenshots of the Map v2 sheet: peek / half / full at the three viewports (a Contributor with
// events, news-less, and photos), a Place and an Event at half, and the photo viewer.
//   node scripts/map-v2/sheet-shots.mjs [outDir] [--theme=light|dark] [--tiles=mock|real]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openSession, openMap, jumpTo, VIEWPORTS, FIXED_NOW } from './harness.mjs';
import { makeSeed } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return [a.replace(/^--/, '').split('=')[0], i < 0 ? true : a.slice(i + 1)]; }));
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(process.cwd(), '..', '..', 'docs', 'audit', 'img'));
const theme = args.theme || 'light';
const prefix = theme === 'dark' ? 'mapv2-sheet-dark' : 'mapv2-sheet';
mkdirSync(outDir, { recursive: true });

const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${(n * 53) % 360} 45% 45%)"/><text x="150" y="215" text-anchor="middle" font-size="64" font-family="Arial" fill="#fff">${n}</text></svg>`;
const seed = makeSeed({ contributors: 3, places: 3, events: 2, now: FIXED_NOW, spread: 0.004, seed: 11 });
seed.places[0].open_hours = 'Mon-Fri 08:00-17:00, Sat 09:00-13:00';
seed.places[0].phone = '+27 12 345 6789';

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const s = await openSession({
    viewport, dsf: 1, tiles: args.tiles || 'mock', seed, colorScheme: theme, bypassCSP: true,
    extraRoutes: async (page) => {
      await page.route('**/fixture-img/*.svg', (r) => r.fulfill({ contentType: 'image/svg+xml', body: svg(Number(/(\d+)\.svg/.exec(r.request().url())[1])) }));
      await page.route('**/api/v1/contributors/*', (route) => {
        const slug = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
        const profile = seed.contributors.find((c) => c.contributor_slug === slug);
        const gallery = Array.from({ length: 9 }, (_, i) => `http://localhost:3100/fixture-img/${i + 1}.svg`);
        return route.fulfill({ json: { data: { profile: { ...profile, gallery_urls: gallery }, upcoming_events: [], past_events: [], places: [], counts: {} } } });
      });
    },
  });
  try {
    await openMap(s.page, '/?map=v2', { minMarkers: 8 });
    if (theme === 'dark') await s.page.evaluate(() => window.MapV2.setTheme('dark'));
    const shot = async (name) => writeFileSync(join(outDir, `${prefix}-${vpName}-${name}.png`), await s.page.screenshot({ animations: 'disabled', caret: 'hide' }));
    const open = async (el, lng, lat) => {
      await jumpTo(s.page, { lng, lat, zoom: 16 });
      await s.page.locator(`.maplibregl-marker[data-cc-id="${el.id}"]`).click({ force: true });
      await s.page.waitForSelector("[data-mv2='sheet']");
      await s.page.waitForTimeout(900);
    };
    const handle = () => s.page.locator("[data-mv2='handle']");
    const c = seed.contributors[1]; // events[1] belongs to contributor 2
    await open(c, c.physical_longitude, c.physical_latitude);
    await s.page.waitForSelector("[data-mv2='tile-img']", { timeout: 5000 }).catch(() => {});
    await shot('contributor-half');
    if (viewport.width < 768) {
      await handle().click(); await s.page.waitForTimeout(600); await shot('contributor-full');
      await handle().click(); await s.page.waitForTimeout(400);
      // to peek: drag the handle down slowly
      const b = await handle().boundingBox();
      await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await s.page.mouse.down();
      for (let i = 1; i <= 10; i++) { await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (viewport.height * 0.33 * i) / 10); await s.page.waitForTimeout(100); }
      await s.page.mouse.up(); await s.page.waitForTimeout(600); await shot('contributor-peek');
    }
    if (vpName === '390x844') {
      await s.page.keyboard.press('Escape');
      const p = seed.places[0];
      await open({ id: p.id }, p.longitude, p.latitude); await shot('place-half');
      await s.page.keyboard.press('Escape');
      const e = seed.events[0];
      await open({ id: e.id }, e.longitude, e.latitude); await shot('event-half');
      await s.page.keyboard.press('Escape');
      await open(seed.contributors[2], seed.contributors[2].physical_longitude, seed.contributors[2].physical_latitude);
      await s.page.getByRole('tab', { name: 'Gallery' }).click().catch(() => {});
      await s.page.locator("[data-mv2='tile-btn']").first().click().catch(() => {});
      await s.page.waitForTimeout(500);
      await shot('photo-viewer');
    }
    console.log(vpName, 'ok', JSON.stringify(s.log.pageErrors));
  } finally { await s.close(); }
}
