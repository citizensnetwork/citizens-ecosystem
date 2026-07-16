import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody, readPageParams } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** GET /api/brands?q=&cursor=&limit= — list or search Wear-owned brands. */
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q');
  const params = readPageParams(url);
  const page = query
    ? await ctx.store.brands.search(query, params)
    : await ctx.store.brands.listAll(params);
  return json({ items: page.items.map(toBrandDto), nextCursor: page.nextCursor });
});

/**
 * POST /api/brands — mint a brand. Brand creation is **admin-assigned** (mig
 * 160, ratified 2026-07-15): the self-serve path is retired. A Citizen becomes
 * a Brand via the progression-gated *Become-a-Brand* application → admin
 * approval; an admin mints the row (optionally owned by the approved applicant
 * via `ownerId`). RLS (`brands_admin_insert`) is the wall — this is the clean
 * 403 front door.
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  if ((await ctx.store.roles.getOwn(userId)) !== 'admin') {
    throw new ApiError(
      403,
      'admin_only',
      'Brands are assigned by Citizens Wear. Apply from Settings once eligible.',
    );
  }
  const body = await readJsonBody(req);
  const slug = bodyString(body, 'slug');
  const name = bodyString(body, 'name');
  if (!slug) throw new ApiError(422, 'invalid_slug', 'A brand slug is required.');
  if (!name) throw new ApiError(422, 'invalid_name', 'A brand name is required.');
  const brand = await ctx.store.brands.create({
    ownerId: bodyString(body, 'ownerId') || userId,
    slug,
    name,
    tagline: bodyString(body, 'tagline') || null,
    websiteUrl: safeUrl(bodyString(body, 'websiteUrl')),
    logoUrl: safeUrl(bodyString(body, 'logoUrl')),
  });
  return json(toBrandDto(brand), 201);
});
