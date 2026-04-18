import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateGoalSchema } from "@/lib/schemas/goal";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("goals")
    .select("*, vision_statements(title)")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("[API goal GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
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

  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Fetch goal's org_id for explicit API-layer authorization (defense in depth).
  // Do not rely solely on RLS — if an RLS policy regresses, API layer still blocks.
  const { data: existing, error: fetchErr } = await supabase
    .from("goals")
    .select("org_id")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const auth = await requireOrgRole(supabase, user.id, existing.org_id, [
    "org_admin",
    "org_manager",
    "platform_admin",
  ]);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("goals")
    .update(parsed.data)
    .eq("id", id)
    .select("*, vision_statements(title)")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("[API goal PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  // Explicit org+role check before DELETE (defense in depth over RLS).
  const { data: existing, error: fetchErr } = await supabase
    .from("goals")
    .select("org_id")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const auth = await requireOrgRole(supabase, user.id, existing.org_id, [
    "org_admin",
    "platform_admin",
  ]);
  if (!auth.ok) return auth.response;

  const { error } = await supabase.from("goals").delete().eq("id", id);

  if (error) {
    console.error("[API goal DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
