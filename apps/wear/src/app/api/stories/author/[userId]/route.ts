import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stories/author/:userId — the author's ACTIVE stories as visible to
 * the signed-in viewer (audience + block rules ride `listActiveForViewer`,
 * which RLS backstops). Powers the full-screen story viewer: the Home tray
 * previously deep-linked to the author's profile instead (§3V item 5).
 */
export const GET = handler(async (_req, ctx, params) => {
  const viewerId = requireUserId(ctx);
  const author = await ctx.store.users.getById(params.userId!);
  if (!author) throw new ApiError(404, 'user_not_found', 'Unknown user.');
  const active = await ctx.store.stories.listActiveForViewer(viewerId);
  const stories = active
    .filter((s) => s.authorId === author.id)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return json({
    author: toUserDto(author),
    stories: stories.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaKind: s.mediaKind,
      caption: s.caption,
      brandId: s.brandId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    })),
  });
});
