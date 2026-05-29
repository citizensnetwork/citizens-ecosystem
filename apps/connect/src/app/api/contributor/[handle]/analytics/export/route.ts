import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import {
  buildAnalyticsCsv,
  sanitiseExportFilename,
  type AnalyticsRow,
} from "@/lib/analytics/csv";
import { buildXlsx, type XlsxCell } from "@/lib/analytics/xlsx";
import type { AnalyticsPeriod } from "@/types/db";

const EXPORT_HEADER = ["date", "metric", "value", "entity_type", "entity_id"];

const VALID_PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];
const VALID_ENTITY_TYPES = ["contributor", "event", "place"] as const;
const VALID_FORMATS = ["csv", "xlsx"] as const;

/**
 * GET /api/contributor/[handle]/analytics/export
 *
 * Streams the contributor's analytics rows as a downloadable file.
 * Owner-only (and admin-with-grant) — the API delegates auth to
 * `checkDashboardAccess` so all owner/admin/RLS rules apply.
 *
 * Query params:
 *   - format     : "csv" (default) | "xlsx". "xlsx" emits a real OOXML
 *                  workbook via the zero-dep writer in @/lib/analytics/xlsx;
 *                  "csv" emits RFC-4180 CSV.
 *   - period     : 7 | 14 | 30 | 60 | 90 | 180 | 365   (default 30)
 *   - entity_type: "contributor" | "event" | "place"   (default "contributor")
 *   - entity_id  : uuid, required when entity_type != "contributor"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Export is heavier than a list fetch — use the heavy bucket.
  const rl = checkRateLimit(`analytics-export:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const periodRaw = parseInt(searchParams.get("period") ?? "30", 10);
  const period = (VALID_PERIODS.includes(periodRaw as AnalyticsPeriod)
    ? periodRaw
    : 30) as AnalyticsPeriod;

  const entityTypeRaw = searchParams.get("entity_type") ?? "contributor";
  const entityType = VALID_ENTITY_TYPES.includes(
    entityTypeRaw as (typeof VALID_ENTITY_TYPES)[number]
  )
    ? entityTypeRaw
    : "contributor";

  const entityId = searchParams.get("entity_id");
  if (entityType !== "contributor" && entityId && !isValidUUID(entityId)) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  const formatRaw = (searchParams.get("format") ?? "csv").toLowerCase();
  const format = (VALID_FORMATS.includes(formatRaw as (typeof VALID_FORMATS)[number])
    ? formatRaw
    : "csv") as (typeof VALID_FORMATS)[number];

  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceIso = since.toISOString().split("T")[0];

  let query = supabase
    .from("contributor_analytics")
    .select("date, metric, value, entity_type, entity_id")
    .eq("contributor_id", contributorId)
    .eq("entity_type", entityType)
    .gte("date", sinceIso)
    .order("date", { ascending: true })
    .order("metric", { ascending: true });

  if (entityType !== "contributor" && entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API analytics export]", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }

  const rows = (data ?? []) as AnalyticsRow[];

  const safeHandle = sanitiseExportFilename(handle);
  const filename = `analytics-${safeHandle}-${period}d.${format}`;

  if (format === "xlsx") {
    // Real OOXML workbook (zero-dep writer). Numbers stay numeric; text is
    // written as inline strings, which are never evaluated as formulas.
    const xlsxRows: XlsxCell[][] = rows.map((r) => [
      r.date,
      r.metric,
      r.value,
      r.entity_type,
      r.entity_id,
    ]);
    const workbook = buildXlsx("Analytics", EXPORT_HEADER, xlsxRows);
    return new NextResponse(workbook.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildAnalyticsCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
