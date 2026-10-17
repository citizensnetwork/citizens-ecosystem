// R8 sign-off shots: the tilted map (and one flat reference) at the three phone sizes, real MapTiler tiles.
//   node scripts/map-v2/serve-static.mjs public 3100        (a built public/, in another terminal)
//   node scripts/map-v2/tilt-shots.mjs [outDir] [--pitch=45]
// Writes mapv2-tilt-<viewport>-<scene>.png (or mapv2-flat-... with --pitch=0). Scenes: "overview" (the app's own
// framing of Pretoria's pins at arrival), "street" (zoom 15.5 in the middle of the pins) and "sheet" (a Contributor
// opened at zoom 16, the sheet at half). The pitch is switched with a setter on window.MapV2 (see tilt-tiles.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openSession, openMap, jumpTo, settle, VIEWPORTS, FIXED_NOW } from './harness.mjs';
import { makeSeed, PRETORIA } from './fixtures.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return [a.slice(2, i < 0 ? undefined : i), i < 0 ? true : a.slice(i + 1)]; }));
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(process.cwd(), '..', '..', 'docs', 'audit', 'img'));
const pitch = args.pitch === undefined ? 45 : Number(args.pitch);
const prefix = pitch === 0 ? 'mapv2-flat' : 'mapv2-tilt';
mkdirSync(outDir, { recursive: true });
const seed = makeSeed({ contributors: 12, places: 20, events: 8, now: FIXED_NOW });

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const s = await openSession({ viewport, dsf: 1, tiles: 'real', seed, bypassCSP: false, mobile: true });
  await s.page.addInitScript((p) => {
    let store;
    Object.defineProperty(window, 'MapV2', { configurable: true, get() { return store; }, set(v) { store = v; if (v && typeof v === 'object') v.PITCH = p; } });
  }, pitch);
  try {
    await openMap(s.page, '/', { minMarkers: 8 });
    await settle(s.page, 2200);
    const shot = async (name) => writeFileSync(join(outDir, `${prefix}-${vpName}-${name}.png`), await s.page.screenshot({ animations: 'disabled', caret: 'hide' }));
    await shot('overview');
    await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 15.5 });
    await settle(s.page, 2200);
    await shot('street');
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 16 });
    await s.page.locator(`.maplibregl-marker[data-cc-id="${c0.id}"]`).click({ force: true });
    await s.page.waitForSelector("[data-mv2='sheet']");
    await settle(s.page, 2200);
    await s.page.waitForTimeout(700);
    await shot('sheet');
    console.log(vpName, 'pitch', Math.round(await s.page.evaluate(() => window.__ccMap.getPitch())), 'saved 3 shots');
  } finally { await s.close(); }
}
