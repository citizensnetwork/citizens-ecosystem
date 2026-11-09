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

/**
 * The pages the front door itself serves and lists in its sitemap: the 219 homepage, Central, its four content
 * pages and Settings (src/lib/content.ts `PAGES` names the same paths after `/`; a test compares them).
 * Coming-soon pages are noindex, so not here. None of these may share a slug with an app (built or coming soon):
 * a test checks that too.
 */
const HUB_PAGES = Object.freeze([
  '/',
  PATH_ROOT,
  `${PATH_ROOT}/ecosystem`,
  `${PATH_ROOT}/how-it-works`,
  `${PATH_ROOT}/philosophy`,
  `${PATH_ROOT}/get-involved`,
  `${PATH_ROOT}/settings`,
]);

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

/**
 * The first path segment of every Connect page, as Connect's own route table has it (apps/connect/next.config.ts:
 * APP_PAGES plus the `/<segment>/:param` screens). From 2026-11-01 to 2026-11-03 `219.co.za` served Connect at the
 * domain ROOT, so links such as `https://219.co.za/c/<slug>` or `/e/<id>` were copied and shared then. Since the
 * domain moved to the front door they would be a 404 here; instead each one is forwarded to the same screen under
 * Connect's prefix. A test keeps this list equal to Connect's route table, so a new Connect page forwards too.
 * None of these may be a path the hub serves itself (`citizens`, `_next`, a public/ file): a test checks that.
 */
const CONNECT_ROOT_PAGES = Object.freeze([
  'map',
  'discover',
  'explore',
  'lets',
  'community',
  'me',
  'messages',
  'notifications',
  'settings',
  'apply',
  'onboarding',
  'dashboard',
  'admin',
  'e',
  'p',
  'c',
  'upgrade',
]);

/**
 * `/` is the 219 homepage (this app). It used to be a 302 to `/citizens` so the root stayed free; that page is it.
 *
 * Connect's old root addresses (see CONNECT_ROOT_PAGES) are 308s to the same path under `/citizens/connect`; Next keeps
 * the query string (`/index.html?c=<slug>` is the oldest QR form). Permanent, because those screens live under the
 * prefix for good. `/api/*` is NOT forwarded: nothing called 219.co.za's root API (the Apps Script, the phone builds
 * and Vision/Wear use other addresses), and a redirect can turn a POST into a GET.
 *
 * Two rules, not one `/:page/:rest*`: with an empty `:rest*` Vercel writes the destination with a trailing slash
 * (`/citizens/connect/discover/`, seen live on 2026-11-05; `next start` does not), and Connect then redirects again
 * to drop it. A bare page and a page with more path each get their own exact destination: one hop.
 */
function hubRedirects() {
  const connect = `${PATH_ROOT}/connect`;
  const page = `/:page(${CONNECT_ROOT_PAGES.join('|')})`;
  return [
    { source: page, destination: `${connect}/:page`, statusCode: 308 },
    { source: `${page}/:rest+`, destination: `${connect}/:page/:rest+`, statusCode: 308 },
    { source: '/index.html', destination: `${connect}/index.html`, statusCode: 308 },
  ];
}

/**
 * Strict policy for the front door's own pages. Scripts and styles are same-origin files (no inline). Central
 * fetches the weather from Open-Meteo in the browser when the feed opens, so that host is the one extra connect
 * source. Development adds what `next dev` needs (React Refresh, injected styles).
 */
function contentSecurityPolicy(isDev = false) {
  return [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.open-meteo.com",
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
};
