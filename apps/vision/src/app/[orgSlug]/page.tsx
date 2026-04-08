import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface OrgPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgOverview({ params }: OrgPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organisations")
    .select("*")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{org.name}</h1>
        {org.description && (
          <p className="mt-1 text-sm text-neutral-500">{org.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Departments" value="--" />
        <StatCard label="Members" value="--" />
        <StatCard label="Active Projects" value="--" />
        <StatCard label="Goals Tracked" value="--" />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-800">
          Organisation Overview
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Dashboard visualisations and activity feed will appear here in Phase 2.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
