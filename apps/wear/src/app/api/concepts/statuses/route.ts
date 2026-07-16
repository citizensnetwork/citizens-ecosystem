import { handler, json } from '@/lib/api/route-context';
import { hydrateConceptStatuses } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concepts/statuses — the concept-stories bar (mig 161): active
 * (non-expired) promotions, newest first, each carrying its concept's title +
 * hero artwork and the viewer's seen-state. Public — anonymous callers see
 * everything unseen. The client groups entries by creator into bubbles.
 */
export const GET = handler(async (_req, ctx) => {
  const entries = await ctx.store.conceptStatuses.listActive(ctx.userId);
  const statuses = (await hydrateConceptStatuses(ctx.store, entries)).filter((s) => s.concept);
  return json({ statuses });
});
