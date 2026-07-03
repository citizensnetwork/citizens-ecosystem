import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { isValidBoundaryGeoJSON, approximateAreaKm2 } from "@/lib/map/geo";
import { requireOrgRole } from "@/lib/supabase/rbac";

const HEX_COLOUR_RE = /^#[0-9a-f]{6}$/i;

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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

  const { data: boundary, error } = await supabase
    .from("geo_boundaries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !boundary) {
    return NextResponse.json({ error: "Boundary not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", boundary.org_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  return NextResponse.json(boundary);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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

  // Get existing boundary
  const { data: existing } = await supabase
    .from("geo_boundaries")
    .select("org_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Boundary not found" }, { status: 404 });
  }

  // Verify admin/manager
  const auth = await requireOrgRole(supabase, user.id, existing.org_id, [
    "org_admin",
    "org_manager",
  ]);
  if (!auth.ok) return auth.response;

  let body: {
    name?: string;
    description?: string;
    boundary_geojson?: unknown;
    colour?: string;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Name must be a non-empty string" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updates.description = typeof body.description === "string" ? body.description.trim() : null;
  }

  if (body.boundary_geojson !== undefined) {
    if (!isValidBoundaryGeoJSON(body.boundary_geojson)) {
      return NextResponse.json(
        { error: "Valid GeoJSON Polygon or MultiPolygon is required" },
        { status: 400 }
      );
    }
    updates.boundary_geojson = body.boundary_geojson;
    updates.area_km2 = approximateAreaKm2(body.boundary_geojson);
  }

  if (body.colour !== undefined) {
    if (typeof body.colour === "string" && HEX_COLOUR_RE.test(body.colour)) {
      updates.colour = body.colour;
    }
  }

  if (body.active !== undefined) {
    updates.active = body.active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("geo_boundaries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

  // Get existing boundary
  const { data: existing } = await supabase
    .from("geo_boundaries")
    .select("org_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Boundary not found" }, { status: 404 });
  }

  // Verify admin
  const auth = await requireOrgRole(supabase, user.id, existing.org_id, [
    "org_admin",
  ]);
  if (!auth.ok) return auth.response;

  const { error } = await supabase
    .from("geo_boundaries")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
