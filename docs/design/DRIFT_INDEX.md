# The drift index, version 1 (frozen)

> **Status:** frozen on 2026-10-17 with `docs/design/DESIGN.md` (Designer build, phase 1). **Owner:** the Designer role ([`../../apps/connect/docs/routines/designer.md`](../../apps/connect/docs/routines/designer.md), section 6). **Rule:** a change to anything on this page (the sets, the exclusions, the counted kinds, the gold band, the formula) is a founder decision card, never a quiet edit; otherwise the week-to-week trend means nothing.

## 1. What it measures

How many different raw design values a screen's source carries **outside its token blocks**, per thousand lines. A value that is read through a token (`var(--space-4)`) is not drift; a literal `13px`, `#f4f2ec` or `box-shadow: 0 1px 3px rgba(0,0,0,.2)` written into a component is. **Lower is better.** Only the trend from week to week and the comparison between apps carry meaning; the absolute number is not a grade.

## 2. Definition (version 1)

**Source set per app** (tracked files, `git ls-files`, extensions `.jsx .js .css .html`, never a `/vendor/` path, never `config.example.js`):

| App     | Directories                 |
| ------- | --------------------------- |
| Connect | `apps/connect/src/frontend` |
| Vision  | `apps/vision/src/frontend`  |
| Wear    | `apps/wear/src/frontend`    |

`packages/ui` has no consumer, so it has no index; it is read for the gold survey only (section 4). `apps/wear/src/styles/globals.css` is not in Wear's set: no page, build file or Tailwind config imports it (a leftover of an earlier build; a cleanup item, not drift).

**Preparation.** Remove `/* */` and `<!-- -->` comments and `//` line comments (a `//` at the start of a line or after a space). A line is a **token line**, and is skipped for every kind except the gold survey, when it is a CSS custom-property declaration (`--name: value`, at the start of the line) or it lies inside the Tailwind config block (from the line containing `tailwind.config =` to the first line that is only `};`).

