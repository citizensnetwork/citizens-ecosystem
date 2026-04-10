import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createProjectSchema } from "@/lib/schemas/project";
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

  let query = supabase
    .from("projects")
    .select("*, departments(name)", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const status = searchParams.get("status");
  if (status) {
    query = query.eq("status", status);
  }

  const departmentId = searchParams.get("department_id");
  if (departmentId && isValidUUID(departmentId)) {
    query = query.eq("department_id", departmentId);
  }

  const search = searchParams.get("search");
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = ITEMS_PER_PAGE;
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[API projects GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Validate date ordering
  if (
    parsed.data.start_date &&
    parsed.data.end_date &&
    parsed.data.end_date < parsed.data.start_date
  ) {
    return NextResponse.json(
      { error: "End date must be on or after start date" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      org_id: orgId,
      created_by: user.id,
    })
    .select("*, departments(name)")
    .single();

  if (error) {
    console.error("[API projects POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}
