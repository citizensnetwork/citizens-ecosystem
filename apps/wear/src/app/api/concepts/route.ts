import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydrateConcept, hydrateConceptPage } from '@/lib/api/serializers';
import { bodyString, bodyStringArray, readJsonBody, readPageParams } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';
import { CONCEPT_STAGES, type ConceptStage } from '@citizens/db';

export const dynamic = 'force-dynamic';

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_MEDIA = 6;

/**
 * GET /api/concepts — public browse of the Concepts marketplace, newest
 * first. `?status=` filters by lifecycle stage, `?creator=` by creator id.
 */
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get('status');
  if (statusRaw && !(CONCEPT_STAGES as readonly string[]).includes(statusRaw)) {
    throw new ApiError(400, 'invalid_status', `Unknown stage ${statusRaw}.`);
  }
  const creator = url.searchParams.get('creator');
  const page = await ctx.store.concepts.list({
    ...readPageParams(url),
    ...(statusRaw ? { status: statusRaw as ConceptStage } : {}),
    ...(creator ? { creatorId: creator } : {}),
  });
  return json(await hydrateConceptPage(ctx.store, page, ctx.userId));
});

/**
 * POST /api/concepts — publish a design concept as the signed-in user.
 * Any citizen may create ("Creator" is derived, never level-gated).
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const title = bodyString(body, 'title').slice(0, MAX_TITLE);
  if (!title) throw new ApiError(422, 'empty_concept', 'Concept title must not be empty.');

  const mediaUrls = bodyStringArray(body, 'mediaUrls')
    .map((u) => safeUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, MAX_MEDIA);

  const entry = await ctx.store.concepts.create({
    creatorId: userId,
    title,
    description: bodyString(body, 'description').slice(0, MAX_DESCRIPTION) || null,
    media: mediaUrls.map((url, i) => ({
      url,
      kind: 'image' as const,
      altText: null,
      orderIndex: i,
    })),
  });
  return json(await hydrateConcept(ctx.store, entry, userId), 201);
});
