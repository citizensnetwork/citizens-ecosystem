// P1-02 / M5: WCAG contrast of the Map v2 tokens (src/frontend/assets/map-v2.css), both looks.
//   node scripts/map-v2/contrast.mjs            prints the markdown table, exits 1 if a pair fails
//   node scripts/map-v2/contrast.mjs --write    also writes docs/audit/contrast.md
// The same pair list is asserted by src/__tests__/frontend/mapV2Tokens.test.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
export const CSS_PATH = join(APP, 'src', 'frontend', 'assets', 'map-v2.css');
export const DATA_PATH = join(APP, 'src', 'frontend', 'app', 'data.jsx');

export function parseTokens(css) {
  const grab = (re) => {
    const m = re.exec(css);
    const out = {};
    if (!m) return out;
    for (const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
    return out;
  };
  const light = grab(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = grab(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);
  return { light, dark: { ...light, ...dark } };
}

function toRgba(v, tokens) {
  v = v.trim();
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (ref) return toRgba(tokens[ref[1]], tokens);
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error('cannot read colour: ' + v);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = (c) => {
  const v = c.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const ratio = (a, b) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};

// [label, foreground token, background token, threshold, kind]
// kind 'over'   = the foreground is semi-transparent: composite it over the background first.
// kind 'border' = the pair only counts in the dark look (on the light map the hairline carries the separation).
export const PAIRS = [
  ['Primary text on the app background', '--text-1', '--surface-0', 4.5],
  ['Primary text on the sheet', '--text-1', '--surface-1', 4.5],
  ['Primary text on a raised surface', '--text-1', '--surface-2', 4.5],
  ['Secondary text on the app background', '--text-2', '--surface-0', 4.5],
  ['Secondary text on the sheet', '--text-2', '--surface-1', 4.5],
  ['Secondary text on a raised surface', '--text-2', '--surface-2', 4.5],
  ['Accent label on the accent fill', '--accent-contrast', '--accent', 4.5],
  ['Gold ink as text on the sheet', '--accent-ink', '--surface-1', 4.5],
  ['Gold ink as text on a raised surface', '--accent-ink', '--surface-2', 4.5],
  ['Gold ink as text on the app background', '--accent-ink', '--surface-0', 4.5],
  ['Open (green) text on the sheet', '--ok', '--surface-1', 4.5],
  ['Closed (red) text on the sheet', '--closed', '--surface-1', 4.5],
  ['Error text on the sheet', '--error', '--surface-1', 4.5],
  ['Pin name label on the map base', '--pin-label', '--map-base', 4.5],
  ['Gold ink as an icon or ring on the sheet', '--accent-ink', '--surface-1', 3],
  ['Focus ring on the sheet', '--focus-ring', '--surface-1', 3],
  ['Focus ring on the app background', '--focus-ring', '--surface-0', 3],
  ['Focus ring on a raised surface', '--focus-ring', '--surface-2', 3],
  ['Pin white border on the map base', '--pin-border', '--map-base', 3, 'border'],
  ['Pin dark hairline on the map base (composited)', '--pin-hairline', '--map-base', 3, 'over'],
  ['Photo viewer text on its backdrop (over the sheet)', '--viewer-fg', '--viewer-bg', 4.5, 'bgalpha', '--surface-1'],
];

/** Best of white or near-black as a glyph colour on a category fill: the glyph rule. */
export function categoryGlyphMin(dataJsx) {
  const hexes = [...new Set([...dataJsx.matchAll(/hex: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toLowerCase()))];
  const white = [255, 255, 255, 1];
  const ink = toRgba('#0a0908', {});
  let min = Infinity;
  let worst = null;
  for (const h of hexes) {
    const c = toRgba(h, {});
    const best = Math.max(ratio(white, c), ratio(ink, c));
    if (best < min) {
      min = best;
      worst = h;
    }
  }
  return { count: hexes.length, min, worst };
}

export function evaluate(css) {
  const t = parseTokens(css);
  const rows = [];
  for (const [label, fg, bg, need, kind, base] of PAIRS) {
    const out = { label, fg, bg, need, ratios: {} };
    for (const look of ['light', 'dark']) {
      const tokens = t[look];
      let b = toRgba(tokens[bg], tokens);
      let f = toRgba(tokens[fg], tokens);
      if (kind === 'bgalpha') b = over(b, toRgba(tokens[base], tokens)); // the background itself is translucent: composite it first
      if (kind === 'over') {
        // a fully transparent hairline (dark look) draws nothing: the white border carries the separation there
        if (f[3] === 0) {
          out.ratios[look] = null;
          continue;
        }
        f = over(f, b);
      }
      out.ratios[look] = ratio(f, b);
    }
    if (kind === 'border') out.ratios.light = null;
    rows.push(out);
  }
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith('contrast.mjs')) {
  const css = readFileSync(CSS_PATH, 'utf8');
  const rows = evaluate(css);
  const glyph = categoryGlyphMin(readFileSync(DATA_PATH, 'utf8'));
  let failed = 0;
  const cell = (r, need) => (r === null ? 'n/a' : `${r.toFixed(2)}${r < need ? ' **FAIL**' : ''}`);
  const lines = ['| Pair | Needs | Light | Dark |', '| --- | --- | --- | --- |'];
  for (const r of rows) {
    for (const look of ['light', 'dark']) if (r.ratios[look] !== null && r.ratios[look] < r.need) failed++;
    lines.push(`| ${r.label} (\`${r.fg}\` on \`${r.bg}\`) | ${r.need}:1 | ${cell(r.ratios.light, r.need)} | ${cell(r.ratios.dark, r.need)} |`);
  }
  if (glyph.min < 4.5) failed++;
  lines.push(`| Category glyph on its category fill: best of white or \`#0a0908\`, worst of ${glyph.count} colours (\`${glyph.worst}\`) | 4.5:1 | ${glyph.min.toFixed(2)} | ${glyph.min.toFixed(2)} |`);
  const md = lines.join('\n');
  console.log(md);
  if (process.argv.includes('--write')) {
    const out = join(APP, '..', '..', 'docs', 'audit', 'contrast.md');
    const body = [
      '# Map v2 — token contrast (P1-02, M5)',
      '',
      'Computed with the WCAG 2.x relative-luminance formula by `apps/connect/scripts/map-v2/contrast.mjs` from the token values in `apps/connect/src/frontend/assets/map-v2.css`, light and dark sets. `src/__tests__/frontend/mapV2Tokens.test.ts` fails the unit tests if any pair drops under its threshold. These ratios are **calculated from token values**; the final pin check is on sampled rendered pixels (P1-04, `docs/audit/phase1-qa.md`).',
      '',
      md,
      '',
      '## Notes',
      '',
      '- **Gold (D3):** `--accent #c9a84c` is a fill with the near-black label `#0a0908`. For gold text, rings and icons on light surfaces use `--accent-ink #8b6914`. Plain gold on white is 2.29:1, so it is never used as text, a ring or an icon on the light set.',
      "- **Difference from `packages/ui` (for RESUME C17):** `packages/ui/src/tokens.ts` has gold `#C9A24A`; Connect's `index.html` `:root` has `--gold #C9A84C`, `--gold-dark #8B6914`, `--gold-crown #D4AF37`. Map v2 starts from Connect's values (`#C9A84C`, `#8B6914`) and adds no new gold. Nothing in `packages/ui` is changed (it has no consumer).",
      '- **Pin on the light map:** white alone is 1.06:1 against the base, so the separation is the dark hairline (composited over the base) plus the shadow; on the dark map the white 3 px border carries it.',
      '- **Category colours** stay in `data.jsx` (23 hexes, 9 below 3:1 on white). They are fills, not borders or text: the glyph colour is chosen per fill (white or near-black, whichever contrasts more) and category is shown by glyph and colour, never colour alone.',
      '- **Scrim:** no text sits on `--scrim` in Phase 1 (the stacked menu, E19, is deferred), so it has no pair.',
      '',
    ].join('\n');
    writeFileSync(out, body);
    console.log('\nwrote', out);
  }
  if (failed) {
    console.error(`\n${failed} pair(s) below threshold`);
    process.exit(1);
  }
}
