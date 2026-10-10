// P0-01 / M7: flag-off baseline screenshots, one run, one machine.
//   node scripts/map-v2/baseline-shots.mjs [outDir] [prefix]
// Defaults write docs/audit/img/baseline-flagoff-*.png. Run it again after the
// code changes with a different prefix and `node scripts/map-v2/m7-diff.mjs`
// compares the two sets (tracker Appendix C, M7).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openSession, openMap, jumpTo, VIEWPORTS, FIXED_NOW } from './harness.mjs';
import { smallSeed, PRETORIA } from './fixtures.mjs';

const outDir = resolve(process.argv[2] || join(process.cwd(), '..', '..', 'docs', 'audit', 'img'));
const prefix = process.argv[3] || 'baseline-flagoff';
mkdirSync(outDir, { recursive: true });

const summary = {};
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const seed = smallSeed(FIXED_NOW);
  const s = await openSession({ viewport, dsf: 1, tiles: 'mock', seed });
  try {
    await openMap(s.page, '/', { minMarkers: 8 });
    // Map at neighbourhood zoom, labels off (z < 15) then on (z >= 15).
    await jumpTo(s.page, { lng: PRETORIA.lng, lat: PRETORIA.lat, zoom: 12.5 });
    writeFileSync(join(outDir, `${prefix}-${name}-z12.png`), await s.page.screenshot());
    // z15.5, centred on the first Contributor so it is on screen at every viewport.
    const c0 = seed.contributors[0];
    await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: 15.5 });
    writeFileSync(join(outDir, `${prefix}-${name}-z15.png`), await s.page.screenshot());

    // Tap a Contributor pin: the v1 preview card.
    const pin = s.page.locator('.maplibregl-marker:has([data-cc-pin^="contributor"])').first();
    await pin.click({ force: true });
    await s.page.waitForSelector('[data-entity-card]', { timeout: 5000 });
    await s.page.waitForTimeout(700); // slide-up-panel / card transitions
    const box = await s.page.locator('[data-entity-card]').first().boundingBox();
    writeFileSync(join(outDir, `${prefix}-${name}-card.png`), await s.page.screenshot());
    summary[name] = { card: box, errors: s.log.pageErrors, consoleCount: s.log.console.length };
  } finally {
    await s.close();
  }
}
console.log(JSON.stringify({ fixedNow: new Date(FIXED_NOW).toISOString(), outDir, summary }, null, 2));
