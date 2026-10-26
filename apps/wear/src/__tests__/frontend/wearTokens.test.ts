/**
 * Wear reads the Map v2 canon (one gold fill, light and dark). The values
 * are the ones in apps/connect/src/frontend/assets/map-v2.css sections 1–2.
 * A second fill gold, or a pair under WCAG AA, fails here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(join(root, 'src/frontend/index.html'), 'utf8');

function block(source: string, start: string): string {
  const i = source.indexOf(start);
  expect(i, start).toBeGreaterThan(-1);
  const from = source.indexOf('{', i);
  let depth = 0;
  for (let n = from; n < source.length; n++) {
    if (source[n] === '{') depth++;
    else if (source[n] === '}') {
      depth--;
      if (depth === 0) return source.slice(from + 1, n);
    }
  }
  throw new Error('unclosed ' + start);
}

function decl(css: string, name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(m, name).toBeTruthy();
  return m![1]!.trim();
}

function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string): number {
  const L = (hex: string) =>
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Same fill-gold band as apps/connect/scripts/design/drift.mjs. */
function isFillGold(colour: string): boolean {
  if (!/^#[0-9a-f]{6}$/.test(colour)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r!, g!, b!);
  const mn = Math.min(r!, g!, b!);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  if (d === 0) return false;
  const h =
    ((mx === r ? ((g! - b!) / d) % 6 : mx === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4) * 60 +
      360) %
    360;
  const s = d / (1 - Math.abs(2 * l - 1));
  return h >= 38 && h <= 52 && s >= 0.45 && l >= 0.5 && l <= 0.56;
}

function frontendSources(): string[] {
  const dir = join(root, 'src/frontend');
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'vendor') continue;
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (
        ent.isFile() &&
        /\.(jsx?|html|css)$/.test(ent.name) &&
        !ent.name.endsWith('config.example.js')
      ) {
        out.push(readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return out;
}

describe('Wear Map v2 tokens', () => {
  const light = block(html, ':root {');
  const dark = block(html, "[data-theme='dark'] {");

  it('uses the canon light colours, one gold fill, and the canon scales', () => {
    expect(decl(light, '--surface-0')).toBe('#f7f4ee');
    expect(decl(light, '--surface-1')).toBe('#ffffff');
    expect(decl(light, '--surface-2')).toBe('#f5f1e8');
    expect(decl(light, '--text-1')).toBe('#0a0908');
    expect(decl(light, '--text-2')).toBe('#5c5444');
    expect(decl(light, '--accent')).toBe('#c9a84c');
    expect(decl(light, '--accent-contrast')).toBe('#0a0908');
    expect(decl(light, '--accent-ink')).toBe('#8b6914');
    expect(decl(light, '--focus-ring')).toBe('#8b6914');
    expect(decl(light, '--radius-sm')).toBe('8px');
    expect(decl(light, '--radius-md')).toBe('12px');
    expect(decl(light, '--radius-lg')).toBe('20px');
    expect(decl(light, '--radius-full')).toBe('999px');
    expect(decl(light, '--fs-1')).toBe('12px');
    expect(decl(light, '--fs-2')).toBe('14px');
    expect(decl(light, '--fs-3')).toBe('18px');
    expect(decl(light, '--fw-regular')).toBe('400');
    expect(decl(light, '--fw-semibold')).toBe('600');
    expect(decl(light, '--font-display')).toContain('Playfair Display');
    expect(decl(light, '--font-body')).toContain('Plus Jakarta Sans');
    expect(decl(light, '--gold')).toBe('var(--accent)');
    expect(decl(light, '--gold-ink')).toBe('var(--accent-ink)');
    expect(decl(light, '--on-gold')).toBe('var(--accent-contrast)');
    expect(decl(light, '--ink')).toBe('var(--text-1)');
    expect(decl(light, '--bg-page')).toBe('var(--surface-0)');
  });

  it('uses the canon dark colours', () => {
    expect(decl(dark, '--surface-0')).toBe('#0a0908');
    expect(decl(dark, '--surface-1')).toBe('#1a1714');
    expect(decl(dark, '--surface-2')).toBe('#26221d');
    expect(decl(dark, '--text-1')).toBe('#f7f4ee');
    expect(decl(dark, '--text-2')).toBe('#b9ae9a');
    expect(decl(dark, '--accent')).toBe('#c9a84c');
    expect(decl(dark, '--accent-contrast')).toBe('#0a0908');
    expect(decl(dark, '--accent-ink')).toBe('#e8d48b');
    expect(decl(dark, '--focus-ring')).toBe('#e8d48b');
  });

  it('keeps text, ink and the label on gold at WCAG AA in both looks', () => {
    const pairs: [string, string, number][] = [
      ['--text-1', '--surface-0', 4.5],
      ['--text-1', '--surface-1', 4.5],
      ['--text-1', '--surface-2', 4.5],
      ['--text-2', '--surface-0', 4.5],
      ['--text-2', '--surface-1', 4.5],
      ['--text-2', '--surface-2', 4.5],
      ['--accent-ink', '--surface-0', 4.5],
      ['--accent-ink', '--surface-1', 4.5],
      ['--accent-ink', '--surface-2', 4.5],
      ['--accent-contrast', '--accent', 4.5],
      ['--focus-ring', '--surface-0', 3],
      ['--focus-ring', '--surface-1', 3],
      ['--focus-ring', '--surface-2', 3],
    ];
    for (const css of [light, dark]) {
      for (const [fg, bg, min] of pairs) {
        const ratio = contrast(decl(css, fg), decl(css, bg));
        expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('has one fill gold in the frontend, and none of the retired metals', () => {
    const sources = frontendSources().join('\n');
    for (const retired of [
      '#f0c024',
      '#d4af37',
      '#d9a50c',
      '#f2ba1b',
      '#c9a24a',
      '#f3c636',
      '#f0d789',
      '#b8860b',
      '#7a6212',
    ]) {
      expect(sources.toLowerCase()).not.toContain(retired);
    }
    expect(sources).not.toContain('Manrope');
    expect(sources.toLowerCase()).not.toContain('rgba(242,186,27');
    expect(sources.toLowerCase()).not.toContain('rgba(242, 186, 27');
    // The Google "G" mark is a third-party brand, the same exclusion the drift index uses.
    const google = new Set([
      '#4285f4',
      '#34a853',
      '#fbbc05',
      '#ea4335',
      '#ffc107',
      '#ff3d00',
      '#4caf50',
      '#1976d2',
    ]);
    const golds = new Set<string>();
    for (const m of sources.matchAll(/#(?:[0-9a-fA-F]{6})(?![\w-])/g)) {
      const hex = m[0].toLowerCase();
      if (!google.has(hex) && isFillGold(hex)) golds.add(hex);
    }
    expect([...golds]).toEqual(['#c9a84c']);
    expect(html).toContain('font-family: var(--font-body)');
    expect(html).toContain('Playfair+Display');
    expect(html).toContain('Plus+Jakarta+Sans');
  });
});
