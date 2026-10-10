// Map v2 measurement harness (tracker Appendix C). Local tool, not shipped, not a test.
//
//   node scripts/map-v2/<script>.mjs        (needs `next dev -p 3100` running)
//
// Hermetic on purpose: config.js, MapTiler and /api/v1/* are answered here, so a
// run never reads the real Supabase project and never touches its rate-limit
// buckets (RESUME_HERE §3). `tiles: 'real'` is the one exception: it loads real
// MapTiler tiles with the key from .env.local (read here, never printed) so the
// look of the real base style can be seen. Use it for a handful of screenshots,
// not for loops.
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(HERE, '..', '..');
export const BASE_URL = process.env.MAPV2_BASE_URL || 'http://localhost:3100';

// Headless Chromium falls back to SwiftShader (software GL) here: a 150-marker pan
// measured p50 174 ms on it and p50 16 ms with the GPU (found 2026-10-10 in P0-04),
// so frame-time numbers are only meaningful with these flags. Set MAPV2_SOFTWARE_GL=1
// to measure the slow path on purpose. The GPU is whatever this PC has (an Intel
// HD 5500 on the founder's machine), recorded with each measurement.
export const GPU_ARGS = process.env.MAPV2_SOFTWARE_GL ? [] : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'];

// Chrome DevTools "Fast 4G" preset as I recall it (NOT read from a spec; recorded
// with every measurement): download 9 Mbit/s, upload 1.5 Mbit/s, each x0.9,
// latency 60 ms x2.75 = 165 ms. Bytes per second for CDP.
export const FAST_4G = { offline: false, downloadThroughput: Math.round(9 * 1000 * 1000 / 8 * 0.9), uploadThroughput: Math.round(1.5 * 1000 * 1000 / 8 * 0.9), latency: 165 };

export const VIEWPORTS = {
  '360x800': { width: 360, height: 800 },
  '390x844': { width: 390, height: 844 },
  '768x1024': { width: 768, height: 1024 },
};

// A fixed "now" so event dates and "Starts in" text are identical between runs.
export const FIXED_NOW = Date.UTC(2026, 9, 10, 8, 0, 0); // 2026-10-10 10:00 SAST

