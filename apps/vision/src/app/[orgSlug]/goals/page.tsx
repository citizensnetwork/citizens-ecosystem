import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { GoalList } from "@/components/goals/GoalList";
import { GoalFilters } from "@/components/goals/GoalFilters";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

interface GoalsPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function GoalsPage({
  params,
  searchParams,
}: GoalsPageProps) {
  const { orgSlug } = await params;
  const filters = await searchParams;
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

  // Fetch visions for filter dropdown
  const { data: visions } = await supabase
    .from("vision_statements")
    .select("*")
    .eq("org_id", org.id)
    .eq("active", true)
    .order("title");

  // Build goals query
  let query = supabase
    .from("goals")
    .select("*, vision_statements(title)", { count: "exact" })
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.vision_id) query = query.eq("vision_id", filters.vision_id);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: goals, count } = await query;

  // Compute alignment scores for displayed goals
  const goalScores: Record<string, number> = {};
  if (goals && goals.length > 0) {
    const scorePromises = goals.map(async (goal) => {
      const { data } = await supabase.rpc("compute_alignment_score", {
        p_goal_id: goal.id,
      });
      return { id: goal.id, score: data?.score ?? 0 };
    });
    const scores = await Promise.all(scorePromises);
    for (const s of scores) goalScores[s.id] = s.score;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Goals</h1>
        <Link
          href={`/${orgSlug}/goals/new`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
        >
          New Goal
        </Link>
      </div>

      <Suspense fallback={<LoadingSkeleton className="h-10 w-full" />}>
        <GoalFilters orgSlug={orgSlug} visions={visions ?? []} />
      </Suspense>

      <GoalList
        goals={goals ?? []}
        orgSlug={orgSlug}
        page={page}
        totalPages={Math.ceil((count ?? 0) / ITEMS_PER_PAGE)}
        goalScores={goalScores}
      />
    </div>
  );
}
