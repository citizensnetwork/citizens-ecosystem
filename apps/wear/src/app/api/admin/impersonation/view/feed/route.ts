import { handler, json } from '@/lib/api/route-context';
import { intParam, requireAdmin, requiredSessionId } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/view/feed?sessionId=&mode=&limit=&offset= —
 * the home feed exactly as the TARGET would see it (their follows, their
 * engagement state), in either app mode. Audited per call.
 */
export const GET = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const sessionId = requiredSessionId(req);
  const mode =
    new URL(req.url).searchParams.get('mode') === 'chronological' ? 'chronological' : 'for-you';
  const view = await ctx.store.impersonation.viewFeed(userId, sessionId, {
    mode,
    limit: intParam(req, 'limit', 20, 1, 50),
    offset: intParam(req, 'offset', 0, 0, Number.MAX_SAFE_INTEGER),
  });
  return json(view);
});
