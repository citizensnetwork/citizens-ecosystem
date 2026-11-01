// Lighthouse, several runs per variant, interleaved, with medians (tracker section 8A, R4).
//
//   node scripts/map-v2/lighthouse-batch.mjs --tool-dir <dir> --chrome <chrome.exe> --out <dir> [--runs 5] label=url [label=url ...]
//   e.g. ... --runs 5 production=https://www.citizenscentral.co.za/ preview=https://<preview>.vercel.app/   (?map=v1 no longer selects an old map)
//
// Local tool, not shipped, not a test. Lighthouse is NOT a repo dependency and is never added to one:
//   1. Ask the founder before downloading it (a download needs their yes each time).
//   2. Install it into its OWN new, empty directory with scripts off:
//        npm install lighthouse@12.8.2 --ignore-scripts --no-audit --no-fund      (run inside that directory)
//      12.8.2 is the version the earlier numbers (docs/audit/data/lighthouse-preview-08458ac.json) used.
//   3. Point --tool-dir at that directory. Lighthouse runs with --out as its working directory, never from the repo
//      and never from the tool directory.
// The default mobile profile applies (simulated slow 4G, CPU x4). Only the landing screen can be measured:
// a fresh profile lands on the sign-in splash, and guest mode lives in sessionStorage.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = {};
const specs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else specs.push(args[i]);
}
const need = (k) => {
  if (!opt[k]) { console.error('missing --' + k); process.exit(2); }
  return opt[k];
};
const toolDir = resolve(need('tool-dir'));
const chrome = resolve(need('chrome'));
const outDir = resolve(need('out'));
const RUNS = Number(opt.runs) || 5;
const variants = specs.map((s) => {
  const i = s.indexOf('=');
  const url = new URL(s.slice(i + 1)); // throws on garbage
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs: ' + s);
  return { label: s.slice(0, i), url: url.href };
});
if (!variants.length) { console.error('give at least one label=url'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const cli = join(toolDir, 'node_modules', 'lighthouse', 'cli', 'index.js');

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (n) => Math.round(n * 10) / 10;
const rows = Object.fromEntries(variants.map((v) => [v.label, []]));

for (let i = 0; i < RUNS; i++) {
  for (const v of variants) {
    const file = join(outDir, `${v.label}-${i + 1}.json`);
    const r = spawnSync(process.execPath, [cli, v.url, '--output=json', '--output-path=' + file, '--only-categories=performance,accessibility', '--chrome-flags=--headless=new --no-sandbox', '--quiet'], {
      cwd: outDir,
      env: { ...process.env, CHROME_PATH: chrome },
      encoding: 'utf8',
      timeout: 240_000,
    });
    if (r.status !== 0) { console.error(`run ${i + 1} ${v.label} failed: ${String(r.stderr || '').slice(0, 300)}`); continue; }
    const j = JSON.parse(readFileSync(file, 'utf8'));
    const a = j.audits;
    rows[v.label].push({
      perf: j.categories.performance.score * 100,
      a11y: j.categories.accessibility.score * 100,
      tbt: a['total-blocking-time'].numericValue,
      lcp: a['largest-contentful-paint'].numericValue,
      fcp: a['first-contentful-paint'].numericValue,
      tti: a['interactive'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      version: j.lighthouseVersion,
      chrome: j.environment && j.environment.hostUserAgent,
    });
    console.log(`run ${i + 1}/${RUNS} ${v.label}: performance ${rows[v.label].at(-1).perf}, blocking ${r1(rows[v.label].at(-1).tbt)} ms`);
  }
}

const first = rows[variants[0].label][0];
const out = { runs: RUNS, lighthouse: first && first.version, chrome: first && first.chrome, variants: {} };
for (const v of variants) {
  const r = rows[v.label];
  if (!r.length) { out.variants[v.label] = { url: v.url, completedRuns: 0 }; continue; }
  const col = (k) => r.map((x) => x[k]);
  out.variants[v.label] = {
    url: v.url,
    completedRuns: r.length,
    performance: median(col('perf')),
    accessibility: median(col('a11y')),
    tbtMs: r1(median(col('tbt'))),
    tbtEachRun: col('tbt').map(r1),
    lcpMs: r1(median(col('lcp'))),
    fcpMs: r1(median(col('fcp'))),
    ttiMs: r1(median(col('tti'))),
    cls: Math.round(median(col('cls')) * 10000) / 10000,
  };
}
console.log(JSON.stringify(out, null, 2));
