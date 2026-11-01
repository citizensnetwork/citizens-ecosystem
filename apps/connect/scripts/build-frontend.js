#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/ (or mobile-dist/ with --mobile),
 * precompile the app/*.jsx screens + auth-client.js into hashed, minified
 * bundles (no runtime Babel-standalone JIT — addendum §B0), and generate
 * config.js from env vars.
 *
 * The pipeline itself lives in @citizens/frontend-build (ecosystem Step 4),
 * consumed as a workspace package (workspace:* → packages/frontend-build, see
 * its README). This file only supplies Connect's configuration: the screen load order
 * here, and in ./frontend-config.js the env-var mapping (the mobile API base and public
 * web address included) and which CDN scripts must match the lockfile. esbuild is passed
 * in from HERE so the output is built with this app's own pinned esbuild version.
 *
 * Run automatically before `next build` via the package.json build script.
 * The generated config.js is gitignored — it must be re-generated on every
 * build from the environment so credentials never touch version control.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_MAPTILER_KEY
 *   NEXT_PUBLIC_MAPTILER_STYLE   (optional, defaults to 'streets-v2')
 *   NEXT_PUBLIC_API_BASE_URL     (optional, defaults to '' = same origin)
 *
 * Mobile build only (`--mobile`, see docs/MOBILE_LAUNCH_RUNBOOK.md); all optional:
 *   MOBILE_API_BASE_URL          (defaults to the live production alias)
 *   MOBILE_PUBLIC_ORIGIN         (public web origin for shared + QR links; https only)
 *   MOBILE_PUBLIC_BASE_PATH      ('' or e.g. /citizens/connect; the web prefix of that site)
 */
'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildFrontend } = require('@citizens/frontend-build');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { basePathFromEnv } = require('@citizens/ecosystem');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const frontendConfig = require('./frontend-config');

// `next dev`/`next build` load .env.local themselves, but this script runs
// as a PLAIN node process (a separate step before `next build` in the
// package.json `build` script) — Next's own dotenv loading never reaches it.
// On Vercel this is a harmless no-op: the platform injects configured
// Environment Variables directly into process.env, and .env.local never
// exists in the deployed source (gitignored). Locally, without this, running
// `node scripts/build-frontend.js` (or `pnpm build`) produces a config.js
// with every value blank even when .env.local is fully filled in — no
// dependency added; .env.local's format is a plain KEY=VALUE list.
function loadDotEnvLocal(rootDir) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(rootDir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue; // real env always wins
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
loadDotEnvLocal(path.join(__dirname, '..'));

/**
 * The maplibre-gl runtime is vendored into src/frontend/vendor/ instead of
 * loaded from a CDN (see the comment in src/frontend/index.html — it's a
 * patch for a critical XSS that shipped in older builds). OSV-Scanner only
 * scans pnpm-lock.yaml, so nothing else would catch this copy silently going
 * stale the next time someone bumps the maplibre-gl npm dependency without
 * re-copying it — which would quietly bring the vulnerability right back.
 * Fails the build instead of shipping a drifted copy.
 */
function assertMaplibreVendorInSync(rootDir) {
  const installed = path.join(rootDir, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl.mjs');
  if (!fs.existsSync(installed)) return;
  const vendored = path.join(rootDir, 'src', 'frontend', 'vendor', 'maplibre-gl', 'maplibre-gl.mjs');
  if (!fs.readFileSync(vendored).equals(fs.readFileSync(installed))) {
    throw new Error(
      '[build-frontend] src/frontend/vendor/maplibre-gl/ is out of sync with the installed ' +
        'maplibre-gl npm package. Re-copy maplibre-gl.mjs, maplibre-gl-worker.mjs, ' +
        'maplibre-gl-shared.mjs and maplibre-gl.css from node_modules/maplibre-gl/dist/ into ' +
        'src/frontend/vendor/maplibre-gl/ (see the comment above the <link>/<script> tags in ' +
        'src/frontend/index.html).',
    );
  }
}
assertMaplibreVendorInSync(path.join(__dirname, '..'));

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),

  // '' until the Vercel project sets NEXT_PUBLIC_BASE_PATH=/citizens/connect
  // (see packages/ecosystem/README.md before setting it). Read AFTER
  // loadDotEnvLocal above, so a local .env.local value counts too.
  basePath: basePathFromEnv('connect'),

  // Every screen module, in the exact dependency order the old
  // <script type="text/babel"> tags loaded them (later files reference
  // `window.X` set by earlier ones).
  appFileOrder: [
    'icons.jsx', 'routes.jsx', 'map-v2-lib.jsx', 'saved-lib.jsx', 'cohost-lib.jsx', 'moments-lib.jsx', 'convince-lib.jsx', 'serving-areas-lib.jsx', 'onboarding-presets-lib.jsx', 'data.jsx', 'lets-lib.jsx', 'store.jsx', 'ui.jsx', 'report.jsx', 'listing-claim.jsx', 'auth.jsx', 'cohosts.jsx', 'moments.jsx', 'convince.jsx', 'map-v2-strings.jsx', 'serving-areas.jsx', 'map-v2-time.jsx', 'map-v2-qr.jsx', 'map-v2-pins.jsx', 'map.jsx',
    'entity-card.jsx', 'map-v2-gallery.jsx', 'map-v2-news.jsx', 'map-v2-card.jsx', 'map-v2-row.jsx', 'map-v2-nearby.jsx', 'map-v2-online.jsx', 'map-v2-sheet.jsx', 'map-v2-explore.jsx', 'map-v2-nav.jsx', 'map-v2-discover.jsx', 'home.jsx', 'kingdom-discovery.jsx', 'apply.jsx', 'pending-application.jsx', 'admin.jsx', 'dashboard.jsx', 'automation.jsx', 'insights.jsx',
    'create.jsx', 'messages.jsx', 'profiles.jsx', 'pages.jsx', 'lets.jsx', 'intake-upgrade.jsx',
    'tweaks-panel.jsx', 'tweaks.jsx', 'shell.jsx', 'app.jsx',
  ],

  // The config.js env-var mapping and the CDN pins live in ./frontend-config.js
  // (their own file so a test can run the real configuration into a temp directory).
  ...frontendConfig,
});
