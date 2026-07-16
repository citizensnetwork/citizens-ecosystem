import { handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandApplicationDto } from '@/lib/api/serializers';
import { bodyBoolean, bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/** Pull a flat string map out of `body.socials` (unknown keys are UI-defined). */
function bodySocials(body: unknown): Record<string, string> {
  const socials: Record<string, string> = {};
  if (body && typeof body === 'object' && 'socials' in body) {
    const raw = (body as Record<string, unknown>).socials;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) socials[key] = value.trim();
      }
    }
  }
  return socials;
}

/**
 * GET /api/brand-applications — the caller's own Become-a-Brand panel state:
 * the derived §6.1 eligibility (posted/claimed/reports + thresholds) and
 * their LATEST application (any status, or null). Fetched lazily when the
 * Settings screen opens — deliberately NOT part of `/api/me` so the app-boot
 * hydrate stays lean. (The admin queue lives under /api/admin/….)
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const [eligibility, application] = await Promise.all([
    ctx.store.brandApplications.eligibility(userId, userId),
    ctx.store.brandApplications.getOwnLatest(userId),
  ]);
  return json({
    eligibility,
    application: application ? toBrandApplicationDto(application) : null,
  });
});

/**
 * POST /api/brand-applications — submit the Become-a-Brand application
 * (§6.1 form: Brand Name*, bio, socials, support email*, contact number*,
 * delivery options*, and the three agreements). The store enforces the whole
 * ratified gate — field validity (422s), all agreements, one open application
 * per user (409 `application_pending`), and eligibility (403 `not_eligible`)
 * — with the mig-162 RLS `WITH CHECK` as the backstop. Applications are
 * IMMUTABLE once submitted; a rejection allows an immediate re-apply.
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const application = await ctx.store.brandApplications.submit(userId, {
    brandName: bodyString(body, 'brandName'),
    bio: bodyString(body, 'bio') || null,
    socials: bodySocials(body),
    supportEmail: bodyString(body, 'supportEmail'),
    contactNumber: bodyString(body, 'contactNumber'),
    deliveryOptions: bodyString(body, 'deliveryOptions'),
    agreeTerms: bodyBoolean(body, 'agreeTerms') ?? false,
    agreeConduct: bodyBoolean(body, 'agreeConduct') ?? false,
    agreeFees: bodyBoolean(body, 'agreeFees') ?? false,
  });
  return json({ application: toBrandApplicationDto(application) }, 201);
});
