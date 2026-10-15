import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/metrics/shared-audience?org_id=<uuid>&days=<7..366>&limit=<1..25>
 *
 * The Community Network Graph (VISION_BACKEND_WIRING_SPEC §4.3): which other
 * public Contributors share this organisation's audience, and how many citizens
 * they share. Wraps the SECURITY DEFINER vision.shared_audience(org, from, to,
 * limit) reader (migration 182), which returns ORGANISATIONS and COUNTS only,
 * hides any pair that shares fewer than 3 citizens, and never names a hidden or
 * unapproved Contributor. No citizen identity can reach this route.
 *
 * The reader is membership-gated: a non-member call raises 42501 → mapped to 403.
 * It is fetched best-effort by the frontend (live.jsx) so a failure here just
 * leaves the Network screen on its empty state. An org that is not linked to
 * Connect, or has no pair at or above the floor, gets an empty list.
 * `days` (default 90) picks the trailing window; the reader caps any span at 366.
 */
const DEFAULT_DAYS = 90;
const MIN_DAYS = 7;
const MAX_DAYS = 366;
const DEFAULT_LIMIT = 12;
const MIN_LIMIT = 1;
const MAX_LIMIT = 25;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

function boundedInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Invalid / out-of-range values fall back to the defaults rather than
  // erroring — the reader is the source of truth on bounds.
  const days = boundedInt(request.nextUrl.searchParams.get("days"), MIN_DAYS, MAX_DAYS, DEFAULT_DAYS);
  const limit = boundedInt(request.nextUrl.searchParams.get("limit"), MIN_LIMIT, MAX_LIMIT, DEFAULT_LIMIT);

  const { data, error } = await supabase.rpc("shared_audience", {
    p_org_id: orgId,
    p_from: isoDaysAgo(days - 1),
    p_limit: limit,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[API metrics shared-audience]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}
