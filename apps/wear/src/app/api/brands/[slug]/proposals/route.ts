import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/brands/:slug/proposals — the brand's bidding pipeline, party-
 * scoped (owner/moderator; a creator sees only bids on their own concepts).
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  return json({ proposals: await ctx.store.conceptProposals.listForBrand(brand.id, userId) });
});
