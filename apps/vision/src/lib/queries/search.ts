import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 16: trigram-backed similarity search helpers.
 *
 * These wrap the `search_*_similar` RPCs from migration 017. They
 * are SECURITY DEFINER + `is_org_member`-guarded server-side, so the
 * caller only needs to pass the orgId they're scoped to.
 *
 * Use these for fuzzy/typo-tolerant search (e.g. "search-as-you-
 * type" inputs). For strict substring filters, the existing list
 * endpoints' `?search=` param is still the right tool — it now
 * uses the same trigram GIN indexes under the hood for `ilike`.
 */

export interface ActivitySearchHit {
  id: string;
  title: string;
  description: string | null;
  date: string;
  type: string;
  similarity_score: number;
}

export interface ProjectSearchHit {
  id: string;
  name: string;
  description: string | null;
  status: string;
  similarity_score: number;
}

export interface GoalSearchHit {
  id: string;
  title: string;
  description: string | null;
  status: string;
  similarity_score: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

export async function searchActivitiesSimilar(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit?: number,
): Promise<ActivitySearchHit[]> {
  const { data, error } = await supabase.rpc("search_activities_similar", {
    p_org_id: orgId,
    p_query: query,
    p_limit: clampLimit(limit),
  });
  if (error) throw error;
  return (data ?? []) as ActivitySearchHit[];
}

export async function searchProjectsSimilar(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit?: number,
): Promise<ProjectSearchHit[]> {
  const { data, error } = await supabase.rpc("search_projects_similar", {
    p_org_id: orgId,
    p_query: query,
    p_limit: clampLimit(limit),
  });
  if (error) throw error;
  return (data ?? []) as ProjectSearchHit[];
}

export async function searchGoalsSimilar(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit?: number,
): Promise<GoalSearchHit[]> {
  const { data, error } = await supabase.rpc("search_goals_similar", {
    p_org_id: orgId,
    p_query: query,
    p_limit: clampLimit(limit),
  });
  if (error) throw error;
  return (data ?? []) as GoalSearchHit[];
}
