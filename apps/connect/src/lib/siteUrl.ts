import { basePathFromEnv } from "@citizens/ecosystem";
import { siteOrigin } from "@/lib/email/send";

/**
 * Where this app's pages live on the public site: "" (NEXT_PUBLIC_BASE_PATH unset, as today, the
 * site root) or exactly "/citizens/connect" (C39). The rule, and the error for a wrong value, is
 * @citizens/ecosystem's; next.config.ts has refused such a value at build time already.
 */
export function sitePrefix(): string {
  return basePathFromEnv("connect");
}

/**
 * An ORIGIN with the app's path prefix on it: the start of every absolute link to a page or an API
 * route of this app (`${withSitePrefix(origin)}/c/<slug>`). `NEXT_PUBLIC_SITE_URL` keeps meaning an
 * origin; the prefix is added here, never put in that variable. With no prefix this returns the
 * origin it was given.
 */
export function withSitePrefix(origin: string): string {
  return origin + sitePrefix();
}

/**
 * `siteOrigin(request)` plus the prefix: the base for the links we put in emails and API replies.
 * Use `siteOrigin` itself only where an ORIGIN is wanted (a Referer for an origin-restricted key,
 * a CORS check).
 */
export function siteBase(request?: Request): string {
  return withSitePrefix(siteOrigin(request));
}
