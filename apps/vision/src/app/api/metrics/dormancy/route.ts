import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { connectApi } from "@/lib/connect/api";

/**
 * GET /api/metrics/dormancy?org_id=<uuid>&days=<7..365>
 *
 * The Dormancy / Churn early-warning (VISION_BACKEND_WIRING_SPEC §4.5) — the
 * guardian complement to the Cross-Pollination Index. Across THIS org's engaged
 * audience, it flags which OTHER contributor organisations in the orbit
 * (audience rsvps + follows) have stopped posting events / broadcasts for longer
 * than a threshold. Wraps the SECURITY DEFINER vision.dormancy_watch(org,
 * threshold_days, lookback_days) reader (migration 156), which returns a single
 * summary row (dormant_count / orbit_size — num + den) or nothing when the org
 * is not linked to Connect.
 *
 * `days` (default 60) is the DORMANCY THRESHOLD — how many days of silence marks
 * a contributor dormant — not a window; the reader forms its audience/orbit over
 * a fixed 180-day lookback. Out-of-range values fall back to the default.
 *
 * The reader is membership-gated: a non-member call raises 42501 → mapped to 403.
 * It is fetched best-effort by the frontend (live.jsx), so a failure here just
 * drops the dormancy advisory rather than sinking the dashboard.
 *
 * The reader is PII-free by design (it returns dormant contributor IDs, not
 * names). This route resolves those IDs to PUBLIC display names via Connect's
 * display-safe contributor directory (/api/v1/profiles/{id}) best-effort — any
 * failure just omits that name, and if none resolve the frontend uses its
 * no-names copy.
 */
const DEFAULT_THRESHOLD = 60;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const MAX_NAMES = 12;

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

  // Optional dormancy threshold. Invalid / out-of-range values fall back to the
  // default rather than erroring — the reader is the source of truth on bounds.
  const rawDays = Number(request.nextUrl.searchParams.get("days"));
  const threshold =
    Number.isFinite(rawDays) && rawDays >= MIN_DAYS && rawDays <= MAX_DAYS
      ? Math.floor(rawDays)
      : DEFAULT_THRESHOLD;

  const { data, error } = await supabase.rpc("dormancy_watch", {
    p_org_id: orgId,
    p_threshold_days: threshold,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[API metrics dormancy]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // The reader returns exactly one row for a linked org, or an empty set for an
  // unlinked one → null so the frontend can keep the demo/neutral surface.
  const row = Array.isArray(data) && data.length ? data[0] : null;
  if (!row) {
    return NextResponse.json({ data: null });
  }

  // Resolve the dormant contributors' PUBLIC display names app-side (the reader
  // is PII-free — it only returns IDs). Best-effort: a rejected lookup, or an
  // unconfigured CONNECT_API_BASE_URL, simply yields fewer/no names, and the
  // frontend degrades to its count-only sentence.
  const ids: string[] = Array.isArray(row.dormant_ids)
    ? row.dormant_ids.slice(0, MAX_NAMES)
    : [];
  const names: string[] = [];
  if (ids.length) {
    const settled = await Promise.allSettled(
      ids.map((id) => connectApi.getProfile(id))
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const name = r.value?.data?.full_name;
        if (name) names.push(name);
      }
    }
  }

  return NextResponse.json({
    data: {
      threshold_days: row.threshold_days,
      orbit_size: row.orbit_size,
      dormant_count: row.dormant_count,
      dormant_pct: row.dormant_pct,
      max_days_quiet: row.max_days_quiet,
      names,
      period_start: row.period_start,
      period_end: row.period_end,
    },
  });
}
