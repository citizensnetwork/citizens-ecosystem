// /c/[slug]/dashboard/page.tsx — Contributor Dashboard home tab
// Shows quick-action row + analytics summary cards + recent activity feed.

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import DashboardHomeClient from "@/components/contributor/dashboard/DashboardHomeClient";
import type { ActivityEntry } from "@/types/db";

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

  // Parallel data fetch
  const [
    placesResult,
    eventsResult,
    followersResult,
    rsvpsResult,
    teamResult,
    recentActivityResult,
    draftCountResult,
    pendingVolunteerResult,
  ] = await Promise.all([
    supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("created_by", contributor.id),

    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("created_by", contributor.id)
      .eq("status", "published")
      .gte("date", new Date().toISOString()),

    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("followee_id", contributor.id),

    supabase
      .from("rsvps")
      .select("event_id, events!inner(created_by)", { count: "exact", head: true })
      .eq("events.created_by", contributor.id)
      .gte("created_at", sinceIso),

    supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributor.id)
      .eq("status", "active"),

    supabase
      .from("activity_log")
      .select(
        "id, action, entity_type, entity_id, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(full_name, avatar_url)"
      )
      .eq("contributor_id", contributor.id)
      .order("created_at", { ascending: false })
      .limit(12),

    supabase
      .from("contributor_drafts")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributor.id),

    supabase
      .from("volunteer_applications")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", contributor.id)
      .eq("status", "pending"),
  ]);

  const stats = {
    active_places: placesResult.count ?? 0,
    upcoming_events: eventsResult.count ?? 0,
    total_followers: followersResult.count ?? 0,
    rsvps_in_period: rsvpsResult.count ?? 0,
    active_team_members: teamResult.count ?? 0,
    drafts: draftCountResult.count ?? 0,
    pending_volunteers: pendingVolunteerResult.count ?? 0,
  };

  return (
    <DashboardHomeClient
      slug={slug}
      contributorId={contributor.id}
      period={period}
      stats={stats}
      recentActivity={(recentActivityResult.data ?? []) as unknown as ActivityEntry[]}
    />
  );
}
