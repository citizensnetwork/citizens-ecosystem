import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ITEMS_PER_PAGE, COVERAGE_LEVEL_COLOURS, COVERAGE_LEVEL_LABELS } from "@/lib/constants";
import type { CoverageLevel } from "@/types/db";

interface BoundariesPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function BoundariesPage({
  params,
  searchParams,
}: BoundariesPageProps) {
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

  // Check membership & role
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org.id)
    .single();

  if (!membership) redirect("/");

  const isManagerOrAdmin = ["org_admin", "org_manager"].includes(membership.role);

  // Build query
  let query = supabase
    .from("geo_boundaries")
    .select("*", { count: "exact" })
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  if (filters.active === "false") {
    query = query.eq("active", false);
  } else if (filters.active !== "all") {
    query = query.eq("active", true);
  }

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: boundaries, count } = await query;

  // Fetch coverage from MV
  const { data: coverage } = await supabase
    .from("mv_boundary_activity_coverage")
    .select("boundary_id, coverage_level, activity_count, participant_reach")
    .eq("org_id", org.id);

  const coverageMap = new Map<string, { level: CoverageLevel; activityCount: number; participantReach: number }>();
  if (coverage) {
    for (const c of coverage) {
      coverageMap.set(c.boundary_id, {
        level: c.coverage_level as CoverageLevel,
        activityCount: c.activity_count,
        participantReach: c.participant_reach,
      });
    }
  }

  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Boundaries</h1>
        {isManagerOrAdmin && (
          <Link
            href={`/${orgSlug}/boundaries/new`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
          >
            New Boundary
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <form className="flex gap-3">
          <input
            name="search"
            type="text"
            defaultValue={filters.search ?? ""}
            placeholder="Search boundaries…"
            className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none"
          />
          <select
            name="active"
            defaultValue={filters.active ?? "true"}
            className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-surface-alt px-4 py-1.5 text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Boundary list */}
      {!boundaries || boundaries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-text-secondary">
          <p className="text-lg">No boundaries found</p>
          <p className="mt-1 text-sm">
            {isManagerOrAdmin
              ? "Create your first boundary to start tracking coverage."
              : "No service area boundaries have been created yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boundaries.map((boundary) => {
            const cov = coverageMap.get(boundary.id);
            const level = cov?.level ?? "gap";
            return (
              <Link
                key={boundary.id}
                href={`/${orgSlug}/boundaries/${boundary.id}`}
                className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/50"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-text-primary group-hover:text-accent">
                      {boundary.name}
                    </h3>
                    {boundary.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {boundary.description}
                      </p>
                    )}
                  </div>
                  <div
                    className="ml-2 h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: boundary.colour ?? "#4a90d9" }}
                  />
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: COVERAGE_LEVEL_COLOURS[level] }}
                    />
                    {COVERAGE_LEVEL_LABELS[level]}
                  </span>
                  <span>{cov?.activityCount ?? 0} activities</span>
                  {boundary.area_km2 != null && (
                    <span>{boundary.area_km2.toFixed(1)} km²</span>
                  )}
                </div>

                {!boundary.active && (
                  <span className="mt-2 inline-block rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary">
                    Inactive
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/${orgSlug}/boundaries?page=${page - 1}${filters.search ? `&search=${filters.search}` : ""}${filters.active ? `&active=${filters.active}` : ""}`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
            >
              Previous
            </Link>
          )}
          <span className="flex items-center px-2 text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/${orgSlug}/boundaries?page=${page + 1}${filters.search ? `&search=${filters.search}` : ""}${filters.active ? `&active=${filters.active}` : ""}`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
