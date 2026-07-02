import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydratePost } from '@/lib/api/serializers';
import { bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const MAX_POST_BODY = 2000;
const MAX_MEDIA = 4;

/**
 * POST /api/posts — create a post as the signed-in user, optionally *as* a
 * brand they own. `mediaUrls` (https, max 4) become image media; a proper
 * upload pipeline is a fast-follow. `taggedProductIds` is an opaque
 * passthrough (Wear has no first-class product catalog yet — STEP3 §3.4).
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const text = bodyString(body, 'body').slice(0, MAX_POST_BODY);
  if (!text) throw new ApiError(422, 'empty_post', 'Post body must not be empty.');

  const mediaUrls = bodyStringArray(body, 'mediaUrls')
    .map((u) => safeUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, MAX_MEDIA);

  const brandSlug = bodyString(body, 'brandSlug');
  let brandId: string | null = null;
  if (brandSlug) {
    const brand = await ctx.store.brands.getBySlug(brandSlug);
    // Only the brand owner may publish as their brand; otherwise post as self.
    if (brand && brand.ownerUserId === userId) brandId = brand.id;
  }

  const entry = await ctx.store.posts.create({
    authorId: userId,
    brandId,
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
