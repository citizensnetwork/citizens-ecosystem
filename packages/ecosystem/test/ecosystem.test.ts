import { describe, expect, it } from 'vitest';
import {
  APP_SLUGS,
  BASE_PATH_ENV,
  PATH_ROOT,
  appPath,
  basePathFromEnv,
  resolveBasePath,
} from '../index.js';

describe('registry', () => {
  it('lists the apps that exist in this repo', () => {
    expect([...APP_SLUGS]).toEqual(['connect', 'vision', 'wear']);
  });

  it('keeps every slug a safe, unique URL segment', () => {
    const seen = new Set<string>();
    for (const slug of APP_SLUGS) {
      expect(slug, slug).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(seen.has(slug), `duplicate slug ${slug}`).toBe(false);
      seen.add(slug);
    }
  });

  it('is frozen, so no app can edit the shared list at build time', () => {
    expect(Object.isFrozen(APP_SLUGS)).toBe(true);
  });

  it('exposes the env var name and path root the docs and Vercel settings rely on', () => {
    expect(BASE_PATH_ENV).toBe('NEXT_PUBLIC_BASE_PATH');
    expect(PATH_ROOT).toBe('/citizens');
  });
});

describe('appPath', () => {
  it('puts each app under /citizens/<slug>', () => {
    expect(appPath('connect')).toBe('/citizens/connect');
    expect(appPath('vision')).toBe('/citizens/vision');
    expect(appPath('wear')).toBe('/citizens/wear');
  });

  it('refuses an app this repo does not have', () => {
    // @ts-expect-error — proving the runtime guard, not the type
    expect(() => appPath('learn')).toThrow(
      /unknown app "learn"; known apps: connect, vision, wear/,
    );
    // @ts-expect-error — prototype keys are not slugs
    expect(() => appPath('constructor')).toThrow(/unknown app/);
  });
});

describe('resolveBasePath', () => {
  it('serves from the site root when nothing is set (today’s behaviour)', () => {
    for (const unset of [undefined, null, '', '   ', '/', ' / ']) {
      expect(resolveBasePath('connect', unset), JSON.stringify(unset)).toBe('');
    }
  });

  it('returns exactly the app’s own path when it is set', () => {
    expect(resolveBasePath('connect', '/citizens/connect')).toBe('/citizens/connect');
    expect(resolveBasePath('vision', '/citizens/vision')).toBe('/citizens/vision');
    expect(resolveBasePath('wear', '/citizens/wear')).toBe('/citizens/wear');
  });

  it('forgives surrounding whitespace (a pasted newline included) and ONE trailing slash', () => {
    expect(resolveBasePath('wear', ' /citizens/wear ')).toBe('/citizens/wear');
    expect(resolveBasePath('wear', '/citizens/wear\n')).toBe('/citizens/wear');
    expect(resolveBasePath('wear', '/citizens/wear/')).toBe('/citizens/wear');
  });

  it('rejects another app’s path, naming the one that is expected', () => {
    expect(() => resolveBasePath('connect', '/citizens/wear')).toThrow(
      'NEXT_PUBLIC_BASE_PATH="/citizens/wear" is not valid for "connect": leave it unset to serve from the site root, or set it to exactly "/citizens/connect".',
    );
  });

  it.each([
    'citizens/connect',
    '/citizens',
    '/citizens/connect/extra',
    '/citizens/connect//',
    '/Citizens/Connect',
    '//evil.example',
    '//citizens/connect',
    'https://219.co.za/citizens/connect',
    '/citizens/connect/../vision',
    '/citizens/connect?x=1',
    '/citizens/connect#top',
    '/citizens/connect"><script>',
    '/citizens/connect\n/extra',
    '\\citizens\\connect',
  ])('rejects %j (a base path is never anything but the registry’s own value)', (bad) => {
    expect(() => resolveBasePath('connect', bad)).toThrow(/is not valid for "connect"/);
  });

  it('refuses an app this repo does not have, even with no value set', () => {
    // @ts-expect-error — proving the runtime guard, not the type
    expect(() => resolveBasePath('learn', undefined)).toThrow(/unknown app/);
  });
});

describe('basePathFromEnv', () => {
  it('reads NEXT_PUBLIC_BASE_PATH from the env it is given', () => {
    expect(basePathFromEnv('vision', { NEXT_PUBLIC_BASE_PATH: '/citizens/vision' })).toBe(
      '/citizens/vision',
    );
    expect(basePathFromEnv('vision', {})).toBe('');
  });

  it('ignores every other variable, including look-alikes', () => {
    expect(
      basePathFromEnv('vision', {
        BASE_PATH: '/citizens/vision',
        NEXT_PUBLIC_BASEPATH: '/citizens/vision',
      }),
    ).toBe('');
  });

  it('defaults to process.env', () => {
    const env = process.env as Record<string, string | undefined>;
    const before = env.NEXT_PUBLIC_BASE_PATH;
    try {
      delete env.NEXT_PUBLIC_BASE_PATH;
      expect(basePathFromEnv('wear')).toBe('');
      env.NEXT_PUBLIC_BASE_PATH = '/citizens/wear';
      expect(basePathFromEnv('wear')).toBe('/citizens/wear');
      env.NEXT_PUBLIC_BASE_PATH = '/citizens/connect';
      expect(() => basePathFromEnv('wear')).toThrow(/is not valid for "wear"/);
    } finally {
      if (before === undefined) delete env.NEXT_PUBLIC_BASE_PATH;
      else env.NEXT_PUBLIC_BASE_PATH = before;
    }
  });
});
