import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/types/db";
import {
  decodeCursor,
  buildCursorPage,
  type CursorPage,
} from "@/lib/pagination/cursor";
import { isValidUUID } from "@/lib/validation";

/**
 * Phase 14c domain query layer — projects.
 *
 * Mirrors the shape of queries/activities.ts. Sort order is
 * `(created_at DESC, id DESC)` because `created_at` is not unique
 * under concurrent inserts.
 */

export interface ProjectListFilters {
  orgId: string;
  status?: string | null;
  departmentId?: string | null;
  search?: string | null;
}

type Filterable<T> = {
  eq(column: string, value: unknown): T;
  ilike(column: string, value: unknown): T;
};

function applyFilters<T extends Filterable<T>>(
  query: T,
  filters: ProjectListFilters,
): T {
  let q: T = query.eq("org_id", filters.orgId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.departmentId && isValidUUID(filters.departmentId)) {
    q = q.eq("department_id", filters.departmentId);
  }
  if (filters.search) q = q.ilike("name", `%${filters.search}%`);
  return q;
}

type ProjectWithDept = Project & { departments?: { name: string } | null };

export async function listProjectsCursor(
  supabase: SupabaseClient,
  filters: ProjectListFilters,
  opts: { cursor?: string | null; pageSize: number },
): Promise<CursorPage<ProjectWithDept>> {
  let query = supabase
    .from("projects")
    .select("*, departments(name)");

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

  const rows = (data ?? []) as ProjectWithDept[];
  return buildCursorPage(
    rows,
    opts.pageSize,
    (row) => row.created_at,
    (row) => row.id,
  );
}

export async function listProjectsOffset(
  supabase: SupabaseClient,
  filters: ProjectListFilters,
  opts: { page: number; pageSize: number },
): Promise<{
  data: ProjectWithDept[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const from = (opts.page - 1) * opts.pageSize;
  let query = supabase
    .from("projects")
    .select("*, departments(name)", { count: "exact" });

  query = applyFilters(query, filters);

  query = query
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data ?? []) as ProjectWithDept[],
    total: count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
