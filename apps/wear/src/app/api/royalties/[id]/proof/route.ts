import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/**
 * POST /api/royalties/:id/proof — the claiming BRAND submits proof of the
 * 100th sale (milestone only; re-submission allowed while open). The
 * obligation then awaits the creator's close-out confirmation.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const proofUrl = safeUrl(bodyString(body, 'proofUrl'));
  if (!proofUrl) throw new ApiError(422, 'proof_url_required', 'Provide a valid https proof url.');
  const royalty = await ctx.store.royalties.submitProof(
    params.id!,
    userId,
    proofUrl,
    bodyString(body, 'note') || null,
  );
  return json({ royalty });
});
