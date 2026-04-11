import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  let body: { org_id?: string; project_id?: string; department_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { org_id, project_id, department_id, action } = body;

  if (!org_id || !isValidUUID(org_id)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (project_id && !isValidUUID(project_id)) {
    return NextResponse.json(
      { error: "Invalid project_id" },
      { status: 400 }
    );
  }

  if (department_id && !isValidUUID(department_id)) {
    return NextResponse.json(
      { error: "Invalid department_id" },
      { status: 400 }
    );
  }

  // Verify admin/manager role
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();

  if (!membership || !["org_admin", "org_manager"].includes(membership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (action === "claim") {
    // Claim the event for the org
    const { data: updated, error } = await supabase
      .from("cc_events_mirror")
      .update({
        cv_org_id: org_id,
        cv_project_id: project_id ?? null,
      })
      .eq("cc_event_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  }

  if (action === "promote") {
    // Get the CC event
    const { data: ccEvent } = await supabase
      .from("cc_events_mirror")
      .select("*")
      .eq("cc_event_id", id)
      .single();

    if (!ccEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Create a CV activity from the CC event
    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .insert({
        org_id,
        department_id: department_id ?? null,
        title: ccEvent.title,
        description: ccEvent.description,
        type: "event",
        date: ccEvent.date ? new Date(ccEvent.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        start_time: ccEvent.date ? new Date(ccEvent.date).toISOString().split("T")[1]?.substring(0, 5) : null,
        end_time: ccEvent.end_time ? new Date(ccEvent.end_time).toISOString().split("T")[1]?.substring(0, 5) : null,
        latitude: ccEvent.latitude,
        longitude: ccEvent.longitude,
        location_name: ccEvent.location,
        participant_count: ccEvent.rsvp_count ?? 0,
        source_type: "citizens_connect",
        source_id: ccEvent.cc_event_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (activityError) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Update mirror with link to new activity
    await supabase
      .from("cc_events_mirror")
      .update({
        cv_org_id: org_id,
        cv_activity_id: activity.id,
        cv_project_id: project_id ?? ccEvent.cv_project_id ?? null,
      })
      .eq("cc_event_id", id);

    // Link to project if specified
    if (project_id) {
      await supabase
        .from("project_activities")
        .insert({ project_id, activity_id: activity.id })
        .select();
    }

    return NextResponse.json({ activity, promoted: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
