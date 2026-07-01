import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** PATCH /api/suggestions/[id] — admin-only: update status + optional response. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimit(`suggestions:update:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const VALID_STATUSES = ["open", "in_review", "actioned", "declined"] as const;
  const raw = body as Record<string, unknown>;
  const statusRaw = raw.status;

  if (!VALID_STATUSES.includes(statusRaw as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const adminResponse =
    typeof raw.admin_response === "string"
      ? raw.admin_response.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 1000)
      : null;

  const patch: Record<string, unknown> = { status: statusRaw };
  if (adminResponse !== null) patch.admin_response = adminResponse;

  if (statusRaw === "actioned" || statusRaw === "declined") {
    patch.resolved_by = user.id;
    patch.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("suggestions")
    .update(patch)
    .eq("id", id)
    .select("id, user_id, status")
    .single();

  if (error) {
    console.error("[API suggestions PATCH]", error);
    return NextResponse.json({ error: "Failed to update suggestion" }, { status: 500 });
  }

  // Notify user if their suggestion was actioned/declined.
  // Uses dedicated `suggestion_response` type (migration 114) instead of the
  // prior `contributor_approved` hack. No deep-link target exists for
  // suggestions, so `data.url` is intentionally omitted.
  if (
    data.user_id &&
    (statusRaw === "actioned" || statusRaw === "declined")
  ) {
    const notificationBody =
      statusRaw === "actioned"
        ? "Your suggestion has been actioned. Thank you for helping improve Citizens Connect!"
        : "Your suggestion has been reviewed. Thank you for your feedback!";

    await supabase.from("notifications").insert({
      user_id: data.user_id,
      type: "suggestion_response",
      title: statusRaw === "actioned" ? "Suggestion actioned" : "Suggestion reviewed",
      body: notificationBody,
      image_url: null,
      data: { suggestion_id: id, status: statusRaw },
    });
  }

  return NextResponse.json({ success: true });
}
