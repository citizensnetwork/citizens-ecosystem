// One real-tile screenshot (the production style, from .env.local), flag as given.
//   node scripts/map-v2/realtiles-shot.mjs <out.png> [flag] [zoom] [styleOverrideId]
import { writeFileSync } from 'node:fs';
import { openSession, openMap, jumpTo, FIXED_NOW } from './harness.mjs';
import { smallSeed } from './fixtures.mjs';
const [out, flag = '', zoom = '14.5', styleId = ''] = process.argv.slice(2);
const seed = smallSeed(FIXED_NOW);
const s = await openSession({ viewport: { width: 390, height: 844 }, dsf: 1, tiles: 'real', seed });
try {
  await openMap(s.page, flag ? `/?map=${flag}` : '/', { minMarkers: 8 });
  if (styleId) await s.page.evaluate(async (id) => { window.__ccMap.setStyle('https://api.maptiler.com/maps/' + id + '/style.json?key=' + window.__CC_ENV.MAPTILER_KEY); await new Promise((r) => { window.__ccMap.once('idle', r); setTimeout(r, 6000); }); }, styleId);
  const c0 = seed.contributors[0];
  await jumpTo(s.page, { lng: c0.physical_longitude, lat: c0.physical_latitude, zoom: Number(zoom) });
  await s.page.waitForTimeout(2500);
  writeFileSync(out, await s.page.screenshot());
  console.log('saved', out);
} finally { await s.close(); }
