// /admin/contributors — list of pending Contributor applications for
// the admin to review. Only accessible to role='admin'.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ContributorReviewCard,
  type PendingApplication,
} from "@/components/admin/ContributorReviewCard";

export const dynamic = "force-dynamic";

export default async function AdminContributorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");

  // Fetch pending applications joined with the applicant's email and
  // display name so the reviewer has everything in one card.
  const { data: rows, error } = await supabase
    .from("contributor_applications")
    .select(
      "id, user_id, display_name, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, logo_url, motivation_text, submitted_at, profiles:contributor_applications_user_id_fkey(email, full_name)",
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  if (error) {
    console.error("[admin/contributors]", error);
  }

  const applications: PendingApplication[] = (rows ?? []).map((r) => {
    const profile = r.profiles as
      | { email?: string; full_name?: string }
      | { email?: string; full_name?: string }[]
      | null;
    const profObj = Array.isArray(profile) ? profile[0] : profile;
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      display_name: r.display_name as string,
      contributor_kind: (r.contributor_kind as string) ?? null,
      bio: (r.bio as string) ?? null,
      website_url: (r.website_url as string) ?? null,
      instagram_handle: (r.instagram_handle as string) ?? null,
      facebook_url: (r.facebook_url as string) ?? null,
      tiktok_handle: (r.tiktok_handle as string) ?? null,
      youtube_url: (r.youtube_url as string) ?? null,
      physical_address: (r.physical_address as string) ?? null,
      logo_url: (r.logo_url as string) ?? null,
      motivation_text: (r.motivation_text as string) ?? null,
      submitted_at: r.submitted_at as string,
      applicant_email: profObj?.email ?? null,
      applicant_name: profObj?.full_name ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader
        title="Contributor applications"
        subtitle={`${applications.length} pending`}
        fallbackHref="/events"
      />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {applications.length === 0 ? (
          <p className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-black/60">
            Nothing to review right now. New applications will appear here
            and in your inbox.
          </p>
        ) : (
          applications.map((app) => (
            <ContributorReviewCard key={app.id} app={app} />
          ))
        )}
      </main>
    </div>
  );
}
