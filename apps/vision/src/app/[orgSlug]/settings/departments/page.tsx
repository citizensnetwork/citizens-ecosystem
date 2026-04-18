import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgSettingsBundle } from "@/lib/queries/orgs";
import { DepartmentsSettingsClient } from "@/components/org/DepartmentsSettingsClient";

/**
 * Phase 14b: converted from client to server component.
 * See members/page.tsx for the rationale.
 */
export default async function DepartmentsSettingsPage({
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
      <h1 className="text-2xl font-semibold text-text-primary">Departments</h1>
      <DepartmentsSettingsClient
        departments={bundle.departments}
        orgId={bundle.org.id}
      />
    </div>
  );
}
