// P1-09: which tile ratio (1:1 or 4:5) suits the images contributors actually upload, and how much of a
// flyer survives each crop (tracker: "choose tile aspect ratio from the median ratio of existing images").
//   node scripts/map-v2/image-ratios.mjs [--out=docs/audit/data/p1-09-image-ratios.json]
// Reads the PUBLIC directory API once (the same two calls the app makes), loads each image in a headless
// page to read its natural size, and prints numbers only: no names, no URLs, no personal data.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.MAPV2_PROD || 'https://www.citizenscentral.co.za';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.replace(/^--/, '').split('=')[0], i < 0 ? true : a.slice(i + 1)]; }));

const get = async (path) => (await fetch(BASE + path)).json();
const contributors = (await get('/api/v1/contributors?limit=100')).data || [];
const events = (await get('/api/v1/events?limit=100')).data || [];
const urls = [];
for (const c of contributors) {
  for (const p of Array.isArray(c.cover_photo_urls) ? c.cover_photo_urls : []) if (p && p.url) urls.push({ kind: 'contributor cover', url: p.url });
}
for (const e of events) if (e.image_url) urls.push({ kind: 'event image', url: e.image_url });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const sizes = [];
for (const { kind, url } of urls) {
  const dim = await page.evaluate((u) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = u; setTimeout(() => res(null), 15000); }), url);
  if (dim) sizes.push({ kind, w: dim[0], h: dim[1] });
}
await browser.close();

const visible = (r, t) => Math.min(r / t, t / r); // share of the picture's area that a cover crop keeps
const ratios = sizes.map((s) => s.w / s.h).sort((a, b) => a - b);
const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
const out = {
  counted: sizes.length,
  tried: urls.length,
  widthOverHeight: sizes.map((s) => +(s.w / s.h).toFixed(3)),
  median: median && +median.toFixed(3),
  portrait: sizes.filter((s) => s.h > s.w).length,
  landscape: sizes.filter((s) => s.w > s.h).length,
  square: sizes.filter((s) => s.w === s.h).length,
  areaKept_1to1: sizes.map((s) => +visible(s.w / s.h, 1).toFixed(2)),
  areaKept_4to5: sizes.map((s) => +visible(s.w / s.h, 0.8).toFixed(2)),
  meanAreaKept_1to1: sizes.length ? +(sizes.reduce((a, s) => a + visible(s.w / s.h, 1), 0) / sizes.length).toFixed(2) : null,
  meanAreaKept_4to5: sizes.length ? +(sizes.reduce((a, s) => a + visible(s.w / s.h, 0.8), 0) / sizes.length).toFixed(2) : null,
};
console.log(JSON.stringify(out, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
