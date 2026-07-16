import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/** POST /api/concepts/statuses/:id/view — record the viewer's seen-state. */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.conceptStatuses.recordView(params.id!, userId);
  return json({ ok: true }, 201);
});
