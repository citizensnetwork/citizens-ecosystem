import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandApplicationDto, toBrandDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';
import { WearStoreError } from '@citizens/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/brand-applications/:id — the ADMIN decision.
 *
 * `{ decision: 'approved', slug, reviewNote? }` — APPROVE = MINT: creates the
 * applicant's brand born-verified through the EXISTING mig-160 admin path
 * (`BrandRepo.create` → `brands_admin_insert` RLS + the mig-157 verified
 * column guard, which admits admins), then stamps the application with the
 * minted brand. If the brand insert succeeded but the stamp failed on a
 * previous attempt, retrying converges: a `slug_taken` collision that already
 * belongs to THIS applicant is reused rather than refused.
 *
 * `{ decision: 'rejected', reviewNote? }` — records the decision; the
 * applicant may re-apply immediately (ratified) as a NEW application.
 *
 * Either way the mig-162 trigger notifies the applicant (institutional voice)
 * and the decided row becomes immutable for everyone.
 */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  // Explicit admin gate BEFORE any write — in prod RLS would stop a non-admin
  // mint anyway, but the memory store trusts its caller (mig-160 route
  // precedent), and we never want a brand minted ahead of a forbidden review.
  if ((await ctx.store.roles.getOwn(userId)) !== 'admin') {
    throw new ApiError(403, 'admin_only', 'Application decisions are admin-only.');
  }
  const body = await readJsonBody(req);
  const decision = bodyString(body, 'decision');
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new ApiError(422, 'invalid_decision', 'decision must be approved or rejected.');
  }
  const reviewNote = bodyString(body, 'reviewNote') || null;

  const application = await ctx.store.brandApplications.getById(params.id!, userId);
  if (!application) {
    throw new ApiError(404, 'application_not_found', 'Unknown application.');
  }
  if (application.status !== 'pending') {
    throw new ApiError(409, 'application_not_open', 'This application was already decided.');
  }

  if (decision === 'rejected') {
    const reviewed = await ctx.store.brandApplications.review(params.id!, userId, 'rejected', {
      reviewNote,
    });
    return json({ application: toBrandApplicationDto(reviewed) });
  }

  const slug = bodyString(body, 'slug').toLowerCase();
  if (!slug) {
    throw new ApiError(422, 'invalid_slug', 'A brand slug is required to approve.');
  }
  let brand;
  try {
    brand = await ctx.store.brands.create({
      ownerId: application.applicantId,
      slug,
      name: application.brandName,
      verified: true,
    });
  } catch (error) {
    // Retry convergence: if a prior approve minted the brand but crashed
    // before stamping the application, reuse the applicant's own brand.
    if (error instanceof WearStoreError && error.code === 'slug_taken') {
      const existing = await ctx.store.brands.getBySlug(slug);
      if (existing && existing.ownerUserId === application.applicantId) {
        brand = existing;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
  const reviewed = await ctx.store.brandApplications.review(params.id!, userId, 'approved', {
    mintedBrandId: brand.id,
    reviewNote,
  });
  return json({ application: toBrandApplicationDto(reviewed), brand: toBrandDto(brand) });
});
