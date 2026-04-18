import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateVisionSchema } from "@/lib/schemas/goal";
import { isValidUUID } from "@/lib/validation";
import { invalidateOrgResource } from "@/lib/cache/tags";

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
    return NextResponse.json(
      { error: "Invalid vision ID" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("vision_statements")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Vision statement not found" },
        { status: 404 }
      );
    }
    console.error("[API vision GET]", error);
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
    return NextResponse.json(
      { error: "Invalid vision ID" },
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

  const parsed = updateVisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("vision_statements")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Vision statement not found" },
        { status: 404 }
      );
    }
    console.error("[API vision PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (data?.org_id) {
    invalidateOrgResource(data.org_id, "vision");
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
    return NextResponse.json(
      { error: "Invalid vision ID" },
      { status: 400 }
    );
  }

  // Capture org_id for cache invalidation before delete.
  const { data: existing } = await supabase
    .from("vision_statements")
    .select("org_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("vision_statements")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[API vision DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (existing?.org_id) {
    invalidateOrgResource(existing.org_id, "vision");
  }

  return NextResponse.json({ success: true });
}
