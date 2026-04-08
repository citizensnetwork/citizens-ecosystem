import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createActivitySchema } from "@/lib/schemas/activity";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";

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

  // Build query
  let query = supabase
    .from("activities")
    .select("*, activity_tags(tag)", { count: "exact" })
    .eq("org_id", orgId)
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

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = ITEMS_PER_PAGE;
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id query parameter is required" },
      { status: 400 }
    );
  }

  const parsed = createActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { tags, ...activityData } = parsed.data;

  // Insert activity
  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .insert({
      ...activityData,
      org_id: orgId,
      created_by: user.id,
      source_type: "manual",
    })
    .select()
    .single();

  if (activityError) {
    return NextResponse.json(
      { error: activityError.message },
      { status: 500 }
    );
  }

  // Insert tags if provided
  if (tags && tags.length > 0) {
    const tagRows = tags.map((tag) => ({
      activity_id: activity.id,
      tag,
    }));

    const { error: tagError } = await supabase
      .from("activity_tags")
      .insert(tagRows);

    if (tagError) {
      // Activity created but tags failed — log but don't fail
      console.error("Failed to insert activity tags:", tagError.message);
    }
  }

  // Return activity with tags
  const { data: result } = await supabase
    .from("activities")
    .select("*, activity_tags(tag)")
    .eq("id", activity.id)
    .single();

  return NextResponse.json({ data: result }, { status: 201 });
}
