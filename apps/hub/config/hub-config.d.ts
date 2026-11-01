/** Type declarations for hub-config.js (plain CommonJS so next.config.js can require it). */

export interface HubRewrite {
  source: string;
  destination: string;
}

export interface HubRedirect {
  source: string;
  destination: string;
  statusCode: number;
}

export interface HubHeader {
  key: string;
  value: string;
}

export interface HubHeaderRule {
  source: string;
  headers: HubHeader[];
}

/** The pages the front door serves and lists in its sitemap. */
export declare const HUB_PAGES: readonly string[];

/** `/citizens/<slug>` and `/citizens/<slug>/:path*` to the app's project, for every built app. */
export declare function proxyRewrites(env?: Record<string, string | undefined>): HubRewrite[];

/** `/` as a 302 to `/citizens`. */
export declare function hubRedirects(): HubRedirect[];

/** The front door's own Content-Security-Policy (no inline script or style). */
export declare function contentSecurityPolicy(isDev?: boolean): string;

/** The security headers sent on the front door's own pages. */
export declare function securityHeaders(isDev?: boolean): HubHeader[];

/** The header rule's source pattern: every path except the built apps' own. */
export declare function ownPagesSource(): string;

/** Security headers on the front door's own pages only, plus X-Robots-Tag on the coming-soon pages. */
export declare function hubHeaders(isDev?: boolean): HubHeaderRule[];

/** The text of public/robots.txt. */
export declare function robotsTxt(): string;

/** The text of public/sitemap.xml. */
export declare function sitemapXml(): string;
