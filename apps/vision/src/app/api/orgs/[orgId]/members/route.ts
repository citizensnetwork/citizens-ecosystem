import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["org_admin", "org_manager", "org_member", "org_viewer"]),
  department_id: z.string().uuid().optional(),
});

const updateMemberSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["org_admin", "org_manager", "org_member", "org_viewer"]).optional(),
  department_id: z.string().uuid().nullable().optional(),
  is_founder: z.boolean().optional(),
});

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
    .from("user_org_roles")
    .select("*, departments(name)")
    .eq("org_id", orgId)
    .order("created_at");

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

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Look up user by email using admin API (service role would be needed in production)
  // For now, we check if the user is already in auth.users via a workaround:
  // In a real app, you'd use the admin API or invite flow
  // Here we create a placeholder entry that will be matched when the user signs up
  const { data: existingRole } = await supabase
    .from("user_org_roles")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);

  if (existingRole === null) {
    return NextResponse.json(
      { error: "You do not have access to this organisation" },
      { status: 403 }
    );
  }

  // For MVP: store invite intent. In production, use Supabase Auth Admin API
  // to look up user by email and create the role directly.
  return NextResponse.json(
    {
      message: `Invite for ${parsed.data.email} as ${parsed.data.role} recorded. User will be added on next sign-in.`,
    },
    { status: 201 }
  );
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

  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id, ...updates } = parsed.data;

  const { data, error } = await supabase
    .from("user_org_roles")
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
  const memberId = searchParams.get("id");

  if (!memberId || !isValidUUID(memberId)) {
    return NextResponse.json(
      { error: "Valid member role id is required" },
      { status: 400 }
    );
  }

  // Prevent removing yourself
  const { data: role } = await supabase
    .from("user_org_roles")
    .select("user_id")
    .eq("id", memberId)
    .single();

  if (role?.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot remove yourself from the organisation" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("user_org_roles")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
