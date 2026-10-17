// Route sweep: screenshots of Connect's 14 screens (and the signed-out landing) at 375, 768 and 1280 px in the light and the dark look, for the
// Designer's eyes (docs/routines/designer.md step 4). Hermetic on purpose: it reuses the Map v2 harness, which
// answers config.js, MapTiler and every /api/** call locally with the synthetic fixture rows (fictional names, reserved
// hosts), so a run reads no real database, signs in nowhere and writes nothing outside its output folder. The page is
// served from the built frontend (public/) by scripts/map-v2/serve-static.mjs on a port of its own; a port already in
// use stops the run (a stale server could belong to another checkout). The only network reads are the CDN scripts and
// fonts the page itself loads.
//
//   node scripts/design/capture.mjs [--surface <id>] [--out <dir>] [--viewports 375,768,1280] [--looks light,dark]
//
// Output: <out>/<route>-<viewport>-<look>.png and <out>/manifest.json (what was ready, what the page logged, and a
// computed-style survey of what actually rendered). Default <out>: <repo>/.claude/design/captures/<yyyy-mm-dd>
// (gitignored). Vision and Wear are separate frontends and are not captured here.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(APP_DIR, '..', '..');

export const VIEWPORTS = [
  { id: '375', width: 375, height: 812 },
  { id: '768', width: 768, height: 1024 },
  { id: '1280', width: 1280, height: 900 },
];
export const LOOKS = ['light', 'dark'];

// The ids the fixture generator gives its rows (scripts/map-v2/fixtures.mjs): the router only accepts UUIDs for /e and /p.
const PLACE_ID = 'd0000000-0000-4000-8000-000000000001';
const EVENT_ID = 'e0000000-0000-4000-8000-000000000001';
const SCREEN = '[data-screen]';

/**
 * The 14 screens of routes.jsx plus the signed-out landing (15 states). `surface` is the id a Designer card uses (designer.md appendix A); `session` is the
 * demo session the page starts with ('none' shows the sign-in landing).
 */
export const ROUTES = [
  { id: 'landing', surface: 'landing-auth', path: '/', session: 'none', ready: '[data-screen-label="Sign in"]' },
  { id: 'map', surface: 'map', path: '/', session: 'citizen', ready: '[data-screen="discover"]', map: true },
  { id: 'discover', surface: 'discovery', path: '/discover', session: 'citizen', ready: '[data-screen="kingdom-discovery"]' },
  { id: 'community', surface: 'discovery', path: '/community', session: 'citizen', ready: '[data-screen="community"]' },
  { id: 'contributor', surface: 'profile', path: '/c/fixture-fellowship-1', session: 'citizen', ready: '[data-screen="profile"]' },
  { id: 'place', surface: 'profile', path: `/p/${PLACE_ID}`, session: 'citizen', ready: '[data-screen="place"]' },
  { id: 'event', surface: 'profile', path: `/e/${EVENT_ID}`, session: 'citizen', ready: '[data-screen="event"]' },
  { id: 'me', surface: 'profile', path: '/me', session: 'citizen', ready: SCREEN },
  { id: 'messages', surface: 'messages-notifications', path: '/messages', session: 'citizen', ready: '[data-screen="messages"]' },
  { id: 'notifications', surface: 'messages-notifications', path: '/notifications', session: 'citizen', ready: '[data-screen="notifications"]' },
  { id: 'settings', surface: 'messages-notifications', path: '/settings', session: 'citizen', ready: '[data-screen="settings"]' },
  { id: 'apply', surface: 'apply', path: '/apply', session: 'citizen', ready: SCREEN },
  { id: 'onboarding', surface: 'apply', path: '/onboarding', session: 'citizen', ready: SCREEN },
  { id: 'dashboard', surface: 'dashboard', path: '/dashboard', session: 'contributor', ready: '[data-screen="dashboard"]' },
  { id: 'admin', surface: 'admin', path: '/admin', session: 'admin', ready: '[data-screen="admin"]' },
];

export const SURFACES = [...new Set(ROUTES.map((r) => r.surface))];

/** The page's own measure of what rendered: distinct computed sizes and radii, and the tap targets under 44 px. */
function surveyPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const sizes = new Set();
  const radii = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) sizes.add(s.fontSize);
    if (s.borderRadius && s.borderRadius !== '0px') radii.add(s.borderRadius);
  }
  const targets = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"]')].filter(visible);
  const small = targets.filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 44).length;
  return { fontSizes: [...sizes].sort(), radii: [...radii].sort(), interactive: targets.length, smallTargets: small };
}

async function startServer(publicDir, port) {
  const child = spawn(process.execPath, [join(HERE, '..', 'map-v2', 'serve-static.mjs'), publicDir, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`the static server did not start on port ${port}`)), 15_000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('serving')) {
        clearTimeout(timer);
        done();
      }
    });
    // a warning on stderr is not a failure; a server that cannot listen (a port in use) exits
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`the static server exited with code ${code} (is port ${port} in use?) ${stderr.trim().split('\n')[0]}`.trim()));
    });
  });
  return child;
}

/**
 * @param {object} o
 * @param {typeof ROUTES} [o.routes]
 * @param {typeof VIEWPORTS} [o.viewports]
 * @param {string[]} [o.looks]
 * @param {string} o.outDir
 * @param {number} [o.port]
 * @returns the manifest that was written
 */
