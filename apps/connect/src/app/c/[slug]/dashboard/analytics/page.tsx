// /c/[slug]/dashboard/analytics/page.tsx
// Full analytics tab with period selector, per-metric sparkline tables, and CSV export.

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import AnalyticsDashboardClient from "@/components/contributor/dashboard/AnalyticsDashboardClient";
import type { AnalyticsPeriod, TopSearchTerm } from "@/types/db";

export const dynamic = "force-dynamic";

const VALID_PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Analytics — ${slug}` };
}

export default async function AnalyticsDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ period?: string; entity_type?: string; entity_id?: string }>;
}) {
  const { slug } = await params;
  const { period: periodParam, entity_type, entity_id } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/analytics`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const period = (VALID_PERIODS.includes(Number(periodParam) as AnalyticsPeriod)
    ? Number(periodParam)
    : 30) as AnalyticsPeriod;

  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceDate = since.toISOString().split("T")[0];

  const validEntityTypes = ["contributor", "event", "place"] as const;
  const entityType =
    validEntityTypes.includes(entity_type as (typeof validEntityTypes)[number])
      ? entity_type!
      : "contributor";

  let analyticsQuery = supabase
    .from("contributor_analytics")
    .select("date, metric, value, entity_type, entity_id")
    .eq("contributor_id", contributor.id)
    .eq("entity_type", entityType)
    .gte("date", sinceDate)
    .order("date", { ascending: true });

  if (entityType !== "contributor" && entity_id) {
    analyticsQuery = analyticsQuery.eq("entity_id", entity_id);
  }

  const { data: rows } = await analyticsQuery;

  // Aggregate by metric
  type Row = { date: string; metric: string; value: number; entity_type: string; entity_id: string | null };
  const byMetric: Record<string, { date: string; value: number }[]> = {};
  const totals: Record<string, number> = {};
  for (const row of (rows ?? []) as Row[]) {
    if (!byMetric[row.metric]) byMetric[row.metric] = [];
    byMetric[row.metric].push({ date: row.date, value: row.value });
    totals[row.metric] = (totals[row.metric] ?? 0) + row.value;
  }

  // Fetch contributor's events and places for entity selector +
  // platform-wide top search terms this month (Stage L, A64).
  const [eventsResult, placesResult, topTermsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, title")
      .eq("created_by", contributor.id)
      .order("date", { ascending: false })
      .limit(30),
    supabase
      .from("places")
      .select("id, name")
      .eq("created_by", contributor.id)
      .limit(30),
    supabase.rpc("get_top_search_terms", { p_limit: 10, p_days: 30 }),
  ]);

  const topSearchTerms = (topTermsResult.data ?? []) as TopSearchTerm[];

  return (
    <AnalyticsDashboardClient
      slug={slug}
      period={period}
      entityType={entityType}
      entityId={entity_id ?? null}
      byMetric={byMetric}
      totals={totals}
      events={eventsResult.data ?? []}
      places={placesResult.data ?? []}
      topSearchTerms={topSearchTerms}
    />
  );
}
