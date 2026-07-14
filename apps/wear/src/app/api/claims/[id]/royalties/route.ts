import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/claims/:id/royalties — the obligations on one claim, party-scoped
 * (brand owner, creator, moderators).
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  return json({ royalties: await ctx.store.royalties.listForClaim(params.id!, userId) });
});
