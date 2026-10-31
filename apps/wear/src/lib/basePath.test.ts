import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Serving Wear under /citizens/wear (PR A of the 219.co.za move). next.config.js takes its base path
 * from @citizens/ecosystem. With NEXT_PUBLIC_BASE_PATH unset (production today) nothing may change.
 */

const requireCjs = createRequire(import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('../../next.config.js', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../frontend/index.html', import.meta.url));
const ENV = 'NEXT_PUBLIC_BASE_PATH';

type Config = {
  basePath?: string;
  redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
};

const env = process.env as Record<string, string | undefined>;
const saved = env[ENV];

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
    const prefixed = await load('/citizens/wear').redirects();
    expect(prefixed).toEqual(await load(undefined).redirects());
    expect(prefixed).toEqual([{ source: '/', destination: '/index.html', permanent: false }]);
  });
});

describe('index.html under a prefix', () => {
  it('loads everything by a relative URL and has no <base>, so it works from /citizens/wear/index.html as is', () => {
    const html = readFileSync(INDEX_PATH, 'utf8');
    const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
    expect(absolute, `root-absolute src/href in index.html: ${absolute.join(', ')}`).toEqual([]);
    expect(html).not.toMatch(/<base\b/i);
  });
});
