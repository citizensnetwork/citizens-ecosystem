import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

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

  // Fetch real counts
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(
    new Date(today).getTime() - 30 * 86400000
  )
    .toISOString()
    .split("T")[0];

  const [deptResult, memberResult, activityResult, recentResult] =
    await Promise.all([
      supabase
        .from("departments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id),
      supabase
        .from("user_org_roles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id),
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id),
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .gte("date", thirtyDaysAgo)
        .lte("date", today),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {org.name}
        </h1>
        {org.description && (
          <p className="mt-1 text-sm text-text-secondary">
            {org.description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Departments" value={String(deptResult.count ?? 0)} />
        <StatCard label="Members" value={String(memberResult.count ?? 0)} />
        <StatCard
          label="Activities"
          value={String(activityResult.count ?? 0)}
        />
        <StatCard
          label="Last 30 Days"
          value={String(recentResult.count ?? 0)}
        />
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-text-primary">
          Organisation Overview
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          View detailed metrics, trends, and department comparisons on the{" "}
          <Link
            href={`/${orgSlug}/dashboard`}
            className="text-accent hover:underline"
          >
            Dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
