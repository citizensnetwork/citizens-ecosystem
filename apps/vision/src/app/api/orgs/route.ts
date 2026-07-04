import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { slugify, isValidSlug } from "@/lib/validation";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_org_roles")
    .select("org_id, role, organisations(*)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { name, description } = body;
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json(
      { error: "Organisation name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const slug = slugify(name);
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Organisation name produces an invalid URL slug" },
      { status: 400 }
    );
  }

  // Create org
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .insert({
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (orgError) {
    if (orgError.code === "23505") {
      return NextResponse.json(
        { error: "An organisation with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  // Auto-assign creator as org_admin
  const { error: roleError } = await supabase
    .from("user_org_roles")
    .insert({
      user_id: user.id,
      org_id: org.id,
      role: "org_admin",
    });

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  return NextResponse.json({ data: org }, { status: 201 });
}
