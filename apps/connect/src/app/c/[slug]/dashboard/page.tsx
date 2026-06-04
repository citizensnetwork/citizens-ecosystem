// /c/[slug]/dashboard/page.tsx — Contributor Dashboard home

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import DashboardHomeClient from "@/components/contributor/dashboard/DashboardHomeClient";
import type { ActivityEntry } from "@/types/db";
import { computeInvolvementLevel } from "@/lib/contributors/involvement";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardHomePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { period: periodParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const period = [7, 14, 30, 60, 90, 180, 365].includes(Number(periodParam))
    ? Number(periodParam)
    : 30;

  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceIso = since.toISOString();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoDate = sevenDaysAgo.toISOString().split("T")[0];

  const [
    profileResult,
    eventsResult,
    placesResult,
    followersResult,
    considerResult,
    teamResult,
    recentActivityResult,
    pendingVolunteerResult,
    weeklyAnalyticsResult,
  ] = await Promise.all([
    // Avatar + profile for header
    supabase
      .from("profiles")
      .select("avatar_url, full_name")
      .eq("id", contributor.id)
      .maybeSingle<{ avatar_url: string | null; full_name: string | null }>(),

    // Full events list for Events tab + stats
    supabase
      .from("events")
      .select("id, title, date, category, image_url, rsvps(count), consider_joins(count)")
      .eq("created_by", contributor.id)
      .eq("status", "published")
      .order("date", { ascending: false })
      .limit(20),

    // Places for Events tab + Tools broadcast selector
    supabase
      .from("places")
      .select("id, name, address, cover_photo_url")
      .eq("created_by", contributor.id)
      .order("created_at", { ascending: false })
      .limit(20),

    // Follower count (for involvement badge signals)
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("followee_id", contributor.id),

    // Consider count in period (for quick stat card)
    supabase
      .from("consider_joins")
      .select("event_id, events!inner(created_by)", { count: "exact", head: true })
      .eq("events.created_by", contributor.id)
      .gte("created_at", sinceIso),

    // Active team (for involvement badge)
    supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributor.id)
      .eq("status", "active"),

    // Activity feed
    supabase
      .from("activity_log")
      .select(
        "id, action, entity_type, entity_id, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(full_name, avatar_url)"
      )
      .eq("contributor_id", contributor.id)
      .order("created_at", { ascending: false })
      .limit(12),

    // Pending volunteer applications badge
    supabase
      .from("volunteer_applications")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributor.id)
      .eq("status", "pending"),

    // Weekly analytics (7 days, rsvps + views) for the bar chart
    supabase
      .from("contributor_analytics")
      .select("date, metric, value")
      .eq("contributor_id", contributor.id)
      .eq("entity_type", "contributor")
      .in("metric", ["rsvps", "views"])
      .gte("date", sevenDaysAgoDate)
      .order("date", { ascending: true }),
  ]);

  // Build 7-day weekly chart data (Mon–Sun labels, connects + views per day)
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  type WeeklyPoint = { day: string; connects: number; views: number };
  const weeklyMap: Record<string, WeeklyPoint> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    weeklyMap[key] = { day: DAY_LABELS[d.getDay()], connects: 0, views: 0 };
  }
  for (const row of (weeklyAnalyticsResult.data ?? []) as { date: string; metric: string; value: number }[]) {
    if (weeklyMap[row.date]) {
      if (row.metric === "rsvps") weeklyMap[row.date].connects = row.value;
      if (row.metric === "views") weeklyMap[row.date].views = row.value;
    }
  }
  const weeklyData = Object.values(weeklyMap);

  // Compute involvement level from real signals
  const followersCount = followersResult.count ?? 0;
  const eventsCount = eventsResult.data?.length ?? 0;
  const placesCount = placesResult.data?.length ?? 0;
  const teamSize = teamResult.count ?? 0;
  const involvementLevel = computeInvolvementLevel({
    followers: followersCount,
    events: eventsCount,
    places: placesCount,
    teamSize,
  });

  // Quick stats — total RSVPs (connects) across contributor events in period
  const totalConnects = (eventsResult.data ?? []).reduce(
    (acc, e) => acc + ((e.rsvps as unknown as { count: number }[])?.[0]?.count ?? 0),
    0
  );
  const totalConsidering = considerResult.count ?? 0;

  const stats = {
    connected: totalConnects,
    considering: totalConsidering,
    events: eventsCount,
    places: placesCount,
    total_followers: followersCount,
    pending_volunteers: pendingVolunteerResult.count ?? 0,
  };

  type EventRow = {
    id: string;
    title: string;
    date: string;
    category: string;
    image_url: string | null;
    rsvps: { count: number }[];
    consider_joins: { count: number }[];
  };

  type PlaceRow = {
    id: string;
    name: string;
    address: string | null;
    cover_photo_url: string | null;
  };

  return (
    <DashboardHomeClient
      slug={slug}
      contributorId={contributor.id}
      contributorName={profileResult.data?.full_name ?? contributor.full_name ?? slug}
      avatarUrl={profileResult.data?.avatar_url ?? null}
      involvementLevel={involvementLevel}
      period={period}
      stats={stats}
      recentActivity={(recentActivityResult.data ?? []) as unknown as ActivityEntry[]}
      events={(eventsResult.data ?? []) as unknown as EventRow[]}
      places={(placesResult.data ?? []) as unknown as PlaceRow[]}
      weeklyData={weeklyData}
    />
  );
}
