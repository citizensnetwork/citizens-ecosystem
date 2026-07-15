import { handler, json, requireUserId } from '@/lib/api/route-context';
import { readPageParams } from '@/lib/api/params';
import { hydrateNotifications } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications?cursor=&limit= — the signed-in user's notifications,
 * newest first, plus their current unread count. Rows are produced by the
 * mig-159 lifecycle triggers; RLS scopes the read to the caller's own rows.
 */
export const GET = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const url = new URL(req.url);
  const [page, unreadCount] = await Promise.all([
    ctx.store.notifications.list(userId, readPageParams(url)),
    ctx.store.notifications.unreadCount(userId),
  ]);
  return json({
    items: await hydrateNotifications(ctx.store, page.items),
    nextCursor: page.nextCursor,
    unreadCount,
  });
});
