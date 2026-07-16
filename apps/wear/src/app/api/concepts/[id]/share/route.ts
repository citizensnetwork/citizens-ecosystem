import { handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';
import type { ConceptShareChannel } from '@citizens/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/concepts/:id/share — record a share (mig 161). Distinct-sharer
 * semantics: idempotent per (concept, viewer); the response carries the fresh
 * public count so the UI can update in place. `{ channel?: 'link'|'native' }`
 * ('dm' is reserved for the conversation-picker fast-follow).
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req).catch(() => ({}));
  const channelRaw = bodyString(body, 'channel');
  const channel: ConceptShareChannel = channelRaw === 'native' ? 'native' : 'link';
  await ctx.store.concepts.share(params.id!, userId, channel);
  const [shares, viewerShared] = await Promise.all([
    ctx.store.concepts.shareCount(params.id!),
    ctx.store.concepts.hasShared(params.id!, userId),
  ]);
  return json({ shares, viewerShared }, 201);
});
