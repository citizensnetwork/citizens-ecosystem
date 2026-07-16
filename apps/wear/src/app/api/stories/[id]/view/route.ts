import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/** POST /api/stories/:id/view — record that the viewer saw this story. */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const view = await ctx.store.stories.recordView(params.id!, userId);
  return json(view, 201);
});
