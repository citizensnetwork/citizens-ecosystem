import { handler, json } from '@/lib/api/route-context';
import { requireAdmin, requiredSessionId } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/view/conversations?sessionId= — the target's
 * conversation LIST as METADATA ONLY (members + timestamps, no message
 * bodies, not even previews): opening a thread is the DM access that needs
 * its own reason (§7.2-3).
 */
export const GET = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const view = await ctx.store.impersonation.viewConversations(userId, requiredSessionId(req));
  return json(view);
});
