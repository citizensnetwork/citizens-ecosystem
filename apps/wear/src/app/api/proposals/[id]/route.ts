import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyNumber, bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 2000;
const MAX_MOCKUPS = 6;

/** GET /api/proposals/:id — party-scoped detail (creator, brand, moderator). */
export const GET = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const proposal = await ctx.store.conceptProposals.getById(params.id!, userId);
  if (!proposal) {
    throw new ApiError(404, 'proposal_not_found', `Unknown proposal ${params.id}.`);
  }
  return json({ proposal });
});

/**
 * PATCH /api/proposals/:id — the proposing brand edits a live bid, or moves
 * it through `action: "withdraw" | "resubmit"`. Award/decline transitions are
 * creator-side (`/award`) — never writable here.
 */
export const PATCH = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const action = bodyString(body, 'action');

  if (action === 'withdraw') {
    return json({ proposal: await ctx.store.conceptProposals.withdraw(params.id!, userId) });
  }
  if (action === 'resubmit') {
    return json({ proposal: await ctx.store.conceptProposals.resubmit(params.id!, userId) });
  }
  if (action) throw new ApiError(422, 'invalid_action', `Unknown action ${action}.`);

  const patch: Record<string, unknown> = {};
  if (body && typeof body === 'object') {
    if ('mockupUrls' in body) {
      patch.mockupUrls = bodyStringArray(body, 'mockupUrls')
        .map((u) => safeUrl(u))
        .filter((u): u is string => !!u)
        .slice(0, MAX_MOCKUPS);
    }
    if ('materials' in body)
      patch.materials = bodyString(body, 'materials').slice(0, MAX_TEXT) || null;
    if ('estUnitPrice' in body) patch.estUnitPrice = bodyNumber(body, 'estUnitPrice');
    if ('moq' in body) patch.moq = bodyNumber(body, 'moq');
    if ('estTurnaroundDays' in body)
      patch.estTurnaroundDays = bodyNumber(body, 'estTurnaroundDays');
    if ('note' in body) patch.note = bodyString(body, 'note').slice(0, MAX_TEXT) || null;
  }
  return json({ proposal: await ctx.store.conceptProposals.update(params.id!, userId, patch) });
});
