// /c/[slug]/dashboard/team/page.tsx

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import TeamDashboardClient from "@/components/contributor/dashboard/TeamDashboardClient";

export const dynamic = "force-dynamic";

export default async function TeamDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/team`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const [membersResult, volunteersResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select(
        "id, member_id, role, status, created_at, member:profiles!team_memberships_member_id_fkey(full_name, avatar_url)"
      )
      .eq("contributor_id", contributor.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("volunteer_applications")
      .select(
        "id, applicant_id, entity_type, entity_id, message, response_message, status, created_at, applicant:profiles!volunteer_applications_applicant_id_fkey(full_name, avatar_url)"
      )
      .eq("contributor_id", contributor.id)
      .in("status", ["pending", "approved", "declined"])
      .order("created_at", { ascending: false }),
  ]);

  type MemberRow = {
    id: string; member_id: string; role: string; status: string; created_at: string;
    member: { full_name: string | null; avatar_url: string | null } | null;
  };
  type VolunteerRow = {
    id: string; applicant_id: string; entity_type: string; entity_id: string;
    message: string | null; response_message: string | null; status: string; created_at: string;
    applicant: { full_name: string | null; avatar_url: string | null } | null;
  };

  return (
    <TeamDashboardClient
      slug={slug}
      members={(membersResult.data ?? []) as unknown as MemberRow[]}
      volunteers={(volunteersResult.data ?? []) as unknown as VolunteerRow[]}
    />
  );
}
