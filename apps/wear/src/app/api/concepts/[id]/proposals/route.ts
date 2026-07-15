import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyNumber, bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 2000;
const MAX_MOCKUPS = 6;

/**
 * GET /api/concepts/:id/proposals — proposal DETAILS, party-scoped: the
 * concept's creator sees all bids, a brand owner sees their own, moderators
 * see everything (RLS enforces the same wall in prod). The public tag surface
 * lives on the concept detail route.
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const proposals = await ctx.store.conceptProposals.listForConcept(params.id!, userId);
  return json({ proposals });
});

/**
 * POST /api/concepts/:id/proposals — a VERIFIED brand pitches on an open
 * concept. `brandSlug` (or `brandId`) must be a brand the caller owns.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);

  const brandSlug = bodyString(body, 'brandSlug');
  const brandIdRaw = bodyString(body, 'brandId');
  let brandId = brandIdRaw;
  if (!brandId && brandSlug) {
    const brand = await ctx.store.brands.getBySlug(brandSlug);
    if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${brandSlug}.`);
    brandId = brand.id;
  }
  if (!brandId) throw new ApiError(422, 'brand_required', 'Provide brandSlug or brandId.');

  const mockupUrls = bodyStringArray(body, 'mockupUrls')
    .map((u) => safeUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, MAX_MOCKUPS);

  const proposal = await ctx.store.conceptProposals.create(userId, {
    conceptId: params.id!,
    brandId,
    mockupUrls,
    materials: bodyString(body, 'materials').slice(0, MAX_TEXT) || null,
    estUnitPrice: bodyNumber(body, 'estUnitPrice'),
    moq: bodyNumber(body, 'moq'),
    estTurnaroundDays: bodyNumber(body, 'estTurnaroundDays'),
    note: bodyString(body, 'note').slice(0, MAX_TEXT) || null,
  });
  return json({ proposal }, 201);
});
