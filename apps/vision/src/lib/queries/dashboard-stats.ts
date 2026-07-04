import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 14c: query helper for `mv_org_dashboard_stats` (migration 015).
 *
 * Reads are routed through the `get_org_dashboard_stats(uuid)`
 * SECURITY DEFINER function so membership is checked server-side,
 * preventing direct-SELECT bypass on the underlying materialized view
 * (materialized views do not participate in RLS).
 */

export interface OrgDashboardStats {
  org_id: string;
  total_activities: number;
  activities_last_30d: number;
  total_participants: number;
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_goals: number;
  achieved_goals: number;
  active_goals: number;
  total_departments: number;
  total_members: number;
  latest_activity_at: string | null;
  refreshed_at: string;
}

export async function getOrgDashboardStats(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgDashboardStats | null> {
  const { data, error } = await supabase.rpc("get_org_dashboard_stats", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const rows = (data ?? []) as OrgDashboardStats[];
  return rows[0] ?? null;
}

/**
 * Force a refresh of the materialized view. Normally the scheduled
 * pg_cron job (every 10 minutes) keeps it fresh; callers only need
 * this after bulk imports or admin-triggered rebuilds.
 */
export async function refreshDashboardStats(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc("refresh_org_dashboard_stats");
  if (error) throw error;
}
