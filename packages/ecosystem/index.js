'use strict';
/**
 * @citizens/ecosystem — where each Citizens app lives on the shared domain.
 *
 * The ecosystem is served from ONE domain, one path per app:
 *
 *   https://<domain>/citizens/connect   https://<domain>/citizens/vision
 *   https://<domain>/citizens/wear      (learn, play, move ... follow)
 *
 * This file is the single place that knows those paths. Every app's
 * next.config and build-frontend script asks it for its own base path, so no
 * app carries a path string of its own and a wrong value fails the build.
 *
 * Plain CommonJS on purpose (like @citizens/frontend-build): next.config.js,
 * next.config.ts and `node scripts/build-frontend.js` all require it directly,
 * with no transpile step and no dependencies.
 *
 * ROLLOUT: an app serves from the site root until its Vercel project sets
 * NEXT_PUBLIC_BASE_PATH. Leave it unset until the app's frontend knows about
 * the prefix and the domain's front door is routing to it (see README.md).
 */

/** Path segment that groups every Citizens app: /citizens/<slug>. */
const PATH_ROOT = '/citizens';

/** The env var an app's Vercel project sets to move itself under PATH_ROOT. */
const BASE_PATH_ENV = 'NEXT_PUBLIC_BASE_PATH';

/**
 * The public address of the shared domain, no trailing slash. The front door (apps/hub) owns it; every app's
 * absolute links (share links, sitemap entries, redirects from an old address) are built from it.
 */
const SITE_ORIGIN = 'https://219.co.za';

/** The apps that exist in this repo. Slugs are public URL segments: never rename one casually. */
const APP_SLUGS = Object.freeze(['connect', 'vision', 'wear']);

/**
 * Apps that are planned but not built. Their /citizens/<slug> address is reserved for a "coming soon" page on the
 * front door, so a slug here must never also be in APP_SLUGS (the tests fail if it is). When an app is built, MOVE
 * its entry to APP_SLUGS: the front door then proxies to it instead of showing the page.
 *
 * `label` and `summary` are public copy (the front door's landing page and its coming-soon page show them). The
 * founder reviews any change to them.
 */
const COMING_SOON = Object.freeze([
  Object.freeze({
    slug: 'learn',
    label: 'Citizens Learn',
    summary: 'Discovery of Christian educational, equipping and training organisations.',
  }),
  Object.freeze({
    slug: 'play',
    label: 'Citizens Play',
    summary:
      'Storage, resources, tools, games and entertainment to break the ice and share memories at Christian gatherings of any size.',
  }),
  Object.freeze({
    slug: 'move',
    label: 'Citizens Move',
    summary:
      'Active events for individuals and families: community runs, hikes, prayer walks, archery, soccer, paddling, cycling and car runs.',
  }),
]);

/**
 * Hosts an app used to answer on before the shared domain. Printed QR codes (`.../c/<slug>`), the Google Apps Script
 * intake (`POST .../api/intake/google-form`) and bookmarks still point at them, so while the app is served under its
 * prefix it forwards what arrives there (see oldAddressRules).
 */
const OLD_HOSTS = Object.freeze({
  connect: Object.freeze(['citizenscentral.co.za', 'www.citizenscentral.co.za']),
});

/** The path an app is served from on the shared domain, e.g. "/citizens/connect". */
function appPath(slug) {
  if (!APP_SLUGS.includes(slug)) {
    throw new Error(
      `[ecosystem] unknown app ${JSON.stringify(slug)}; known apps: ${APP_SLUGS.join(', ')}`,
    );
  }
  return `${PATH_ROOT}/${slug}`;
}

/**
 * Turn the raw NEXT_PUBLIC_BASE_PATH value into the base path an app builds
 * with: '' (serve from the site root) or exactly appPath(slug).
 *
 * Unset, blank and "/" all mean the site root. A single trailing slash is
 * forgiven (it is easy to type in a dashboard). Anything else, including the
 * path of a DIFFERENT app, throws, because pointing one project at another
 * app's prefix would silently break both.
 */
function resolveBasePath(slug, raw) {
  const expected = appPath(slug);
  if (raw === undefined || raw === null) return '';
  const value = String(raw).trim();
  if (value === '' || value === '/') return '';
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  if (normalized !== expected) {
    throw new Error(
      `[ecosystem] ${BASE_PATH_ENV}=${JSON.stringify(value)} is not valid for "${slug}": ` +
        `leave it unset to serve from the site root, or set it to exactly "${expected}".`,
    );
  }
  return expected;
}

/** resolveBasePath for the running process (or the `env` you pass). */
function basePathFromEnv(slug, env = process.env) {
  return resolveBasePath(slug, env[BASE_PATH_ENV]);
}

/**
 * Where each app's own Vercel project answers: its stable production address. The front door proxies
 * /citizens/<slug> here, and an app reaches itself here (see oldAddressRules). HUB_ORIGIN_<SLUG> overrides one, which
 * is how a local test points at a fake upstream.
 */
