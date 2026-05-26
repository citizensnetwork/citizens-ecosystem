// GET  /api/contributor/[handle]/volunteers  – list applications
// POST /api/contributor/[handle]/volunteers  – apply or change status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const ALLOWED_STATUSES = ["pending", "approved", "declined", "withdrawn"] as const;
type VolunteerStatus = (typeof ALLOWED_STATUSES)[number];

function sanitize(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 500);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const statusFilter = url.searchParams.get("status");

  let query = supabase
    .from("volunteer_applications")
    .select(
      "id, applicant_id, entity_type, entity_id, message, status, created_at, applicant:profiles!volunteer_applications_applicant_id_fkey(full_name, avatar_url)"
    )
    .eq("contributor_id", access.contributorId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (entityType && ["event", "place"].includes(entityType)) {
    query = query.eq("entity_type", entityType);
  }
  if (entityId && isValidUUID(entityId)) {
    query = query.eq("entity_id", entityId);
  }
  if (statusFilter && ALLOWED_STATUSES.includes(statusFilter as VolunteerStatus)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to fetch volunteers" }, { status: 500 });
  return NextResponse.json({ volunteers: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(user.id, RATE_LIMITS.mutation);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "apply") {
    // Citizens apply to volunteer at an event/place
    const { entity_type, entity_id, message } = body as Record<string, unknown>;
    if (!entity_type || !["event", "place"].includes(String(entity_type))) {
      return NextResponse.json({ error: "entity_type must be event or place" }, { status: 400 });
    }
    if (!entity_id || !isValidUUID(String(entity_id))) {
      return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
    }

    // Resolve contributor for this entity
    const entityTable = String(entity_type) === "event" ? "events" : "places";
    const { data: entity } = await supabase
      .from(entityTable)
      .select("created_by")
      .eq("id", String(entity_id))
      .maybeSingle();
    if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

    const sanitizedMsg = message ? sanitize(String(message)) : null;

    const { data: inserted, error: insertErr } = await supabase
      .from("volunteer_applications")
      .insert({
        applicant_id: user.id,
        contributor_id: entity.created_by,
        entity_type: String(entity_type),
        entity_id: String(entity_id),
        message: sanitizedMsg,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json({ error: "You have already applied for this opportunity" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
    }

    // Notify contributor
    await supabase.from("notifications").insert({
      user_id: entity.created_by,
      type: "system",
      title: "New volunteer application",
      body: "Someone has applied to volunteer at one of your events.",
      link: null,
    });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  }

  if (action === "update_status") {
    // Contributor updates application status
    const access = await checkDashboardAccess(handle);
    if (!access.hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { application_id, status: newStatus } = body as Record<string, unknown>;
    if (!application_id || !isValidUUID(String(application_id))) {
      return NextResponse.json({ error: "Invalid application_id" }, { status: 400 });
    }
    if (!newStatus || !ALLOWED_STATUSES.includes(newStatus as VolunteerStatus)) {
      return NextResponse.json({ error: "status must be pending, approved, or declined" }, { status: 400 });
    }

    // Verify application belongs to this contributor
    const { data: existing } = await supabase
      .from("volunteer_applications")
      .select("id, applicant_id")
      .eq("id", String(application_id))
      .eq("contributor_id", access.contributorId)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const rawResponseMsg = (body as Record<string, unknown>).response_message;
    const responseMessage = rawResponseMsg
      ? sanitize(String(rawResponseMsg)).slice(0, 500) || null
      : null;

    const { error: updateErr } = await supabase
      .from("volunteer_applications")
      .update({
        status: newStatus,
        ...(responseMessage !== null ? { response_message: responseMessage } : {}),
      })
      .eq("id", String(application_id));
    if (updateErr) return NextResponse.json({ error: "Failed to update status" }, { status: 500 });

    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: `volunteer_${newStatus}`,
      entityType: "volunteer_application",
      entityId: String(application_id),
      metadata: { applicant_id: existing.applicant_id },
    });

    // Notify applicant
    const notifBody =
      newStatus === "approved"
        ? "Your volunteer application has been approved!"
        : newStatus === "declined"
        ? "Your volunteer application was not accepted this time."
        : null;
    if (notifBody) {
      await supabase.from("notifications").insert({
        user_id: existing.applicant_id,
        type: "system",
        title: newStatus === "approved" ? "Application approved" : "Application update",
        body: notifBody,
        link: null,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "withdraw") {
    // Citizen withdraws their own pending or approved application.
    // No dashboard access check needed — gated by applicant_id = user.id.
    const { application_id } = body as Record<string, unknown>;
    if (!application_id || !isValidUUID(String(application_id))) {
      return NextResponse.json({ error: "Invalid application_id" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("volunteer_applications")
      .select("id")
      .eq("id", String(application_id))
      .eq("applicant_id", user.id)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from("volunteer_applications")
      .update({ status: "withdrawn" })
      .eq("id", String(application_id))
      .eq("applicant_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to withdraw application" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
