// /admin/applications — Canonical contributor application review inbox.
//
// Per MASTER_DIRECTION FEAT-01, this is the named route for pending
// contributor sign-ups. The legacy /admin/contributors path redirects
// here so existing emails / deep links continue to work.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContributorReviewCard } from "@/components/admin/ContributorReviewCard";
import { fetchPendingApplications } from "@/lib/contributors/pendingApplications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications — Admin · Citizens Connect" };

export default async function AdminApplicationsPage() {
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

  const { applications, error } = await fetchPendingApplications(supabase);
  if (error) {
    console.error("[admin/applications]", error);
  }

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader
        title="Contributor applications"
        subtitle={`${applications.length} pending`}
        fallbackHref="/admin"
      />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn&apos;t load applications: {error.message}
          </p>
        ) : null}
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
