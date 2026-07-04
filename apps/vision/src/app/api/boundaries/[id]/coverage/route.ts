import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  void request;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid boundary ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get boundary to verify org membership
  const { data: boundary } = await supabase
    .from("geo_boundaries")
    .select("org_id")
    .eq("id", id)
    .single();

  if (!boundary) {
    return NextResponse.json({ error: "Boundary not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", boundary.org_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Fetch from materialized view
  const { data: coverage, error } = await supabase
    .from("mv_boundary_activity_coverage")
    .select("*")
    .eq("boundary_id", id)
    .single();

  if (error || !coverage) {
    // Return default coverage if MV not yet refreshed
    return NextResponse.json({
      boundary_id: id,
      org_id: boundary.org_id,
      boundary_name: null,
      activity_count: 0,
      participant_reach: 0,
      department_count: 0,
      coverage_level: "gap",
      min_lng: 0,
      max_lng: 0,
      min_lat: 0,
      max_lat: 0,
    });
  }

  return NextResponse.json(coverage);
}
