import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateActivitySchema } from "@/lib/schemas/activity";
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
    return NextResponse.json({ error: "Invalid activity ID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("activities")
    .select("*, activity_tags(tag), departments(name)")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: "Invalid activity ID" }, { status: 400 });
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

  const parsed = updateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { tags, ...activityData } = parsed.data;

  // Update activity fields
  if (Object.keys(activityData).length > 0) {
    const { error: updateError } = await supabase
      .from("activities")
      .update(activityData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }
  }

  // Replace tags if provided
  if (tags !== undefined) {
    // Delete existing tags
    await supabase.from("activity_tags").delete().eq("activity_id", id);

    // Insert new tags
    if (tags.length > 0) {
      const tagRows = tags.map((tag) => ({ activity_id: id, tag }));
      await supabase.from("activity_tags").insert(tagRows);
    }
  }

  // Return updated activity
  const { data, error } = await supabase
    .from("activities")
    .select("*, activity_tags(tag)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.org_id) {
    invalidateOrgResource(data.org_id, "activities");
    invalidateOrgResource(data.org_id, "metrics");
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
    return NextResponse.json({ error: "Invalid activity ID" }, { status: 400 });
  }

  // Capture org_id before delete so we can invalidate the right tag.
  const { data: existing } = await supabase
    .from("activities")
    .select("org_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("activities").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing?.org_id) {
    invalidateOrgResource(existing.org_id, "activities");
    invalidateOrgResource(existing.org_id, "metrics");
  }

  return NextResponse.json({ success: true });
}
