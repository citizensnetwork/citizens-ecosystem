import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { createPartnershipSchema } from "@/lib/schemas/federation";

export async function GET(request: NextRequest) {
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
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("org_partnerships")
      .select(
        "*, org_a:organisations!org_partnerships_org_a_id_fkey(id, name, slug), org_b:organisations!org_partnerships_org_b_id_fkey(id, name, slug)"
      )
      .or(`org_a_id.eq.${orgId},org_b_id.eq.${orgId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[partnerships] Query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ partnerships: data ?? [] });
  } catch (error) {
    console.error("[partnerships] Error:", error);
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createPartnershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { org_a_id, org_b_id, sharing_level } = parsed.data;

  if (org_a_id === org_b_id) {
    return NextResponse.json(
      { error: "Cannot create partnership with self" },
      { status: 400 }
    );
  }

  try {
    // Check existing partnership in either direction
    const { data: existing } = await supabase
      .from("org_partnerships")
      .select("id, status")
      .or(
        `and(org_a_id.eq.${org_a_id},org_b_id.eq.${org_b_id}),and(org_a_id.eq.${org_b_id},org_b_id.eq.${org_a_id})`
      )
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Partnership already exists", partnership_id: existing[0].id },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("org_partnerships")
      .insert({
        org_a_id,
        org_b_id,
        sharing_level,
        initiated_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[partnerships] Insert error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[partnerships] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
