import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/royalties — every royalty obligation the caller is party to
 * (as claiming brand owner or as concept creator). Party-scoped by RLS.
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  return json({ royalties: await ctx.store.royalties.listForUser(userId) });
});
