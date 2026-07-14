import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * POST /api/claims/:id/revoke — ADMIN dispute lever. Revoking the active
 * claim re-opens the concept ('proposed') so declined proposals may re-enter.
 */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const claim = await ctx.store.conceptClaims.revoke(params.id!, userId);
  return json({ claim });
});
