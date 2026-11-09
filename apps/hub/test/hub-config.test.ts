import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_SLUGS, COMING_SOON, PRODUCTION_ORIGINS, SITE_ORIGIN } from '@citizens/ecosystem';
import {
  CONNECT_ROOT_PAGES,
  HUB_PAGES,
  contentSecurityPolicy,
  hubHeaders,
  hubRedirects,
  ownPagesSource,
  proxyRewrites,
  robotsTxt,
  securityHeaders,
  sitemapXml,
} from '../config/hub-config';

const requireCjs = createRequire(import.meta.url);
// The very compiler Next uses for a header, redirect or rewrite `source`.
const { pathToRegexp } = requireCjs('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => { regexp?: RegExp } | RegExp;
};
const toRegExp = (source: string): RegExp => {
  const compiled = pathToRegexp(source);
  return compiled instanceof RegExp ? compiled : (compiled.regexp as RegExp);
};

const publicFile = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../public/${name}`, import.meta.url)), 'utf8');

describe('proxyRewrites', () => {
  it('is one pair of rules per BUILT app, in registry order, and nothing for a coming-soon app', () => {
    const rules = proxyRewrites({});
    expect(rules.map((r) => r.source)).toEqual(
      APP_SLUGS.flatMap((slug) => [`/citizens/${slug}`, `/citizens/${slug}/:path*`]),
    );
    for (const app of COMING_SOON) {
      expect(
        rules.some((r) => r.source.startsWith(`/citizens/${app.slug}`)),
        app.slug,
      ).toBe(false);
    }
  });

  it('keeps the path whole: the app is built with the matching basePath, so nothing is added or removed', () => {
    expect(proxyRewrites({})).toEqual([
      {
        source: '/citizens/connect',
        destination: 'https://citizens-ecosystem-connect.vercel.app/citizens/connect',
      },
      {
        source: '/citizens/connect/:path*',
        destination: 'https://citizens-ecosystem-connect.vercel.app/citizens/connect/:path*',
      },
      {
        source: '/citizens/vision',
        destination: 'https://citizens-ecosystem-vision.vercel.app/citizens/vision',
      },
      {
        source: '/citizens/vision/:path*',
        destination: 'https://citizens-ecosystem-vision.vercel.app/citizens/vision/:path*',
      },
      {
        source: '/citizens/wear',
        destination: 'https://citizens-ecosystem-wear.vercel.app/citizens/wear',
      },
      {
        source: '/citizens/wear/:path*',
        destination: 'https://citizens-ecosystem-wear.vercel.app/citizens/wear/:path*',
      },
    ]);
    for (const rule of proxyRewrites({})) {
      expect(rule.destination.endsWith(rule.source), rule.source).toBe(true);
    }
  });

  it('takes each origin from HUB_ORIGIN_<APP>, falling back to the production address', () => {
    const rules = proxyRewrites({
      HUB_ORIGIN_CONNECT: 'http://127.0.0.1:4001',
      HUB_ORIGIN_VISION: '  https://vision-preview.vercel.app/ ',
    });
    expect(rules[0]?.destination).toBe('http://127.0.0.1:4001/citizens/connect');
    expect(rules[2]?.destination).toBe('https://vision-preview.vercel.app/citizens/vision');
    expect(rules[4]?.destination).toBe(`${PRODUCTION_ORIGINS.wear}/citizens/wear`);
  });

  it('refuses an origin that is not a bare origin, so a typo cannot silently proxy somewhere odd', () => {
    expect(() =>
      proxyRewrites({ HUB_ORIGIN_WEAR: 'https://example.vercel.app/citizens/wear' }),
    ).toThrow(/HUB_ORIGIN_WEAR=.* is not valid/);
    expect(() => proxyRewrites({ HUB_ORIGIN_VISION: 'http://example.vercel.app' })).toThrow(
      /HUB_ORIGIN_VISION=.* is not valid/,
    );
  });

  it('matches the bare prefix, a deep path and nothing that merely starts with the same letters', () => {
    const rule = proxyRewrites({}).find((r) => r.source === '/citizens/connect/:path*');
    const re = toRegExp(rule?.source ?? '');
    for (const path of [
      '/citizens/connect',
      '/citizens/connect/',
      '/citizens/connect/e/1',
      '/citizens/connect/api/v1/x',
    ]) {
      expect(re.test(path), path).toBe(true);
    }
    for (const path of ['/citizens/connectx', '/citizens/learn', '/citizens', '/connect']) {
      expect(re.test(path), path).toBe(false);
    }
  });
});

describe('hubRedirects', () => {
  const rules = hubRedirects();
  // The first rule whose compiled source matches, as Next applies them (first match wins).
  const firstMatch = (path: string) => rules.find((rule) => toRegExp(rule.source).test(path));

  it('leaves / to the 219 homepage (it used to redirect, and the root is that page now)', () => {
    expect(firstMatch('/')).toBeUndefined();
  });

  it('forwards Connect’s old root addresses (2026-11-01 to 11-03) to the same screen under its prefix, permanently', () => {
    for (const path of [
      '/c/a-church',
      '/e/42',
      '/p/7',
      '/dashboard',
      '/dashboard/saved',
      '/discover',
      '/upgrade/t0k/decline',
      '/index.html',
    ]) {
      const rule = firstMatch(path);
      expect(rule, path).toBeDefined();
      expect(rule?.statusCode, path).toBe(308);
      expect(rule?.destination.startsWith('/citizens/connect/'), path).toBe(true);
    }
  });

  it('leaves the hub’s own addresses, the apps’ prefixes, /api and near-misses alone', () => {
    const own = [
      '/',
      '/citizens',
      '/citizens/connect',
      '/citizens/c/x',
      '/_next/static/x.css',
      '/favicon.ico',
      '/icon.svg',
      '/robots.txt',
      '/sitemap.xml',
      '/citizens-crown.png',
      '/api/intake/google-form',
      '/cx',
      '/discovery',
      '/index.htm',
      '/index.html/x',
    ];
    for (const path of own) expect(firstMatch(path), path).toBeUndefined();
  });

  it('forwards exactly the pages in Connect’s route table (apps/connect/next.config.ts), so none lands on a 404', () => {
    const config = readFileSync(
      fileURLToPath(new URL('../../connect/next.config.ts', import.meta.url)),
      'utf8',
    );
    const appPages = config.match(/const APP_PAGES = \[([\s\S]*?)\]/)?.[1] ?? '';
    const segments = new Set<string>([
      ...[...appPages.matchAll(/"([a-z-]+)"/g)].map((m) => m[1] as string),
      ...[...config.matchAll(/toApp\("\/([a-z-]+)\/:/g)].map((m) => m[1] as string),
    ]);
    expect(segments.size, 'the route table could not be read').toBeGreaterThan(10);
    expect([...CONNECT_ROOT_PAGES].sort()).toEqual([...segments].sort());
  });

  it('gives a bare page and a longer path each an exact destination: one hop, no trailing slash', () => {
    // An empty `:rest*` in a destination becomes a trailing slash on Vercel (/citizens/connect/discover/), and Connect
    // then redirects a second time. A destination may only use required parameters.
    for (const rule of rules) expect(rule.destination, rule.source).not.toMatch(/:[a-z]+[*?]/);
    expect(firstMatch('/discover')?.destination).toBe('/citizens/connect/:page');
    expect(firstMatch('/dashboard/saved')?.destination).toBe('/citizens/connect/:page/:rest+');
  });

  it('never forwards a path the hub serves itself', () => {
    const publicFiles = [
      'favicon.ico',
      'icon.svg',
      'robots.txt',
      'sitemap.xml',
      'citizens-crown.png',
    ];
    for (const page of CONNECT_ROOT_PAGES) {
      expect(['citizens', '_next', 'api', ...publicFiles], page).not.toContain(page);
      expect(page, page).toMatch(/^[a-z]+$/);
    }
  });
});

describe('security headers', () => {
  it('sends the strict policy: no inline script or style, no eval, no framing, no base tag', () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    const directive = (name: string) =>
      csp
        .split('; ')
        .find((d) => d.startsWith(`${name} `))
        ?.split(' ')
        .slice(1);
    expect(directive('default-src')).toEqual(["'self'"]);
    expect(directive('script-src')).toEqual(["'self'"]);
    expect(directive('style-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'none'"]);
    expect(directive('form-action')).toEqual(["'none'"]);
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(directive('connect-src')).toEqual(["'self'", 'https://api.open-meteo.com']);
  });

  it('relaxes only what `next dev` needs, and only in development', () => {
    const dev = contentSecurityPolicy(true);
    expect(dev).toContain("script-src 'self' 'unsafe-eval'");
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
    expect(contentSecurityPolicy()).toBe(contentSecurityPolicy(false));
  });

  it('lists every header once', () => {
    const keys = securityHeaders().map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]);
  });
});

describe('hubHeaders', () => {
  const rules = hubHeaders(false);
  const all = rules[0]!;

  it('puts the security headers on a rule that excludes every built app’s paths', () => {
    expect(all.source).toBe(ownPagesSource());
    expect(all.headers).toEqual(securityHeaders(false));
  });

  it('matches the hub’s own paths (and its 404s) but NEVER a proxied path, the bare prefix included', () => {
    const re = toRegExp(all.source);
    for (const path of [
      '/',
      '/citizens',
      '/citizens/ecosystem',
      '/citizens/how-it-works',
      '/citizens/philosophy',
      '/citizens/get-involved',
      '/citizens/learn',
      '/citizens/play',
      '/citizens/move',
      '/citizens/impact',
      '/citizens/unknown',
      '/citizens/learn/extra',
      '/robots.txt',
      '/sitemap.xml',
      '/favicon.ico',
      '/_next/static/chunks/x.css',
      '/citizens/connectx',
      '/citizens/wearable',
    ]) {
      expect(re.test(path), path).toBe(true);
    }
    for (const slug of APP_SLUGS) {
      for (const path of [
        `/citizens/${slug}`,
        `/citizens/${slug}/`,
        `/citizens/${slug}/index.html`,
        `/citizens/${slug}/api/v1/events`,
        `/citizens/${slug}/_next/static/x.js`,
      ]) {
        expect(re.test(path), path).toBe(false);
      }
    }
  });

  it('excludes a newly built app the moment the registry lists it (the source is generated, not typed)', () => {
    for (const slug of APP_SLUGS) expect(all.source).toContain(slug);
    for (const app of COMING_SOON) expect(all.source).not.toContain(app.slug);
  });

  it('marks each coming-soon page noindex by header too, and only those', () => {
    const noindex = rules.slice(1);
    expect(noindex.map((r) => r.source)).toEqual(COMING_SOON.map((a) => `/citizens/${a.slug}`));
    for (const rule of noindex) {
      expect(rule.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }]);
    }
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('the committed files are what the registry generates', () => {
    expect(publicFile('robots.txt')).toBe(robotsTxt());
    expect(publicFile('sitemap.xml')).toBe(sitemapXml());
  });

  it('robots.txt allows crawling, keeps crawlers out of every app’s API, and names the sitemap', () => {
    const lines = robotsTxt().split('\n');
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    for (const slug of APP_SLUGS) expect(lines).toContain(`Disallow: /citizens/${slug}/api/`);
    expect(lines).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it('the sitemap lists the hub’s own indexable pages only (no app, no noindex page)', () => {
    expect([...HUB_PAGES]).toEqual([
      '/',
      '/citizens',
      '/citizens/ecosystem',
      '/citizens/how-it-works',
      '/citizens/philosophy',
      '/citizens/get-involved',
      '/citizens/settings',
    ]);
    const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([...HUB_PAGES].map((page) => `${SITE_ORIGIN}${page}`));
  });

  it('no hub page shares its slug with an app, built or coming soon (a page would hide the app, or the app the page)', () => {
    const taken = new Set<string>([...APP_SLUGS, ...COMING_SOON.map((app) => app.slug)]);
    for (const page of HUB_PAGES) {
      const slug = page.split('/').pop() as string;
      if (page === '/citizens') continue;
      expect(taken.has(slug), `${page} collides with an app slug`).toBe(false);
    }
  });
});
