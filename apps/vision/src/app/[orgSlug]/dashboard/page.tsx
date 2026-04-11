import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./DashboardClient";
import { AdvisorySummaryCard } from "@/components/advisory/AdvisorySummaryCard";

interface DashboardPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    redirect("/");
  }

  const [departmentsResult, infoResult, warningResult, criticalResult] = await Promise.all([
    supabase
      .from("departments")
      .select("*")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "info"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "warning"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "critical"),
  ]);

  const advisorySummary = {
    info: infoResult.count ?? 0,
    warning: warningResult.count ?? 0,
    critical: criticalResult.count ?? 0,
  };

  return (
    <>
      <DashboardClient
        orgId={org.id}
        orgName={org.name}
        departments={departmentsResult.data ?? []}
      />
      <div className="mt-6">
        <AdvisorySummaryCard summary={advisorySummary} orgSlug={orgSlug} />
      </div>
    </>
  );
}
