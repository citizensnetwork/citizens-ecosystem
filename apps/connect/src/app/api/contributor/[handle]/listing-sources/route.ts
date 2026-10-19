import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { canEditListingContent } from "@/lib/dashboard/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const KINDS = ["website", "youtube", "calendar", "facebook", "instagram", "tiktok"] as const;

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || !parsed.hostname.includes(".")) return null;
  parsed.protocol = "https:";
  parsed.hash = "";
  const out = parsed.toString();
  return out.length > 500 ? null : out;
}

/**
 * POST /api/contributor/[handle]/listing-sources
 * An active editor (or the owner, or an admin with a grant) adds a source
 * owned by the contributor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`sources:${user.id}`, RATE_LIMITS.mutation);
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
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "Invalid source kind" }, { status: 400 });
  }
  const url = httpsUrl(raw.url);
  if (!url) return NextResponse.json({ error: "url must be an https link" }, { status: 400 });
  const enabled = raw.enabled === true;

  const { data, error } = await supabase
    .from("listing_sources")
    .insert({ contributor_id: access.contributorId, kind, url, enabled })
    .select("id, contributor_id, kind, url, enabled")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to add source" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/contributor/[handle]/listing-sources?id= */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("listing_sources")
    .delete()
    .eq("id", id)
    .eq("contributor_id", access.contributorId);
  if (error) return NextResponse.json({ error: "Failed to remove source" }, { status: 500 });
  return NextResponse.json({ success: true });
}
