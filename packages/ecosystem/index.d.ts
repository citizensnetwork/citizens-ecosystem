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

/** The public address of the shared domain, no trailing slash. The front door (apps/hub) owns it. */
export declare const SITE_ORIGIN: 'https://219.co.za';

/** A planned app whose /citizens/<slug> address is reserved for a "coming soon" page. */
export interface ComingSoonApp {
  readonly slug: string;
  /** Public name, e.g. "Citizens Learn". */
  readonly label: string;
  /** One public line saying what the app will be. */
  readonly summary: string;
}

/** Apps planned but not built. A slug here is never also in APP_SLUGS. */
export declare const COMING_SOON: readonly ComingSoonApp[];

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

/** Hosts an app used to answer on before the shared domain (Connect: the citizenscentral.co.za names). */
export declare const OLD_HOSTS: Readonly<Partial<Record<AppSlug, readonly string[]>>>;

/** Each built app's own production address (its stable Vercel alias), no trailing slash. */
export declare const PRODUCTION_ORIGINS: Readonly<Record<AppSlug, string>>;

/** The env var that overrides appOrigin(slug): `HUB_ORIGIN_CONNECT`, `HUB_ORIGIN_VISION`, `HUB_ORIGIN_WEAR`. */
export declare function originEnvName(slug: AppSlug): string;

/**
 * The origin the app's own project answers on: HUB_ORIGIN_<SLUG> when set (blank is unset; one trailing slash is
 * forgiven), otherwise its production address. Throws on anything but a bare origin (https, or http for localhost).
 */
export declare function appOrigin(slug: AppSlug, env?: Record<string, string | undefined>): string;

/** A redirect in the shape Next's `redirects()` takes. */
export interface OldAddressRedirect {
  source: string;
  destination: string;
  basePath: false;
  permanent: boolean;
  has?: { type: 'host'; value: string }[];
}

/** A rewrite in the shape Next's `rewrites()` takes. */
export interface OldAddressRewrite {
  source: string;
  destination: string;
  basePath: false;
}

/**
 * The redirects and rewrites an app adds to its next.config while it is served under its prefix, so the addresses
 * from before the shared domain keep working. Both lists are empty when `basePath` is '' (the site root).
 */
export declare function oldAddressRules(
  slug: AppSlug,
  basePath: string,
  env?: Record<string, string | undefined>,
): { redirects: OldAddressRedirect[]; rewrites: OldAddressRewrite[] };
