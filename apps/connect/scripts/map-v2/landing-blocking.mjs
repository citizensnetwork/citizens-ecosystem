// R4 (tracker section 8A): main-thread blocking on the LANDING screen, Map v2 on vs off.
//
//   node scripts/map-v2/landing-blocking.mjs [runs=12] label=url [label=url ...]
//   e.g. node scripts/map-v2/landing-blocking.mjs 12 default=http://localhost:3103/ optout=http://localhost:3103/?map=v1 old=http://localhost:3102/
//
// Local tool, not shipped, not a test. It is NOT Lighthouse (not a repo dependency): it counts Chromium
// long tasks (> 50 ms) after first-contentful-paint, the same idea as Lighthouse's Total Blocking Time,
// inside a fixed window, at CPU x4 (tracker Appendix C). Numbers are comparable with each other in one
// run on one machine; they are not comparable with a Lighthouse score. Runs are interleaved
// (a, b, c, a, b, c ...) so drift in the machine's load hits every variant alike.
//
// Hermetic enough to be fair: the third-party scripts and fonts the page loads (Tailwind's runtime,
// React, lucide, supabase-js, Google Fonts) are fetched ONCE and then answered from memory, so network
// jitter cannot leak into a main-thread measure; /config.js is answered here and no Supabase or MapTiler
// call is made. Each run is a fresh browser context: no cookies, no storage, a cold HTTP cache.
import { chromium } from '@playwright/test';
import { GPU_ARGS } from './harness.mjs';

const [runsArg, ...specs] = process.argv.slice(2);
const RUNS = Number(runsArg) || 12;
const variants = specs.map((s) => {
  const i = s.indexOf('=');
  return { label: s.slice(0, i), url: s.slice(i + 1) };
});
if (!variants.length) {
  console.error('usage: node scripts/map-v2/landing-blocking.mjs [runs] label=url [label=url ...]');
  process.exit(2);
}

const WINDOW_MS = 6000; // long tasks counted from FCP to FCP + 6 s
const THIRD_PARTY = new Set(['cdn.tailwindcss.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const cache = new Map(); // url -> { status, headers, body }

async function installRoutes(page) {
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__CC_ENV = ${JSON.stringify({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', API_BASE_URL: '', MAPTILER_KEY: 'e2e-test-key', MAPTILER_STYLE: 'streets-v2' })};`,
    }),
  );
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (!THIRD_PARTY.has(u.hostname)) return route.fallback();
    const key = u.href;
    let hit = cache.get(key);
    if (!hit) {
      const res = await route.fetch();
      hit = { status: res.status(), headers: res.headers(), body: await res.body() };
      cache.set(key, hit);
    }
    return route.fulfill({ status: hit.status, headers: hit.headers, body: hit.body });
  });
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (n) => Math.round(n * 10) / 10;

async function once(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await installRoutes(page);
    await page.addInitScript(() => {
      window.__lt = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lt.push([e.startTime, e.duration]);
        }).observe({ type: 'longtask', buffered: true });
      } catch { /* no longtask support */ }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, undefined, { timeout: 30_000 });
    await page.waitForTimeout(WINDOW_MS + 500);
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const r = await page.evaluate((win) => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0].startTime;
      const tasks = window.__lt.filter(([s]) => s >= fcp && s <= fcp + win);
      const tbt = tasks.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
      // every long task from navigation start to the end of the window (pre-paint work included)
      const all = window.__lt.filter(([s]) => s <= fcp + win);
      const blockAll = all.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
      return {
        fcp,
        tbt,
        blockAll,
        longTasksAll: all.length,
        longTasks: tasks.length,
        mapV2: typeof window.isMapV2 === 'function' ? window.isMapV2() : null,
        stylesheet: !!document.querySelector('link[href*="map-v2.css"]'),
      };
    }, WINDOW_MS);
    return {
      ...r,
      scriptMs: (m.ScriptDuration || 0) * 1000,
      styleMs: (m.RecalcStyleDuration || 0) * 1000,
      layoutMs: (m.LayoutDuration || 0) * 1000,
      taskMs: (m.TaskDuration || 0) * 1000,
    };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ args: GPU_ARGS });
const rows = Object.fromEntries(variants.map((v) => [v.label, []]));
try {
  // one throw-away load fills the third-party cache, so run 1 of the first variant is not the odd one out
  await once(browser, variants[0].url);
  for (let i = 0; i < RUNS; i++) for (const v of variants) rows[v.label].push(await once(browser, v.url));
} finally {
  await browser.close();
}

const out = { runs: RUNS, windowMs: WINDOW_MS, cpuThrottle: 4, viewport: '390x844', variants: {} };
for (const v of variants) {
  const r = rows[v.label];
  const col = (k) => r.map((x) => x[k]);
  out.variants[v.label] = {
    url: v.url,
    mapV2: [...new Set(col('mapV2'))],
    stylesheetLoaded: [...new Set(col('stylesheet'))],
    medianTbtMs: round(median(col('tbt'))),
    minTbtMs: round(Math.min(...col('tbt'))),
    maxTbtMs: round(Math.max(...col('tbt'))),
    medianLongTasks: median(col('longTasks')),
    medianBlockAllMs: round(median(col('blockAll'))),
    minBlockAllMs: round(Math.min(...col('blockAll'))),
    maxBlockAllMs: round(Math.max(...col('blockAll'))),
    medianLongTasksAll: median(col('longTasksAll')),
    blockAllEachRun: col('blockAll').map(round),
    medianFcpMs: round(median(col('fcp'))),
    medianScriptMs: round(median(col('scriptMs'))),
    medianStyleMs: round(median(col('styleMs'))),
    medianLayoutMs: round(median(col('layoutMs'))),
    medianTaskMs: round(median(col('taskMs'))),
    tbtEachRun: col('tbt').map(round),
  };
}
console.log(JSON.stringify(out, null, 2));
