import { handler, json } from '@/lib/api/route-context';
import { requireAdmin, requiredSessionId } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/view/profile?sessionId= — the target's own
 * profile + settings VIEW (read-only), served by the audited SECDEF reader.
 */
export const GET = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const view = await ctx.store.impersonation.viewProfile(userId, requiredSessionId(req));
  return json(view);
});
