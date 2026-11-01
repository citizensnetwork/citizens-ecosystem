/**
 * Pinch zoom (issue #184). The viewport tag must not cap scale or disable
 * user scaling. Text controls stay at least 16px so iOS does not zoom on
 * focus; the type scale has no 16px step, so a control that was smaller
 * uses --fs-3 (18px), the smallest token at or above that floor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(join(root, 'src/frontend/index.html'), 'utf8');

const WEB_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover';
const TEXT_TYPES = new Set(['', 'text', 'email', 'password', 'search', 'tel', 'url', 'number']);

function viewportContent(source: string): string {
  const nameAt = source.indexOf('name="viewport"');
  expect(nameAt, 'viewport meta').toBeGreaterThan(-1);
  const contentKey = 'content="';
  const start = source.indexOf(contentKey, nameAt);
  expect(start).toBeGreaterThan(-1);
  const valueStart = start + contentKey.length;
  const end = source.indexOf('"', valueStart);
  expect(end).toBeGreaterThan(valueStart);
  return source.slice(valueStart, end);
}

function extractObject(source: string, openBrace: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openBrace; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace, i + 1);
    }
  }
  throw new Error('unclosed object');
}

function quotedProp(props: string, name: string): string | null {
  const match = props.match(new RegExp(`${name}\\s*:\\s*(?:'([^']*)'|"([^"]*)")`));
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

function styleSource(props: string): string | null {
  const key = props.search(/style\s*:/);
  if (key < 0) return null;
  const rest = props.slice(key).replace(/^style\s*:\s*/, '');
  if (rest.startsWith('{')) return extractObject(rest, 0);
  const id = rest.match(/^([A-Za-z_][\w]*)/);
  return id ? id[1]! : null;
}

function fontSizeRaw(chunk: string): string | null {
  const match = chunk.match(/fontSize\s*:\s*([^,\n}]+)/);
  return match ? match[1]!.trim() : null;
}

/** The nearest `const name = { … }` before `before`, or null. */
function constObject(source: string, name: string, before: number): string | null {
  const needle = `const ${name} = {`;
  const at = source.lastIndexOf(needle, before);
  if (at < 0) return null;
  return extractObject(source, at + needle.length - 1);
}

function resolvedFontSize(file: string, before: number, style: string): string | null {
  const own = fontSizeRaw(style);
  if (own) return own;
  if (!style.startsWith('{')) {
    const obj = constObject(file, style, before);
    return obj ? fontSizeRaw(obj) : null;
  }
  const spreads = [...style.matchAll(/\.\.\.([A-Za-z_][\w]*)/g)];
  for (const spread of spreads) {
    const obj = constObject(file, spread[1]!, before);
    const size = obj ? fontSizeRaw(obj) : null;
    if (size) return size;
  }
  return null;
}

function tokenPx(token: string): number | null {
  const match = html.match(new RegExp(`--${token}:\\s*(\\d+(?:\\.\\d+)?)px`));
  return match ? Number(match[1]) : null;
}

/** Computed px for an inline fontSize, or null when the control sets none. */
function fontSizePx(raw: string | null): number | null {
  if (raw == null) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const token = raw.match(/^['"]var\(--(fs-\d+)\)['"]$/);
  if (!token) throw new Error(`unrecognised fontSize ${raw}`);
  const px = tokenPx(token[1]!);
  if (px == null) throw new Error(`missing token --${token[1]}`);
  return px;
}

type Control = { file: string; line: number; px: number | null };

function textControls(): Control[] {
  const dir = join(root, 'src/frontend');
  const out: Control[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== 'vendor') walk(p);
        continue;
      }
      if (!ent.isFile() || !/\.jsx?$/.test(ent.name)) continue;
      const source = readFileSync(p, 'utf8');
      const calls = source.matchAll(/h\(\s*'(input|textarea|select)'/g);
      for (const call of calls) {
        const open = source.indexOf('{', call.index!);
        const props = extractObject(source, open);
        const kind = call[1]!;
        const type = kind === 'input' ? (quotedProp(props, 'type') ?? '') : kind;
        if (!TEXT_TYPES.has(type)) continue;
        const style = styleSource(props);
        if (style && style.includes("display: 'none'")) continue;
        const raw = style ? resolvedFontSize(source, call.index!, style) : null;
        const line = source.slice(0, call.index!).split('\n').length;
        out.push({ file: p.slice(dir.length + 1), line, px: fontSizePx(raw) });
      }
    }
  };
  walk(dir);
  return out;
}

describe('Wear viewport allows pinch zoom', () => {
  it('ships one viewport tag and does not cap scale or disable user scaling', () => {
    expect(html.split('name="viewport"').length - 1).toBe(1);
    const content = viewportContent(html);
    expect(content).toBe(WEB_CONTENT);
    expect(content.includes('maximum-scale')).toBe(false);
    expect(content.includes('user-scalable')).toBe(false);
    expect(html.includes('maximum-scale')).toBe(false);
    expect(html.includes('user-scalable')).toBe(false);
  });

  it('keeps text controls at least 16px so iOS does not zoom on focus', () => {
    expect(html.includes('input, textarea, select { font-size: var(--fs-3); }')).toBe(true);
    expect(tokenPx('fs-3')).toBe(18);
    const controls = textControls();
    expect(controls.length).toBeGreaterThan(0);
    const small = controls.filter((c) => c.px != null && c.px < 16);
    expect(small, JSON.stringify(small)).toEqual([]);
    // Fields that used to sit under 16px now read the type token, not a raw size.
    for (const file of [
      'app/adminq.jsx',
      'app/brand.jsx',
      'app/discover.jsx',
      'app/inbox.jsx',
      'app/post.jsx',
      'app/ui.jsx',
    ]) {
      const sized = controls.filter((c) => c.file === file && c.px != null);
      expect(sized.length, file).toBeGreaterThan(0);
      expect(
        sized.every((c) => c.px! >= 16),
        file,
      ).toBe(true);
    }
  });
});
