// /c/[slug]/dashboard/planning/page.tsx

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import PlanningDashboardClient from "@/components/contributor/dashboard/PlanningDashboardClient";

export const dynamic = "force-dynamic";

export default async function PlanningDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/planning`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const [tasksResult, ideasResult] = await Promise.all([
    supabase
      .from("planning_tasks")
      .select("id, title, description, status, due_date, visible_to_team, completed_at, sort_order, created_at")
      .eq("contributor_id", contributor.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("planning_ideas")
      .select("id, title, description, tags, visible_to_team, created_at")
      .eq("contributor_id", contributor.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <PlanningDashboardClient
      slug={slug}
      tasks={tasksResult.data ?? []}
      ideas={ideasResult.data ?? []}
    />
  );
}
