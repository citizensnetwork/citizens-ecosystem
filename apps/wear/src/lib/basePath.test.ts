import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { oldAddressRules } from '@citizens/ecosystem';

/**
 * Serving Wear under /citizens/wear (PR A of the 219.co.za move). next.config.js takes its base path
 * from @citizens/ecosystem. With NEXT_PUBLIC_BASE_PATH unset (production today) nothing may change.
 */

const requireCjs = createRequire(import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('../../next.config.js', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../frontend/index.html', import.meta.url));
const ENV = 'NEXT_PUBLIC_BASE_PATH';
const ORIGIN_ENV = 'HUB_ORIGIN_WEAR';

type Config = {
  basePath?: string;
  redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
  rewrites?: () => Promise<{ source: string; destination: string }[]>;
};

const env = process.env as Record<string, string | undefined>;
const saved = env[ENV];
const savedOrigin = env[ORIGIN_ENV];

/** next.config.js, freshly evaluated with NEXT_PUBLIC_BASE_PATH set to `raw` (undefined = unset). */
function load(raw: string | undefined): Config {
  if (raw === undefined) delete env[ENV];
  else env[ENV] = raw;
  delete requireCjs.cache[requireCjs.resolve(CONFIG_PATH)];
  return requireCjs(CONFIG_PATH) as Config;
}

afterEach(() => {
  if (saved === undefined) delete env[ENV];
  else env[ENV] = saved;
  if (savedOrigin === undefined) delete env[ORIGIN_ENV];
  else env[ORIGIN_ENV] = savedOrigin;
  delete requireCjs.cache[requireCjs.resolve(CONFIG_PATH)];
});

describe('Wear next.config.js basePath', () => {
  it('adds no basePath key at all when unset: the config is exactly what it was', () => {
    for (const raw of [undefined, '', '  ', '/']) {
      expect('basePath' in load(raw), JSON.stringify(raw)).toBe(false);
    }
  });

  it('serves from /citizens/wear when set to that (a trailing slash is forgiven)', () => {
    expect(load('/citizens/wear').basePath).toBe('/citizens/wear');
    expect(load('/citizens/wear/').basePath).toBe('/citizens/wear');
  });

  it.each([
    '/citizens/connect',
    '/citizens/vision',
    '/citizens',
    'citizens/wear',
    '//evil.example',
    '/Citizens/Wear',
  ])('refuses %j, naming the path that is expected', (raw) => {
    expect(() => load(raw)).toThrow('set it to exactly "/citizens/wear"');
  });

  it('keeps the "/" redirect unprefixed: Next adds the prefix to source and destination itself', async () => {
    const plain = await load(undefined).redirects();
    const prefixed = await load('/citizens/wear').redirects();
    // Under the prefix the same first rule is followed by the old-address rule (see the next describe).
    expect(prefixed[0]).toEqual(plain[0]);
    expect(plain).toEqual([{ source: '/', destination: '/index.html', permanent: false }]);
  });
});

describe('Wear old addresses', () => {
  it('adds nothing at all when the prefix is unset: no rewrites() key, and redirects() is exactly today’s', async () => {
    for (const raw of [undefined, '', '/']) {
      const config = load(raw);
      expect('rewrites' in config, JSON.stringify(raw)).toBe(false);
      expect(await config.redirects(), JSON.stringify(raw)).toEqual([
        { source: '/', destination: '/index.html', permanent: false },
      ]);
    }
  });

  it('does not even read HUB_ORIGIN_WEAR while the prefix is unset (a bad value cannot break today’s build)', () => {
    env[ORIGIN_ENV] = 'not a url';
    expect(() => load(undefined)).not.toThrow();
  });

  it('under the prefix, sends a bare / to it and /api/* to the app’s own production route', async () => {
    delete env[ORIGIN_ENV];
    const config = load('/citizens/wear');
    expect(await config.redirects()).toContainEqual({
      source: '/',
      basePath: false,
      destination: '/citizens/wear',
      permanent: false,
    });
    expect(await config.rewrites!()).toEqual([
      {
        source: '/api/:path*',
        basePath: false,
        destination: 'https://citizens-ecosystem-wear.vercel.app/citizens/wear/api/:path*',
      },
    ]);
  });

  it('is exactly @citizens/ecosystem’s oldAddressRules, and HUB_ORIGIN_WEAR moves the rewrite', async () => {
    env[ORIGIN_ENV] = 'http://127.0.0.1:4010';
    const config = load('/citizens/wear');
    const rules = oldAddressRules('wear', '/citizens/wear', env);
    expect(await config.rewrites!()).toEqual(rules.rewrites);
    expect(rules.rewrites[0]?.destination).toBe('http://127.0.0.1:4010/citizens/wear/api/:path*');
    expect((await config.redirects()).slice(1)).toEqual(rules.redirects);
  });

  it('refuses a HUB_ORIGIN_WEAR that is not a bare origin, while the prefix is on', () => {
    env[ORIGIN_ENV] = 'https://example.vercel.app/citizens/wear';
    expect(() => load('/citizens/wear')).toThrow(
      /HUB_ORIGIN_WEAR=.* is not valid: use a bare origin/,
    );
  });
});

describe('index.html under a prefix', () => {
  it('names its own icon by a RELATIVE URL (the domain root belongs to the front door), and ships the file', () => {
    // Browsers ask the domain root for /favicon.ico when a page names no icon; under one shared domain that root is
    // the front door's, so each app names its own. Relative: /citizens/wear/icons/icon.svg under the prefix.
    const html = readFileSync(INDEX_PATH, 'utf8');
    expect(html.match(/<link\b[^>]*\brel="icon"[^>]*>/g)).toEqual([
      '<link rel="icon" href="icons/icon.svg" type="image/svg+xml" />',
    ]);
    const icon = readFileSync(
      fileURLToPath(new URL('../frontend/icons/icon.svg', import.meta.url)),
      'utf8',
    );
    expect(icon).toMatch(/^<svg\b/);
  });

  it('loads everything by a relative URL and has no <base>, so it works from /citizens/wear/index.html as is', () => {
    const html = readFileSync(INDEX_PATH, 'utf8');
    const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
    expect(absolute, `root-absolute src/href in index.html: ${absolute.join(', ')}`).toEqual([]);
    expect(html).not.toMatch(/<base\b/i);
  });
});
