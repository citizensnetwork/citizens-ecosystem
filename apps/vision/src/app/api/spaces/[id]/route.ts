import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { updateSpaceSchema } from "@/lib/schemas/space";

// PUT /api/spaces/[id]     — update a Space (RLS: org_admin of the space's org)
// DELETE /api/spaces/[id]  — delete a Space (cascades category_space_map rows)
//
// Authorisation is enforced entirely by vision.spaces RLS (mig 147): the update
// / delete policies require is_org_admin(org_id) of the target row, so no
// org_id needs to travel — the id alone is the RLS-scoped handle. An RLS denial
// surfaces as PostgREST 42501 → 403.

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid space ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSpaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("spaces")
    .update(parsed.data)
    .eq("id", id)
    .select("id, name, description, colour, icon, sort_order")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No row updated: not found, or RLS hid it from this caller.
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid space ID" }, { status: 400 });
  }

  const { error } = await supabase.from("spaces").delete().eq("id", id);

  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ success: true });
}
