import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

// GET /api/metrics/connect?org_id=<uuid>&period=day|week|month
//
// The org's live Connect metrics (VISION_BACKEND_WIRING_SPEC §3.1b/§3.4),
// served by the reader functions reach_per_org, engagement_per_org,
// calendar_growth, retention_rate (mig 148) + activity_funnel,
// broadcast_effectiveness (mig 150). Each is SECURITY DEFINER with an
// internal org-membership gate (42501 → 403 here), called with the caller's
// JWT so auth.uid() resolves inside the function.
//
// `series` is the last 30 whole-org day snapshots (sparkline source). Its
// RLS policy (vps_own_read) only matches when auth.uid() equals the org's
// Connect contributor id — the ownership-verified link identity — so other
// org members receive an empty series while the headline numbers still work.
//
// funnel + broadcast are best-effort: they share the same gate as the RGRE
// readers, so if those pass these pass too, but a null here just leaves the
// frontend on its sample data for that one tab (never sinks the whole call).

const PERIOD_KINDS = new Set(["day", "week", "month"]);
const SERIES_DAYS = 30;
const FUNNEL_DAYS = 30;

function firstRow<T>(rows: T[] | null | undefined): T | null {
  return rows && rows.length ? rows[0] : null;
}

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

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  const period = searchParams.get("period") ?? "month";
  if (!PERIOD_KINDS.has(period)) {
    return NextResponse.json(
      { error: "period must be one of day, week, month" },
      { status: 400 }
    );
  }

  // Resolve the Connect link (bridge column, migration 142). RLS scopes the
  // read to orgs the caller can see.
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .select("id, name, connect_contributor_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) {
    console.error("[API metrics connect org]", orgError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!org.connect_contributor_id) {
    return NextResponse.json({
      linked: false,
      period,
      reach: null,
      engagement: null,
      growth: [],
      retention: null,
      funnel: null,
      broadcast: null,
      series: [],
    });
  }

  const [reach, engagement, growth, retention, funnel, broadcast, series] = await Promise.all([
    supabase.rpc("reach_per_org", { p_org_id: orgId }),
    supabase.rpc("engagement_per_org", { p_org_id: orgId }),
    supabase.rpc("calendar_growth", { p_org_id: orgId, p_period_kind: period }),
    supabase.rpc("retention_rate", { p_org_id: orgId, p_period_kind: period }),
    supabase.rpc("activity_funnel", { p_org_id: orgId, p_from: isoDaysAgo(FUNNEL_DAYS) }),
    supabase.rpc("broadcast_effectiveness", { p_org_id: orgId }),
    supabase
      .from("vision_period_snapshots")
      .select(
        "period_start, reach_total, attending_count, engagement_score, distinct_persons, active_events"
      )
      .eq("org_id", org.connect_contributor_id)
      .eq("period_kind", "day")
      .is("space_id", null)
      .gte("period_start", isoDaysAgo(SERIES_DAYS))
      .order("period_start", { ascending: true }),
  ]);

  const firstError =
    reach.error ?? engagement.error ?? growth.error ?? retention.error;
  if (firstError) {
    if (firstError.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[API metrics connect]", firstError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    linked: true,
    period,
    reach: firstRow(reach.data),
    engagement: firstRow(engagement.data),
    growth: growth.data ?? [],
    retention: firstRow(retention.data),
    funnel: funnel.error ? null : firstRow(funnel.data),
    broadcast: broadcast.error ? null : firstRow(broadcast.data),
    series: series.error ? [] : (series.data ?? []),
  });
}
