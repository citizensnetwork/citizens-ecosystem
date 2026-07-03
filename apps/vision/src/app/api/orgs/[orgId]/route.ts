import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

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
    .from("organisations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
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

  let body: { name?: string; description?: string; parent_org_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const updates: Record<string, string | null> = {};
  if (body.name && typeof body.name === "string" && body.name.trim().length >= 2) {
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updates.description = body.description?.trim() || "";
  }
  // Phase 19: hierarchy admin can re-parent the organisation. Cycle
  // protection lives in the DB trigger created in migration 013, so
  // we only need a role check + UUID/null validation here.
  if (body.parent_org_id !== undefined) {
    if (body.parent_org_id !== null && !isValidUUID(body.parent_org_id)) {
      return NextResponse.json(
        { error: "parent_org_id must be a valid UUID or null" },
        { status: 400 },
      );
    }
    if (body.parent_org_id === orgId) {
      return NextResponse.json(
        { error: "An org cannot be its own parent" },
        { status: 400 },
      );
    }
    const { data: membership } = await supabase
      .from("user_org_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();

    if (!membership || membership.role !== "org_admin") {
      return NextResponse.json(
        { error: "Only org admins can change the parent organisation" },
        { status: 403 },
      );
    }
    updates.parent_org_id = body.parent_org_id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("organisations")
    .update(updates)
    .eq("id", orgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
