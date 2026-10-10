// One screenshot of the map screen with the fixture: node scripts/map-v2/shot.mjs <out.png> [query] [WxH] [zoom] [select]
//   select = contributor | event | place : tap the first such pin after jumping to the zoom
import { writeFileSync } from 'node:fs';
import { openSession, openMap, jumpTo, VIEWPORTS, FIXED_NOW } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';
const [out, query = '', vp = '390x844', zoom = '15.5', select = ''] = process.argv.slice(2);
const seed = smallSeed(FIXED_NOW);
const s = await openSession({ viewport: VIEWPORTS[vp], dsf: Number(process.env.DSF || 1), tiles: process.env.TILES || 'mock', seed, colorScheme: process.env.SCHEME || 'light', reducedMotion: !!process.env.REDUCED });
try {
  await openMap(s.page, '/' + query, { minMarkers: 8 });
  const c0 = seed.contributors[0];
  await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: Number(zoom) });
  if (select) {
    await s.page.locator(`.maplibregl-marker:has([data-cc-pin^="${select}"])`).first().click({ force: true });
    await s.page.waitForTimeout(900);
  }
  writeFileSync(out, await s.page.screenshot({ animations: 'disabled', caret: 'hide' }));
  console.log('saved', out, JSON.stringify({ pageErrors: s.log.pageErrors }));
} finally { await s.close(); }
