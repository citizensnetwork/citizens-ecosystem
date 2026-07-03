import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { updatePartnershipSchema } from "@/lib/schemas/federation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Valid partnership ID is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("org_partnerships")
      .select(
        "*, org_a:organisations!org_partnerships_org_a_id_fkey(id, name, slug), org_b:organisations!org_partnerships_org_b_id_fkey(id, name, slug)"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Partnership not found" },
        { status: 404 }
      );
    }

    // Fetch shared metrics for this partnership
    const { data: sharedMetrics } = await supabase
      .from("shared_metrics")
      .select("*")
      .eq("partnership_id", id);

    return NextResponse.json({ ...data, shared_metrics: sharedMetrics ?? [] });
  } catch (error) {
    console.error("[partnerships/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Valid partnership ID is required" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updatePartnershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status) {
    updates.status = parsed.data.status;
    updates.responded_by = user.id;
  }
  if (parsed.data.sharing_level) {
    updates.sharing_level = parsed.data.sharing_level;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("org_partnerships")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[partnerships/[id]] Update error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[partnerships/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Valid partnership ID is required" },
      { status: 400 }
    );
  }

  try {
    const { error } = await supabase
      .from("org_partnerships")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[partnerships/[id]] Delete error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[partnerships/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
