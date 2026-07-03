import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import {
  searchActivitiesSimilar,
  searchProjectsSimilar,
  searchGoalsSimilar,
} from "@/lib/queries/search";

/**
 * GET /api/search?org_id=...&q=...&types=activities,projects,goals
 *
 * Phase 16: Unified fuzzy search endpoint backed by pg_trgm
 * similarity scoring. Returns results grouped by entity type. RLS
 * is enforced inside each `search_*_similar` SECURITY DEFINER RPC
 * via `is_org_member`.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");
  const q = (searchParams.get("q") ?? "").trim();
  const typesParam = searchParams.get("types");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 },
    );
  }

  if (q.length < 2) {
    // Trigram similarity is unreliable below 2 chars and would just
    // return everything. Surface it as a 400 so the UI can hint at
    // the user instead of rendering an empty result list.
    return NextResponse.json(
      { error: "q must be at least 2 characters" },
      { status: 400 },
    );
  }

  const requested = typesParam
    ? new Set(typesParam.split(",").map((s) => s.trim().toLowerCase()))
    : new Set(["activities", "projects", "goals"]);

  try {
    // Run requested searches in parallel — they're independent RPCs.
    const tasks: Array<Promise<unknown>> = [];
    const result: {
      activities?: unknown[];
      projects?: unknown[];
      goals?: unknown[];
    } = {};

    if (requested.has("activities")) {
      tasks.push(
        searchActivitiesSimilar(supabase, orgId, q, limit).then((rows) => {
          result.activities = rows;
        }),
      );
    }
    if (requested.has("projects")) {
      tasks.push(
        searchProjectsSimilar(supabase, orgId, q, limit).then((rows) => {
          result.projects = rows;
        }),
      );
    }
    if (requested.has("goals")) {
      tasks.push(
        searchGoalsSimilar(supabase, orgId, q, limit).then((rows) => {
          result.goals = rows;
        }),
      );
    }

    await Promise.all(tasks);
    return NextResponse.json({ q, ...result });
  } catch (err) {
    console.error("[API search GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
