import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgBySlug, getUserMembership } from "@/lib/queries/orgs";
import { HierarchySettingsClient } from "@/components/org/HierarchySettingsClient";
import type { Organisation } from "@/types/db";

/**
 * Phase 19: Hierarchy admin UI.
 *
 * Lets an org_admin re-parent the organisation by picking a new
 * parent from the orgs they can read. Cycle prevention is enforced
 * by the DB trigger introduced in migration 013.
 */
export default async function HierarchySettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const org = await getOrgBySlug(supabase, orgSlug);
  if (!org) redirect("/");

  const membership = await getUserMembership(supabase, user.id, org.id);
  if (!membership) redirect("/");

  const isAdmin = membership.role === "org_admin";

  const { data: visible } = await supabase
    .from("organisations")
    .select("id, name, slug, parent_org_id")
    .order("name");

  const visibleOrgs = (visible ?? []) as Pick<
    Organisation,
    "id" | "name" | "slug" | "parent_org_id"
  >[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Hierarchy</h1>
      <p className="text-sm text-text-secondary">
        Place this organisation in the parent/child tree. Cycle protection
        is enforced server-side.
      </p>
      <HierarchySettingsClient
        org={org}
        candidates={visibleOrgs}
        canEdit={isAdmin}
      />
    </div>
  );
}
