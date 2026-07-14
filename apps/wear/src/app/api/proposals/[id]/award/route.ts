import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * POST /api/proposals/:id/award — the concept's CREATOR awards this proposal.
 * Delegates to the `wear.award_concept_claim` SECDEF RPC: exclusive claim,
 * losing bids declined, concept → 'claimed', log entry, and the milestone
 * royalty (10% / first 100 units) committed atomically.
 */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const claim = await ctx.store.conceptClaims.award(params.id!, userId);
  return json({ claim }, 201);
});
