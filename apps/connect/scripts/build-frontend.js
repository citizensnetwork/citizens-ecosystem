#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/ (or mobile-dist/), precompile the
 * app/*.jsx screens + auth-client.js into hashed, minified bundles (no more
 * runtime Babel-standalone JIT-compiling 19 files in the browser — addendum
 * §B0), and generate config.js from env vars.
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
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require('crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'frontend');
const APP_SRC = path.join(SRC, 'app');

// --mobile: build the Capacitor webDir (mobile-dist/) instead of public/.
// Mobile bundles are built locally (not on Vercel), so env vars may be absent;
// values fall back to the developer's gitignored src/frontend/config.js, and
// API_BASE_URL is FORCED to an absolute production URL — a store build must
// never point at a localhost fallback (addendum §B6).
const MOBILE = process.argv.includes('--mobile');
const DEST = MOBILE ? path.join(ROOT, 'mobile-dist') : path.join(ROOT, 'public');

// Every screen module, in the exact dependency order the old <script type="text/babel">
// tags loaded them (later files reference `window.X` set by earlier ones).
const APP_FILE_ORDER = [
  'icons.jsx', 'data.jsx', 'store.jsx', 'ui.jsx', 'auth.jsx', 'map.jsx',
  'home.jsx', 'apply.jsx', 'admin.jsx', 'dashboard.jsx', 'insights.jsx',
  'create.jsx', 'messages.jsx', 'profiles.jsx', 'pages.jsx',
  'tweaks-panel.jsx', 'tweaks.jsx', 'shell.jsx', 'app.jsx',
];

// Files handled specially (compiled/hashed) — excluded from the generic copy.
const SPECIAL = new Set(['app', 'config.js', 'auth-client.js', 'index.html', 'capacitor-bridge.js']);

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

/** Remove stale content-hashed outputs from a previous build (filenames change per build). */
function cleanHashedOutputs() {
  if (!fs.existsSync(DEST)) return;
  for (const name of fs.readdirSync(DEST)) {
    if (/^(auth-client|capacitor-bridge)\.[0-9a-f]{10}\.js$/.test(name)) {
      fs.unlinkSync(path.join(DEST, name));
    }
  }
  const appDir = path.join(DEST, 'app');
  if (fs.existsSync(appDir)) {
    for (const name of fs.readdirSync(appDir)) {
      if (/^bundle\.[0-9a-f]{10}\.js$/.test(name)) {
        fs.unlinkSync(path.join(appDir, name));
      }
    }
  }
}

function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d, new Set());
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function hashOf(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

/**
 * Precompile the 19 app/*.jsx screens into ONE minified, content-hashed bundle.
 * Each file is still its own IIFE that only communicates via `window.*` (no
 * import/export was ever used) — esbuild just strips JSX per file (React 18
 * classic runtime, matching the old Babel-standalone pragma) and the results
 * are concatenated in load order, so cross-file `window.X` wiring is untouched.
 * React/ReactDOM/supabase-js/maplibre-gl/lucide stay on CDN UMD <script> tags
 * (unchanged) — see docs/MOBILE_LAUNCH_RUNBOOK.md Step 0 note on scope.
 */
function buildAppBundle() {
  const parts = APP_FILE_ORDER.map((name) => {
    const src = fs.readFileSync(path.join(APP_SRC, name), 'utf8');
    const { code, warnings } = esbuild.transformSync(src, {
      loader: 'jsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2019',
      sourcefile: `app/${name}`,
    });
    for (const w of warnings) console.warn(`[build-frontend] ${name}: ${w.text}`);
    return `// ── ${name} ──\n${code}`;
  });

  const concatenated = parts.join('\n');
  const { code: minified } = esbuild.transformSync(concatenated, {
    loader: 'js',
    minify: true,
    target: 'es2019',
  });

  const hash = hashOf(minified);
  const filename = `bundle.${hash}.js`;
  fs.mkdirSync(path.join(DEST, 'app'), { recursive: true });
  fs.writeFileSync(path.join(DEST, 'app', filename), minified);
  return filename;
}

/**
 * capacitor-bridge.js is real ESM (imports @capacitor/* npm packages) — the
 * one file that needs a true bundle:true esbuild pass, not just a JSX strip.
 */
function buildCapacitorBridge() {
  const result = esbuild.buildSync({
    entryPoints: [path.join(SRC, 'capacitor-bridge.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    minify: true,
    write: false,
  });
  const code = result.outputFiles[0].text;
  const hash = hashOf(code);
  const filename = `capacitor-bridge.${hash}.js`;
  fs.writeFileSync(path.join(DEST, filename), code);
  return filename;
}

/** auth-client.js is plain JS (no JSX) — just minify + content-hash it. */
function buildAuthClient() {
  const src = fs.readFileSync(path.join(SRC, 'auth-client.js'), 'utf8');
  const { code: minified } = esbuild.transformSync(src, { loader: 'js', minify: true, target: 'es2019' });
  const hash = hashOf(minified);
  const filename = `auth-client.${hash}.js`;
  fs.writeFileSync(path.join(DEST, filename), minified);
  return filename;
}

/**
 * Rewrite index.html: drop the Babel-standalone CDN script + the 19
 * `type="text/babel" ... ?v=` tags + the `?v=`-suffixed auth-client tag,
 * replace with two plain hashed <script> tags. Also sets viewport-fit=cover
 * for notched-device safe-area support (runbook Step 6).
 */
function buildIndexHtml(bundleFile, authClientFile, capacitorBridgeFile) {
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // Drop the Babel-standalone CDN script — no longer needed, JSX is precompiled.
  html = html.replace(/^\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^\n]*\n/m, '');

  // Replace the versioned auth-client.js tag with the hashed build output,
  // preceded by the Capacitor bridge (window.Cap* must exist before
  // auth-client.js's signInWithGoogle / map.jsx's geolocation call it).
  html = html.replace(
    /<script src="auth-client\.js\?v=[^"]*"><\/script>/,
    `<script src="${capacitorBridgeFile}"></script>\n<script src="${authClientFile}"></script>`
  );

  // Replace all 19 `type="text/babel"` screen tags with one compiled bundle tag.
  const babelTagRe = /^\s*<script type="text\/babel" src="app\/[^"]+"><\/script>\n?/gm;
  let replaced = false;
  html = html.replace(babelTagRe, () => {
    if (replaced) return '';
    replaced = true;
    return `<script src="app/${bundleFile}"></script>\n`;
  });

  fs.writeFileSync(path.join(DEST, 'index.html'), html);
}

cleanHashedOutputs();
copyDir(SRC, DEST, SPECIAL);
const bundleFile = buildAppBundle();
const authClientFile = buildAuthClient();
const capacitorBridgeFile = buildCapacitorBridge();
buildIndexHtml(bundleFile, authClientFile, capacitorBridgeFile);
console.log(`[build-frontend] Copied src/frontend/ → ${path.basename(DEST)}/`);
console.log(`[build-frontend] Compiled 19 screens → app/${bundleFile} (Babel-standalone removed, addendum §B0)`);
console.log(`[build-frontend] Compiled auth-client.js → ${authClientFile}`);
console.log(`[build-frontend] Bundled Capacitor plugins → ${capacitorBridgeFile}`);

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
