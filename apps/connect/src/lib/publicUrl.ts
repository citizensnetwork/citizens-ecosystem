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

/**
 * A social field's value, which may legitimately be EITHER a URL or a bare
 * handle — and until now was not.
 *
 * Half the social columns are URL-shaped (`facebook_url`, `youtube_url`,
 * `linkedin_url`) and half are handle-shaped (`instagram_handle`,
 * `tiktok_handle`, `x_handle`), but a person filling in a form does not know
 * or care which. Typing `@ourchurch` into the Facebook box used to fail
 * `normalisePublicUrl`, and because the profile route rejects on the FIRST bad
 * field, that one keystroke took the WHOLE profile save down with it — which
 * is why a real contributor ended up with one social handle stored out of the
 * several they filled in.
 *
 * The rule, for every platform and every column:
 *   · empty            → null (an explicit clear)
 *   · dangerous scheme → rejected, always ("javascript:" is not a typo)
 *   · URL-shaped       → coerced + validated exactly as before
 *   · one token        → kept verbatim as a handle
 *   · contains spaces  → rejected: a display name ("Grace Radio"), not a
 *                        handle — see `checkSocialValue`
 *
 * A stored handle is never rendered raw: the client turns it into a platform
 * URL through `window.DATA.SOCIAL_PLATFORMS[].urlFor()`, and every render site
 * still passes the result through `UI.safeUrl()`. So "keep it verbatim" adds
 * no XSS surface — it just stops a handle being mistaken for a broken link.
 *
 * Returns `undefined` — and ONLY then — when the caller should reject the
 * request. An absent field (`undefined` in, because the client simply did not
 * send that platform) is not a rejection: it reads as "no value", i.e. `null`.
 */
export function normaliseSocialValue(
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): string | null | undefined {
  const check = checkSocialValue(value, maxLength);
  return check.ok ? check.value : undefined;
}

/**
 * Why a social value was refused. `invalid` is never recoverable (a dangerous
 * scheme, a non-string, over the length bound). `not_a_link` and `not_a_number`
 * are "this isn't what the box asks for" — a display name typed into a link
 * box, a phone number we can't use — which a caller with nobody to ask (the
 * Google Form intake) may drop and report instead of failing the whole listing.
 */
export type SocialCheck =
  | { ok: true; value: string | null }
  | { ok: false; reason: "invalid" | "not_a_link" | "not_a_number" };

const INVALID: SocialCheck = { ok: false, reason: "invalid" };

/** True for a value with a scheme or a dotted host before any path ("facebook.com/us"). */
function looksLikeUrl(trimmed: string): boolean {
  const beforePath = trimmed.split(/[/?#]/, 1)[0];
  return EXPLICIT_SCHEME_RE.test(trimmed) || /^[^\s@]+\.[a-z]{2,}$/i.test(beforePath);
}

/**
 * `normaliseSocialValue` with the reason a value was refused. A bare handle is
 * ONE token — no platform allows a space in one — so "Grace Radio" typed into
 * a Facebook box is a display name, not a handle, and storing it only ever
 * produced a dead link (the first real Form submission did exactly that).
 */
export function checkSocialValue(
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): SocialCheck {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return INVALID;
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) return INVALID;
  if (hasUnsafeScheme(trimmed)) return INVALID;
  if (!looksLikeUrl(trimmed)) {
    return /\s/.test(trimmed) ? { ok: false, reason: "not_a_link" } : { ok: true, value: trimmed };
  }
  const coerced = coercePublicUrl(trimmed, maxLength);
  return coerced === null ? INVALID : { ok: true, value: coerced };
}

/**
 * A WhatsApp number as international digits without the "+" (`27712345678`,
 * what wa.me wants), or null when it can't be read as one.
 *
 * Accepts the shapes people actually type: local South African
 * (`071 234 5678`, `0712345678`), country-coded (`27 71 234 5678`,
 * `+27 (0)71 234 5678`, `0027…`) and any other explicitly international
 * number (`+44 7911 123456`). A local number that isn't a 10-digit
 * 0-prefixed South African one is ambiguous (whose country?) and is refused.
 */
export function normaliseWhatsappNumber(raw: string): string | null {
  const text = raw.trim();
  // Bounded class + length: nothing here can backtrack.
  if (!/^\+?[\d\s().-]{6,40}$/.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  let international = text.startsWith("+");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  // "+27 (0)71…" keeps South Africa's trunk 0 after the country code.
  if (/^270\d{9}$/.test(digits)) digits = "27" + digits.slice(3);
  if (international) return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
  if (/^0\d{9}$/.test(digits)) return "27" + digits.slice(1);
  if (/^27\d{9}$/.test(digits)) return digits;
  return null;
}

/** A WhatsApp box takes a number or a wa.me / chat.whatsapp.com link. */
export function checkWhatsappValue(
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): SocialCheck {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return INVALID;
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) return INVALID;
  if (hasUnsafeScheme(trimmed)) return INVALID;
  if (looksLikeUrl(trimmed)) {
    const coerced = coercePublicUrl(trimmed, maxLength);
    return coerced === null ? INVALID : { ok: true, value: coerced };
  }
  const number = normaliseWhatsappNumber(trimmed);
  return number === null ? { ok: false, reason: "not_a_number" } : { ok: true, value: number };
}

/** The hosts each `profiles` social column's links may legitimately point at. */
const SOCIAL_HOSTS: Readonly<Record<string, readonly string[]>> = {
  instagram_handle: ["instagram.com", "instagr.am"],
  facebook_url: ["facebook.com", "fb.com", "fb.me"],
  tiktok_handle: ["tiktok.com"],
  youtube_url: ["youtube.com", "youtu.be"],
  x_handle: ["x.com", "twitter.com"],
  linkedin_url: ["linkedin.com", "lnkd.in"],
  whatsapp_number: ["wa.me", "whatsapp.com"],
};

/** True when `url`'s host is (a subdomain of) one the column's platform uses. */
function onPlatformHost(column: string, url: string): boolean {
  const hosts = SOCIAL_HOSTS[column];
  if (!hosts) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * One entry point for every social column, so no route can forget that
 * WhatsApp is a number and the rest are handles or links.
 *
 * `matchPlatformHost` additionally refuses a link that points at some OTHER
 * site (a YouTube URL in the Facebook box, or worse, an unrelated domain
 * wearing a Facebook icon on a public profile). It is for unattended writers
 * only: an owner's existing profile may hold a link-in-bio URL that
 * `/api/contributor/profile` re-sends on every save, and rejecting it there
 * would fail the whole save.
 */
export function checkSocialField(
  column: string,
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
  opts: { matchPlatformHost?: boolean } = {},
): SocialCheck {
  const check =
    column === "whatsapp_number" ? checkWhatsappValue(value, maxLength) : checkSocialValue(value, maxLength);
  if (check.ok && check.value && opts.matchPlatformHost && /^https?:\/\//i.test(check.value)) {
    if (!onPlatformHost(column, check.value)) return { ok: false, reason: "not_a_link" };
  }
  return check;
}

/** `normaliseSocialValue` for a named column (WhatsApp-aware). `undefined` = reject. */
export function normaliseSocialField(
  column: string,
  value: unknown,
  maxLength: number = MAX_PUBLIC_URL_LENGTH,
): string | null | undefined {
  const check = checkSocialField(column, value, maxLength);
  return check.ok ? check.value : undefined;
}
