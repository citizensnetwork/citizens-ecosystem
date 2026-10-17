// The drift index, version 1 (FROZEN). The definition, the reason for every rule and the baseline live in
// docs/design/DRIFT_INDEX.md; this file is its tested implementation (it replaces the reference script printed
// there, and must keep reproducing that baseline exactly on the same commit: see
// src/__tests__/scripts/designDrift.test.ts). A change to a set, an exclusion, a counted kind, the gold band or the
// formula is a founder decision card, never a quiet edit.
//
//   node scripts/design/drift.mjs [--list] [--json] [--root <repo dir>]
//
// Read-only: it lists tracked files with `git ls-files` and reads them. No network, no write, no dependency.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The source set of each app (tracked files; `.jsx .js .css .html`; never a /vendor/ path or config.example.js). */
export const SETS = {
  connect: ['apps/connect/src/frontend'],
  vision: ['apps/vision/src/frontend'],
  wear: ['apps/wear/src/frontend'],
};
/** `packages/ui` has no consumer: it is read for the gold survey only. */
export const UI_DIRS = ['packages/ui/src'];
const APP_EXT = /\.(jsx?|css|html)$/;
const UI_EXT = /\.(tsx?|cjs|js)$/;

/** The eight colours of the Google sign-in "G" mark: a third-party brand mark, not our drift. */
const GOOGLE_G = ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#ffc107', '#ff3d00', '#4caf50', '#1976d2'];

