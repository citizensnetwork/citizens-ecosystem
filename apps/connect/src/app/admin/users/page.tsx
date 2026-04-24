import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminUserManager from "@/components/admin/AdminUserManager";
import {
  ContributorReviewCard,
  type PendingApplication,
} from "@/components/admin/ContributorReviewCard";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — Admin · Citizens Connect" };

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/events");

  let query = supabase
    .from("profiles")
    .select(
      "id, email, full_name, avatar_url, role, contributor_kind, contributor_status, contributor_slug, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("contributor_status", status);
  }
  const { data, count } = await query;

  // Pending Contributor applications — surfaced directly on the users
  // page as a secondary elevation pipeline next to admin elevations.
  const { data: appsRows, error: appsError } = await supabase
    .from("contributor_applications")
    .select(
      "id, user_id, display_name, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, logo_url, motivation_text, submitted_at, profiles:contributor_applications_user_id_fkey(email, full_name)",
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });
  if (appsError) {
    // Don't silently render "nothing to review" when a real DB/RLS
    // error occurred — that's exactly the failure mode migration 063
    // fixed on the users list. Log + show a visible banner below.
    console.error("[admin/users pending applications]", appsError);
  }

  const applications: PendingApplication[] = (appsRows ?? []).map((r) => {
    const prof = r.profiles as
      | { email?: string; full_name?: string }
      | { email?: string; full_name?: string }[]
      | null;
    const profObj = Array.isArray(prof) ? prof[0] : prof;
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
    <>
      <PageHeader title="Users" fallbackHref="/events" />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="mb-5 text-sm text-black/60">
          Manage roles and contributor status. All changes are logged to the
          admin audit trail.
        </p>
        <AdminUserManager
          viewerId={user.id}
          initialRows={data ?? []}
          initialMeta={{ page: 1, pageSize: PAGE_SIZE, total: count ?? 0 }}
          initialStatus={status ?? null}
        />

        {/* Contributor applications — secondary elevation pipeline. */}
        <section
          id="contributor-applications"
          className="mt-10 rounded-2xl border border-black/10 bg-white"
        >
          <header className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-black">
              Contributor applications{" "}
              <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">
                {applications.length}
              </span>
            </h2>
            <p className="text-xs text-black/50">
              Approve or reject pending Contributor requests. Applicants are
              notified on decision.
            </p>
          </header>
          <div className="space-y-4 px-4 pb-5">
            {appsError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                Failed to load pending applications. Check server logs.
              </p>
            ) : applications.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/10 bg-white px-4 py-6 text-center text-sm text-black/50">
                Nothing to review right now. New applications will appear here
                and in your inbox.
              </p>
            ) : (
              applications.map((app) => (
                <ContributorReviewCard key={app.id} app={app} />
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
