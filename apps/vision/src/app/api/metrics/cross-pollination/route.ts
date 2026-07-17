import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/metrics/cross-pollination?org_id=<uuid>&days=<7..366>
 *
 * The Cross-Pollination Index (VISION_BACKEND_WIRING_SPEC §4.2) — the platform's
 * "de-scattering" measure: across an org's engaged audience, how many citizens
 * connected in the window with an organisation they had NEVER engaged with
 * before. Wraps the SECURITY DEFINER vision.cross_pollination(org, from, to)
 * reader (migration 155), which returns a single row (num + den on every ratio)
 * or nothing when the org is not linked to Connect.
 *
 * The reader is membership-gated: a non-member call raises 42501 → mapped to 403.
 * It is fetched best-effort by the frontend (live.jsx), alongside the RGRE
 * metrics, so a failure here just drops the discovery observation rather than
 * sinking the dashboard. `days` (default 90) picks the trailing window; the
 * reader itself caps any span at 366 days.
 */
const DEFAULT_DAYS = 90;
const MIN_DAYS = 7;
const MAX_DAYS = 366;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
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

  // Optional trailing window. Invalid / out-of-range values fall back to the
  // default rather than erroring — the reader is the source of truth on bounds.
  const rawDays = Number(request.nextUrl.searchParams.get("days"));
  const days =
    Number.isFinite(rawDays) && rawDays >= MIN_DAYS && rawDays <= MAX_DAYS
      ? Math.floor(rawDays)
      : DEFAULT_DAYS;

  const { data, error } = await supabase.rpc("cross_pollination", {
    p_org_id: orgId,
    p_from: isoDaysAgo(days - 1),
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[API metrics cross-pollination]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // The reader returns exactly one row for a linked org, or an empty set for an
  // unlinked one → null so the frontend can keep the demo/neutral surface.
  const row = Array.isArray(data) && data.length ? data[0] : null;
  return NextResponse.json({ data: row });
}
