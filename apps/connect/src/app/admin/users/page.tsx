import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminUserManager from "@/components/admin/AdminUserManager";
import { ContributorReviewCard } from "@/components/admin/ContributorReviewCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchPendingApplications } from "@/lib/contributors/pendingApplications";

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
  // Shared loader (also used by /admin/contributors) keeps the FK
  // alias + row mapping in lockstep across the two admin panes.
  const { applications, error: appsError } =
    await fetchPendingApplications(supabase);
  if (appsError) {
    // Don't silently render "nothing to review" when a real DB/RLS
    // error occurred — that's exactly the failure mode migration 063
    // fixed on the users list. Log + show a visible banner below.
    console.error("[admin/users pending applications]", appsError);
  }

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
