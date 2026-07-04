import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const VALID_DRAFT_TYPES = ["event", "place"] as const;

/** GET /api/contributor/[handle]/drafts */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();

  let query = supabase
    .from("contributor_drafts")
    .select("id, draft_type, title, body, created_at, updated_at")
    .eq("contributor_id", contributorId)
    .order("updated_at", { ascending: false })
    .limit(50);

  const draftType = searchParams.get("draft_type");
  if (draftType && VALID_DRAFT_TYPES.includes(draftType as (typeof VALID_DRAFT_TYPES)[number])) {
    query = query.eq("draft_type", draftType);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}

/** POST /api/contributor/[handle]/drafts */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`drafts:${user.id}`, RATE_LIMITS.mutation);
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
  const draftType = raw.draft_type as string;
  if (!VALID_DRAFT_TYPES.includes(draftType as (typeof VALID_DRAFT_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid draft_type" }, { status: 400 });
  }

  const title = typeof raw.title === "string"
    ? raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 200)
    : "";
  if (title.length < 1) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  // body field stores JSON of the form data snapshot
  let draftBody: Record<string, unknown> | null = null;
  if (raw.body && typeof raw.body === "object" && !Array.isArray(raw.body)) {
    draftBody = raw.body as Record<string, unknown>;
  }

  const { data, error } = await supabase
    .from("contributor_drafts")
    .insert({
      contributor_id: contributorId,
      draft_type: draftType,
      title,
      body: draftBody,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "draft_created",
    entityType: "draft",
    entityId: data.id,
    metadata: { draft_type: draftType },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

/** PATCH /api/contributor/[handle]/drafts */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`drafts:${user.id}`, RATE_LIMITS.mutation);
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

  if (!isValidUUID(String(raw.id ?? ""))) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof raw.title === "string") {
    patch.title = raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 200);
  }
  if (raw.body !== undefined && typeof raw.body === "object" && !Array.isArray(raw.body)) {
    patch.body = raw.body;
  }

  const { error } = await supabase
    .from("contributor_drafts")
    .update(patch)
    .eq("id", raw.id as string)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "draft_updated",
    entityType: "draft",
    entityId: raw.id as string,
  });

  return NextResponse.json({ success: true });
}

/** DELETE /api/contributor/[handle]/drafts?id=uuid */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("contributor_drafts")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "draft_deleted",
    entityType: "draft",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
