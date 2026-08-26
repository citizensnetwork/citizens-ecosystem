/**
 * Shared validation for any URL a Contributor supplies that the app later
 * renders as a real link (website, socials, logo/gallery images).
 *
 * A stored `javascript:` URL is stored XSS the moment something puts it in an
 * `href` or hands it to `window.open()` — and the Contributor profile page,
 * the Dashboard and (since the card redesign) every Kingdom Discovery card do
 * exactly that. Four write paths reach `profiles.website_url` /
 * `facebook_url` / `youtube_url` / `logo_url` and only one of them checked the
 * scheme, so the rule lives here now and every writer uses it.
 *
 * Two levels, because the inputs genuinely differ:
 *
 *  · `normalisePublicUrl` — STRICT. The value must already be an absolute
 *    http(s) URL. For fields whose client coerces before sending
 *    (`/api/contributor/profile`, whose callers all run their own `asUrl`).
 *
 *  · `coercePublicUrl` — the same guarantee, but a scheme-less value like
 *    `yourministry.org` is accepted and stored as `https://yourministry.org/`.
 *    That is literally the apply wizard's placeholder, so rejecting it would
 *    fail a legitimate application; silently mangling it would be worse.
 *    An explicit non-http(s) scheme is still rejected outright — someone
 *    typing `javascript:` is not making a typo we should "fix".
 *
 *  · `hasUnsafeScheme` — for values that are NOT URLs at all (social handles
 *    like `@ourchurch`, which the display layer turns into a platform URL).
 *    Nothing to normalise; just refuse an explicit dangerous scheme.
 */
export const MAX_PUBLIC_URL_LENGTH = 500;

// RFC 3986 scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"
// Bounded quantifier — the state space is capped by the bound, not by input
// length (same recipe as this app's other user-input regexes).
const EXPLICIT_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]{0,39}:/;

/** True when the value declares a scheme that is neither http nor https. */
export function hasUnsafeScheme(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const match = EXPLICIT_SCHEME_RE.exec(trimmed);
  if (!match) return false;
  const scheme = match[0].slice(0, -1).toLowerCase();
  return scheme !== "http" && scheme !== "https";
}

/** Absolute http(s) URL, normalised. Null for anything else. */
export function normalisePublicUrl(
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * As above, but a scheme-less value is treated as an https host+path.
 * Null for empty, over-long, unparseable, or explicitly non-http(s) values.
 */
export function coercePublicUrl(
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (hasUnsafeScheme(trimmed)) return null;
  const candidate = EXPLICIT_SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
  return normalisePublicUrl(candidate, maxLength + "https://".length);
}
