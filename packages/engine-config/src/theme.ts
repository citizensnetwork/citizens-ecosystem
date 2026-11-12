/**
 * Theme tokens: a world's colours and fonts, by role and never by value.
 *
 * The token names follow the roles the app's stylesheets already use (the Map v2 token block
 * and the gold roles in the app shell, which the facelift keeps), so a tenant's theme can be
 * written into the page as CSS variables without renaming anything. Each token maps to one or
 * more existing CSS variable names in `TOKEN_CSS_VARIABLES`.
 *
 * A theme has a light and a dark set. Values are checked strictly (a colour is a hex colour or
 * an rgb()/rgba() value and nothing else) because they end up inside a style block.
 */

export const COLOR_TOKENS = [
  'surface0',
  'surface1',
  'surface2',
  'text1',
  'text2',
  'accent',
  'accentContrast',
  'accentInk',
  'accentLight',
  'accentDeep',
  'ok',
  'closed',
  'error',
  'live',
  'focusRing',
  'divider',
  'scrim',
  'mapBackground',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

export type ColorScheme = 'light' | 'dark';

export type ColorSet = Readonly<Record<ColorToken, string>>;

export interface ThemeFonts {
  /** The font stack for headings, as a CSS font-family value. */
  readonly display: string;
  /** The font stack for everything else. */
  readonly body: string;
}

export interface Theme {
  readonly light: ColorSet;
  readonly dark: ColorSet;
  readonly fonts: ThemeFonts;
}

/** What each token is for. The first sentence is what a tenant's designer needs to know. */
export const COLOR_TOKEN_ROLES: Readonly<Record<ColorToken, string>> = {
  surface0: 'The page background behind everything.',
  surface1: 'Cards, sheets and panels.',
  surface2: 'Raised elements and image placeholders.',
  text1: 'Main text.',
  text2: 'Secondary text.',
  accent: 'The brand colour, used as a fill.',
  accentContrast: 'Text and icons on top of the brand fill.',
  accentInk: 'The brand colour as text, rings and icons on a surface.',
  accentLight: 'The light end of the brand gradient.',
  accentDeep: 'The deep end of the brand gradient.',
  ok: 'Open, confirmed, successful. Always paired with words.',
  closed: 'Closed, ended. Always paired with words.',
  error: 'Something went wrong.',
  live: 'Happening now.',
  focusRing: 'The outline around the control the keyboard is on.',
  divider: 'Thin lines between rows.',
  scrim: 'The dimming behind a dialog.',
  mapBackground: 'What the map shows before its tiles arrive.',
};

/**
 * The CSS variable each token is written to, in both colour sets. The names are the app's own
 * (the Map v2 token block), unchanged. `accentLight` and `accentDeep` have no variable here:
 * they are only written through the shell's names below.
 */
export const TOKEN_CSS_VARIABLES: Readonly<Partial<Record<ColorToken, string>>> = {
  surface0: '--surface-0',
  surface1: '--surface-1',
  surface2: '--surface-2',
  text1: '--text-1',
  text2: '--text-2',
  accent: '--accent',
  accentContrast: '--accent-contrast',
  accentInk: '--accent-ink',
  ok: '--ok',
  closed: '--closed',
  error: '--error',
  live: '--live',
  focusRing: '--focus-ring',
  divider: '--divider',
  scrim: '--scrim',
  mapBackground: '--map-bg',
};

/**
 * The app shell's older names for the brand colour's roles. The shell defines them once, for
 * the light set only, and the dark set inherits them; so they are written from the LIGHT
 * colours and never for the dark set. That is exactly how the app behaves today.
 */
export const SHELL_CSS_VARIABLES: Readonly<Partial<Record<ColorToken, string>>> = {
  accent: '--gold',
  accentInk: '--gold-dark',
  accentLight: '--gold-light',
  accentDeep: '--gold-deep',
};

export const FONT_CSS_VARIABLES = { display: '--font-display', body: '--font-body' } as const;

/** A solid hex colour: #rgb or #rrggbb. */
export const SOLID_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** A hex colour (with or without transparency), or an rgb()/rgba() value. Nothing else. */
export const COLOR_RE =
  /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*(?:,\s*(?:0|1|0?\.\d{1,3}|1\.0{1,3})\s*)?\))$/;
const FONT_NAME = "(?:'[A-Za-z0-9 ]{1,40}'|[A-Za-z][A-Za-z0-9-]{0,39})";
/** One to eight font names, quoted or bare, separated by commas. Nothing else. */
export const FONT_STACK_RE = new RegExp(`^${FONT_NAME}(?:, ?${FONT_NAME}){0,7}$`);

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && COLOR_RE.test(value);
}

export function isOpaqueHex(value: unknown): value is string {
  return typeof value === 'string' && SOLID_HEX_RE.test(value);
}

export function isFontStack(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && FONT_STACK_RE.test(value);
}

function channels(hex: string): [number, number, number] {
  const body = hex.slice(1);
  const full = body.length === 3 ? Array.from(body, (c) => c + c).join('') : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two solid hex colours, from 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  if (!isOpaqueHex(a) || !isOpaqueHex(b)) {
    throw new Error('contrastRatio needs two solid hex colours.');
  }
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastRule {
  readonly foreground: ColorToken;
  readonly background: ColorToken;
  readonly minimum: number;
  readonly why: string;
}

/**
 * The pairs every theme must keep readable, in both colour sets. 4.5:1 is the WCAG AA level
 * for text; 3:1 is the level for large text and for the edges of controls.
 */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  { foreground: 'text1', background: 'surface0', minimum: 4.5, why: 'main text on the page' },
  { foreground: 'text1', background: 'surface1', minimum: 4.5, why: 'main text on a card' },
  { foreground: 'text2', background: 'surface1', minimum: 4.5, why: 'secondary text on a card' },
  {
    foreground: 'accentContrast',
    background: 'accent',
    minimum: 4.5,
    why: 'the label on a brand-coloured button',
  },
  {
    foreground: 'accentInk',
    background: 'surface1',
    minimum: 3,
    why: 'brand-coloured text and icons',
  },
  {
    foreground: 'focusRing',
    background: 'surface1',
    minimum: 3,
    why: 'the keyboard focus outline',
  },
];

export interface ContrastFailure {
  readonly scheme: ColorScheme;
  readonly rule: ContrastRule;
  readonly ratio: number;
}

/** The contrast rules a colour set breaks. A pair is skipped when either colour is not solid. */
export function contrastFailures(colors: ColorSet, scheme: ColorScheme): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const rule of CONTRAST_RULES) {
    const foreground = colors[rule.foreground];
    const background = colors[rule.background];
    if (!isOpaqueHex(foreground) || !isOpaqueHex(background)) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < rule.minimum) failures.push({ scheme, rule, ratio });
  }
  return failures;
}

/** The theme as CSS variables for one colour set, ready to write into a style block. */
export function themeCssVariables(theme: Theme, scheme: ColorScheme): Record<string, string> {
  const variables: Record<string, string> = {};
  const colors = theme[scheme];
  for (const token of COLOR_TOKENS) {
    const name = TOKEN_CSS_VARIABLES[token];
    if (name) variables[name] = colors[token];
    const shellName = SHELL_CSS_VARIABLES[token];
    if (shellName && scheme === 'light') variables[shellName] = colors[token];
  }
  variables[FONT_CSS_VARIABLES.display] = theme.fonts.display;
  variables[FONT_CSS_VARIABLES.body] = theme.fonts.body;
  return variables;
}
