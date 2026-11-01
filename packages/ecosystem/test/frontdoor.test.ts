import { describe, expect, it } from 'vitest';
import {
  APP_SLUGS,
  COMING_SOON,
  OLD_HOSTS,
  PRODUCTION_ORIGINS,
  SITE_ORIGIN,
  appOrigin,
  oldAddressRules,
  originEnvName,
} from '../index.js';

/** What the front door (apps/hub) and the old-address rules in each app's next.config are built from. */

describe('SITE_ORIGIN', () => {
  it('is the one shared domain, with no trailing slash', () => {
    expect(SITE_ORIGIN).toBe('https://219.co.za');
    expect(new URL(SITE_ORIGIN).origin).toBe(SITE_ORIGIN);
  });
});

describe('COMING_SOON', () => {
  it('reserves learn, play, move and impact, in that order', () => {
    expect(COMING_SOON.map((app) => app.slug)).toEqual(['learn', 'play', 'move', 'impact']);
  });

  it('describes Learn as courses, teachers and all learning material (the founder’s words, 2026-11-01)', () => {
    const learn = COMING_SOON.find((app) => app.slug === 'learn');
    expect(learn?.label).toBe('Citizens Learn');
    for (const word of ['Christian', 'courses', 'teachers', 'learning material']) {
      expect(learn?.summary, word).toContain(word);
    }
  });

  it('reserves Impact with VISION.md’s line: community change proposed, agreed, funded and launched (founder, 2026-11-01)', () => {
    const impact = COMING_SOON.find((app) => app.slug === 'impact');
    expect(impact?.label).toBe('Citizens Impact');
    for (const word of ['proposed', 'agreed', 'funded', 'officially launched', 'community needs']) {
      expect(impact?.summary, word).toContain(word);
    }
  });

  it('never overlaps the built apps, so a slug is either proxied or a coming-soon page', () => {
    for (const app of COMING_SOON) {
      expect([...APP_SLUGS], app.slug).not.toContain(app.slug);
    }
  });

  it('keeps every slug a safe, unique URL segment', () => {
    const seen = new Set<string>([...APP_SLUGS]);
    for (const { slug } of COMING_SOON) {
      expect(slug, slug).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(seen.has(slug), `duplicate slug ${slug}`).toBe(false);
      seen.add(slug);
    }
  });

  it('gives each a public name and a one-line summary', () => {
    for (const app of COMING_SOON) {
      expect(app.label, app.slug).toMatch(/^Citizens [A-Z][a-z]+$/);
      expect(app.summary.trim(), app.slug).toBe(app.summary);
      expect(app.summary.length, app.slug).toBeGreaterThan(20);
      expect(app.summary, app.slug).not.toMatch(/[\r\n]/);
    }
  });

  it('describes Move as active, physical events, cars included (the founder’s definition, 2026-11-01)', () => {
    const move = COMING_SOON.find((app) => app.slug === 'move');
    for (const word of [
      'runs',
      'hikes',
      'prayer walks',
      'archery',
      'soccer',
      'cycling',
      'car runs',
    ]) {
      expect(move?.summary, word).toContain(word);
    }
  });

  it('is frozen all the way down, so no app can edit the shared list at build time', () => {
    expect(Object.isFrozen(COMING_SOON)).toBe(true);
    for (const app of COMING_SOON) expect(Object.isFrozen(app)).toBe(true);
  });
});

