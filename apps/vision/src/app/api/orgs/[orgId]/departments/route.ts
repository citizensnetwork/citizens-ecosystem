import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const createDepartmentSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  parent_department_id: z.string().uuid().optional(),
});

const updateDepartmentSchema = createDepartmentSchema.partial();

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
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

  const parsed = createDepartmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("departments")
    .insert({
      ...parsed.data,
      org_id: orgId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
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

  const parsed = z
    .object({ id: z.string().uuid() })
    .merge(updateDepartmentSchema)
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id, ...updates } = parsed.data;

  const { data, error } = await supabase
    .from("departments")
    .update(updates)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const departmentId = searchParams.get("id");

  if (!departmentId || !isValidUUID(departmentId)) {
    return NextResponse.json(
      { error: "Valid department id is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", departmentId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
