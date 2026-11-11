/**
 * The look switch's build half (facelift; the founder's "switch, then flip", 2026-11-11).
 *
 * Connect ships TWO app bundles until the new look is flipped on for everyone:
 *   - the live look: exactly the files and order `scripts/build-frontend.js` lists (today's Connect);
 *   - the 2026 look: the same list, with the screens the new shell rewrote taken from
 *     `src/frontend/app/look-2026/` instead, plus the new shell's own files.
 * The 2026 list is DERIVED from the live one here, so the two cannot drift apart.
 *
 * `src/frontend/index.html` decides the look before anything is drawn (data-look on <html>, see the
 * comment there). This step replaces the page's single bundle tag with a one-line loader that asks
 * for the bundle matching that decision, so a visitor downloads one bundle, never both.
 *
 * The later flip: set CONNECT_DEFAULT_LOOK=2026 for the build (or change DEFAULT_LOOK in index.html).
 * Removing the old look after that: move look-2026/* over the live files, then delete this file,
 * its call in build-frontend.js and the bootstrap in index.html.
 */
'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildAppBundle } = require('@citizens/frontend-build');

const LOOKS = ['live', '2026'];
const LOOK_2026_DIR = 'look-2026';
const LOOK_2026_BUNDLE_NAME = 'bundle-look2026';

/** Screens that have a 2026 version in app/look-2026/ (same file name). */
const LOOK_2026_OVERRIDES = [
  'map-v2-lib.jsx',
  'data.jsx',
  'map-v2-strings.jsx',
  'map-v2-pins.jsx',
  'map.jsx',
  'map-v2-online.jsx',
  'home.jsx',
  'shell.jsx',
];

/** Files only the 2026 look loads, and the live file they follow in the load order. */
const LOOK_2026_ADDED = {
  after: 'map-v2-explore.jsx',
  files: ['connect-chrome.jsx', 'connect-previews.jsx', 'connect-explore.jsx', 'connect-me.jsx'],
};

/** The marker in index.html's bootstrap that carries the default look. */
const DEFAULT_LOOK_LINE = "var DEFAULT_LOOK = 'live';";

/** The 2026 look's load order, derived from the live one. Throws when the live list lost a name it relies on. */
function look2026Order(liveOrder) {
  for (const name of [...LOOK_2026_OVERRIDES, LOOK_2026_ADDED.after]) {
    if (!liveOrder.includes(name)) {
      throw new Error(`[look-bundles] the live file order no longer lists ${name}: update scripts/look-bundles.js`);
    }
  }
  const out = [];
  for (const name of liveOrder) {
    out.push(LOOK_2026_OVERRIDES.includes(name) ? `${LOOK_2026_DIR}/${name}` : name);
    if (name === LOOK_2026_ADDED.after) out.push(...LOOK_2026_ADDED.files);
  }
  return out;
}

/** 'live' unless CONNECT_DEFAULT_LOOK says '2026'. Any other value fails the build instead of shipping a guess. */
function defaultLookFromEnv(env) {
  const value = env.CONNECT_DEFAULT_LOOK;
  if (value === undefined || value === '') return 'live';
  if (!LOOKS.includes(value)) {
    throw new Error(`[look-bundles] CONNECT_DEFAULT_LOOK must be "live" or "2026" (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Pure: put the loader and the default look into the built index.html.
 * Both edits must find exactly one place to land, or the build fails: a page that silently kept
 * one hard-wired bundle would make the switch a no-op.
 */
function applyLooksToHtml(html, { liveBundle, look2026Bundle, defaultLook }) {
  if (!LOOKS.includes(defaultLook)) throw new Error(`[look-bundles] unknown look ${JSON.stringify(defaultLook)}`);
  for (const file of [liveBundle, look2026Bundle]) {
    if (!/^bundle(?:-[a-z0-9]+)?\.[0-9a-f]{10}\.js$/.test(file)) {
      throw new Error(`[look-bundles] not a built bundle file name: ${JSON.stringify(file)}`);
    }
  }
  const tag = `<script src="app/${liveBundle}"></script>`;
  if (html.split(tag).length !== 2) {
    throw new Error('[look-bundles] the built index.html must hold exactly one app bundle tag');
  }
  if (html.split(DEFAULT_LOOK_LINE).length !== 2) {
    throw new Error(`[look-bundles] index.html must hold exactly one \`${DEFAULT_LOOK_LINE}\` (the look switch's bootstrap)`);
  }
  // The bundle is the page's last script and must still run in document order, so the loader writes
  // a plain parser-inserted tag. Same origin, and the page's CSP already allows its inline scripts.
  const loader =
    '<script>document.write(\'<script src="app/\' + (document.documentElement.getAttribute("data-look") === "2026" ? ' +
    `"${look2026Bundle}" : "${liveBundle}") + '"><\\/script>');</script>`;
  return html
    .replace(tag, () => loader)
    .replace(DEFAULT_LOOK_LINE, () => `var DEFAULT_LOOK = '${defaultLook}';`);
}

/** Build the 2026 bundle beside the live one and rewrite the built index.html. Call after buildFrontend. */
function buildLooks({ esbuild, rootDir, dest, liveOrder, liveBundle, env = process.env, log = console.log, warn = console.warn }) {
  const defaultLook = defaultLookFromEnv(env);
  const order = look2026Order(liveOrder);
  const look2026Bundle = buildAppBundle({
    esbuild,
    srcDir: path.join(rootDir, 'src', 'frontend'),
    dest,
    appFileOrder: order,
    warn,
    name: LOOK_2026_BUNDLE_NAME,
  });
  const indexFile = path.join(dest, 'index.html');
  fs.writeFileSync(
    indexFile,
    applyLooksToHtml(fs.readFileSync(indexFile, 'utf8'), { liveBundle, look2026Bundle, defaultLook }),
  );
  log(`[build-frontend] Look switch: 2026 look → app/${look2026Bundle} (${order.length} screens); default look: ${defaultLook}`);
  return { look2026Bundle, defaultLook, order };
}

module.exports = {
  DEFAULT_LOOK_LINE,
  LOOK_2026_ADDED,
  LOOK_2026_DIR,
  LOOK_2026_OVERRIDES,
  applyLooksToHtml,
  buildLooks,
  defaultLookFromEnv,
  look2026Order,
};
