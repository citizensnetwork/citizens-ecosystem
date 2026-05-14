// Shared loader for pending Contributor applications.
//
// Used by both `/admin/applications` (the dedicated review inbox) and
// `/admin/users` (which surfaces pending apps as a secondary elevation
// pipeline next to the admin users list). Centralised so the FK alias
// (`profiles:contributor_applications_user_id_fkey`) and the
// row→`PendingApplication` mapping stay in lockstep — the prior copies
// were starting to drift between the two admin panes.
//
// Returns `{ applications, error }` so callers can render a visible
// error banner when the fetch itself fails (the `/admin/users` flow
// added in Batch P does this; `/admin/applications` just logs).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingApplication } from "@/components/admin/ContributorReviewCard";

const SELECT_COLUMNS =
  "id, user_id, display_name, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, logo_url, motivation_text, submitted_at, profiles:contributor_applications_user_id_fkey(email, full_name)";

type ProfileSummary = { email?: string; full_name?: string };
type ProfileJoin = ProfileSummary | ProfileSummary[] | null;

type RawApplicationRow = {
  id: string;
  user_id: string;
  display_name: string;
  contributor_kind?: string | null;
  bio?: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  facebook_url?: string | null;
  tiktok_handle?: string | null;
  youtube_url?: string | null;
  physical_address?: string | null;
  logo_url?: string | null;
  motivation_text?: string | null;
  submitted_at: string;
  profiles?: ProfileJoin;
};

export type FetchPendingApplicationsResult = {
  applications: PendingApplication[];
  error: { message: string } | null;
};

export async function fetchPendingApplications(
  supabase: SupabaseClient,
): Promise<FetchPendingApplicationsResult> {
  const { data, error } = await supabase
    .from("contributor_applications")
    .select(SELECT_COLUMNS)
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  if (error) {
    return {
      applications: [],
      error: { message: error.message },
    };
  }

  const rows = (data ?? []) as RawApplicationRow[];
  const applications: PendingApplication[] = rows.map((r) => {
    const prof = r.profiles ?? null;
    const profObj = Array.isArray(prof) ? prof[0] : prof;
    return {
      id: r.id,
      user_id: r.user_id,
      display_name: r.display_name,
      contributor_kind: r.contributor_kind ?? null,
      bio: r.bio ?? null,
      website_url: r.website_url ?? null,
      instagram_handle: r.instagram_handle ?? null,
      facebook_url: r.facebook_url ?? null,
      tiktok_handle: r.tiktok_handle ?? null,
      youtube_url: r.youtube_url ?? null,
      physical_address: r.physical_address ?? null,
      logo_url: r.logo_url ?? null,
      motivation_text: r.motivation_text ?? null,
      submitted_at: r.submitted_at,
      applicant_email: profObj?.email ?? null,
      applicant_name: profObj?.full_name ?? null,
    };
  });

  return { applications, error: null };
}
