import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydrateConcept, toBrandDto } from '@/lib/api/serializers';
import { bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';
import type { WearBrand } from '@citizens/db';

export const dynamic = 'force-dynamic';

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_MEDIA = 6;

/**
 * GET /api/concepts/:id — full marketplace detail: the concept card, the
 * PUBLIC proposal brand tags, the append-only status timeline (the stepper's
 * data), and the active claim. Proposal DETAILS stay behind the party-scoped
 * `/proposals` route.
 */
export const GET = handler(async (_req, ctx, params) => {
  const entry = await ctx.store.concepts.getById(params.id!);
  if (!entry) throw new ApiError(404, 'concept_not_found', `Unknown concept ${params.id}.`);

  const [card, tags, log, claim] = await Promise.all([
    hydrateConcept(ctx.store, entry, ctx.userId),
    ctx.store.conceptProposals.publicTags(entry.concept.id),
    ctx.store.conceptStatusLog.listForConcept(entry.concept.id),
    ctx.store.conceptClaims.getActiveForConcept(entry.concept.id),
  ]);

  const tagBrands = new Map<string, WearBrand>();
  await Promise.all(
    [...new Set(tags.map((t) => t.brandId))].map(async (id) => {
      const b = await ctx.store.brands.getById(id);
      if (b) tagBrands.set(id, b);
    }),
  );

  return json({
    concept: card,
    proposalTags: tags.map((t) => ({
      proposedAt: t.proposedAt,
      brand: tagBrands.has(t.brandId) ? toBrandDto(tagBrands.get(t.brandId)!) : null,
    })),
    statusLog: log.map((e) => ({
      id: e.id,
      status: e.status,
      note: e.note,
      createdAt: e.createdAt,
    })),
    claim: claim
      ? {
          id: claim.id,
          brandId: claim.brandId,
          awardedAt: claim.awardedAt,
          attributionPublic: claim.attributionPublic,
        }
      : null,
  });
});

/**
 * PATCH /api/concepts/:id — creator edit, only while the concept is open
 * ('proposed'); artwork and text are frozen once claimed.
 */
export const PATCH = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);

  const patch: {
    title?: string;
    description?: string | null;
    media?: { url: string; kind: 'image'; altText: null; orderIndex: number }[];
  } = {};
  const title = bodyString(body, 'title');
  if (title) patch.title = title.slice(0, MAX_TITLE);
  if (body && typeof body === 'object' && 'description' in body) {
    patch.description = bodyString(body, 'description').slice(0, MAX_DESCRIPTION) || null;
  }
  if (body && typeof body === 'object' && 'mediaUrls' in body) {
    patch.media = bodyStringArray(body, 'mediaUrls')
      .map((u) => safeUrl(u))
      .filter((u): u is string => !!u)
      .slice(0, MAX_MEDIA)
      .map((url, i) => ({ url, kind: 'image' as const, altText: null, orderIndex: i }));
  }

  const entry = await ctx.store.concepts.update(params.id!, userId, patch);
  return json(await hydrateConcept(ctx.store, entry, userId));
});

/**
 * DELETE /api/concepts/:id — creator (while open) or moderator takedown.
 */
export const DELETE = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.concepts.delete(params.id!, userId);
  return json({ ok: true });
});
