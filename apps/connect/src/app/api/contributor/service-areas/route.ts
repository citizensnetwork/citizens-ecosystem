/**
 * Owner side of serving areas (issue #259, migration 195).
 *
 *   GET /api/contributor/service-areas[?contributor_id=<uuid>]
 *       The current selection: { area_ids, radius_km, radius_centre_area_id }. Defaults to the caller's own listing.
 *       Read on the caller's own session, so RLS decides who may see it (the Contributor, an active team member of the
 *       listing, an admin). Someone who may not simply gets an empty selection.
 *   PUT /api/contributor/service-areas
 *       { contributor_id?, area_ids: uuid[], radius_km?: 1..100, radius_centre_area_id?: uuid }
 *       Replaces the whole selection in one transaction through `set_service_areas`, which decides who may write (the
 *       Contributor, an active editor, an admin), which Contributors may choose areas (approved, or an applicant who is
 *       still pending), and the radius rule (a radius needs a centre: a ticked area, or the Contributor's own pin).
 *       A tick means that area and everything inside it; nothing is ever added upward.
 *
 * Auth: Bearer through getRouteAuth(). The RPC runs on the caller's session; service_role is never used here.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { parseSelectionPayload, SET_REFUSALS } from "@/lib/serviceAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tooMany(resetMs: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": Math.ceil(resetMs / 1000).toString() } },
  );
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`service-areas-read:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) return tooMany(rl.resetMs);

  const asked = new URL(request.url).searchParams.get("contributor_id");
  if (asked !== null && !isValidUUID(asked)) {
    return NextResponse.json({ error: "invalid_contributor_id" }, { status: 400 });
  }
  const contributorId = (asked ?? user.id).toLowerCase();

  const [areas, radius] = await Promise.all([
    supabase.from("contributor_service_areas").select("area_id").eq("contributor_id", contributorId),
    supabase
      .from("contributor_service_radius")
      .select("radius_km, centre_area_id")
      .eq("contributor_id", contributorId)
      .maybeSingle(),
  ]);
  if (areas.error || radius.error) {
    console.error("[/api/contributor/service-areas] read", areas.error ?? radius.error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const ids = (areas.data ?? []).map((r: { area_id: string }) => r.area_id).sort();
  return NextResponse.json({
    area_ids: ids,
    radius_km: radius.data?.radius_km ?? null,
    radius_centre_area_id: radius.data?.centre_area_id ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`service-areas-write:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return tooMany(rl.resetMs);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseSelectionPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const contributorId = parsed.contributorId ?? user.id;
  const { selection } = parsed;
  const { data, error } = await supabase.rpc("set_service_areas", {
    p_contributor_id: contributorId,
    p_area_ids: selection.areaIds,
    p_radius_km: selection.radiusKm,
    p_radius_centre_area_id: selection.radiusCentreAreaId,
  });
  if (error) {
    console.error("[/api/contributor/service-areas] rpc", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const result = (data ?? {}) as {
    success?: boolean;
    reason?: string;
    area_ids?: string[];
    radius_km?: number | null;
    radius_centre_area_id?: string | null;
  };
  if (!result.success) {
    const refusal = SET_REFUSALS[result.reason ?? ""] ?? { status: 400, error: "refused" };
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }
  return NextResponse.json({
    area_ids: result.area_ids ?? [],
    radius_km: result.radius_km ?? null,
    radius_centre_area_id: result.radius_centre_area_id ?? null,
  });
}
