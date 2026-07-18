import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { createSpaceSchema } from "@/lib/schemas/space";

// GET /api/spaces?org_id=<uuid>
// POST /api/spaces?org_id=<uuid>
//
// The org's Vision Spaces (vision.spaces, migration 147), RLS-gated exactly
// like /api/activities: org_member SELECT, org_admin write. GET folds in each
// space's LIVE per-space metrics (VISION_BACKEND_WIRING_SPEC §3.5b) so the
// Spaces directory renders real reach / people / activities / trend instead of
// sample data — the reason mig 151's space readers ship before this wiring
// (a live directory with no numbers would read worse than the demo it replaces).
//
// Metrics are best-effort: reach_per_space / engagement_per_space (mig 151) are
// membership-gated SECDEF readers (42501 → 403); a per-space snapshot trend is
// read from vision_period_snapshots (RLS-scoped to the link owner, so other
// members simply get a flat/absent sparkline). A reader error never sinks the
// list — the space still lists with honest zero metrics.

const TREND_DAYS = 30;

interface SpaceReachRow {
  space_id: string;
  total_reach: number;
  distinct_persons: number;
  event_count: number;
}
interface SpaceEngRow {
  space_id: string;
  engagement_score: number;
  top_component: string | null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

function indexBy<T extends { space_id: string }>(
  rows: T[] | null | undefined
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows ?? []) m.set(r.space_id, r);
  return m;
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
    return NextResponse.json({ error: "Valid org_id is required" }, { status: 400 });
  }

  // Base list (RLS: org_member).
  const { data: spaces, error } = await supabase
    .from("spaces")
    .select("id, name, description, colour, icon, sort_order")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Live per-space metrics (best-effort; membership gate → 403).
  const [reach, engagement] = await Promise.all([
    supabase.rpc("reach_per_space", { p_org_id: orgId }),
    supabase.rpc("engagement_per_space", { p_org_id: orgId }),
  ]);
  if (reach.error?.code === "42501" || engagement.error?.code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const reachBy = indexBy<SpaceReachRow>(reach.error ? null : (reach.data as SpaceReachRow[]));
  const engBy = indexBy<SpaceEngRow>(engagement.error ? null : (engagement.data as SpaceEngRow[]));

  // Per-space trend from the daily snapshots (RLS-scoped to the link owner).
  const trendBy = new Map<string, number[]>();
  const { data: org } = await supabase
    .from("organisations")
    .select("connect_contributor_id")
    .eq("id", orgId)
    .maybeSingle();
  const cc = org?.connect_contributor_id as string | null | undefined;
  if (cc) {
    const { data: snaps } = await supabase
      .from("vision_period_snapshots")
      .select("space_id, period_start, reach_total")
      .eq("org_id", cc)
      .eq("period_kind", "day")
      .not("space_id", "is", null)
      .gte("period_start", isoDaysAgo(TREND_DAYS))
      .order("period_start", { ascending: true });
    for (const row of snaps ?? []) {
      const arr = trendBy.get(row.space_id) ?? [];
      arr.push(Number(row.reach_total ?? 0));
      trendBy.set(row.space_id, arr);
    }
  }

  const data = (spaces ?? []).map((s) => {
    const r = reachBy.get(s.id);
    const g = engBy.get(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      colour: s.colour,
      icon: s.icon,
      sort_order: s.sort_order,
      reach: r ? Number(r.total_reach) : 0,
      people: r ? Number(r.distinct_persons) : 0,
      activities: r ? Number(r.event_count) : 0,
      engagement: g ? Number(g.engagement_score) : 0,
      top_component: g ? g.top_component : null,
      trend: trendBy.get(s.id) ?? [],
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json({ error: "Valid org_id is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSpaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("spaces")
    .insert({ ...parsed.data, org_id: orgId })
    .select("id, name, description, colour, icon, sort_order")
    .single();

  if (error) {
    // RLS denial (not an admin) surfaces as 42501 → 403.
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ data }, { status: 201 });
}
