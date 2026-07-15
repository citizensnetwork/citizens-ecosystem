import { handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyBoolean, bodyStringArray, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/read — mark notifications read for the signed-in user.
 * Body: `{ all: true }` clears everything, otherwise `{ ids: string[] }` clears
 * the named ones (own only, enforced by the store + RLS). Returns how many
 * changed and the fresh unread count.
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const all = bodyBoolean(body, 'all') === true;
  const updated = all
    ? await ctx.store.notifications.markAllRead(userId)
    : await ctx.store.notifications.markRead(userId, bodyStringArray(body, 'ids'));
  const unreadCount = await ctx.store.notifications.unreadCount(userId);
  return json({ updated, unreadCount });
});
