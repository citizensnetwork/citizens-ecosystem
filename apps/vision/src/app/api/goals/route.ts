import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createGoalSchema } from "@/lib/schemas/goal";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { listGoalsCursor, listGoalsOffset } from "@/lib/queries/goals";
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
    status: searchParams.get("status"),
    visionId: searchParams.get("vision_id"),
    search: searchParams.get("search"),
  };

  const cursorParam = searchParams.get("cursor");
  const useCursor =
    cursorParam !== null || searchParams.get("paginate") === "cursor";

  try {
    if (useCursor) {
      const pageSize = parsePageSize(
        searchParams.get("limit") ?? String(ITEMS_PER_PAGE),
      );
      const page = await listGoalsCursor(supabase, filters, {
        cursor: cursorParam,
        pageSize,
      });
      return NextResponse.json(page);
    }

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const result = await listGoalsOffset(supabase, filters, {
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
    console.error("[API goals GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

  const orgId = request.nextUrl.searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id query parameter is required" },
      { status: 400 }
    );
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

  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      ...parsed.data,
      org_id: orgId,
      created_by: user.id,
    })
    .select("*, vision_statements(title)")
    .single();

  if (error) {
    console.error("[API goals POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  invalidateOrgResource(orgId, "goals");

  return NextResponse.json({ data }, { status: 201 });
}
