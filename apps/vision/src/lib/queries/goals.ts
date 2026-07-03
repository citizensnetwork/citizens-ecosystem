import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Goal } from "@/types/db";
import {
  decodeCursor,
  buildCursorPage,
  type CursorPage,
} from "@/lib/pagination/cursor";
import { isValidUUID } from "@/lib/validation";

/**
 * Phase 14c domain query layer — goals.
 * See queries/activities.ts for the compound-cursor rationale.
 */

export interface GoalListFilters {
  orgId: string;
  status?: string | null;
  visionId?: string | null;
  search?: string | null;
}

type Filterable<T> = {
  eq(column: string, value: unknown): T;
  ilike(column: string, value: unknown): T;
};

function applyFilters<T extends Filterable<T>>(
  query: T,
  filters: GoalListFilters,
): T {
  let q: T = query.eq("org_id", filters.orgId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.visionId && isValidUUID(filters.visionId)) {
    q = q.eq("vision_id", filters.visionId);
  }
  if (filters.search) q = q.ilike("title", `%${filters.search}%`);
  return q;
}

type GoalWithVision = Goal & { vision_statements?: { title: string } | null };

export async function listGoalsCursor(
  supabase: SupabaseClient,
  filters: GoalListFilters,
  opts: { cursor?: string | null; pageSize: number },
): Promise<CursorPage<GoalWithVision>> {
  let query = supabase
    .from("goals")
    .select("*, vision_statements(title)");

  query = applyFilters(query, filters);

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.pageSize + 1);

  const cursor = decodeCursor(opts.cursor);
  if (cursor) {
    const k = String(cursor.k);
    query = query.or(
      `created_at.lt.${k},and(created_at.eq.${k},id.lt.${cursor.i})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as GoalWithVision[];
  return buildCursorPage(
    rows,
    opts.pageSize,
    (row) => row.created_at,
    (row) => row.id,
  );
}

export async function listGoalsOffset(
  supabase: SupabaseClient,
  filters: GoalListFilters,
  opts: { page: number; pageSize: number },
): Promise<{
  data: GoalWithVision[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const from = (opts.page - 1) * opts.pageSize;
  let query = supabase
    .from("goals")
    .select("*, vision_statements(title)", { count: "exact" });

  query = applyFilters(query, filters);

  query = query
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data ?? []) as GoalWithVision[],
    total: count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
