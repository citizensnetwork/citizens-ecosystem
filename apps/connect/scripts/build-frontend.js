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
const esbuild = require('esbuild');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildFrontend } = require('@citizens/frontend-build');

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),

  // Every screen module, in the exact dependency order the old
  // <script type="text/babel"> tags loaded them (later files reference
  // `window.X` set by earlier ones).
  appFileOrder: [
    'icons.jsx', 'data.jsx', 'store.jsx', 'ui.jsx', 'auth.jsx', 'map.jsx',
    'home.jsx', 'apply.jsx', 'admin.jsx', 'dashboard.jsx', 'insights.jsx',
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
