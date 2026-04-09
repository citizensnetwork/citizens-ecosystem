import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/map/activities?org_id=UUID
 * Returns activities that have lat/lng coordinates, for map plotting.
 * Supports filters: department_id, type, date_from, date_to, search
 * No pagination — returns all geolocated activities (map needs all points).
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

  // Build query — only activities with coordinates
  let query = supabase
    .from("activities")
    .select(
      "id, title, type, date, latitude, longitude, location_name, participant_count, department_id, departments(name), activity_tags(tag)"
    )
    .eq("org_id", orgId)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("date", { ascending: false });

  // Filters
  const departmentId = searchParams.get("department_id");
  if (departmentId && isValidUUID(departmentId)) {
    query = query.eq("department_id", departmentId);
  }

  const type = searchParams.get("type");
  if (type) {
    query = query.eq("type", type);
  }

  const dateFrom = searchParams.get("date_from");
  if (dateFrom) {
    query = query.gte("date", dateFrom);
  }

  const dateTo = searchParams.get("date_to");
  if (dateTo) {
    query = query.lte("date", dateTo);
  }

  const search = searchParams.get("search");
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  // Limit to 5000 activities for performance
  query = query.limit(5000);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to map-friendly format
  const activities = (data ?? []).map((a: Record<string, unknown>) => {
    const dept = a.departments as { name: string } | null;
    const tags = a.activity_tags as Array<{ tag: string }> | null;
    return {
      id: a.id as string,
      title: a.title as string,
      type: a.type as string,
      date: a.date as string,
      latitude: a.latitude as number,
      longitude: a.longitude as number,
      location_name: a.location_name as string | null,
      participant_count: a.participant_count as number,
      department_id: a.department_id as string | null,
      department_name: dept?.name ?? null,
      tags: tags?.map((t) => t.tag) ?? [],
    };
  });

  return NextResponse.json({ data: activities });
}
