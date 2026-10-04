/**
 * GET /api/admin/contributor-applications
 *
 * Returns all contributor applications (all statuses) for the admin review UI.
 * Admin-only — enforced by requireAdmin guard.
 *
 * The response shape matches what admin.jsx AppCard expects:
 *   { id, userId, name, photo, bio, category, kind, website, location,
 *     noFixedLocation, hasPin, reason, socials, contactEmail, covers, status,
 *     submittedAt, reviewedAt, reviewNote, applicantName, previouslyRemovedAt }
 *
 * `previouslyRemovedAt` is set on a PENDING application whose applicant had an
 * earlier listing removed by an admin (admin_actions `contributor_listing_removed`,
 * mig 178): a removal is moderation, so the admin deciding on the re-application
 * should know about it before approving. (Approval itself clears the hide flag.)
 *
 * Everything in a row is the applicant's own, UNTRUSTED text; the UI must render
 * links only when they are http(s).
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileJoin =
  | { email?: string | null; full_name?: string | null; avatar_url?: string | null }
  | { email?: string | null; full_name?: string | null; avatar_url?: string | null }[]
  | null;

const REMOVED_ACTION = "contributor_listing_removed";

/** The latest removal time per applicant, for the applicants who are waiting on a decision. */
async function previousRemovals(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data, error } = await admin
    .from("admin_actions")
    .select("target_id, created_at")
    .eq("action", REMOVED_ACTION)
    .in("target_id", userIds)
    .order("created_at", { ascending: false });
  if (error) {
    // The note is a courtesy: the list must still load without it.
    console.warn("[/api/admin/contributor-applications] removal lookup failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as { target_id: string | null; created_at: string }[]) {
    // Rows are newest first, so the first one seen per target is the latest.
    if (row.target_id && !out.has(row.target_id)) out.set(row.target_id, row.created_at);
  }
  return out;
}

function coverUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => (typeof c === "string" ? c : (c as { url?: unknown } | null)?.url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

export async function GET(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  // The applicant embed includes `email`, a private profiles column (mig
  // 176). requireAdmin() above is the authorisation; the service-role
  // client only performs this admin-gated read.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contributor_applications")
    .select(
      "id, user_id, display_name, contributor_kind, contributor_category, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, x_handle, linkedin_url, whatsapp_number, contributor_contact_email, no_fixed_location, physical_address, physical_latitude, physical_longitude, logo_url, cover_photo_urls, motivation_text, submitted_at, reviewed_at, rejection_reason, status, profiles:contributor_applications_user_id_fkey(email, full_name, avatar_url)",
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[/api/admin/contributor-applications]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rowsIn = (data ?? []) as unknown as Record<string, unknown>[];
  const removals = await previousRemovals(
    admin,
    rowsIn.filter((r) => r.status === "pending" && typeof r.user_id === "string").map((r) => r.user_id as string),
  );

  const rows = rowsIn.map((r) => {
    const prof = r.profiles as ProfileJoin;
    const profObj = Array.isArray(prof) ? prof[0] : prof;
    return {
      id: r.id,
      userId: r.user_id,
      name: r.display_name,
      photo: r.logo_url || profObj?.avatar_url || null,
      bio: r.bio || "",
      // The map/pin category (one of the 12 Contributor types). This used to
      // read `contributor_kind`, so every card showed the wrong chip.
      category: r.contributor_category || "",
      kind: r.contributor_kind || "",
      website: r.website_url || "",
      location: r.no_fixed_location ? "Online / no fixed location" : r.physical_address || "",
      noFixedLocation: r.no_fixed_location === true,
      hasPin: typeof r.physical_latitude === "number" && typeof r.physical_longitude === "number",
      reason: r.motivation_text || "",
      socials: {
        ...(r.instagram_handle ? { instagram: r.instagram_handle } : {}),
        ...(r.facebook_url ? { facebook: r.facebook_url } : {}),
        ...(r.tiktok_handle ? { tiktok: r.tiktok_handle } : {}),
        ...(r.youtube_url ? { youtube: r.youtube_url } : {}),
        ...(r.x_handle ? { x: r.x_handle } : {}),
        ...(r.linkedin_url ? { linkedin: r.linkedin_url } : {}),
        ...(r.whatsapp_number ? { whatsapp: r.whatsapp_number } : {}),
      },
      contactEmail: r.contributor_contact_email || "",
      covers: coverUrls(r.cover_photo_urls),
      status: r.status || "pending",
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at || null,
      // What the applicant was told when it was rejected (AppCard's "Admin note").
      reviewNote: r.rejection_reason || "",
      applicantName: profObj?.full_name || r.display_name,
      previouslyRemovedAt:
        r.status === "pending" && typeof r.user_id === "string" ? (removals.get(r.user_id) ?? null) : null,
    };
  });

  return NextResponse.json({ data: rows });
}
