import { handler, json } from '@/lib/api/route-context';
import { requireAdmin, requiredSessionId } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/view/saves?sessionId= — the target's PRIVATE
 * saved boards (owner-only under RLS), via the audited reader.
 */
export const GET = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const view = await ctx.store.impersonation.viewSaves(userId, requiredSessionId(req));
  return json(view);
});
