import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ProjectList } from "@/components/projects/ProjectList";
import { ProjectFilters } from "@/components/projects/ProjectFilters";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

interface ProjectsPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProjectsPage({
  params,
  searchParams,
}: ProjectsPageProps) {
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

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .order("name");

  // Build projects query
  let query = supabase
    .from("projects")
    .select("*, departments(name)", { count: "exact" })
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.department_id)
    query = query.eq("department_id", filters.department_id);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: projects, count } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Projects</h1>
        <Link
          href={`/${orgSlug}/projects/new`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
        >
          New Project
        </Link>
      </div>

      <Suspense fallback={<LoadingSkeleton className="h-10 w-full" />}>
        <ProjectFilters orgSlug={orgSlug} departments={departments ?? []} />
      </Suspense>

      <ProjectList
        projects={projects ?? []}
        orgSlug={orgSlug}
        page={page}
        totalPages={Math.ceil((count ?? 0) / ITEMS_PER_PAGE)}
      />
    </div>
  );
}
