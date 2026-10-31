/**
 * Type declarations for @citizens/ecosystem (the implementation is plain
 * CommonJS in index.js so next.config.js / next.config.ts and
 * `node scripts/build-frontend.js` can require it directly).
 */

/** Path segment that groups every Citizens app: /citizens/<slug>. */
export declare const PATH_ROOT: '/citizens';

/** The env var an app's Vercel project sets to move itself under PATH_ROOT. */
export declare const BASE_PATH_ENV: 'NEXT_PUBLIC_BASE_PATH';

/** The apps that exist in this repo (their slugs are public URL segments). */
export declare const APP_SLUGS: readonly ['connect', 'vision', 'wear'];

export type AppSlug = (typeof APP_SLUGS)[number];

/** The path an app is served from on the shared domain, e.g. "/citizens/connect". Throws on an unknown slug. */
export declare function appPath(slug: AppSlug): string;

/**
 * The base path an app builds with from the raw NEXT_PUBLIC_BASE_PATH value:
 * '' (serve from the site root) or exactly appPath(slug). Unset, blank and "/"
 * mean the site root; one trailing slash is forgiven; anything else throws.
 */
export declare function resolveBasePath(slug: AppSlug, raw: string | null | undefined): string;

/** resolveBasePath for the running process (or the `env` you pass). */
export declare function basePathFromEnv(
  slug: AppSlug,
  env?: Record<string, string | undefined>,
): string;
