#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/, precompile the app/*.jsx screens
 * + auth-client.js into hashed, minified bundles (no runtime Babel-standalone
 * JIT), and generate config.js from env vars.
 *
 * The pipeline lives in @citizens/frontend-build (ecosystem Step 4), consumed
 * as a workspace package (workspace:* → packages/frontend-build in this
 * monorepo — no vendored copy). This file only supplies Vision's
 * configuration: screen load order, env-var mapping.
 * esbuild is passed in from HERE so the output is built with this app's own
 * pinned esbuild version.
 *
 * Vision is a desktop back-office (no Capacitor shell): capacitor-bridge.js
 * is a no-op stub that satisfies the pipeline's file contract, and there is
 * no --mobile build.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_API_BASE_URL     (optional, defaults to '' = same origin)
 *   NEXT_PUBLIC_MAPTILER_KEY     (optional — Timeline Map falls back to a
 *                                 placeholder card without it)
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

  // Every screen module, in dependency order (later files reference
  // `window.*` globals set by earlier ones).
  appFileOrder: [
    'data.jsx', 'store.jsx', 'live.jsx', 'ui.jsx', 'login.jsx',
    'home.jsx', 'views.jsx', 'shell.jsx', 'app.jsx',
  ],

  envGlobalName: '__CV_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    // '' = same origin (standard Vercel topology).
    { key: 'API_BASE_URL', env: 'NEXT_PUBLIC_API_BASE_URL' },
    { key: 'MAPTILER_KEY', env: 'NEXT_PUBLIC_MAPTILER_KEY' },
  ],
});