describe('appOrigin', () => {
  it('names the env var per app', () => {
    expect(originEnvName('connect')).toBe('HUB_ORIGIN_CONNECT');
    expect(originEnvName('vision')).toBe('HUB_ORIGIN_VISION');
    expect(originEnvName('wear')).toBe('HUB_ORIGIN_WEAR');
    // @ts-expect-error — proving the runtime guard, not the type
    expect(() => originEnvName('learn')).toThrow(/unknown app/);
  });

  it('defaults to each project’s production address', () => {
    expect(PRODUCTION_ORIGINS).toEqual({
      connect: 'https://citizens-ecosystem-connect.vercel.app',
      vision: 'https://citizens-ecosystem-vision.vercel.app',
      wear: 'https://citizens-ecosystem-wear.vercel.app',
    });
    expect(Object.keys(PRODUCTION_ORIGINS)).toEqual([...APP_SLUGS]);
    expect(Object.isFrozen(PRODUCTION_ORIGINS)).toBe(true);
    for (const slug of APP_SLUGS) expect(appOrigin(slug, {})).toBe(PRODUCTION_ORIGINS[slug]);
  });

  it('treats a blank value as unset', () => {
    expect(appOrigin('wear', { HUB_ORIGIN_WEAR: '' })).toBe(PRODUCTION_ORIGINS.wear);
    expect(appOrigin('wear', { HUB_ORIGIN_WEAR: '   ' })).toBe(PRODUCTION_ORIGINS.wear);
  });

  it('takes an override, forgiving whitespace and one trailing slash, ignoring other apps’ variables', () => {
    expect(appOrigin('wear', { HUB_ORIGIN_WEAR: ' https://wear-test.vercel.app/ ' })).toBe(
      'https://wear-test.vercel.app',
    );
    expect(appOrigin('wear', { HUB_ORIGIN_CONNECT: 'https://connect-test.vercel.app' })).toBe(
      PRODUCTION_ORIGINS.wear,
    );
  });

  it('allows http only for a local address (fake upstreams in tests)', () => {
    expect(appOrigin('connect', { HUB_ORIGIN_CONNECT: 'http://127.0.0.1:4000' })).toBe(
      'http://127.0.0.1:4000',
    );
    expect(appOrigin('connect', { HUB_ORIGIN_CONNECT: 'http://localhost:4000' })).toBe(
      'http://localhost:4000',
    );
    expect(appOrigin('connect', { HUB_ORIGIN_CONNECT: 'http://[::1]:4000' })).toBe(
      'http://[::1]:4000',
    );
  });

  it.each([
    'example.vercel.app',
    'ftp://example.vercel.app',
    'http://example.vercel.app',
    'https://example.vercel.app/citizens/connect',
    'https://example.vercel.app/x',
    'https://example.vercel.app?x=1',
    'https://example.vercel.app/#top',
    'https://user:pass@example.vercel.app',
    'javascript:alert(1)',
    'https://',
    '//example.vercel.app',
  ])('rejects %j, naming the variable', (bad) => {
    expect(() => appOrigin('connect', { HUB_ORIGIN_CONNECT: bad })).toThrow(
      /HUB_ORIGIN_CONNECT=.* is not valid: use a bare origin/,
    );
  });

  it('refuses an app this repo does not have', () => {
    // @ts-expect-error — proving the runtime guard, not the type
    expect(() => appOrigin('learn', {})).toThrow(/unknown app/);
  });

  it('defaults to process.env', () => {
    const env = process.env as Record<string, string | undefined>;
    const before = env.HUB_ORIGIN_VISION;
    try {
      env.HUB_ORIGIN_VISION = 'https://vision-test.vercel.app';
      expect(appOrigin('vision')).toBe('https://vision-test.vercel.app');
      delete env.HUB_ORIGIN_VISION;
      expect(appOrigin('vision')).toBe(PRODUCTION_ORIGINS.vision);
    } finally {
      if (before === undefined) delete env.HUB_ORIGIN_VISION;
      else env.HUB_ORIGIN_VISION = before;
    }
  });
});

