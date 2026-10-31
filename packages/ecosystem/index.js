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

/** The apps that exist in this repo. Slugs are public URL segments: never rename one casually. */
const APP_SLUGS = Object.freeze(['connect', 'vision', 'wear']);

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

module.exports = {
  APP_SLUGS,
  BASE_PATH_ENV,
  PATH_ROOT,
  appPath,
  basePathFromEnv,
  resolveBasePath,
};
