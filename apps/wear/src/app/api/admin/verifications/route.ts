import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandDto } from '@/lib/api/serializers';
import type { WearBrand } from '@citizens/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/verifications — the pending brand-verification queue,
 * hydrated with the requesting brand. Moderators may view; review itself is
 * admin-only (the per-item POST).
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const role = await ctx.store.roles.getOwn(userId);
  if (!role) throw new ApiError(403, 'forbidden', 'Moderators only.');

  const pending = await ctx.store.brandVerifications.listPending(userId);
  const brands = new Map<string, WearBrand>();
  await Promise.all(
    pending.map(async (v) => {
      const b = await ctx.store.brands.getById(v.brandId);
      if (b) brands.set(v.brandId, b);
    }),
  );
  return json({
    role,
    verifications: pending.map((v) => ({
      ...v,
      brand: brands.has(v.brandId) ? toBrandDto(brands.get(v.brandId)!) : null,
    })),
  });
});
