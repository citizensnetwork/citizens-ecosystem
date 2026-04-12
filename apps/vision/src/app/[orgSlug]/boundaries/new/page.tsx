import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BoundaryFormClient } from "@/components/map/BoundaryFormClient";

interface NewBoundaryPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NewBoundaryPage({ params }: NewBoundaryPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  // Verify admin/manager role
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org.id)
    .single();

  if (!membership || !["org_admin", "org_manager"].includes(membership.role)) {
    redirect(`/${orgSlug}/boundaries`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${orgSlug}/boundaries`}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← Boundaries
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-text-primary">New Boundary</h1>
      <BoundaryFormClient orgId={org.id} orgSlug={orgSlug} />
    </div>
  );
}
