import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';
import type { WearUser } from '@citizens/db';

export const dynamic = 'force-dynamic';

const MAX_COMMENT_BODY = 500;

/** GET /api/concepts/:id/comments — the concept's thread, author-hydrated. */
export const GET = handler(async (_req, ctx, params) => {
  const concept = await ctx.store.concepts.getById(params.id!);
  if (!concept) throw new ApiError(404, 'concept_not_found', 'Unknown concept.');
  const comments = await ctx.store.conceptComments.listForConcept(params.id!);
  const authors = new Map<string, WearUser>();
  await Promise.all(
    [...new Set(comments.map((c) => c.authorId))].map(async (id) => {
      const u = await ctx.store.users.getById(id);
      if (u) authors.set(id, u);
    }),
  );
  return json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentCommentId: c.parentCommentId,
      author: authors.has(c.authorId) ? toUserDto(authors.get(c.authorId)!) : null,
    })),
  });
});

/**
 * POST /api/concepts/:id/comments — add a comment (or threaded reply).
 * Any citizen may comment (§6.1 base tier); the DB trigger notifies the
 * creator (and the parent author on replies).
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const text = bodyString(body, 'body').slice(0, MAX_COMMENT_BODY);
  if (!text) throw new ApiError(422, 'empty_comment', 'Comment body must not be empty.');
  const parent = bodyString(body, 'parentCommentId') || null;
  const comment = await ctx.store.conceptComments.create({
    conceptId: params.id!,
    authorId: userId,
    body: text,
    parentCommentId: parent,
  });
  return json(comment, 201);
});
