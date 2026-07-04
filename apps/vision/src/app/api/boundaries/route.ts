import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { isValidBoundaryGeoJSON, approximateAreaKm2 } from "@/lib/map/geo";
import { requireOrgRole } from "@/lib/supabase/rbac";

const HEX_COLOUR_RE = /^#[0-9a-f]{6}$/i;

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
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const activeOnly = searchParams.get("active") !== "false";

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

  let query = supabase
    .from("geo_boundaries")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (activeOnly) {
    query = query.eq("active", true);
  }

  query = query.range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

  const { data: boundaries, count, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    boundaries: boundaries ?? [],
    total: count ?? 0,
    page,
    per_page: ITEMS_PER_PAGE,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    org_id?: string;
    name?: string;
    description?: string;
    boundary_geojson?: unknown;
    colour?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { org_id, name, description, boundary_geojson, colour } = body;

  if (!org_id || !isValidUUID(org_id)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  if (!isValidBoundaryGeoJSON(boundary_geojson)) {
    return NextResponse.json(
      { error: "Valid GeoJSON Polygon or MultiPolygon is required" },
      { status: 400 }
    );
  }

  // Verify admin/manager role
  const auth = await requireOrgRole(supabase, user.id, org_id, [
    "org_admin",
    "org_manager",
  ]);
  if (!auth.ok) return auth.response;

  const area = approximateAreaKm2(boundary_geojson);

  const validColour = colour && HEX_COLOUR_RE.test(colour) ? colour : "#4a90d9";

  const { data: created, error } = await supabase
    .from("geo_boundaries")
    .insert({
      org_id,
      name: name.trim(),
      description: description?.trim() ?? null,
      boundary_geojson,
      area_km2: area,
      colour: validColour,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json(created, { status: 201 });
}
