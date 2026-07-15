import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const DECISIONS = ['approved', 'rejected', 'revoked'] as const;
type Decision = (typeof DECISIONS)[number];

/**
 * POST /api/admin/verifications/:brandId — ADMIN review decision. Approval
 * syncs `wear.brands.verified` (the authoritative badge + the gate on
 * proposing/claiming) via the DB trigger; the memory spec mirrors it.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const decision = bodyString(body, 'decision');
  if (!(DECISIONS as readonly string[]).includes(decision)) {
    throw new ApiError(422, 'invalid_decision', 'decision must be approved, rejected, or revoked.');
  }
  const verification = await ctx.store.brandVerifications.review(
    params.brandId!,
    userId,
    decision as Decision,
    bodyString(body, 'reviewNote') || null,
  );
  return json({ verification });
});
