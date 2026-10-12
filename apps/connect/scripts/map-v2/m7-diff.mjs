// M7: pixel difference between two screenshot sets taken in the same run on one machine.
//   node scripts/map-v2/m7-diff.mjs <dirA> <prefixA> <dirB> <prefixB> [maxRatio=0.001]
// Pairs are matched by the part of the file name after the prefix. Exits 1 when any pair
// differs by more than maxRatio (tracker M7: 0.1 %). Dependency-free: both PNGs are decoded
// in a headless page and compared channel by channel (threshold 0 = any change counts).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { pngDiff } from './harness.mjs';

const [dirA, prefixA, dirB, prefixB, max = '0.001'] = process.argv.slice(2);
const maxRatio = Number(max);
const list = (dir, prefix) => readdirSync(resolve(dir)).filter((f) => f.startsWith(prefix + '-') && f.endsWith('.png')).sort();
const A = list(dirA, prefixA);
const B = new Set(list(dirB, prefixB));

const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
let failed = 0;
for (const fa of A) {
  const key = fa.slice(prefixA.length + 1);
  const fb = `${prefixB}-${key}`;
  if (!B.has(fb)) {
    rows.push({ key, result: 'MISSING in B' });
    failed++;
    continue;
  }
  const r = await pngDiff(page, readFileSync(join(resolve(dirA), fa)), readFileSync(join(resolve(dirB), fb)));
  if (r.sizeMismatch) failed++;
  else if (r.ratio > maxRatio) failed++;
  rows.push({ key, ...(r.sizeMismatch ? { result: 'SIZE MISMATCH', a: r.a, b: r.b } : { diffPixels: r.diff, total: r.total, ratioPercent: +(r.ratio * 100).toFixed(4) }) });
}
await browser.close();
console.log(JSON.stringify({ A: `${dirA}/${prefixA}-*`, B: `${dirB}/${prefixB}-*`, maxRatioPercent: maxRatio * 100, rows }, null, 2));
if (failed) {
  console.error(`${failed} pair(s) over the limit or missing`);
  process.exit(1);
}