export async function captureAll({ routes = ROUTES, viewports = VIEWPORTS, looks = LOOKS, outDir, port = Number(process.env.DESIGN_CAPTURE_PORT || 3141) }) {
  const publicDir = join(APP_DIR, 'public');
  if (!existsSync(join(publicDir, 'index.html'))) {
    console.log('public/ is not built: running scripts/build-frontend.js');
    execFileSync(process.execPath, [join(APP_DIR, 'scripts', 'build-frontend.js')], { cwd: APP_DIR, stdio: 'inherit' });
  }
  mkdirSync(outDir, { recursive: true });
  // The harness reads these when it loads: no GPU flags (a capture is not a frame-time measurement), our own server.
  process.env.MAPV2_BASE_URL = `http://localhost:${port}`;
  process.env.MAPV2_SOFTWARE_GL = '1';
  const { openSession, settle } = await import('../map-v2/harness.mjs');
  const { makeSeed } = await import('../map-v2/fixtures.mjs');
  const seed = makeSeed({ contributors: 6, places: 6, events: 5, spread: 0.03 });
  // /c/<slug> asks /api/v1/contributors/<slug> for one profile (store.jsx); the harness's catch-all would answer with
  // an empty list and the app would go back to the map. Answered from the same fixture rows, 404 for any other slug.
  const profileRoute = async (page) => {
    await page.route(/\/api\/v1\/contributors\/[a-z0-9-]+(?:\?.*)?$/, (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const profile = seed.contributors.find((c) => c.contributor_slug === slug);
      return profile ? route.fulfill({ json: { data: { profile } } }) : route.fulfill({ status: 404, json: { error: 'not found' } });
    });
  };

  const server = await startServer(publicDir, port);
  const shots = [];
  const hosts = new Set(); // every non-local host a page asked for, so a reader sees what the capture depends on
  try {
    const sessions = [...new Set(routes.map((r) => r.session))];
    for (const session of sessions) {
      for (const vp of viewports) {
        for (const look of looks) {
          const s = await openSession({ viewport: { width: vp.width, height: vp.height }, colorScheme: look, reducedMotion: true, seed, extraRoutes: profileRoute });
          try {
            await s.page.addInitScript((role) => {
              try {
                if (role === 'none') localStorage.removeItem('cc_session_v1');
                else localStorage.setItem('cc_session_v1', JSON.stringify({ authed: true, role }));
              } catch {
                /* storage blocked: the page falls back to the landing */
              }
            }, session);
            for (const route of routes.filter((r) => r.session === session)) {
              const file = `${route.id}-${vp.id}-${look}.png`;
              const seenBefore = s.log.console.length + s.log.pageErrors.length;
              let ready = true;
              let note = '';
              try {
                await s.page.goto(`http://localhost:${port}${route.path}`, { waitUntil: 'load', timeout: 30_000 });
                await s.page.waitForSelector(route.ready, { timeout: 20_000 });
                if (route.map) await s.page.waitForFunction(() => !!window.__ccMap, undefined, { timeout: 20_000 });
                await s.page.evaluate(() => document.fonts && document.fonts.ready);
                await settle(s.page);
              } catch (e) {
                ready = false;
                note = String(e && e.message ? e.message : e).split('\n')[0];
              }
              let saved = true;
              try {
                await s.page.screenshot({ path: join(outDir, file) });
              } catch (e) {
                // one lost screenshot must not lose the run: it is recorded, and the manifest is still written
                saved = false;
                ready = false;
                note = `screenshot failed: ${String(e && e.message ? e.message : e).split('\n')[0]}`;
              }
              const survey = await s.page.evaluate(surveyPage).catch(() => null);
              shots.push({
                route: route.id, surface: route.surface, path: route.path, session, viewport: vp.id, look, file: saved ? file : null, ready, note,
                survey, logged: s.log.console.length + s.log.pageErrors.length - seenBefore,
              });
            }
          } finally {
            for (const r of s.log.requests) {
              try {
                const host = new URL(r.url).hostname;
                if (host && host !== 'localhost') hosts.add(host);
              } catch {
                /* not a URL we can read */
              }
            }
            await s.close();
          }
        }
      }
    }
  } finally {
    server.kill();
  }
  const manifest = { capturedAt: new Date().toISOString(), viewports: viewports.map((v) => v.id), looks, count: shots.length, notReady: shots.filter((x) => !x.ready).length, hosts: [...hosts].sort(), shots };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export function parseArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const surface = get('--surface');
  if (surface && !SURFACES.includes(surface)) throw new Error(`unknown surface "${surface}"; the Connect surfaces are: ${SURFACES.join(', ')}`);
  const wantVp = get('--viewports')?.split(',');
  const wantLooks = get('--looks')?.split(',');
  const viewports = wantVp ? VIEWPORTS.filter((v) => wantVp.includes(v.id)) : VIEWPORTS;
  const looks = wantLooks ? LOOKS.filter((l) => wantLooks.includes(l)) : LOOKS;
  if (!viewports.length || !looks.length) throw new Error('--viewports takes 375, 768 or 1280; --looks takes light or dark');
  const outDir = resolve(get('--out') || join(REPO_ROOT, '.claude', 'design', 'captures', new Date().toISOString().slice(0, 10)));
  return { routes: surface ? ROUTES.filter((r) => r.surface === surface) : ROUTES, viewports, looks, outDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  const m = await captureAll(opts);
  console.log(`captured ${m.count} screenshots into ${opts.outDir} (${m.notReady} not ready)`);
  for (const s of m.shots.filter((x) => !x.ready)) console.log(`  not ready: ${s.file ?? `${s.route}-${s.viewport}-${s.look}`}: ${s.note}`);
}
