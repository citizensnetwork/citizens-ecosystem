import { ApiError, handler, json } from '@/lib/api/route-context';
import { requireAdmin, requiredSessionId } from '@/lib/api/impersonation';
import { toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation — the caller's ACTIVE sign-in-as session (or
 * null), target identity hydrated. The banner-restore call on app boot.
 */
export const GET = handler(async (_req, ctx) => {
  const userId = await requireAdmin(ctx);
  const session = await ctx.store.impersonation.getActive(userId);
  if (!session) return json({ session: null, target: null });
  const target = await ctx.store.users.getById(session.targetUserId);
  return json({ session, target: target ? toUserDto(target) : null });
});

/**
 * POST /api/admin/impersonation — start a session:
 * `{ targetUserId, reason }` (reason REQUIRED, 5–500 chars — §7.4). Fails
 * closed with 409 when the admin already has one or the target is already
 * under review (ratified §7.6b "both").
 */
export const POST = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const body = await readJsonBody(req);
  const targetUserId = bodyString(body, 'targetUserId');
  if (!targetUserId) {
    throw new ApiError(422, 'target_required', 'targetUserId is required.');
  }
  const reason = bodyString(body, 'reason');
  const session = await ctx.store.impersonation.start(userId, targetUserId, reason);
  const target = await ctx.store.users.getById(session.targetUserId);
  return json({ session, target: target ? toUserDto(target) : null }, 201);
});

/**
 * DELETE /api/admin/impersonation?sessionId= — end the session (the Exit
 * control and the 30-min client timer). Deliberately takes the EXPLICIT id:
 * an expired-but-unswept session no longer shows as active, yet ending it is
 * exactly how the banner closes it cleanly and fires the target's notify.
 */
export const DELETE = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const session = await ctx.store.impersonation.end(userId, requiredSessionId(req));
  return json({ session });
});
