#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/ and generate config.js from env vars.
 *
 * Run automatically before `next build` via the package.json build script.
 * The generated public/config.js is gitignored — it must be re-generated on
 * every build from the environment so credentials never touch version control.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_MAPTILER_KEY
 *   NEXT_PUBLIC_MAPTILER_STYLE   (optional, defaults to 'streets-v2')
 *   NEXT_PUBLIC_API_BASE_URL     (optional, defaults to '' = same origin)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'frontend');

// --mobile: build the Capacitor webDir (mobile-dist/) instead of public/.
// Mobile bundles are built locally (not on Vercel), so env vars may be absent;
// values fall back to the developer's gitignored src/frontend/config.js, and
// API_BASE_URL is FORCED to an absolute production URL — a store build must
// never point at a localhost fallback (addendum §B6).
const MOBILE = process.argv.includes('--mobile');
const DEST = MOBILE ? path.join(ROOT, 'mobile-dist') : path.join(ROOT, 'public');

function readLocalConfig() {
  // Execute the gitignored dev config (trusted local file, plain JS with
  // comments) against a stub window to extract __CC_ENV.
  try {
    const raw = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');
    const win = {};
    new Function('window', raw)(win);
    return win.__CC_ENV || {};
  } catch {
    return {};
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'config.js') continue; // generated below from env vars
    const s = path.join(src, name);
    const d = path.join(dest, name);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

copyDir(SRC, DEST);
console.log(`[build-frontend] Copied src/frontend/ → ${path.basename(DEST)}/`);

// Generate config.js. Web: API_BASE_URL is empty when the frontend is served
// from the same domain as the API (the standard Vercel deployment topology).
// Mobile: absolute production API base, env-first with local-config fallback.
const local = MOBILE ? readLocalConfig() : {};
const cfg = {
  SUPABASE_URL:     process.env.NEXT_PUBLIC_SUPABASE_URL      || local.SUPABASE_URL || '',
  SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.SUPABASE_ANON_KEY || '',
  API_BASE_URL:     MOBILE
    ? (process.env.MOBILE_API_BASE_URL || 'https://citizens-connect.vercel.app')
    : (process.env.NEXT_PUBLIC_API_BASE_URL || ''),
  MAPTILER_KEY:     process.env.NEXT_PUBLIC_MAPTILER_KEY       || local.MAPTILER_KEY || '',
  MAPTILER_STYLE:   process.env.NEXT_PUBLIC_MAPTILER_STYLE     || local.MAPTILER_STYLE || 'streets-v2',
};
if (MOBILE && (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !cfg.MAPTILER_KEY)) {
  console.warn('[build-frontend] WARNING: mobile config is missing Supabase/MapTiler values — set NEXT_PUBLIC_* env vars or fill src/frontend/config.js before shipping.');
}
fs.writeFileSync(
  path.join(DEST, 'config.js'),
  '// AUTO-GENERATED — do not edit; set env vars and rebuild.\nwindow.__CC_ENV = ' +
    JSON.stringify(cfg, null, 2) + ';\n',
);
console.log(`[build-frontend] Generated ${path.basename(DEST)}/config.js (API_BASE_URL=${cfg.API_BASE_URL || "'' (same-origin)"})`);
