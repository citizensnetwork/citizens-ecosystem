import { ApiError, requireUserId, type RouteContext } from './route-context';

/**
 * The impersonation surface's gate (roles MD §7.2-5): ADMIN only — not
 * moderators. Belt-and-braces: in prod every store call re-checks
 * `wear.is_admin()` inside the SECDEF fn (auth.uid(), not this id), but the
 * memory store trusts its caller and we never want a 500 where a clean 403
 * belongs (mig-162 admin-route precedent).
 */
export async function requireAdmin(ctx: RouteContext): Promise<string> {
  const userId = requireUserId(ctx);
  if ((await ctx.store.roles.getOwn(userId)) !== 'admin') {
    throw new ApiError(403, 'admin_only', 'Impersonation is admin-only.');
  }
  return userId;
}

/** The `?sessionId=` every view-as route must carry (explicit, auditable). */
export function requiredSessionId(req: Request): string {
  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (!sessionId) {
    throw new ApiError(422, 'session_id_required', 'sessionId is required.');
  }
  return sessionId;
}

/** Parse an integer query param with a default and [min, max] clamp. */
export function intParam(
  req: Request,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = new URL(req.url).searchParams.get(name);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  const value = Number.isNaN(parsed) ? fallback : parsed;
  return Math.min(Math.max(value, min), max);
}
