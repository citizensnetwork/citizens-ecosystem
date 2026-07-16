import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydratePost } from '@/lib/api/serializers';
import { bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const MAX_POST_BODY = 2000;
const MAX_MEDIA = 4;

/**
 * POST /api/posts — create a Post. Posts are **Brand-tier** (mig 160, ratified
 * 2026-07-15): the caller must publish AS a `verified` brand they own — base
 * Citizens create Concepts + Stories, not Posts. `brandSlug` is required; RLS
 * (`posts_author_write`) is the backstop wall. `mediaUrls` (https, max 4)
 * become image media; `taggedProductIds` is an opaque passthrough (Wear has no
 * first-class product catalog yet — STEP3 §3.4).
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);

  // Brand-tier gate: own an attributed, verified brand (403 chain), then validate.
  const brandSlug = bodyString(body, 'brandSlug');
  if (!brandSlug) {
    throw new ApiError(
      403,
      'brand_required',
      'Only brands can post. Share a Concept or a Story instead.',
    );
  }
  const brand = await ctx.store.brands.getBySlug(brandSlug);
  if (!brand || brand.ownerUserId !== userId) {
    throw new ApiError(403, 'not_brand_owner', 'You can only post as a brand you own.');
  }
  if (!brand.verified) {
    throw new ApiError(
      403,
      'brand_not_verified',
      'Only verified brands can post. Your brand is pending verification.',
    );
  }

  const text = bodyString(body, 'body').slice(0, MAX_POST_BODY);
  if (!text) throw new ApiError(422, 'empty_post', 'Post body must not be empty.');

  const mediaUrls = bodyStringArray(body, 'mediaUrls')
    .map((u) => safeUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, MAX_MEDIA);

  const entry = await ctx.store.posts.create({
    authorId: userId,
    brandId: brand.id,
    body: text,
    media: mediaUrls.map((url, i) => ({
      url,
      kind: 'image' as const,
      altText: null,
      orderIndex: i,
    })),
    taggedProductIds: bodyStringArray(body, 'taggedProductIds'),
  });
  return json(await hydratePost(ctx.store, entry), 201);
});
