import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/** POST /api/concepts/:id/upvote — idempotent upvote by the caller. */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.concepts.upvote(params.id!, userId);
  return json({
    upvotes: await ctx.store.concepts.upvoteCount(params.id!),
    viewerUpvoted: true,
  });
});

/** DELETE /api/concepts/:id/upvote — remove the caller's upvote. */
export const DELETE = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.concepts.removeUpvote(params.id!, userId);
  return json({
    upvotes: await ctx.store.concepts.upvoteCount(params.id!),
    viewerUpvoted: false,
  });
});
