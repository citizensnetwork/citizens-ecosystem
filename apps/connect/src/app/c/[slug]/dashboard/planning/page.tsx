// /c/[slug]/dashboard/planning/page.tsx

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import PlanningDashboardClient, {
  type PlanningTaskRow,
  type PlanningIdeaRow,
  type PlanningPlaceRow,
} from "@/components/contributor/dashboard/PlanningDashboardClient";

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

  // Fetch tasks, ideas, and the contributor's own places (for the multi-place
  // picker on each card). Places list is small enough to ship in one shot.
  const [tasksResult, ideasResult, placesResult] = await Promise.all([
    supabase
      .from("planning_tasks")
      .select(
        "id, title, description, status, due_date, visible_to_team, completed_at, " +
          "sort_order, checklist, links, assigned_place_ids, linked_place_id, " +
          "linked_event_id, created_at"
      )
      .eq("contributor_id", contributor.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("planning_ideas")
      .select(
        "id, title, description, tags, visible_to_team, checklist, links, " +
          "assigned_place_ids, linked_place_id, linked_event_id, created_at"
      )
      .eq("contributor_id", contributor.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("places")
      .select("id, name")
      .eq("created_by", contributor.id)
      .order("name", { ascending: true }),
  ]);

  return (
    <PlanningDashboardClient
      slug={slug}
      tasks={(tasksResult.data ?? []) as unknown as PlanningTaskRow[]}
      ideas={(ideasResult.data ?? []) as unknown as PlanningIdeaRow[]}
      places={(placesResult.data ?? []) as unknown as PlanningPlaceRow[]}
    />
  );
}
