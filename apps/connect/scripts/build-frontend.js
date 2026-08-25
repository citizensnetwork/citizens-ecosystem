#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/ (or mobile-dist/ with --mobile),
 * precompile the app/*.jsx screens + auth-client.js into hashed, minified
 * bundles (no runtime Babel-standalone JIT — addendum §B0), and generate
 * config.js from env vars.
 *
 * The pipeline itself lives in @citizens/frontend-build (ecosystem Step 4),
 * vendored at vendor/citizens-frontend-build — canonical source is
 * citizens-wear/packages/frontend-build, see vendor/README.md. This file only
 * supplies Connect's configuration: screen load order, env-var mapping, and
 * the mobile API base. esbuild is passed in from HERE so the output is built
 * with this app's own pinned esbuild version.
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

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),

  // Every screen module, in the exact dependency order the old
  // <script type="text/babel"> tags loaded them (later files reference
  // `window.X` set by earlier ones).
  appFileOrder: [
    'icons.jsx', 'data.jsx', 'store.jsx', 'ui.jsx', 'auth.jsx', 'map.jsx',
    'home.jsx', 'kingdom-discovery.jsx', 'apply.jsx', 'admin.jsx', 'dashboard.jsx', 'insights.jsx',
    'create.jsx', 'messages.jsx', 'profiles.jsx', 'pages.jsx',
    'tweaks-panel.jsx', 'tweaks.jsx', 'shell.jsx', 'app.jsx',
  ],

  envGlobalName: '__CC_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    {
      // Web: '' = same origin (standard Vercel topology). Mobile: FORCED
      // absolute production URL — a store build must never point at a
      // localhost fallback (addendum §B6).
      key: 'API_BASE_URL',
      env: 'NEXT_PUBLIC_API_BASE_URL',
      mobileEnv: 'MOBILE_API_BASE_URL',
      mobileDefault: 'https://citizens-connect.vercel.app',
    },
    { key: 'MAPTILER_KEY', env: 'NEXT_PUBLIC_MAPTILER_KEY' },
    { key: 'MAPTILER_STYLE', env: 'NEXT_PUBLIC_MAPTILER_STYLE', defaultValue: 'streets-v2' },
  ],
  mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'MAPTILER_KEY'],
  mobileMissingLabel: 'Supabase/MapTiler',
});
