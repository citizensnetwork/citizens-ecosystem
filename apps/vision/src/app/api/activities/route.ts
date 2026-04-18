import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createActivitySchema } from "@/lib/schemas/activity";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import {
  listActivitiesCursor,
  listActivitiesOffset,
} from "@/lib/queries/activities";
import { parsePageSize } from "@/lib/pagination/cursor";
import { invalidateOrgResource } from "@/lib/cache/tags";

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

  const filters = {
    orgId,
    departmentId: searchParams.get("department_id"),
    type: searchParams.get("type"),
    dateFrom: searchParams.get("date_from"),
    dateTo: searchParams.get("date_to"),
    search: searchParams.get("search"),
  };

  // Cursor pagination is opt-in for forward compatibility: a client
  // that supplies `?cursor=...` or `?paginate=cursor` gets the new
  // stable keyset response shape, while existing clients relying on
  // `page` + `pagination.total` keep working unchanged.
  const cursorParam = searchParams.get("cursor");
  const useCursor =
    cursorParam !== null || searchParams.get("paginate") === "cursor";

  try {
    if (useCursor) {
      const pageSize = parsePageSize(
        searchParams.get("limit") ?? String(ITEMS_PER_PAGE),
      );
      const page = await listActivitiesCursor(supabase, filters, {
        cursor: cursorParam,
        pageSize,
      });
      return NextResponse.json(page);
    }

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const result = await listActivitiesOffset(supabase, filters, {
      page,
      pageSize: ITEMS_PER_PAGE,
    });
    return NextResponse.json({
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  invalidateOrgResource(orgId, "activities");
  invalidateOrgResource(orgId, "metrics");

  return NextResponse.json({ data: result }, { status: 201 });
}
