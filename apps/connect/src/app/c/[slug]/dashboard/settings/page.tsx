// /c/[slug]/dashboard/settings/page.tsx — Keywords, admin access, broadcasts archive

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import SettingsDashboardClient, {
  type AccessRequestStatus,
} from "@/components/contributor/dashboard/SettingsDashboardClient";

export const dynamic = "force-dynamic";

export default async function SettingsDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/settings`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const isOwner = user.id === contributor.id;

  // Stage A defence-in-depth: when an admin is viewing this page, restrict
  // the visible access-request rows to those granted to THIS admin. RLS
  // already enforces this server-side, but pushing the predicate into the
  // query removes any chance of an admin seeing other admins' grant rows
  // for the same contributor due to a future policy regression.
  const accessRequestsQuery = supabase
    .from("contributor_access_requests")
    .select(
      "id, admin_id, status, expires_at, revoked_at, viewing_started_at, denial_reason, updated_at, admin:profiles!contributor_access_requests_admin_id_fkey(full_name, avatar_url)",
    )
    .eq("contributor_id", contributor.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!isOwner) {
    accessRequestsQuery.eq("admin_id", user.id);
  }

  const [keywordsResult, accessRequestsResult] = await Promise.all([
    supabase
      .from("contributor_keywords")
      .select("id, keyword")
      .eq("contributor_id", contributor.id)
      .order("keyword", { ascending: true }),
    accessRequestsQuery,
  ]);

  type AccessRequestRow = {
    id: string; admin_id: string; status: AccessRequestStatus;
    expires_at: string | null; revoked_at: string | null;
    viewing_started_at: string | null; denial_reason: string | null;
    updated_at: string | null;
    admin: { full_name: string | null; avatar_url: string | null } | null;
  };

  // Determine whether the viewer is an admin (with active grant) or the
  // contributor owner. Owner is read-only on the access list per A48 —
  // only the granting admin may revoke their own session.

  return (
    <SettingsDashboardClient
      slug={slug}
      keywords={keywordsResult.data ?? []}
      accessRequests={(accessRequestsResult.data ?? []) as unknown as AccessRequestRow[]}
      viewerIsOwner={isOwner}
    />
  );
}
