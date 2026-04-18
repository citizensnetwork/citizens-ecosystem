import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgSettingsBundle } from "@/lib/queries/orgs";
import { MembersSettingsClient } from "@/components/org/MembersSettingsClient";

/**
 * Phase 14b: converted from client to server component.
 *
 * Previously this page did a three-hop client bootstrap:
 *   1. GET /api/orgs to resolve slug → orgId
 *   2. GET /api/orgs/{id}/members
 *   3. GET /api/orgs/{id}/departments
 * which meant a logged-in user saw a skeleton for ~600ms before any
 * content rendered, and the `currentUserId` was never populated
 * because the `/api/orgs` endpoint does not expose it.
 *
 * Now it's a single server-side bundle query (parallelised in
 * getOrgSettingsBundle). The existing <MemberTable> is re-used via
 * a thin client wrapper that calls router.refresh() after mutations.
 */
export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const bundle = await getOrgSettingsBundle(supabase, user.id, orgSlug);
  if (!bundle) {
    return (
      <p className="text-text-secondary">Organisation not found.</p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Members</h1>
      <MembersSettingsClient
        members={bundle.members}
        departments={bundle.departments}
        orgId={bundle.org.id}
        currentUserId={user.id}
      />
    </div>
  );
}
