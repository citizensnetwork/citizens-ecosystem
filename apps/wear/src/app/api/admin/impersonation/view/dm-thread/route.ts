import { ApiError, handler, json } from '@/lib/api/route-context';
import { requireAdmin } from '@/lib/api/impersonation';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/impersonation/view/dm-thread — open ONE DM thread of the
 * target: `{ sessionId, conversationId, reason }`. POST (not GET) so the
 * required per-access reason travels in the body, never in a URL (§7.2-3;
 * URLs land in server logs). Every call writes its own audit row with the
 * reason — the read and the log are the same SECDEF call.
 */
export const POST = handler(async (req, ctx) => {
  const userId = await requireAdmin(ctx);
  const body = await readJsonBody(req);
  const sessionId = bodyString(body, 'sessionId');
  if (!sessionId) {
    throw new ApiError(422, 'session_id_required', 'sessionId is required.');
  }
  const conversationId = bodyString(body, 'conversationId');
  if (!conversationId) {
    throw new ApiError(422, 'conversation_required', 'conversationId is required.');
  }
  const reason = bodyString(body, 'reason');
  const view = await ctx.store.impersonation.viewDmThread(userId, sessionId, conversationId, reason);
  return json(view);
});
