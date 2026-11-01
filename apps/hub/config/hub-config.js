'use strict';
/**
 * Everything the front door generates from the @citizens/ecosystem registry: the proxy rewrites, the header rules,
 * the "/" redirect, robots.txt and sitemap.xml. next.config.js and the tests both load this file, so what the tests
 * prove is what Next is given.
 *
 * Plain CommonJS (with a .d.ts) because next.config.js is CommonJS and cannot import TypeScript.
 */
const {
  APP_SLUGS,
  COMING_SOON,
  PATH_ROOT,
  SITE_ORIGIN,
  appOrigin,
} = require('@citizens/ecosystem');

/** The pages the front door itself serves and lists in its sitemap. Coming-soon pages are noindex, so not here. */
const HUB_PAGES = Object.freeze([PATH_ROOT]);

/**
 * One external rewrite pair per BUILT app: /citizens/<slug> and /citizens/<slug>/:path* go to the same path on the
 * app's own project (HUB_ORIGIN_<SLUG>, default its production address). The path is kept whole because each app is
 * built with the matching basePath, so no prefix is added or removed. Method, body, query and headers pass through.
 */
function proxyRewrites(env = process.env) {
  const rules = [];
  for (const slug of APP_SLUGS) {
    const origin = appOrigin(slug, env);
    const base = `${PATH_ROOT}/${slug}`;
    rules.push(
      { source: base, destination: `${origin}${base}` },
      { source: `${base}/:path*`, destination: `${origin}${base}/:path*` },
    );
  }
  return rules;
}

/** `/` is a 302, not a permanent redirect, so the root stays free to become something else. */
function hubRedirects() {
  return [{ source: '/', destination: PATH_ROOT, statusCode: 302 }];
}

/**
 * Strict policy for the front door's own pages. They are static HTML with one external stylesheet and no script at
 * all, so nothing inline is allowed. Development adds what `next dev` needs (React Refresh, injected styles).
 */
function contentSecurityPolicy(isDev = false) {
  return [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(isDev = false) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(isDev) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  ];
}

/**
 * The header rule's source: every path EXCEPT the built apps' own (/citizens/<slug> and below). Those are proxied, the
 * upstream app sends its own CSP, and a second policy from here would be added to its response or replace it.
 * Built from the registry, so a new app is excluded the moment it is listed.
 */
function ownPagesSource() {
  // Slugs are plain [a-z0-9-] (the registry's tests enforce it), so they are safe inside a regular expression.
  const apps = APP_SLUGS.join('|');
  return `/:path((?!${PATH_ROOT.slice(1)}/(?:${apps})(?:/|$)).*)`;
}

/**
 * Security headers on the front door's own pages (and its 404), none on the proxied paths. The coming-soon pages also
 * carry X-Robots-Tag, as well as the robots meta tag in the page itself.
 */
function hubHeaders(isDev = false) {
  return [
    { source: ownPagesSource(), headers: securityHeaders(isDev) },
    ...COMING_SOON.map((app) => ({
      source: `${PATH_ROOT}/${app.slug}`,
      headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
    })),
  ];
}

/** robots.txt: everything may be crawled except the apps' API routes. */
function robotsTxt() {
  return (
    [
      'User-agent: *',
      'Allow: /',
      ...APP_SLUGS.map((slug) => `Disallow: ${PATH_ROOT}/${slug}/api/`),
      '',
      `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    ].join('\n') + '\n'
  );
}

/** sitemap.xml: the front door's own indexable pages only. */
function sitemapXml() {
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...HUB_PAGES.map((page) => `  <url><loc>${SITE_ORIGIN}${page}</loc></url>`),
      '</urlset>',
    ].join('\n') + '\n'
  );
}

module.exports = {
  HUB_PAGES,
  contentSecurityPolicy,
  hubHeaders,
  hubRedirects,
  ownPagesSource,
  proxyRewrites,
  robotsTxt,
  securityHeaders,
  sitemapXml,
};
