/**
 * Security-critical input validators.
 *
 * Centralised so every server action and route handler uses the same
 * allow-list semantics. These helpers are pure (no I/O, no globals) and
 * carry direct unit tests in `validators.test.ts`.
 */

/**
 * Accept a candidate URL only if it parses cleanly and uses `http:` or
 * `https:`. Returns the canonicalised URL string, or `null` if the input
 * fails any check.
 *
 * Rejects (returns `null`):
 *   - falsy input (`''`, `null`, `undefined`)
 *   - non-http(s) schemes — including `javascript:`, `data:`, `file:`,
 *     `vbscript:`, custom app schemes
 *   - URLs that carry credentials (`https://user:pass@host`) — these can
 *     spoof origin in some UI surfaces and exfiltrate session via referrer
 *   - inputs that fail to parse as a URL at all
 *
 * Scope: this validator is for **rendering-time** URLs (e.g. `<img src>`
 * targets supplied by users). It does NOT defend against SSRF and must
 * not be used to gate server-side fetches — those need an additional
 * DNS-pinned host allow-list (see ROADMAP Phase 7+ note).
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Public path of the `wear-media` bucket (what Storage's `getPublicUrl` returns). */
const WEAR_MEDIA_PATH = '/storage/v1/object/public/wear-media/';
/** Google profile pictures; the CSP lists them as `https://*.googleusercontent.com`. */
const GOOGLE_USER_CONTENT = '.googleusercontent.com';

/**
 * `true` when the browser will actually draw this picture under Wear's
 * Content-Security-Policy `img-src` (`next.config.js`). The policy only allows
 * our own Storage and Google profile pictures, so a link anywhere else would be
 * saved and then silently blocked: a broken picture for everyone who sees it.
 *
 * Accepts an `https:` URL on the default port, with no credentials, that is
 * either
 *   - on the Supabase project host, under the `wear-media` bucket's public path, or
 *   - on a subdomain of `googleusercontent.com`.
 *
 * The candidate is parsed here, so `..` segments are collapsed and the host is
 * lower-cased before it is judged. `supabaseUrl` is the project URL
 * (`NEXT_PUBLIC_SUPABASE_URL`). `lib/api/image-urls.test.ts` keeps this list
 * inside `img-src`.
 */
export function isDisplayableImageUrl(candidate: string, supabaseUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  if (u.hostname.endsWith(GOOGLE_USER_CONTENT) && u.hostname.length > GOOGLE_USER_CONTENT.length) {
    return true;
  }
  let storageHost: string;
  try {
    storageHost = new URL(supabaseUrl).hostname;
  } catch {
    return false; // a project URL we cannot read allows no storage host
  }
  return (
    u.hostname === storageHost &&
    u.pathname.startsWith(WEAR_MEDIA_PATH) &&
    u.pathname.length > WEAR_MEDIA_PATH.length
  );
}
