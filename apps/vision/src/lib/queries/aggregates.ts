import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 15: query helpers for pre-aggregated analytics tables.
 *
 * These read from `activity_daily_aggregates` (see migration 016)
 * instead of scanning the raw `activities` table per request. RLS on
 * the aggregate table already restricts rows to org members, so
 * callers only need to pass the orgId they're scoped to.
 */

export interface DailyAggregateRow {
  org_id: string;
  day: string;
  activity_type: string;
  activity_count: number;
  participant_total: number;
  hours_total: number;
  refreshed_at: string;
}

export interface DailyTrendPoint {
  day: string;
  activity_count: number;
  participant_total: number;
  hours_total: number;
}

/**
 * Read daily aggregates for an org within an inclusive date window.
 *
 * `types`, when supplied, filters to specific activity types; an
 * empty/undefined `types` returns all types.
 */
export async function readDailyAggregates(
  supabase: SupabaseClient,
  orgId: string,
  opts: {
    from: string; // ISO date
    to: string;   // ISO date
    types?: readonly string[];
  },
): Promise<DailyAggregateRow[]> {
  // Apply filters BEFORE .order() so the chain mock (and PostgREST)
  // receive them in the canonical where→sort order.
  let query = supabase
    .from("activity_daily_aggregates")
    .select("*")
    .eq("org_id", orgId)
    .gte("day", opts.from)
    .lte("day", opts.to);

  if (opts.types && opts.types.length > 0) {
    query = query.in("activity_type", [...opts.types]);
  }

  const { data, error } = await query.order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailyAggregateRow[];
}

/**
 * Collapse per-type daily rows into a single per-day trend series.
 * Sums across activity_type so the caller gets one point per day.
 *
 * Days with no activity are NOT filled in — callers that need a
 * dense series should zero-fill in application code. Keeping gaps
 * in the aggregate saves storage when orgs have long quiet periods.
 */
export function collapseByDay(rows: DailyAggregateRow[]): DailyTrendPoint[] {
  const byDay = new Map<string, DailyTrendPoint>();
  for (const row of rows) {
    const existing = byDay.get(row.day);
    if (existing) {
      existing.activity_count += row.activity_count;
      existing.participant_total += row.participant_total;
      existing.hours_total += row.hours_total;
    } else {
      byDay.set(row.day, {
        day: row.day,
        activity_count: row.activity_count,
        participant_total: row.participant_total,
        hours_total: row.hours_total,
      });
    }
  }
  return Array.from(byDay.values()).sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );
}

/**
 * Request an on-demand per-org refresh of the aggregates. Called
 * from server actions after a bulk import or an admin-triggered
 * rebuild. Cheap for a single org (<10ms for most tenants).
 */
export async function refreshOrgAggregates(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  const { error } = await supabase.rpc("refresh_activity_daily_aggregates", {
    p_org_id: orgId,
  });
  if (error) throw error;
}

/**
 * Request an incremental refresh for a single day. Called from the
 * activity CREATE/UPDATE server actions so the aggregate stays in
 * sync without waiting for the 30-minute cron.
 */
export async function refreshActivityDay(
  supabase: SupabaseClient,
  orgId: string,
  day: string,
): Promise<void> {
  const { error } = await supabase.rpc("refresh_activity_day", {
    p_org_id: orgId,
    p_day: day,
  });
  if (error) throw error;
}
