import { cookies } from 'next/headers';

/**
 * Citizens Wear launch gate.
 *
 * Until Wear is ready for public launch every marketing surface is hidden
 * behind a "coming soon" splash. Operators can preview the real design by
 * either:
 *   - Running in `NODE_ENV !== 'production'` (dev + preview = always open), OR
 *   - Setting `WEAR_LAUNCH_UNLOCKED=true` on the deployment (force open), OR
 *   - Setting a `cw_preview` cookie to the value of `WEAR_PREVIEW_KEY` and
 *     visiting `/?preview=<key>` on production — lets insiders share
 *     pre-launch preview links without flipping the whole site.
 *
 * The gate deliberately lives *here* (a tiny server module) instead of as
 * middleware so that:
 *   - RSC pages decide what to render rather than relying on rewrites.
 *   - Tests can `vi.stubEnv` / pass cookies to exercise both branches.
 *   - `/api/health` and similar routes are never gated.
 */

export const PREVIEW_COOKIE = 'cw_preview';
const PREVIEW_QUERY = 'preview';

export interface LaunchGateResult {
  readonly unlocked: boolean;
  /** Which rule opened the gate; useful for debugging + analytics. */
  readonly reason:
    | 'dev-environment'
    | 'env-unlocked'
    | 'preview-cookie'
    | 'locked';
}

/**
 * Evaluate the launch gate on the server.
 *
 * `searchParams` is optional so page components can pass their route
 * params through. Only read here; the cookie handoff (setting
 * `PREVIEW_COOKIE` when `?preview=<key>` matches `WEAR_PREVIEW_KEY`) is
 * handled separately inside the root page so that this function stays
 * pure and trivially unit-testable.
 */
export async function evaluateLaunchGate(searchParams?: {
  readonly preview?: string | string[];
}): Promise<LaunchGateResult> {
  if (process.env.NODE_ENV !== 'production') {
    return { unlocked: true, reason: 'dev-environment' };
  }
  if (process.env.WEAR_LAUNCH_UNLOCKED === 'true') {
    return { unlocked: true, reason: 'env-unlocked' };
  }
  const key = process.env.WEAR_PREVIEW_KEY;
  if (key) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(PREVIEW_COOKIE)?.value;
    if (cookieVal && safeEqual(cookieVal, key)) {
      return { unlocked: true, reason: 'preview-cookie' };
    }
    const raw = searchParams?.preview;
    const queryVal = Array.isArray(raw) ? raw[0] : raw;
    if (queryVal && safeEqual(queryVal, key)) {
      return { unlocked: true, reason: 'preview-cookie' };
    }
  }
  return { unlocked: false, reason: 'locked' };
}

/**
 * Constant-time-ish string comparison. Not cryptographically perfect
 * (JS strings leak length), but avoids the most obvious early-exit leak
 * when comparing a user-supplied key against a secret.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
