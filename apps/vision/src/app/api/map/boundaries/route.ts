import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { boundaryToFeature } from "@/lib/map/geo";
import type { GeoBoundary, CoverageLevel } from "@/types/db";

/**
 * GET /api/map/boundaries?org_id=UUID
 * Returns active boundary polygons as a GeoJSON FeatureCollection
 * with coverage metadata for map rendering.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Fetch active boundaries
  const { data: boundaries, error: bErr } = await supabase
    .from("geo_boundaries")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name");

  if (bErr) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Fetch coverage from materialized view
  const { data: coverage } = await supabase
    .from("mv_boundary_activity_coverage")
    .select("*")
    .eq("org_id", orgId);

  const coverageMap = new Map<string, CoverageLevel>();
  if (coverage) {
    for (const c of coverage) {
      coverageMap.set(c.boundary_id, c.coverage_level as CoverageLevel);
    }
  }

  // Build GeoJSON FeatureCollection
  const features = (boundaries ?? []).map((b: GeoBoundary) =>
    boundaryToFeature(b, coverageMap.get(b.id))
  );

  return NextResponse.json({
    type: "FeatureCollection",
    features,
  });
}
