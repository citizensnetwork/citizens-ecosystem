import { handler, json } from '@/lib/api/route-context';
import { intParam, requireAdmin, requiredSessionId } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/view/notifications?sessionId=&limit= — the
 * target's inbox (recipient-only under RLS), via the audited reader.
 */
export const GET = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const view = await ctx.store.impersonation.viewNotifications(
    userId,
    requiredSessionId(req),
    intParam(req, 'limit', 50, 1, 100),
  );
  return json(view);
});
