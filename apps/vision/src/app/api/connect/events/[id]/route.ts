import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";
import { connectApi, ConnectApiError } from "@/lib/connect/api";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure an exclusive claim row exists for (cc_event_id, org). Claims are keyed
 * by cc_event_id (PK) so only one org can own a Connect event. Re-claiming by the
 * same org is idempotent; a different org gets 409.
 */
async function ensureEventClaim(
  supabase: SupabaseClient,
  args: { eventId: string; orgId: string; projectId: string | null; userId: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { error } = await supabase.from("cc_event_claims").insert({
    cc_event_id: args.eventId,
    cv_org_id: args.orgId,
    cv_project_id: args.projectId,
    claimed_by: args.userId,
  });

  if (!error) return { ok: true };

  if (error.code === "23505") {
    // Already claimed. RLS only lets us see our own org's claim row.
    const { data: existing } = await supabase
      .from("cc_event_claims")
      .select("cv_org_id")
      .eq("cc_event_id", args.eventId)
      .maybeSingle();
    if (existing?.cv_org_id === args.orgId) return { ok: true };
    return {
      ok: false,
      status: 409,
      error: "This event is already claimed by another organisation",
    };
  }

  return { ok: false, status: 500, error: "Internal server error" };
}

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

  let body: {
    org_id?: string;
    project_id?: string;
    department_id?: string;
    action?: string;
  };
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
    return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
  }
  if (department_id && !isValidUUID(department_id)) {
    return NextResponse.json({ error: "Invalid department_id" }, { status: 400 });
  }

  // Verify admin/manager role
  const auth = await requireOrgRole(supabase, user.id, org_id, [
    "org_admin",
    "org_manager",
  ]);
  if (!auth.ok) return auth.response;

  if (action === "claim") {
    const claim = await ensureEventClaim(supabase, {
      eventId: id,
      orgId: org_id,
      projectId: project_id ?? null,
      userId: user.id,
    });
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status });
    }

    const { data: row } = await supabase
      .from("cc_event_claims")
      .select("*")
      .eq("cc_event_id", id)
      .eq("cv_org_id", org_id)
      .single();

    return NextResponse.json(row);
  }

  if (action === "promote") {
    // Source-of-truth event data now comes from Connect's public API.
    let detail;
    try {
      ({ data: detail } = await connectApi.getEvent(id));
    } catch (error) {
      if (error instanceof ConnectApiError) {
        const status = error.status === 404 ? 404 : 502;
        const message =
          status === 404 ? "Event not found" : "Citizens Connect API is unavailable";
        return NextResponse.json({ error: message }, { status });
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Claim must belong to this org before we attach an activity.
    const claim = await ensureEventClaim(supabase, {
      eventId: id,
      orgId: org_id,
      projectId: project_id ?? null,
      userId: user.id,
    });
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status });
    }

    const eventDate = detail.date
      ? detail.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .insert({
        org_id,
        department_id: department_id ?? null,
        title: detail.title,
        description: detail.description,
        type: "event",
        date: eventDate,
        start_time: detail.date,
        end_time: detail.end_time,
        latitude: detail.latitude,
        longitude: detail.longitude,
        location_name: detail.location,
        participant_count: detail.stats?.going ?? 0,
        source_type: "citizens_connect",
        source_id: id,
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

    // Link the activity back onto the claim.
    await supabase
      .from("cc_event_claims")
      .update({
        cv_activity_id: activity.id,
        cv_project_id: project_id ?? null,
      })
      .eq("cc_event_id", id)
      .eq("cv_org_id", org_id);

    if (project_id) {
      await supabase
        .from("project_activities")
        .insert({ project_id, activity_id: activity.id });
    }

    return NextResponse.json({ activity, promoted: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
