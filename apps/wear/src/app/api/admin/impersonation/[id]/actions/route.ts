import { handler, json } from '@/lib/api/route-context';
import { requireAdmin } from '@/lib/api/impersonation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/impersonation/:id/actions — a session's audit trail, oldest
 * first (bench review; also the future user-facing audit summary's source).
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = await requireAdmin(ctx);
  const actions = await ctx.store.impersonation.listActions(userId, params.id!);
  return json({ actions });
});
