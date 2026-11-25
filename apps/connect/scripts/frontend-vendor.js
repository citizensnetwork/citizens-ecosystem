/**
 * The libraries Connect's frontend used to load from CDNs (unpkg, jsDelivr), served from our own origin instead
 * (QA fix plan PR F2, 2026-11-25): React and ReactDOM 18.3.1 (production UMD), supabase-js (its UMD build) and
 * lucide, trimmed to the icons the app names. @citizens/frontend-build writes each as vendor/<name>.<hash>.js where
 * index.html's placeholder <script src="vendor/<name>.js"> stands, so the browser caches it for good and the page
 * talks to one origin.
 *
 * The bytes are the npm packages' own, pinned by the lockfile and scanned by OSV in CI; React's and supabase-js's
 * are byte-identical to what the CDNs served (the same SRI hashes the old tags carried).
 *
 * lucide: the app reads `window.lucide.icons[name]` (app/icons.jsx, app/map.jsx). The full UMD carries all ~2,000
 * icons (112 KB on the wire); the app names a few dozen. The names are collected from the source: every quoted
 * PascalCase word in the frontend's screens and scripts and in the engine configuration (category icons) that is a
 * lucide icon. A word that is not an icon is ignored; an icon named only at runtime, from data, would be missed, so
 * icon names must stay literal in source (no 'Arrow' + dir). e2e/icons.spec.ts walks the screens and fails on any
 * name the trimmed set lacks.
 */
'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

/** A file inside one of the app's own installed packages (its node_modules link; package `exports` maps don't apply). */
function packageFile(rootDir, pkg, rel) {
  return path.join(fs.realpathSync(path.join(rootDir, 'node_modules', ...pkg.split('/'))), rel);
}

/** Every file under `dir` with one of `exts`, skipping vendored code and tests. */
function sourceFiles(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'vendor' || entry.name === '__tests__')
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e)) && !/\.test\.[jt]sx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

/** The lucide icon names the source mentions, sorted. */
function iconNames(rootDir, icons) {
  // the engine configuration (category icons) through the app's own workspace link to it
  const engineSrc = packageFile(rootDir, '@engine/config', 'src');
  const files = [
    ...sourceFiles(path.join(rootDir, 'src', 'frontend'), ['.jsx', '.js']),
    ...sourceFiles(engineSrc, ['.ts']),
  ];
  const names = new Set();
  for (const file of files) {
    for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/['"]([A-Z][A-Za-z0-9]*)['"]/g)) {
      if (Object.hasOwn(icons, name)) names.add(name);
    }
  }
  return [...names].sort();
}

/** lucide, trimmed: `window.lucide = { icons: { Name: [[tag, attrs], ...] } }`, the shape app/icons.jsx reads. */
function trimmedLucide(rootDir) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lucide = require(require.resolve('lucide', { paths: [rootDir] }));
  const names = iconNames(rootDir, lucide.icons);
  const picked = Object.fromEntries(names.map((n) => [n, lucide.icons[n]]));
  const version = JSON.parse(
    fs.readFileSync(packageFile(rootDir, 'lucide', 'package.json'), 'utf8'),
  ).version;
  return {
    names,
    code: `/*! lucide ${version} (ISC), ${names.length} icons named by Citizens Connect */\nwindow.lucide={icons:${JSON.stringify(picked)}};\n`,
  };
}

/** The vendored scripts, in the shape buildFrontend's `scripts` option takes, plus the icon list for the log. */
function vendorScripts(rootDir) {
  const read = (pkg, rel) => fs.readFileSync(packageFile(rootDir, pkg, rel), 'utf8');
  const lucide = trimmedLucide(rootDir);
  return {
    scripts: [
      { src: 'vendor/react.js', code: read('react-umd', 'umd/react.production.min.js') },
      {
        src: 'vendor/react-dom.js',
        code: read('react-dom-umd', 'umd/react-dom.production.min.js'),
      },
      { src: 'vendor/supabase.js', code: read('@supabase/supabase-js', 'dist/umd/supabase.js') },
      { src: 'vendor/lucide.js', code: lucide.code },
    ],
    iconNames: lucide.names,
  };
}

module.exports = { vendorScripts, iconNames };
