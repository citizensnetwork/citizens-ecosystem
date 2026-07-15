import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/claims/:id/conversions — the handshake history for a claim,
 * party-scoped (brand owner, creator, moderators).
 */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const conversions = await ctx.store.conversions.listForClaim(params.id!, userId);
  return json({ conversions });
});

/**
 * POST /api/claims/:id/conversions — the claiming BRAND proposes converting
 * the released item into its permanent catalogue (mirrors
 * `wear.propose_catalogue_conversion`).
 */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const conversion = await ctx.store.conversions.propose(params.id!, userId);
  return json({ conversion }, 201);
});
