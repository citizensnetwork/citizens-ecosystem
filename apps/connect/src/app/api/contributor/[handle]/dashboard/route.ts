import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { AnalyticsPeriod } from "@/types/db";

const VALID_PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];

/**
 * GET /api/contributor/[handle]/dashboard
 * Returns aggregated home-tab analytics for the contributor dashboard.
 * Requires owner or approved admin session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;

  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`dashboard:stats:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const periodRaw = parseInt(searchParams.get("period") ?? "30", 10);
  const period = (VALID_PERIODS.includes(periodRaw as AnalyticsPeriod)
    ? periodRaw
    : 30) as AnalyticsPeriod;

  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceIso = since.toISOString();

  // Run all aggregations in parallel
  const [
    placesResult,
    eventsResult,
    followersResult,
    rsvpsResult,
    unreadInboxResult,
    teamResult,
    recentActivityResult,
    topEventResult,
    activeAccessResult,
  ] = await Promise.all([
    // Active places count
    supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("created_by", contributorId),

    // Upcoming events count
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("created_by", contributorId)
      .eq("status", "published")
      .gte("date", new Date().toISOString()),

    // Total followers
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("followee_id", contributorId),

    // RSVPs in period
    supabase
      .from("rsvps")
      .select("event_id, events!inner(created_by)", { count: "exact", head: true })
      .eq("events.created_by", contributorId)
      .gte("created_at", sinceIso),

    // Unread DM conversations
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", contributorId),

    // Active team members
    supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributorId)
      .eq("status", "active"),

    // Recent activity log (last 15 entries)
    supabase
      .from("activity_log")
      .select("action, entity_type, entity_id, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(full_name, avatar_url)")
      .eq("contributor_id", contributorId)
      .order("created_at", { ascending: false })
      .limit(15),

    // Top performing event by RSVPs this period
    supabase
      .from("events")
      .select("id, title, date, image_url, rsvps(id)")
      .eq("created_by", contributorId)
      .eq("status", "published")
      .gte("date", sinceIso)
      .order("date", { ascending: true })
      .limit(50),

    // Active admin sessions (for contributor to see who has access)
    supabase
      .from("contributor_access_requests")
      .select("id, admin_id, expires_at, admin:profiles!contributor_access_requests_admin_id_fkey(full_name, avatar_url)")
      .eq("contributor_id", contributorId)
      .eq("status", "approved")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  // Compute top event by RSVP count
  type EventWithRsvps = { id: string; title: string; date: string; image_url: string | null; rsvps: { id: string }[] };
  const topEvent = ((topEventResult.data as EventWithRsvps[] | null) ?? [])
    .map((e) => ({ ...e, rsvp_count: e.rsvps?.length ?? 0 }))
    .sort((a, b) => b.rsvp_count - a.rsvp_count)[0] ?? null;

  return NextResponse.json({
    period,
    stats: {
      active_places: placesResult.count ?? 0,
      upcoming_events: eventsResult.count ?? 0,
      total_followers: followersResult.count ?? 0,
      rsvps_in_period: rsvpsResult.count ?? 0,
      active_team_members: teamResult.count ?? 0,
      unread_inbox: unreadInboxResult.count ?? 0,
    },
    recent_activity: recentActivityResult.data ?? [],
    top_event: topEvent
      ? { id: topEvent.id, title: topEvent.title, date: topEvent.date, image_url: topEvent.image_url, rsvp_count: topEvent.rsvp_count }
      : null,
    active_admin_sessions: activeAccessResult.data ?? [],
  });
}
