import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const TRIAGE = ['reviewed', 'actioned', 'dismissed'] as const;
type TriageStatus = (typeof TRIAGE)[number];

/**
 * POST /api/admin/reports/:id — moderator triage
 * (`open → reviewed → actioned | dismissed`, mig 145).
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const status = bodyString(await readJsonBody(req), 'status');
  if (!(TRIAGE as readonly string[]).includes(status)) {
    throw new ApiError(422, 'invalid_status', 'status must be reviewed, actioned, or dismissed.');
  }
  const report = await ctx.store.reports.triage(params.id!, userId, status as TriageStatus);
  return json({ report });
});
