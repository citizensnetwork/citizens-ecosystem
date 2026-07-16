import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandApplicationDto, toUserDto } from '@/lib/api/serializers';
import type { BrandEligibility, WearUser } from '@citizens/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/brand-applications — the pending Become-a-Brand queue
 * (oldest first), each card hydrated with the applicant's identity and their
 * LIVE §6.1 eligibility snapshot (the SECDEF fn admits moderators, so the
 * bench sees the numbers behind every application). Moderators may view;
 * the decision itself is admin-only (the per-item POST).
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const role = await ctx.store.roles.getOwn(userId);
  if (!role) throw new ApiError(403, 'forbidden', 'Moderators only.');

  const pending = await ctx.store.brandApplications.listPending(userId);
  const applicants = new Map<string, WearUser>();
  const gates = new Map<string, BrandEligibility>();
  await Promise.all(
    pending.map(async (a) => {
      const [user, gate] = await Promise.all([
        ctx.store.users.getById(a.applicantId),
        ctx.store.brandApplications.eligibility(a.applicantId, userId),
      ]);
      if (user) applicants.set(a.applicantId, user);
      gates.set(a.applicantId, gate);
    }),
  );
  return json({
    role,
    applications: pending.map((a) => ({
      ...toBrandApplicationDto(a),
      applicant: applicants.has(a.applicantId)
        ? toUserDto(applicants.get(a.applicantId)!)
        : null,
      eligibility: gates.get(a.applicantId) ?? null,
    })),
  });
});
