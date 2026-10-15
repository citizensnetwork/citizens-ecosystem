import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Pins the Content-Security-Policy that `next.config.js` sends to the real
 * `src/frontend/index.html`. If a CDN host moves, or someone adds an inline
 * script, these fail before production starts blocking the page.
 */

const requireCjs = createRequire(import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('../../next.config.js', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../frontend/index.html', import.meta.url));

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/** Loads next.config.js fresh, so NODE_ENV is read again. */
async function loadHeaders(nodeEnv: string): Promise<Header[]> {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    delete requireCjs.cache[requireCjs.resolve(CONFIG_PATH)];
    const config = requireCjs(CONFIG_PATH) as { headers: () => Promise<HeaderRule[]> };
    const rules = await config.headers();
    const all = rules.find((r) => r.source === '/:path*');
    if (!all) throw new Error('no /:path* header rule');
    return all.headers;
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
}

function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
}

async function policy(nodeEnv: string): Promise<Map<string, string[]>> {
  const headers = await loadHeaders(nodeEnv);
  const csp = headers.filter((h) => h.key === 'Content-Security-Policy');
  expect(csp).toHaveLength(1);
  return directives(csp[0]!.value);
}

const hostOf = (url: string) => new URL(url).origin;

describe('Wear Content-Security-Policy header', () => {
  afterEach(() => {
    delete requireCjs.cache[requireCjs.resolve(CONFIG_PATH)];
  });

  it('is sent exactly once, next to the other security headers', async () => {
    const headers = await loadHeaders('production');
    const keys = headers.map((h) => h.key);
    for (const k of [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(keys.filter((x) => x === k)).toHaveLength(1);
    }
  });

  it('allows scripts only from self and the two pinned CDNs, never inline or eval', async () => {
    const script = (await policy('production')).get('script-src');
    expect(script).toEqual(["'self'", 'https://unpkg.com', 'https://cdn.jsdelivr.net']);
  });

  it("adds 'unsafe-eval' in development only (Next's React Refresh)", async () => {
    expect((await policy('development')).get('script-src')).toContain("'unsafe-eval'");
    expect((await policy('production')).get('script-src')).not.toContain("'unsafe-eval'");
    expect((await policy('test')).get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('closes plugin, framing, base-tag and form-hijack routes', async () => {
    const d = await policy('production');
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
  });

  it('lets the browser talk only to this site and the Supabase project', async () => {
    const connect = (await policy('production')).get('connect-src');
    expect(connect).toEqual([
      "'self'",
      'https://xyiajtrvhlxaeplsiajj.supabase.co',
      'wss://xyiajtrvhlxaeplsiajj.supabase.co',
    ]);
  });

  it('never uses a bare scheme or wildcard source outside img-src', async () => {
    const d = await policy('production');
    for (const [name, values] of d) {
      if (name === 'img-src') continue;
      for (const v of values) {
        expect(v, `${name} contains ${v}`).not.toMatch(/^(\*|https?:|wss?:|data:|blob:)$/);
      }
    }
  });

  it('draws pictures from storage, Google avatars and the demo-content hosts only', async () => {
    expect((await policy('production')).get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://xyiajtrvhlxaeplsiajj.supabase.co',
      'https://*.googleusercontent.com',
      'https://ui-avatars.com',
      'https://images.unsplash.com',
    ]);
  });
});

describe('the policy against the real index.html', () => {
  const html = readFileSync(INDEX_PATH, 'utf8');

  it('covers every external script the page loads', async () => {
    const allowed = (await policy('production')).get('script-src') ?? [];
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g)].map((m) => m[1]!);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(allowed, src).toContain(hostOf(src));
  });

  it('covers every external stylesheet and font host', async () => {
    const d = await policy('production');
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
    const sheets = links
      .filter((l) => /rel="stylesheet"/.test(l))
      .map((l) => /href="(https?:\/\/[^"]+)"/.exec(l)?.[1])
      .filter((u): u is string => Boolean(u));
    expect(sheets.length).toBeGreaterThan(0);
    for (const url of sheets) expect(d.get('style-src'), url).toContain(hostOf(url));
    // Google Fonts serves the font files from a second host.
    expect(d.get('font-src')).toContain('https://fonts.gstatic.com');
  });

  it('has no inline script and no inline event handler (script-src has no unsafe-inline)', () => {
    const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(
      (m) => m[1]!.trim() !== '',
    );
    expect(inline).toHaveLength(0);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/href="javascript:/i);
  });
});
