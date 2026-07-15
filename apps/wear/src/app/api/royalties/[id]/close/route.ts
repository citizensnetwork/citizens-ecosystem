import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * POST /api/royalties/:id/close — the CREATOR confirms a submitted proof and
 * closes the obligation; an admin may close from any open state (dispute
 * lever). Mirrors `wear.close_royalty_obligation`.
 */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  return json({ royalty: await ctx.store.royalties.close(params.id!, userId) });
});
