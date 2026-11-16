import { describe, expect, it } from 'vitest';
import {
  citizensConfiguration,
  COLOR_TOKEN_ROLES,
  COLOR_TOKENS,
  CONTRAST_RULES,
  contrastFailures,
  contrastRatio,
  isColor,
  isFontStack,
  isOpaqueHex,
  sampleConfiguration,
  SHELL_CSS_VARIABLES,
  themeCssVariables,
  TOKEN_CSS_VARIABLES,
} from '../src/index';

describe('colour values', () => {
  it('accepts hex colours and rgb()/rgba() values', () => {
    for (const good of [
      '#fff',
      '#F2BD22',
      '#0a090880',
      'rgb(1,2,3)',
      'rgb(255, 255, 255)',
      'rgba(10, 9, 8, 0.12)',
      'rgba(0,0,0,1)',
      'rgba(0, 0, 0, .5)',
      'rgba(0, 0, 0, 1.0)',
    ]) {
      expect(isColor(good), good).toBe(true);
    }
  });

  it('refuses everything else, so nothing but a colour can reach a style block', () => {
    for (const bad of [
      'red',
      '#ggg',
      '#ffff',
      '#12345',
      'rgb(256,0,0)',
      'rgb(0,0)',
      'rgba(0,0,0,1.5)',
      'rgba(0,0,0,0.1234)',
      'rgb(0,0,0);color:red',
      'rgb(0,0,0)}body{display:none',
      'url(https://example.test/x)',
      'var(--accent)',
      'expression(alert(1))',
      '#fff ',
      ' #fff',
      '#fff\n',
      '',
      42,
      null,
      undefined,
      ['#fff'],
      `rgb(${' '.repeat(60)}0,0,0)`,
    ]) {
      expect(isColor(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('tells a solid hex colour from one with transparency', () => {
    expect(isOpaqueHex('#abc')).toBe(true);
    expect(isOpaqueHex('#aabbcc')).toBe(true);
    expect(isOpaqueHex('#aabbcc80')).toBe(false);
    expect(isOpaqueHex('rgb(0,0,0)')).toBe(false);
    expect(isOpaqueHex(0)).toBe(false);
  });
});

describe('font stacks', () => {
  it('accepts font names, quoted or bare, separated by commas', () => {
    for (const good of [
      'serif',
      "'Playfair Display', serif",
      "'Plus Jakarta Sans', ui-sans-serif, sans-serif",
      "'Inter',system-ui",
    ]) {
      expect(isFontStack(good), good).toBe(true);
    }
  });

  it('refuses anything that could close the declaration or load a file', () => {
    for (const bad of [
      '',
      'serif; color: red',
      'serif}',
      '"Inter"',
      "'Inter', url(https://example.test/f.woff)",
      "'Inter'  ,  serif",
      "'Inter\\'",
      'a, b, c, d, e, f, g, h, i',
      `'${'x'.repeat(41)}'`,
      'x'.repeat(201),
      7,
    ]) {
      expect(isFontStack(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('contrast', () => {
  it('measures the WCAG ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#f2bd22', '#ffffff')).toBeCloseTo(1.74, 1);
    expect(contrastRatio('#836100', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrastRatio('#123456', '#abcdef')).toBe(contrastRatio('#abcdef', '#123456'));
  });

  it('only measures solid colours', () => {
    expect(() => contrastRatio('rgba(0,0,0,0.5)', '#fff')).toThrow();
    expect(() => contrastRatio('#fff', '#ffffff80')).toThrow();
  });

  it('both configurations in this repository pass every rule, in both colour sets', () => {
    for (const configuration of [citizensConfiguration, sampleConfiguration]) {
      expect(contrastFailures(configuration.theme.light, 'light')).toEqual([]);
      expect(contrastFailures(configuration.theme.dark, 'dark')).toEqual([]);
    }
  });

  it('reports a pair that is too close, and skips a pair it cannot measure', () => {
    const light = { ...sampleConfiguration.theme.light, text2: '#c9d2ce' };
    const failures = contrastFailures(light, 'light');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.rule.foreground).toBe('text2');
    expect(failures[0]?.scheme).toBe('light');
    expect(failures[0]?.ratio).toBeLessThan(4.5);

    const seeThrough = { ...sampleConfiguration.theme.light, text2: 'rgba(0, 0, 0, 0.1)' };
    expect(contrastFailures(seeThrough, 'light')).toEqual([]);
  });

  it('the rules name tokens that exist', () => {
    for (const rule of CONTRAST_RULES) {
      expect(COLOR_TOKENS).toContain(rule.foreground);
      expect(COLOR_TOKENS).toContain(rule.background);
    }
  });
});

describe('CSS variables', () => {
  it('writes every token of a colour set under the app’s own variable names', () => {
    const light = themeCssVariables(sampleConfiguration.theme, 'light');
    expect(light['--surface-0']).toBe('#f4f7f5');
    expect(light['--accent']).toBe('#0f766e');
    expect(light['--accent-ink']).toBe('#0f766e');
    expect(light['--map-bg']).toBe('#dfe8e3');
    expect(light['--font-display']).toBe("'Fraunces', serif");
    expect(light['--font-body']).toBe("'Inter', system-ui, sans-serif");
  });

  it('writes the shell’s older brand names from the light set only', () => {
    const light = themeCssVariables(sampleConfiguration.theme, 'light');
    const dark = themeCssVariables(sampleConfiguration.theme, 'dark');
    expect(light['--gold']).toBe('#0f766e');
    expect(light['--gold-dark']).toBe('#0f766e');
    expect(light['--gold-light']).toBe('#5eead4');
    expect(light['--gold-deep']).toBe('#115e59');
    for (const name of Object.values(SHELL_CSS_VARIABLES)) expect(dark).not.toHaveProperty(name);
    expect(dark['--accent']).toBe('#2dd4bf');
    expect(dark['--map-bg']).toBe('#1c2623');
  });

  it('every token has a role and reaches at least one variable', () => {
    for (const token of COLOR_TOKENS) {
      expect(COLOR_TOKEN_ROLES[token].length, token).toBeGreaterThan(0);
      expect(TOKEN_CSS_VARIABLES[token] ?? SHELL_CSS_VARIABLES[token], token).toBeDefined();
    }
    const names = [...Object.values(TOKEN_CSS_VARIABLES), ...Object.values(SHELL_CSS_VARIABLES)];
    expect(new Set(names).size).toBe(names.length);
  });
});
