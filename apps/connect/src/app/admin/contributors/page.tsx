// /admin/contributors — list of pending Contributor applications for
// the admin to review. Only accessible to role='admin'.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContributorReviewCard } from "@/components/admin/ContributorReviewCard";
import { fetchPendingApplications } from "@/lib/contributors/pendingApplications";

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
    .maybeSingle();
  if (me?.role !== "admin") redirect("/events");

  // Shared loader (also used by /admin/users). Keeps the FK alias +
  // row mapping consistent across the two admin panes.
  const { applications, error } = await fetchPendingApplications(supabase);
  if (error) {
    console.error("[admin/contributors]", error);
  }

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