function readMaptilerKey() {
  const f = join(APP_DIR, '.env.local');
  if (!existsSync(f)) return '';
  const m = /^NEXT_PUBLIC_MAPTILER_KEY\s*=\s*(.*)$/m.exec(readFileSync(f, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
function readMaptilerStyle() {
  const f = join(APP_DIR, '.env.local');
  if (!existsSync(f)) return 'streets-v2';
  const m = /^NEXT_PUBLIC_MAPTILER_STYLE\s*=\s*(.*)$/m.exec(readFileSync(f, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : 'streets-v2';
}

/**
 * Open a page ready to measure.
 * @param {object} o
 * @param {{width:number,height:number}} o.viewport
 * @param {number} [o.dsf]          device scale factor (profile: 3; screenshots: 1)
 * @param {boolean} [o.mobile]      touch + mobile UA (forced on for width < 768)
 * @param {number} [o.cpu]          CPU throttle rate (profile: 4)
 * @param {boolean} [o.network]     apply FAST_4G
 * @param {'mock'|'real'} [o.tiles]
 * @param {object} [o.seed]         { contributors, places, events } API rows
 * @param {string} [o.colorScheme]
 * @param {boolean} [o.reducedMotion]
 * @param {boolean} [o.bypassCSP]
 * @param {boolean} [o.fixClock]    freeze Date.now() at FIXED_NOW (timers keep running)
 * @param {(page:any)=>Promise<void>} [o.extraRoutes]
 */
export async function openSession(o) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const mobile = o.mobile ?? o.viewport.width < 768;
  const context = await browser.newContext({
    viewport: o.viewport,
    deviceScaleFactor: o.dsf ?? 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: o.colorScheme || 'light',
    reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference',
    bypassCSP: !!o.bypassCSP,
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const log = { requests: [], console: [], pageErrors: [] };
  page.on('request', (r) => log.requests.push({ url: r.url(), type: r.resourceType(), method: r.method() }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e && e.message || e)));
  if (o.fixClock !== false) await page.clock.setFixedTime(FIXED_NOW);

  const realKey = o.tiles === 'real' ? readMaptilerKey() : '';
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.__CC_ENV = ${JSON.stringify({
      SUPABASE_URL: '', SUPABASE_ANON_KEY: '', API_BASE_URL: '',
      MAPTILER_KEY: realKey || 'e2e-test-key',
      MAPTILER_STYLE: realKey ? readMaptilerStyle() : 'streets-v2',
    })};`,
  }));
  if (!realKey) {
    await page.route('**/api.maptiler.com/**', (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [], features: [] } }));
  }
  const seed = o.seed || { contributors: [], places: [], events: [] };
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: [] } }));
  for (const key of Object.keys(seed)) {
    await page.route(`**/api/v1/${key}**`, (route) =>
      route.fulfill({ json: { data: seed[key], meta: { count: seed[key].length, limit: 100, offset: 0 } } }));
  }
  if (o.extraRoutes) await o.extraRoutes(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cc_session_v1', JSON.stringify({ authed: true, role: 'citizen' })); } catch { /* private mode */ }
  });

  const cdp = await context.newCDPSession(page);
  if (o.cpu && o.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  if (o.network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  }
  const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; }).catch(() => 'n/a');
  return { browser, context, page, cdp, log, gpu, close: () => browser.close() };
}

/** Navigate and wait until the map screen, the MapLibre instance and fonts are ready. */
export async function openMap(page, path = '/', { minMarkers = 1 } = {}) {
  await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-screen="discover"]', { timeout: 30_000 });
  await page.waitForFunction(() => !!window.__ccMap, undefined, { timeout: 30_000 });
  if (minMarkers > 0) await page.waitForFunction((n) => document.querySelectorAll('.maplibregl-marker').length >= n, minMarkers, { timeout: 20_000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await settle(page);
}

/** Let layout, images and the map's idle state settle (no wall-clock guessing for the map itself). */
export async function settle(page, ms = 250) {
  await page.evaluate(() => new Promise((res) => {
    const m = window.__ccMap;
    if (!m) return res();
    if (!m.isMoving() && m.loaded()) return res();
    m.once('idle', () => res());
    setTimeout(res, 4000);
  }));
  await page.waitForTimeout(ms);
}

export async function jumpTo(page, { lng, lat, zoom }) {
  await page.evaluate(([lo, la, z]) => window.__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);
  await settle(page);
}

/** Decode two PNG buffers in the browser and count differing pixels. Dependency-free pixel diff. */
export async function pngDiff(page, aBuf, bBuf, { threshold = 0 } = {}) {
  return page.evaluate(async ([a, b, th]) => {
    const load = async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d');
      x.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, d: x.getImageData(0, 0, bmp.width, bmp.height).data };
    };
    const A = await load(a), B = await load(b);
    if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: true, a: [A.w, A.h], b: [B.w, B.h] };
    let diff = 0;
    for (let i = 0; i < A.d.length; i += 4) {
      const dr = Math.abs(A.d[i] - B.d[i]), dg = Math.abs(A.d[i + 1] - B.d[i + 1]), db = Math.abs(A.d[i + 2] - B.d[i + 2]);
      if (dr > th || dg > th || db > th) diff++;
    }
    return { total: A.w * A.h, diff, ratio: diff / (A.w * A.h) };
  }, [aBuf.toString('base64'), bBuf.toString('base64'), threshold]);
}

// WCAG 2.x relative luminance / contrast, for token and pin-colour checks (M5).
export function luminance(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(h.length === 3 ? h[i / 2] + h[i / 2] : h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}
