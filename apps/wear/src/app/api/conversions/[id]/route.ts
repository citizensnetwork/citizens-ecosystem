import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/conversions/:id — move a pending handshake:
 *   action "accept"  — CREATOR accepts (public tag dropped, milestone closed
 *                      as superseded, lifetime 5% committed "in its place")
 *   action "decline" — CREATOR declines (may be re-proposed later)
 *   action "cancel"  — the proposing BRAND withdraws it
 */
export const PATCH = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const action = bodyString(await readJsonBody(req), 'action');

  if (action === 'accept' || action === 'decline') {
    const conversion = await ctx.store.conversions.respond(params.id!, userId, action === 'accept');
    return json({ conversion });
  }
  if (action === 'cancel') {
    return json({ conversion: await ctx.store.conversions.cancel(params.id!, userId) });
  }
  throw new ApiError(422, 'invalid_action', 'action must be accept, decline, or cancel.');
});
