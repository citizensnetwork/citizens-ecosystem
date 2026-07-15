import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'reviewed', 'actioned', 'dismissed'] as const;

/**
 * GET /api/admin/reports — the mig-145 moderation queue (`?status=` filter,
 * default 'open'). Moderator-scoped; RLS enforces the same wall in prod.
 */
export const GET = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get('status') ?? 'open';
  if (statusRaw !== 'all' && !(STATUSES as readonly string[]).includes(statusRaw)) {
    throw new ApiError(400, 'invalid_status', `Unknown report status ${statusRaw}.`);
  }
  const reports = await ctx.store.reports.listForModeration(
    userId,
    statusRaw === 'all' ? undefined : { status: statusRaw as (typeof STATUSES)[number] },
  );
  return json({ reports });
});