export const KINDS = ['colours', 'fontSizes', 'radii', 'shadows', 'zIndex'];
const RULES = {
  colours: [/(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![\w-])/gi, /\b(?:rgba?|hsla?)\([^)]*\)/gi],
  fontSizes: [/font-size\s*:\s*([^;}]+)/gi, /fontSize\s*:\s*['"`]?([\d.]+(?:px|rem|em)?)/g, /text-\[(\d[^\]]*)\]/g],
  radii: [/border-radius\s*:\s*([^;}]+)/gi, /borderRadius\s*:\s*['"`]?([\d.]+(?:px|rem|em|%)?)/g, /rounded-\[([^\]]+)\]/g],
  shadows: [/box-shadow\s*:\s*([^;}]+)/gi, /boxShadow\s*:\s*(['"`])(.*?)\1/g, /shadow-\[([^\]]+)\]/g],
  zIndex: [/z-index\s*:\s*(-?\d+)/gi, /zIndex\s*:\s*(-?\d+)/g, /\bz-\[(-?\d+)\]/g],
};

const blankOut = (m) => m.replace(/[^\n]/g, '');

/**
 * Comments out (block, HTML and `//` after a space or at a line start), then every line is marked as a token line
 * (a custom-property declaration, or inside the Tailwind config block) or not.
 * @param {string} text
 * @returns {{code: string, token: boolean}[]}
 */
export function prepare(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, blankOut).replace(/<!--[\s\S]*?-->/g, blankOut);
  let inTailwind = false;
  return bare.split('\n').map((raw) => {
    const code = raw.replace(/(^|\s)\/\/.*$/, '$1');
    if (/tailwind\.config\s*=/.test(code)) inTailwind = true;
    const token = inTailwind || /^\s*--[\w-]+\s*:/.test(code);
    if (inTailwind && code.trim() === '};') inTailwind = false;
    return { code, token };
  });
}

/** Lower case, no whitespace, `_` as a space, 3-digit hex expanded, `.5` as `0.5`. */
export function normalise(v) {
  return v
    .trim()
    .replace(/[;,]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3')
    .replace(/([(,])\./g, (_, p) => p + '0.');
}
const withPx = (v) => (/^\d+(\.\d+)?$/.test(v) ? v + 'px' : v);

/**
 * The distinct normalised values of each kind in prepared lines. Token lines are skipped unless `includeTokens`,
 * and then only colours are read from them (the gold survey).
 */
export function scan(lines, includeTokens) {
  const found = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
  for (const { code, token } of lines) {
    if (token && !includeTokens) continue;
    for (const kind of KINDS) {
      if (token && kind !== 'colours') continue;
      for (const re of RULES[kind]) {
        for (const m of code.matchAll(re)) {
          const raw = kind === 'colours' ? m[0] : m[m.length - 1];
          const v = kind === 'fontSizes' || kind === 'radii' ? withPx(normalise(raw)) : normalise(raw);
          if (/var\(|\$\{|\+/.test(raw) || /^(inherit|initial|unset|0|0px|none)$/.test(v) || GOOGLE_G.includes(v)) continue;
          found[kind].add(v);
        }
      }
    }
  }
  return found;
}

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h: (h + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l };
}

/** A fill gold: a 6-digit hex with hue 38 to 52 degrees, saturation at least 0.45, lightness 0.50 to 0.56. */
export function isFillGold(colour) {
  if (!/^#[0-9a-f]{6}$/.test(colour)) return false;
  const x = hsl(colour);
  return x.h >= 38 && x.h <= 52 && x.s >= 0.45 && x.l >= 0.5 && x.l <= 0.56;
}

/** DI = (distinct values + 5 for each fill gold beyond the first) / (lines / 1000). */
export const driftIndex = (distinct, golds, loc) => (distinct + 5 * Math.max(golds - 1, 0)) / (loc / 1000);

/** @typedef {{files: number, loc: number, outside: Record<string, Set<string>>, golds: string[], distinct: number, di: number}} AppResult */

/**
 * One app (or any set) from its files.
 * @param {{path: string, text: string}[]} files
 * @returns {AppResult}
 */
export function analyseFiles(files) {
  let loc = 0;
  const outside = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
  const everywhere = new Set();
  for (const { text } of files) {
    loc += text.split('\n').length;
    const lines = prepare(text);
    const a = scan(lines, false);
    for (const k of KINDS) for (const v of a[k]) outside[k].add(v);
    for (const v of scan(lines, true).colours) everywhere.add(v);
  }
  const golds = [...everywhere].filter(isFillGold).sort();
  const distinct = KINDS.reduce((n, k) => n + outside[k].size, 0);
  return { files: files.length, loc, outside, golds, distinct, di: driftIndex(distinct, golds.length, loc) };
}

/** `git ls-files` under `dirs`, filtered like the reference: right extension, no /vendor/, no config.example.js. */
export function listTracked(root, dirs, ext) {
  return execFileSync('git', ['-C', root, 'ls-files', ...dirs], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => ext.test(f) && !f.includes('/vendor/') && !f.endsWith('config.example.js'));
}

/**
 * The whole index: per app, the union total, `packages/ui` golds, and the platform's fill golds.
 * `list` and `read` are injectable so tests need no repository.
 */
export function analyseRepo({
  root = REPO_ROOT,
  list = (dirs, ext) => listTracked(root, dirs, ext),
  read = (path) => readFileSync(join(root, path), 'utf8'),
} = {}) {
  /** @type {Record<string, AppResult>} */
  const apps = {};
  const total = { loc: 0, golds: new Set(), outside: Object.fromEntries(KINDS.map((k) => [k, new Set()])) };
  const platform = new Set();
  for (const [app, dirs] of Object.entries(SETS)) {
    const files = list(dirs, APP_EXT).map((path) => ({ path, text: read(path) }));
    const r = analyseFiles(files);
    apps[app] = r;
    total.loc += r.loc;
    for (const g of r.golds) {
      total.golds.add(g);
      platform.add(g);
    }
    for (const k of KINDS) for (const v of r.outside[k]) total.outside[k].add(v);
  }
  const totalDistinct = KINDS.reduce((n, k) => n + total.outside[k].size, 0);
  const totalResult = {
    loc: total.loc,
    distinct: totalDistinct,
    golds: [...total.golds].sort(),
    di: driftIndex(totalDistinct, total.golds.size, total.loc),
  };
  const uiColours = new Set();
  for (const path of list(UI_DIRS, UI_EXT)) for (const v of scan(prepare(read(path)), true).colours) uiColours.add(v);
  const uiGolds = [...uiColours].filter(isFillGold).sort();
  for (const g of uiGolds) platform.add(g);
  return { apps, total: totalResult, ui: { golds: uiGolds }, platform: [...platform].sort() };
}

const f2 = (n) => n.toFixed(2);

/** The table of DRIFT_INDEX.md section 4, as plain text. */
export function formatReport(r) {
  const rows = [['App', 'Files', 'Lines', 'Colours', 'Sizes', 'Radii', 'Shadows', 'z', 'Distinct', 'Fill golds', 'DI']];
  for (const [app, a] of Object.entries(r.apps)) {
    rows.push([app, a.files, a.loc, a.outside.colours.size, a.outside.fontSizes.size, a.outside.radii.size, a.outside.shadows.size, a.outside.zIndex.size, a.distinct, a.golds.join(' '), f2(a.di)].map(String));
  }
  rows.push(['total', '', r.total.loc, '', '', '', '', '', r.total.distinct, r.total.golds.join(' '), f2(r.total.di)].map(String));
  rows.push(['packages/ui', '', '', '', '', '', '', '', '', r.ui.golds.join(' '), ''].map(String));
  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)));
  const lines = rows.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd());
  lines.push('', `Fill golds across the platform (three apps and packages/ui): ${r.platform.length}: ${r.platform.join(' ')}`);
  return lines.join('\n');
}

/** Every distinct raw value of one app, by kind (the `--list` view and the audit's surface view). */
export function formatValues(app, a) {
  return KINDS.map((k) => `  ${app} ${k}: ${[...a.outside[k]].sort().join(' | ')}`).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const rootAt = argv.indexOf('--root');
  const root = rootAt >= 0 ? resolve(argv[rootAt + 1]) : REPO_ROOT;
  const r = analyseRepo({ root });
  if (argv.includes('--json')) {
    const plain = (a) => ({ ...a, outside: Object.fromEntries(KINDS.map((k) => [k, [...a.outside[k]].sort()])) });
    console.log(JSON.stringify({ apps: Object.fromEntries(Object.entries(r.apps).map(([k, a]) => [k, plain(a)])), total: r.total, ui: r.ui, platform: r.platform }, null, 2));
  } else {
    console.log(formatReport(r));
    if (argv.includes('--list')) for (const [app, a] of Object.entries(r.apps)) console.log('\n' + formatValues(app, a));
  }
}
