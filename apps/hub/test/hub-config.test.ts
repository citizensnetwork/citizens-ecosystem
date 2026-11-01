import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_SLUGS, COMING_SOON, PRODUCTION_ORIGINS, SITE_ORIGIN } from '@citizens/ecosystem';
import {
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
  it('sends / to /citizens as a 302 (not permanent, so the root stays free)', () => {
    expect(hubRedirects()).toEqual([{ source: '/', destination: '/citizens', statusCode: 302 }]);
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
    expect(directive('connect-src')).toEqual(["'self'"]);
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
      '/citizens/learn',
      '/citizens/play',
      '/citizens/move',
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
    expect([...HUB_PAGES]).toEqual(['/citizens']);
    const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${SITE_ORIGIN}/citizens`]);
  });
});
