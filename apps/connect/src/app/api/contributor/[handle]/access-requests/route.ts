import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/contributor/[handle]/access-requests
 * Contributor: see pending + active requests.
 * Admin: see their own requests to this contributor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contributor } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("contributor_slug", handle)
    .maybeSingle<{ id: string; role: string }>();

  if (!contributor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  const isOwner = user.id === contributor.id;
  const isAdmin = viewerProfile?.role === "admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`access-requests:read:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let query = supabase
    .from("contributor_access_requests")
    .select(
      "id, contributor_id, admin_id, status, denial_reason, expires_at, revoked_at, created_at, updated_at, admin:profiles!contributor_access_requests_admin_id_fkey(full_name, avatar_url)"
    )
    .eq("contributor_id", contributor.id)
    .order("created_at", { ascending: false });

  // Admins only see their own requests when querying via this route
  if (isAdmin && !isOwner) {
    query = query.eq("admin_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API access-requests GET]", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

/**
 * POST /api/contributor/[handle]/access-requests
 * Admin-only: submit a dashboard access request.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (viewerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admins only" }, { status: 403 });
  }

  const rl = checkRateLimit(`access-requests:submit:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data: contributor } = await supabase
    .from("profiles")
    .select("id")
    .eq("contributor_slug", handle)
    .maybeSingle<{ id: string }>();

  if (!contributor) return NextResponse.json({ error: "Contributor not found" }, { status: 404 });

  // Check for existing pending or active request from this admin
  const { data: existing } = await supabase
    .from("contributor_access_requests")
    .select("id, status, expires_at, revoked_at")
    .eq("contributor_id", contributor.id)
    .eq("admin_id", user.id)
    .in("status", ["pending", "approved"])
    .maybeSingle<{ id: string; status: string; expires_at: string | null; revoked_at: string | null }>();

  if (existing) {
    if (existing.status === "pending") {
      return NextResponse.json({ error: "Request already pending" }, { status: 409 });
    }
    if (
      existing.status === "approved" &&
      existing.revoked_at === null &&
      existing.expires_at &&
      new Date(existing.expires_at) > new Date()
    ) {
      return NextResponse.json({ error: "Access already granted" }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("contributor_access_requests")
    .insert({
      contributor_id: contributor.id,
      admin_id: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // Partial unique index on (contributor_id, admin_id) where status='pending'
    // collapses the concurrent-submit race into a 23505. Map to the same 409
    // the pre-check would have returned.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Request already pending" }, { status: 409 });
    }
    console.error("[API access-requests POST]", error);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }

  // Notify the contributor
  await supabase.from("notifications").insert({
    user_id: contributor.id,
    type: "admin_elevation_request",
    title: "Dashboard access requested",
    body: "An admin has requested access to your dashboard. Review in your dashboard settings.",
    image_url: null,
    data: { request_id: data.id },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

/**
 * PATCH /api/contributor/[handle]/access-requests
 * Contributor: approve or deny a pending request.
 * Admin: revoke their own active session.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contributor } = await supabase
    .from("profiles")
    .select("id")
    .eq("contributor_slug", handle)
    .maybeSingle<{ id: string }>();

  if (!contributor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  const isOwner = user.id === contributor.id;
  const isAdmin = viewerProfile?.role === "admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`access-requests:update:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (!isValidUUID(String(raw.request_id ?? ""))) {
    return NextResponse.json({ error: "Invalid request_id" }, { status: 400 });
  }

  const requestId = raw.request_id as string;
  const action = raw.action as string;

  // Owner: approve or deny
  if (isOwner) {
    if (action === "approve") {
      const { error } = await supabase.rpc("approve_dashboard_access", {
        p_request_id: requestId,
      });
      if (error) {
        const msg = error.message.includes("max_sessions_reached")
          ? "Maximum of 2 concurrent admin sessions allowed."
          : "Failed to approve request";
        return NextResponse.json({ error: msg }, { status: error.message.includes("max_sessions_reached") ? 409 : 500 });
      }

      // Notify admin
      const { data: req } = await supabase
        .from("contributor_access_requests")
        .select("admin_id")
        .eq("id", requestId)
        .single();
      if (req?.admin_id) {
        await supabase.from("notifications").insert({
          user_id: req.admin_id,
          type: "contributor_approved",
          title: "Dashboard access granted",
          body: "Your access request has been approved. Access expires in 3 days.",
          image_url: null,
          data: { request_id: requestId },
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "deny") {
      const reason =
        typeof raw.reason === "string"
          ? raw.reason.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 500)
          : "";
      if (reason.length < 3) {
        return NextResponse.json({ error: "Denial reason required (min 3 chars)" }, { status: 400 });
      }
      const { error } = await supabase.rpc("deny_dashboard_access", {
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) {
        return NextResponse.json({ error: "Failed to deny request" }, { status: 500 });
      }

      // Notify admin
      const { data: req } = await supabase
        .from("contributor_access_requests")
        .select("admin_id")
        .eq("id", requestId)
        .single();
      if (req?.admin_id) {
        await supabase.from("notifications").insert({
          user_id: req.admin_id,
          type: "contributor_rejected",
          title: "Dashboard access denied",
          body: `Your access request was denied: ${reason}`,
          image_url: null,
          data: { request_id: requestId },
        });
      }
      return NextResponse.json({ success: true });
    }
  }

  // Admin: revoke own session
  if (isAdmin && action === "revoke") {
    const { error } = await supabase
      .from("contributor_access_requests")
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", requestId)
      .eq("admin_id", user.id)
      .eq("status", "approved");

    if (error) {
      return NextResponse.json({ error: "Failed to revoke access" }, { status: 500 });
    }

    // Log revocation
    await supabase.from("activity_log").insert({
      contributor_id: contributor.id,
      actor_id: user.id,
      action: "dashboard_access_revoked",
      entity_type: "access_request",
      entity_id: requestId,
      metadata: { admin_id: user.id },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
