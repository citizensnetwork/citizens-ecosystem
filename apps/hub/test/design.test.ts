import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The front door's palette (white, black, gold) must stay readable: WCAG 2.2 AA, checked from the CSS itself. */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const css = read('../src/styles/hub.css').toString('utf8');

/** `--name: #rrggbb;` pairs from the stylesheet's :root block. */
function tokens(): Record<string, string> {
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const [, name, value] of root.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    out[name as string] = (value as string).toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('palette', () => {
  const t = tokens();

  it('is white, near-black and the Connect gold', () => {
    expect(t.white).toBe('#ffffff');
    expect(t.gold).toBe('#c8a24f');
    expect(t.ink).toBe('#111111');
    expect(t.black).toBe('#0a0a0a');
  });

  // [foreground, background, minimum ratio, where it is used]
  const PAIRS: [string, string, number, string][] = [
    ['ink', 'white', 4.5, 'body text on the page'],
    ['muted', 'white', 4.5, 'card text on white'],
    ['white', 'black', 4.5, 'banner, hero and footer text'],
    ['on-black-soft', 'black', 4.5, 'hero paragraph'],
    ['gold', 'black', 4.5, 'slogan, eyebrow and focus ring on black'],
    ['ink', 'gold', 4.5, 'the Coming soon badge and skip link'],
    ['white', 'ink', 4.5, 'button label'],
    ['ink', 'gold', 4.5, 'button label on hover'],
    ['ink', 'white', 3, 'focus ring on white (needs 3 as an interface line)'],
    ['gold', 'black', 3, 'gold rules on the black bands'],
  ];

  it.each(PAIRS)('%s on %s is at least %s:1 (%s)', (fg, bg, min) => {
    expect(t[fg], `--${fg} missing from :root`).toBeDefined();
    expect(t[bg], `--${bg} missing from :root`).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min);
  });

  it('never sets gold text on white (the design system’s rule): gold is a fill, a rule, or text on black', () => {
    const rules = [...css.matchAll(/([^{}]+){([^{}]*)}/g)].map((m) => ({
      selector: (m[1] as string).trim(),
      body: m[2] as string,
    }));
    for (const { selector, body } of rules) {
      if (!/(^|;|\s)color:\s*var\(--gold\)/.test(body)) continue;
      expect(selector, `gold text in "${selector}" must sit on a black band`).toMatch(
        /\.slogan|\.hero|\.eyebrow|:focus/,
      );
    }
  });
});

describe('the stylesheet', () => {
  it('loads nothing from outside: no @import, no url(), no web font', () => {
    expect(css).not.toMatch(/@import|url\(|@font-face/i);
  });

  it('keeps every tap target at least 44 px tall', () => {
    expect(css).toMatch(/\.button\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.brand\s*{[^}]*min-height:\s*44px/);
  });

  it('shows a visible keyboard focus ring', () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid/);
  });
});

describe('icons', () => {
  it('icon.svg is the Connect mark, byte for byte', () => {
    expect(read('../public/icon.svg').equals(read('../../connect/public/icons/icon.svg'))).toBe(
      true,
    );
  });

  it('favicon.ico is a real icon holding 16, 32 and 48 pixel PNGs', () => {
    const ico = read('../public/favicon.ico');
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + 16 * i;
      sizes.push(ico[entry] as number);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + 4).toString('hex'), `image ${i} is a PNG`).toBe(
        '89504e47',
      );
      expect(offset + ico.readUInt32LE(entry + 8)).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });
});