const PRODUCTION_ORIGINS = Object.freeze({
  connect: 'https://citizens-ecosystem-connect.vercel.app',
  vision: 'https://citizens-ecosystem-vision.vercel.app',
  wear: 'https://citizens-ecosystem-wear.vercel.app',
});

/** The env var that overrides appOrigin(slug), e.g. HUB_ORIGIN_CONNECT. */
function originEnvName(slug) {
  appPath(slug);
  return `HUB_ORIGIN_${slug.toUpperCase()}`;
}

/** A bare origin ("https://host[:port]") or a clear error: no path, query, credentials or other scheme. */
function parseOrigin(name, raw) {
  const value = String(raw).trim();
  const bad = () =>
    new Error(
      `[ecosystem] ${name}=${JSON.stringify(value)} is not valid: use a bare origin such as ` +
        `"https://example.vercel.app" (https only; http only for localhost), with no path, query or login.`,
    );
  let url;
  try {
    url = new URL(value);
  } catch {
    throw bad();
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const schemeOk = url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
  const bare =
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '';
  if (!schemeOk || !bare) throw bad();
  return url.origin;
}

/**
 * The origin the app's own project answers on: HUB_ORIGIN_<SLUG> when set (blank counts as unset; one trailing slash
 * is forgiven), otherwise the production address. Throws on anything that is not a bare origin.
 */
function appOrigin(slug, env = process.env) {
  const name = originEnvName(slug);
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '')
    return PRODUCTION_ORIGINS[slug];
  return parseOrigin(name, raw);
}

/**
 * Host names as the regular expression Next matches a `host` condition's value against. A host name holds only
 * letters, digits, "-" and ".", so escaping the dots is all it takes (a backslash is escaped too, as a rule, though
 * the check below already refuses one).
 */
function hostPattern(hosts) {
  const escaped = hosts.map((host) => {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host)) {
      throw new Error(`[ecosystem] not a plain host name: ${JSON.stringify(host)}`);
    }
    return host.replace(/[\\.]/g, '\\$&');
  });
  return escaped.length === 1 ? escaped[0] : `(?:${escaped.join('|')})`;
}

/**
 * The redirects and rewrites an app adds to its next.config while it is served under its prefix, so the addresses
 * that existed before the shared domain keep working. `[]` for both when the app is at the site root (basePath ''),
 * which leaves today's behaviour untouched.
 *
 * Every rule sets `basePath: false`: without it Next prefixes the rule, and the whole point is to match the
 * address WITHOUT the prefix.
 *
 *   redirects (first match wins):
 *   - An app with an old host (Connect on citizenscentral.co.za): every page path there, `/` included, is
 *     redirected permanently to the same path on the shared domain, query kept. `/api`, `/_next` and an already
 *     prefixed `/citizens/...` path are NOT matched: `/api` is rewritten below, never redirected, because the
 *     Apps Script intake POSTs to it and a redirect can turn a POST into a GET.
 *   - Any host: the bare `/` goes to the app's prefix on the same host (temporary, so the root stays free).
 *
 *   rewrites:
 *   - Any host: `/api/*` is served by the prefixed route (path, method, body, query and headers unchanged).
 *     Installed phone builds, server-to-server callers and the Apps Script intake use the unprefixed address.
 *     The destination is the app's OWN production address, not a path: Next refuses a `basePath: false`
 *     rewrite to an internal path ("rewrites urls outside of the basePath"), so the request makes one extra hop
 *     into the same project. That is also why a CORS preflight works: the second hop is an ordinary prefixed
 *     request and runs the app's middleware.
 */
function oldAddressRules(slug, basePath, env = process.env) {
  const prefix = resolveBasePath(slug, basePath);
  if (prefix === '') return { redirects: [], rewrites: [] };

  const redirects = [];
  const oldHosts = OLD_HOSTS[slug];
  if (oldHosts) {
    const has = [{ type: 'host', value: hostPattern(oldHosts) }];
    redirects.push(
      {
        source: '/',
        has,
        basePath: false,
        destination: `${SITE_ORIGIN}${prefix}`,
        permanent: true,
      },
      {
        source: '/:path((?!api(?:/|$)|_next(?:/|$)|citizens(?:/|$)).+)',
        has,
        basePath: false,
        destination: `${SITE_ORIGIN}${prefix}/:path`,
        permanent: true,
      },
    );
  }
  redirects.push({ source: '/', basePath: false, destination: prefix, permanent: false });

  return {
    redirects,
    rewrites: [
      {
        source: '/api/:path*',
        basePath: false,
        destination: `${appOrigin(slug, env)}${prefix}/api/:path*`,
      },
    ],
  };
}

module.exports = {
  APP_SLUGS,
  BASE_PATH_ENV,
  COMING_SOON,
  OLD_HOSTS,
  PATH_ROOT,
  PRODUCTION_ORIGINS,
  SITE_ORIGIN,
  appOrigin,
  appPath,
  basePathFromEnv,
  oldAddressRules,
  originEnvName,
  resolveBasePath,
};
