// /dashboard — analytics for approved contributors and admins.
//
// Auth gate:
//   - unauthenticated → /login
//   - role='citizen' or pending contributor → /profile (with a hint)
//   - role='contributor' + approved → dashboard
//   - role='admin' → dashboard (with community-health + trends blocks)
//
// The heavy lifting lives in /api/dashboard/stats; this page only
// performs the role gate and renders the shell + client component.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import OrgDashboard from "@/components/admin/OrgDashboard";
import { isAdmin as profileIsAdmin, isApprovedContributor } from "@/lib/profiles/capabilities";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · Citizens Connect",
  description: "Your contributor analytics.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, contributor_status")
    .eq("id", user.id)
    .maybeSingle<{ role: string; contributor_status: string | null }>();

  const isAdmin = profileIsAdmin(me);
  const isApprovedContributorUser = isApprovedContributor(me);

  if (!isAdmin && !isApprovedContributorUser) {
    redirect("/profile");
  }

  return (
    <>
      <PageHeader title="Dashboard" fallbackHref="/events" />
      <OrgDashboard />
    </>
  );
}
