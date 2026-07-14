import { ApiError, handler, json } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/brands/:slug/claims — the brand's concept claims (public info:
 * "Claimed by X" renders on every concept card).
 */
export const GET = handler(async (_req, ctx, params) => {
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  return json({ claims: await ctx.store.conceptClaims.listForBrand(brand.id) });
});
