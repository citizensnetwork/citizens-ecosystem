import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';
import { CONCEPT_STAGES, type ConceptStage } from '@citizens/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/concepts/:id/status — the claiming brand advances the lifecycle
 * (forward-only, above 'claimed'; skips allowed). Mirrors the
 * `wear.advance_concept_status` RPC; 'released' auto-publishes the
 * Completed-Concepts post server-side.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const statusRaw = bodyString(body, 'status');
  if (!(CONCEPT_STAGES as readonly string[]).includes(statusRaw)) {
    throw new ApiError(422, 'invalid_stage', `Unknown stage ${statusRaw || '(missing)'}.`);
  }
  const entry = await ctx.store.conceptStatusLog.advance(
    params.id!,
    userId,
    statusRaw as ConceptStage,
    bodyString(body, 'note') || null,
  );
  return json(
    {
      entry: { id: entry.id, status: entry.status, note: entry.note, createdAt: entry.createdAt },
      statusLog: (await ctx.store.conceptStatusLog.listForConcept(params.id!)).map((e) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        createdAt: e.createdAt,
      })),
    },
    201,
  );
});
