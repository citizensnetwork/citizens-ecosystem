/**
 * GET /api/admin/contributor-applications
 *
 * Returns all contributor applications (all statuses) for the admin review UI.
 * Admin-only — enforced by requireAdmin guard.
 *
 * The response shape matches what admin.jsx AppCard expects:
 *   { id, name, photo, bio, category, website, location, reason, socials, status, submittedAt }
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileJoin =
  | { email?: string | null; full_name?: string | null; avatar_url?: string | null }
  | { email?: string | null; full_name?: string | null; avatar_url?: string | null }[]
  | null;

export async function GET(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const { data, error } = await supabase
    .from("contributor_applications")
    .select(
      "id, user_id, display_name, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, logo_url, motivation_text, submitted_at, status, profiles:contributor_applications_user_id_fkey(email, full_name, avatar_url)",
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[/api/admin/contributor-applications]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const prof = r.profiles as ProfileJoin;
    const profObj = Array.isArray(prof) ? prof[0] : prof;
    return {
      id: r.id,
      name: r.display_name,
      photo: r.logo_url || profObj?.avatar_url || null,
      bio: r.bio || "",
      category: r.contributor_kind || "",
      website: r.website_url || "",
      location: r.physical_address || "",
      reason: r.motivation_text || "",
      socials: {
        ...(r.instagram_handle ? { instagram: r.instagram_handle } : {}),
        ...(r.facebook_url ? { facebook: r.facebook_url } : {}),
        ...(r.tiktok_handle ? { tiktok: r.tiktok_handle } : {}),
        ...(r.youtube_url ? { youtube: r.youtube_url } : {}),
      },
      status: r.status || "pending",
      submittedAt: r.submitted_at,
      applicantName: profObj?.full_name || r.display_name,
    };
  });

  return NextResponse.json({ data: rows });
}
