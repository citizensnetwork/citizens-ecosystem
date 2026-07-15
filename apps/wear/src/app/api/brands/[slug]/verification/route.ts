import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/brands/:slug/verification — the brand's verification lifecycle
 * row (owner or moderator view; null-scoped by RLS for everyone else).
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  const verification = await ctx.store.brandVerifications.getForBrand(brand.id, userId);
  return json({ verification, verified: brand.verified });
});

/**
 * POST /api/brands/:slug/verification — the OWNER requests verification
 * (re-request allowed only after a rejection). Review is admin-side.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  const note = bodyString(await readJsonBody(req), 'note') || null;
  const verification = await ctx.store.brandVerifications.request(brand.id, userId, note);
  return json({ verification }, 201);
});