describe('oldAddressRules', () => {
  /** The regular expression inside the redirect's `/:path(...)` source, anchored like Next anchors it. */
  const pathPattern = (source: string) => {
    const inner = /^\/:path\((.*)\)$/.exec(source)?.[1];
    if (inner === undefined) throw new Error(`not a /:path(...) source: ${source}`);
    return new RegExp(`^${inner}$`);
  };

  it('adds nothing at the site root: today’s behaviour is untouched', () => {
    for (const slug of APP_SLUGS) {
      expect(oldAddressRules(slug, '')).toEqual({ redirects: [], rewrites: [] });
    }
  });

  it('refuses a base path that is not the app’s own', () => {
    expect(() => oldAddressRules('connect', '/citizens/wear')).toThrow(
      /is not valid for "connect"/,
    );
  });

  it('lists the old hosts of Connect only', () => {
    expect(OLD_HOSTS).toEqual({
      connect: ['citizenscentral.co.za', 'www.citizenscentral.co.za'],
    });
    expect(Object.isFrozen(OLD_HOSTS)).toBe(true);
  });

  describe('Connect', () => {
    const rules = oldAddressRules('connect', '/citizens/connect', {});
    const [rootOnOldHost, pathsOnOldHost, rootAnywhere] = rules.redirects;

    it('has three redirects in this order and one rewrite', () => {
      expect(rules.redirects).toHaveLength(3);
      expect(rules.rewrites).toHaveLength(1);
    });

    it('matches the address WITHOUT the prefix (basePath: false) on every rule', () => {
      for (const rule of [...rules.redirects, ...rules.rewrites]) {
        expect(rule.basePath, rule.source).toBe(false);
      }
    });

    it('redirects the old hosts’ root permanently to the shared domain', () => {
      expect(rootOnOldHost).toEqual({
        source: '/',
        has: [
          {
            type: 'host',
            value: '(?:citizenscentral\\.co\\.za|www\\.citizenscentral\\.co\\.za)',
          },
        ],
        basePath: false,
        destination: 'https://219.co.za/citizens/connect',
        permanent: true,
      });
    });

    it('matches the old hosts exactly: the dots are escaped, and Next anchors the value', () => {
      const value = rootOnOldHost?.has?.[0]?.value ?? '';
      const host = new RegExp(`^${value}$`);
      expect(host.test('www.citizenscentral.co.za')).toBe(true);
      expect(host.test('citizenscentral.co.za')).toBe(true);
      expect(host.test('citizenscentralxco.za')).toBe(false);
      expect(host.test('evil.www.citizenscentral.co.za')).toBe(false);
      expect(host.test('www.citizenscentral.co.za.evil.example')).toBe(false);
      expect(host.test('219.co.za')).toBe(false);
    });

    it('redirects every other page path on the old hosts, keeping the path (Next keeps the query)', () => {
      expect(pathsOnOldHost).toMatchObject({
        destination: 'https://219.co.za/citizens/connect/:path',
        permanent: true,
        basePath: false,
      });
      expect(pathsOnOldHost?.has).toEqual(rootOnOldHost?.has);
      const matches = pathPattern(pathsOnOldHost?.source ?? '');
      for (const page of [
        'c/some-slug',
        'index.html',
        'dashboard',
        'dashboard/events',
        'e/123',
        'map',
        'auth/callback',
        'manifest.json',
      ]) {
        expect(matches.test(page), page).toBe(true);
      }
      // The API is rewritten, never redirected; _next and an already prefixed path are not old addresses.
      for (const page of [
        'api',
        'api/',
        'api/intake/google-form',
        'api/v1/events',
        '_next/static/x.js',
        '_next',
        'citizens',
        'citizens/connect',
        'citizens/connect/e/1',
        '',
      ]) {
        expect(matches.test(page), page).toBe(false);
      }
      // Look-alikes of the three excluded names are ordinary pages.
      for (const page of ['apiary', 'api-docs', '_nextish', 'citizens-news']) {
        expect(matches.test(page), page).toBe(true);
      }
    });

    it('sends the bare root of any other host to the prefix, temporarily', () => {
      expect(rootAnywhere).toEqual({
        source: '/',
        basePath: false,
        destination: '/citizens/connect',
        permanent: false,
      });
    });

    it('rewrites /api/* to the app’s own production route (a path-only destination is refused by Next)', () => {
      expect(rules.rewrites[0]).toEqual({
        source: '/api/:path*',
        basePath: false,
        destination: 'https://citizens-ecosystem-connect.vercel.app/citizens/connect/api/:path*',
      });
    });

    it('points the /api rewrite at HUB_ORIGIN_CONNECT when set', () => {
      const local = oldAddressRules('connect', '/citizens/connect', {
        HUB_ORIGIN_CONNECT: 'http://127.0.0.1:4010',
      });
      expect(local.rewrites[0]?.destination).toBe(
        'http://127.0.0.1:4010/citizens/connect/api/:path*',
      );
    });

    it('never redirects /api: no redirect rule can match it', () => {
      for (const rule of rules.redirects) {
        if (rule.source === '/') continue;
        expect(pathPattern(rule.source).test('api/intake/google-form')).toBe(false);
      }
    });
  });

  describe('Vision and Wear', () => {
    it.each(['vision', 'wear'] as const)(
      '%s: only the bare root redirect and the /api rewrite',
      (slug) => {
        const rules = oldAddressRules(slug, `/citizens/${slug}`, {});
        expect(rules.redirects).toEqual([
          { source: '/', basePath: false, destination: `/citizens/${slug}`, permanent: false },
        ]);
        expect(rules.rewrites).toEqual([
          {
            source: '/api/:path*',
            basePath: false,
            destination: `https://citizens-ecosystem-${slug}.vercel.app/citizens/${slug}/api/:path*`,
          },
        ]);
      },
    );
  });
});
