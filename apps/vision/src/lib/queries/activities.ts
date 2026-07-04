import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityWithTags } from "@/types/db";
import {
  decodeCursor,
  buildCursorPage,
  type CursorPage,
} from "@/lib/pagination/cursor";
import { isValidUUID } from "@/lib/validation";

/**
 * Phase 14b domain query layer — activities.
 *
 * Centralises the filter-and-paginate query that previously lived
 * inline in `/api/activities/route.ts`. Supports both offset-based
 * pagination (legacy) and cursor pagination (preferred; stable at
 * scale).
 *
 * Activities are ordered by `(date DESC, id DESC)`. The compound
 * order is important: `date` is a DATE column and is not unique, so
 * a pure `date DESC` cursor would skip or repeat rows at page
 * boundaries when two activities share the same date. The `id DESC`
 * tiebreaker is lexicographic over UUID strings and therefore
 * deterministic.
 */

export interface ActivityListFilters {
  orgId: string;
  departmentId?: string | null;
  type?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
}

// Minimal structural type for the chainable PostgREST builder. This
// avoids pulling in Supabase's internal generic soup while keeping the
// filter helper strongly typed.
type Filterable<T> = {
  eq(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  ilike(column: string, value: unknown): T;
};

function applyFilters<T extends Filterable<T>>(
  query: T,
  filters: ActivityListFilters,
): T {
  let q: T = query.eq("org_id", filters.orgId);
  if (filters.departmentId && isValidUUID(filters.departmentId)) {
    q = q.eq("department_id", filters.departmentId);
  }
  if (filters.type) {
    q = q.eq("type", filters.type);
  }
  if (filters.dateFrom) {
    q = q.gte("date", filters.dateFrom);
  }
  if (filters.dateTo) {
    q = q.lte("date", filters.dateTo);
  }
  if (filters.search) {
    q = q.ilike("title", `%${filters.search}%`);
  }
  return q;
}

/**
 * Cursor-paginated activity listing. Pass `cursor = null` for the
 * first page. Returns `next_cursor = null` when there are no more
 * rows.
 */
export async function listActivitiesCursor(
  supabase: SupabaseClient,
  filters: ActivityListFilters,
  opts: { cursor?: string | null; pageSize: number },
): Promise<CursorPage<ActivityWithTags>> {
  // Apply filters before ordering/limit so chainable-mock tests that
  // stub terminal methods (e.g. only `.limit` resolving) still work,
  // and so the final SQL reads naturally: WHERE … ORDER BY … LIMIT.
  let query = supabase
    .from("activities")
    .select("*, activity_tags(tag)");

  query = applyFilters(query, filters);

  query = query
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.pageSize + 1);

  const cursor = decodeCursor(opts.cursor);
  if (cursor) {
    // Compound keyset predicate: (date, id) strictly less than (k, i).
    // Supabase's PostgREST supports `or` with row-constructor semantics
    // via the .or() helper.
    const k = String(cursor.k);
    query = query.or(
      `date.lt.${k},and(date.eq.${k},id.lt.${cursor.i})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ActivityWithTags[];
  return buildCursorPage(
    rows,
    opts.pageSize,
    (row) => row.date,
    (row) => row.id,
  );
}

/**
 * Offset-paginated listing, retained so existing callers keep working.
 * New routes should use {@link listActivitiesCursor}.
 */
export async function listActivitiesOffset(
  supabase: SupabaseClient,
  filters: ActivityListFilters,
  opts: { page: number; pageSize: number },
): Promise<{
  data: ActivityWithTags[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const from = (opts.page - 1) * opts.pageSize;
  let query = supabase
    .from("activities")
    .select("*, activity_tags(tag)", { count: "exact" });

  query = applyFilters(query, filters);

  query = query
    .order("date", { ascending: false })
    .range(from, from + opts.pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data ?? []) as ActivityWithTags[],
    total: count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