**Counted kinds** (the number of **distinct normalised values** of each, over all the app's files, outside token lines):

| Kind       | Matched                                                                                                                                                           | Skipped values                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colours    | `#rgb`, `#rrggbb`, `#rrggbbaa` (3-digit forms expanded to 6) and `rgb( rgba( hsl( hsla(` literals (leading-zero decimals unified, whitespace removed, lower case) | the eight colours of the Google sign-in "G" mark (a third-party brand mark, used only in the two sign-in screens), anything containing `var(` or a runtime expression |
| font sizes | `font-size:`, `fontSize:` (a bare number means px) and Tailwind `text-[..]`                                                                                       | `var(` values, `0`, `inherit`, `initial`, `unset`                                                                                                                     |
| radii      | `border-radius:`, `borderRadius:` and `rounded-[..]`                                                                                                              | the same                                                                                                                                                              |
| shadows    | `box-shadow:`, `boxShadow:` (a quoted string) and `shadow-[..]`                                                                                                   | the same, and `none`                                                                                                                                                  |
| z-index    | `z-index:`, `zIndex:` and `z-[..]`                                                                                                                                | the same                                                                                                                                                              |

Tailwind **scale** classes (`text-sm`, `rounded-lg`) are not counted: they are a scale, not a raw value. Spacing is not counted in version 1 (Connect's inline styles mix numbers and strings; a later version may add it).

**Fill gold.** A 6-digit hex colour with hue 38 to 52 degrees, saturation at least 0.45 and lightness 0.50 to 0.56. This catches a gold used as a fill and leaves out its darker ink, its lighter tints and orange. It is counted over **all** colour literals in the app, token lines included, because a second brand gold that lives only in a token block is still a second gold.

**Formula.** `DI = (distinct values over the five kinds + 5 for each fill gold beyond the first) / (lines of the source set / 1000)`, to two decimals. Lines are the newline-separated segments of each file (the script's `loc`), blank lines and comments included. The **total** uses the union of values across the three apps (a value shared by two apps counts once), the sum of lines, and the fill golds of the union.

## 3. Reference implementation

Save as `drift-ref.mjs` outside the repository (any scratch folder), run from the root of a clean checkout with `node drift-ref.mjs` (add `--list` to print every value). Phase 2 of the Designer build turns it into `apps/connect/scripts/design/drift.mjs` with unit tests, and **must reproduce the baseline below exactly** on the same commit.

```text
// Drift index v1: reference implementation (frozen with docs/design/DESIGN.md).
// Run from the root of a clean checkout:  node drift-ref.mjs [--list]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SETS = {
  connect: ['apps/connect/src/frontend'],
  vision: ['apps/vision/src/frontend'],
  wear: ['apps/wear/src/frontend'],
};
const UI = ['packages/ui/src']; // gold survey only (no drift index: it has no consumer)
const GOOGLE_G = ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#ffc107', '#ff3d00', '#4caf50', '#1976d2'];
const list = (dirs, ext) =>
  execFileSync('git', ['ls-files', ...dirs], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => ext.test(f) && !f.includes('/vendor/') && !f.endsWith('config.example.js'));

// Comments out, then the Tailwind config block and custom-property declarations are "token lines".
function lines(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
  let inTw = false;
  return bare.split('\n').map((raw) => {
    const code = raw.replace(/(^|\s)\/\/.*$/, '$1');
    if (/tailwind\.config\s*=/.test(code)) inTw = true;
    const token = inTw || /^\s*--[\w-]+\s*:/.test(code);
    if (inTw && code.trim() === '};') inTw = false;
    return { code, token };
  });
}
const norm = (v) =>
  v.trim().replace(/[;,]+$/, '').replace(/_/g, ' ').replace(/\s+/g, '').toLowerCase()
    .replace(/#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3').replace(/([(,])\./g, (_, p) => p + '0.');
const px = (v) => (/^\d+(\.\d+)?$/.test(v) ? v + 'px' : v);
const RULES = {
  colours: [/(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![\w-])/gi, /\b(?:rgba?|hsla?)\([^)]*\)/gi],
  fontSizes: [/font-size\s*:\s*([^;}]+)/gi, /fontSize\s*:\s*['"`]?([\d.]+(?:px|rem|em)?)/g, /text-\[(\d[^\]]*)\]/g],
  radii: [/border-radius\s*:\s*([^;}]+)/gi, /borderRadius\s*:\s*['"`]?([\d.]+(?:px|rem|em|%)?)/g, /rounded-\[([^\]]+)\]/g],
  shadows: [/box-shadow\s*:\s*([^;}]+)/gi, /boxShadow\s*:\s*(['"`])(.*?)\1/g, /shadow-\[([^\]]+)\]/g],
  zIndex: [/z-index\s*:\s*(-?\d+)/gi, /zIndex\s*:\s*(-?\d+)/g, /\bz-\[(-?\d+)\]/g],
};
const kinds = Object.keys(RULES);
function scan(ls, includeTokens) {
  const found = Object.fromEntries(kinds.map((k) => [k, new Set()]));
  for (const { code, token } of ls) {
    if (token && !includeTokens) continue;
    for (const kind of kinds) {
      if (token && kind !== 'colours') continue;
      for (const re of RULES[kind]) {
        for (const m of code.matchAll(re)) {
          const raw = kind === 'colours' ? m[0] : m[m.length - 1];
          const v = kind === 'fontSizes' || kind === 'radii' ? px(norm(raw)) : norm(raw);
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
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h: (h + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l };
}
// A fill gold: a 6-digit hex with hue 38 to 52 degrees, saturation >= 0.45, lightness 0.50 to 0.56.
const fillGold = (c) => /^#[0-9a-f]{6}$/.test(c) && ((x) => x.h >= 38 && x.h <= 52 && x.s >= 0.45 && x.l >= 0.5 && x.l <= 0.56)(hsl(c));

const platform = new Set();
const total = { loc: 0, golds: new Set(), ...Object.fromEntries(kinds.map((k) => [k, new Set()])) };
for (const [app, dirs] of Object.entries(SETS)) {
  const files = list(dirs, /\.(jsx?|css|html)$/);
  let loc = 0;
  const outside = Object.fromEntries(kinds.map((k) => [k, new Set()]));
  const everywhere = new Set();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    loc += text.split('\n').length;
    const ls = lines(text);
    const a = scan(ls, false);
    kinds.forEach((k) => a[k].forEach((v) => outside[k].add(v)));
    scan(ls, true).colours.forEach((v) => everywhere.add(v));
  }
  const golds = [...everywhere].filter(fillGold).sort();
  golds.forEach((g) => { platform.add(g); total.golds.add(g); });
  total.loc += loc;
  kinds.forEach((k) => outside[k].forEach((v) => total[k].add(v)));
  const distinct = kinds.reduce((n, k) => n + outside[k].size, 0);
  const di = (distinct + 5 * Math.max(golds.length - 1, 0)) / (loc / 1000);
  console.log(`${app}: files=${files.length} loc=${loc} colours=${outside.colours.size} fontSizes=${outside.fontSizes.size} radii=${outside.radii.size} shadows=${outside.shadows.size} zIndex=${outside.zIndex.size} distinct=${distinct} fillGolds=${golds.length} [${golds.join(' ')}] DI=${di.toFixed(2)}`);
  if (process.argv.includes('--list')) kinds.forEach((k) => console.log(`  ${k}: ${[...outside[k]].sort().join(' | ')}`));
}
const tDistinct = kinds.reduce((n, k) => n + total[k].size, 0);
console.log(`total (three apps, union of values): loc=${total.loc} distinct=${tDistinct} fillGolds=${total.golds.size} DI=${((tDistinct + 5 * Math.max(total.golds.size - 1, 0)) / (total.loc / 1000)).toFixed(2)}`);
const ui = new Set();
for (const f of list(UI, /\.(tsx?|cjs|js)$/)) scan(lines(readFileSync(f, 'utf8')), true).colours.forEach((v) => ui.add(v));
const uiGolds = [...ui].filter(fillGold);
uiGolds.forEach((g) => platform.add(g));
console.log(`packages/ui: fillGolds=${uiGolds.length} [${uiGolds.join(' ')}]`);
console.log(`platform: fillGolds=${platform.size} [${[...platform].sort().join(' ')}]`);
```

## 4. Baseline, measured 2026-10-17 on `origin/main` at `f14b0c8` (the commit before the Designer specification merged; later commits in this pull request are docs only and change no number)

Command: the script of section 3, run from the root of a clean checkout of that commit.

| App                                     | Files |  Lines | Colours | Font sizes | Radii | Shadows | z-index | Distinct | Fill golds                                    |        DI |
| --------------------------------------- | ----: | -----: | ------: | ---------: | ----: | ------: | ------: | -------: | --------------------------------------------- | --------: |
| Connect                                 |    37 | 13,785 |      96 |          7 |    10 |      13 |       6 |      132 | 2: `#c9a84c`, `#d4af37`                       |  **9.94** |
| Vision                                  |    14 |  3,715 |       9 |         16 |     9 |       0 |       0 |       34 | 2: `#d4af37`, `#f0c024`                       | **10.50** |
| Wear                                    |    22 | 10,279 |      93 |         22 |    16 |       8 |       4 |      143 | 1: `#f2ba1b`                                  | **13.91** |
| **Total** (three apps, union of values) |    73 | 27,779 |     n/a |        n/a |   n/a |     n/a |     n/a |      265 | 4: `#c9a84c`, `#d4af37`, `#f0c024`, `#f2ba1b` | **10.08** |
| `packages/ui` (gold survey only)        |   n/a |    n/a |     n/a |        n/a |   n/a |     n/a |     n/a |      n/a | 1: `#c9a24a`                                  |       n/a |

Across the whole platform (the three apps and `packages/ui`) the script finds **five** different fill golds: `#c9a24a`, `#c9a84c`, `#d4af37`, `#f0c024`, `#f2ba1b`. The Designer specification said three; that count came from a search for three known values and missed the two golds that live in Vision's and Wear's own pages.

## 5. How to read it, and what it cannot see

- **Connect's number is not Map v2's.** Map v2's stylesheet has no raw values outside its token blocks (a test enforces it); Connect's figure comes from the older screens, and the three apps are not on one footing: Wear and Vision write sizes inline, Connect mixes inline styles and Tailwind classes.
- **It does not read Tailwind scale classes, images, icon artwork, copy or motion.** A screen can have a low index and still be hard to use; the parity checklist and the Designer's own judgement cover that.
- **Server-side TypeScript** that carries colours (`apps/connect/src/lib/categories.ts`, `apps/connect/src/lib/map/markers.ts`) is outside the source sets, so Connect's index does not see its raw values (its golds repeat ones already counted).
- **Dynamic values** (a colour built from data at run time) are not counted; a category colour list in `data.jsx` is counted once per literal.
- **Parity** (how many of the 14 screens pass the nine-item checklist) is **not measured** in version 1: it needs the captures that phase 2 adds. **Findability** (the probe of public search terms) is **not measured** for the same reason.
- The numbers belong to a commit. A Designer run that quotes a drift figure names the commit it measured.
