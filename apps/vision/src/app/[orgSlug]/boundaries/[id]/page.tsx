import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isValidUUID } from "@/lib/validation";
import { COVERAGE_LEVEL_COLOURS, COVERAGE_LEVEL_LABELS } from "@/lib/constants";
import type { CoverageLevel } from "@/types/db";

interface BoundaryDetailPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function BoundaryDetailPage({ params }: BoundaryDetailPageProps) {
  const { orgSlug, id } = await params;

  if (!isValidUUID(id)) notFound();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: boundary } = await supabase
    .from("geo_boundaries")
    .select("*")
    .eq("id", id)
    .single();

  if (!boundary) notFound();

  // Verify membership
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", boundary.org_id)
    .single();

  if (!membership) redirect("/");

  const isManagerOrAdmin = ["org_admin", "org_manager"].includes(membership.role);

  // Fetch coverage
  const { data: coverage } = await supabase
    .from("mv_boundary_activity_coverage")
    .select("*")
    .eq("boundary_id", id)
    .single();

  const level = (coverage?.coverage_level as CoverageLevel) ?? "gap";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${orgSlug}/boundaries`}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← Boundaries
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold text-text-primary">
            <span
              className="inline-block h-4 w-4 rounded-full"
              style={{ backgroundColor: boundary.colour ?? "#4a90d9" }}
            />
            {boundary.name}
          </h1>
          {boundary.description && (
            <p className="mt-2 text-sm text-text-secondary">{boundary.description}</p>
          )}
        </div>
        {isManagerOrAdmin && (
          <Link
            href={`/${orgSlug}/boundaries/${id}/edit`}
            className="rounded-md bg-surface-alt px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            Edit
          </Link>
        )}
      </div>

      {/* Coverage Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs text-text-secondary">Coverage Level</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: COVERAGE_LEVEL_COLOURS[level] }}
            />
            <span className="text-lg font-semibold text-text-primary">
              {COVERAGE_LEVEL_LABELS[level]}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs text-text-secondary">Activities</div>
          <div className="mt-1 text-lg font-semibold text-text-primary">
            {coverage?.activity_count ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs text-text-secondary">Participant Reach</div>
          <div className="mt-1 text-lg font-semibold text-text-primary">
            {coverage?.participant_reach ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs text-text-secondary">Area</div>
          <div className="mt-1 text-lg font-semibold text-text-primary">
            {boundary.area_km2 != null ? `${boundary.area_km2.toFixed(1)} km²` : "—"}
          </div>
        </div>
      </div>

      {/* Status & Metadata */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            Status:{" "}
            <span className={boundary.active ? "text-green-400" : "text-yellow-400"}>
              {boundary.active ? "Active" : "Inactive"}
            </span>
          </span>
          <span>
            Departments: {coverage?.department_count ?? 0}
          </span>
          <span>
            Created: {new Date(boundary.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* GeoJSON Preview */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium text-text-primary">Geometry</h2>
        <pre className="max-h-48 overflow-auto rounded-md bg-surface-alt p-3 font-mono text-xs text-text-secondary">
          {JSON.stringify(boundary.boundary_geojson, null, 2)}
        </pre>
      </div>
    </div>
  );
}
