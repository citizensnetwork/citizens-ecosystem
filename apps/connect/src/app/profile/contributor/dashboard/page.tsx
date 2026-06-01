import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ManageEventsView from "@/components/events/ManageEventsView";
import BillPreviewCard from "@/components/contributor/BillPreviewCard";
import { CONTRIBUTOR_ROLES } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Contributions — Citizens Connect",
};

export default async function ContributorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, contributor_status, contributor_slug")
    .eq("id", user.id)
    .maybeSingle();

  // The dashboard is an approved-contributor surface. Citizens and
  // not-yet-approved contributors get a friendly redirect rather than a
  // 403 — we'd rather guide them than slam a door.
  if (
    !profile ||
    !CONTRIBUTOR_ROLES.includes(profile.role) ||
    profile.contributor_status !== "approved"
  ) {
    redirect("/profile");
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel w-full max-w-4xl px-6 py-8 sm:px-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">My contributions</h1>
            <p className="mt-1 text-sm text-black/55">
              Events you&apos;ve published, grouped by lifecycle stage.
            </p>
          </div>
          {profile.contributor_slug && (
            <Link
              href={`/c/${encodeURIComponent(profile.contributor_slug)}`}
              className="hidden shrink-0 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 sm:inline-block"
            >
              View public page →
            </Link>
          )}
        </div>
        <ManageEventsView isVendor groupByLifecycle />
        <BillPreviewCard />
      </div>
    </div>
  );
}
