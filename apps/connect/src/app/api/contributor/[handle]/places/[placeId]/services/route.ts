import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const MAX_SERVICES = 10;
const SERVICE_MAX_LEN = 40;
/** Allowlist per A28: letters, digits, space, period, underscore, hyphen. */
const SERVICE_ALLOWLIST = /^[A-Za-z0-9 ._-]+$/;

function sanitiseService(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/  +/g, " ")
    .trim()
    .slice(0, SERVICE_MAX_LEN);
}

/**
 * GET /api/contributor/[handle]/places/[placeId]/services — public.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string; placeId: string }> }
) {
  const { placeId } = await params;

  if (!isValidUUID(placeId)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("specialised_services")
    .select("id, service, created_at")
    .eq("place_id", placeId)
    .order("service", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch services" }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}

/** POST /api/contributor/[handle]/places/[placeId]/services — add service. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string; placeId: string }> }
) {
  const { handle, placeId } = await params;

  if (!isValidUUID(placeId)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
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

  // Verify place ownership
  const { data: place } = await supabase
    .from("places")
    .select("created_by")
    .eq("id", placeId)
    .maybeSingle<{ created_by: string }>();

  if (!place || place.created_by !== contributorId) {
    return NextResponse.json({ error: "Place not owned by this contributor" }, { status: 403 });
  }

  const rl = await checkRateLimit(`services:${user.id}`, RATE_LIMITS.mutation);
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
  const service = typeof raw.service === "string" ? sanitiseService(raw.service) : "";

  if (service.length < 2) {
    return NextResponse.json({ error: "Service name must be at least 2 characters" }, { status: 400 });
  }
  if (!SERVICE_ALLOWLIST.test(service)) {
    return NextResponse.json(
      { error: "Service name may only contain letters, numbers, spaces, periods, underscores, and hyphens" },
      { status: 422 }
    );
  }

  // Check cap
  const { count } = await supabase
    .from("specialised_services")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  if ((count ?? 0) >= MAX_SERVICES) {
    return NextResponse.json({ error: `Maximum ${MAX_SERVICES} services per place` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("specialised_services")
    .insert({ place_id: placeId, contributor_id: contributorId, service })
    .select("id, service")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Service already exists for this place" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add service" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "service_added",
    entityType: "specialised_service",
    entityId: data.id,
    metadata: { place_id: placeId, service: data.service },
  });

  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/contributor/[handle]/places/[placeId]/services?id=uuid */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string; placeId: string }> }
) {
  const { handle, placeId } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!isValidUUID(placeId) || !id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
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

  // Verify place ownership before deleting
  const { data: place } = await supabase
    .from("places")
    .select("created_by")
    .eq("id", placeId)
    .maybeSingle<{ created_by: string }>();

  if (!place || place.created_by !== contributorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("specialised_services")
    .delete()
    .eq("id", id)
    .eq("place_id", placeId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "service_deleted",
    entityType: "specialised_service",
    entityId: id,
    metadata: { place_id: placeId },
  });

  return NextResponse.json({ success: true });
}
