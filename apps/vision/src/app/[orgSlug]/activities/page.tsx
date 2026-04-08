import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ActivityList } from "@/components/activities/ActivityList";
import { ActivityFilters } from "@/components/activities/ActivityFilters";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

interface ActivitiesPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ActivitiesPage({
  params,
  searchParams,
}: ActivitiesPageProps) {
  const { orgSlug } = await params;
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get org
  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  // Get departments for filter
  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .order("name");

  // Build activity query
  let query = supabase
    .from("activities")
    .select("*, activity_tags(tag), departments(name)", { count: "exact" })
    .eq("org_id", org.id)
    .order("date", { ascending: false });

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.department_id)
    query = query.eq("department_id", filters.department_id);
  if (filters.date_from) query = query.gte("date", filters.date_from);
  if (filters.date_to) query = query.lte("date", filters.date_to);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: activities, count } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Activities</h1>
        <Link
          href={`/${orgSlug}/activities/new`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
        >
          New Activity
        </Link>
      </div>

      <Suspense
        fallback={<LoadingSkeleton className="h-10 w-full" />}
      >
        <ActivityFilters orgSlug={orgSlug} departments={departments ?? []} />
      </Suspense>

      <ActivityList
        activities={activities ?? []}
        orgSlug={orgSlug}
        pagination={{
          page,
          totalPages: Math.ceil((count ?? 0) / ITEMS_PER_PAGE),
          total: count ?? 0,
        }}
      />
    </div>
  );
}
