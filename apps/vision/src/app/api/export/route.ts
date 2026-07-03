import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { generateCSV } from "@/lib/metrics/analytics";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { requireOrgRole, type OrgRole } from "@/lib/supabase/rbac";

// Whitelist of (resource, export_type) combinations and the minimum
// role required. Platform admins are always allowed (checked via
// requireOrgRole membership list).
const EXPORT_ROLE_MATRIX: Record<string, readonly OrgRole[]> = {
  activities: ["org_member", "org_manager", "org_admin", "platform_admin"],
  metrics: ["org_manager", "org_admin", "platform_admin"],
  map: ["org_member", "org_manager", "org_admin", "platform_admin"],
  report: ["org_admin", "platform_admin"],
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = body.org_id as string;
  const exportType = body.export_type as string;
  const resource = body.resource as string;
  const dateFrom = (body.date_from as string) ?? "1970-01-01";
  const dateTo = (body.date_to as string) ?? "2099-12-31";
  const filters = (body.filters as Record<string, unknown>) ?? {};

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (!exportType || !["csv", "pdf", "png"].includes(exportType)) {
    return NextResponse.json(
      { error: "export_type must be csv, pdf, or png" },
      { status: 400 }
    );
  }

  if (!resource || !["activities", "metrics", "map", "report"].includes(resource)) {
    return NextResponse.json(
      { error: "resource must be activities, metrics, map, or report" },
      { status: 400 }
    );
  }

  // Explicit org membership + role-scoped authorization.
  // Reports and metrics are manager/admin-only; activities and map
  // are member+. Prevents data exfiltration even if RLS regresses.
  const allowedRoles = EXPORT_ROLE_MATRIX[resource];
  const auth = await requireOrgRole(supabase, user.id, orgId, allowedRoles);
  if (!auth.ok) return auth.response;

  try {
    if (exportType === "csv" && resource === "activities") {
      // Export activities as CSV
      let query = supabase
        .from("activities")
        .select("id, title, type, date, start_time, end_time, location_name, participant_count, latitude, longitude, departments(name)")
        .eq("org_id", orgId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .limit(50000);

      if (filters.department_id && isValidUUID(filters.department_id as string)) {
        query = query.eq("department_id", filters.department_id as string);
      }
      if (filters.type) {
        query = query.eq("type", filters.type as string);
      }

      const { data: activities, error } = await query;

      if (error) {
        console.error("[export] Query error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      const rows = (activities ?? []).map((a) => ({
        title: a.title,
        type: ACTIVITY_TYPE_LABELS[a.type] ?? a.type,
        date: a.date,
        start_time: a.start_time ?? "",
        end_time: a.end_time ?? "",
        location: a.location_name ?? "",
        participants: a.participant_count,
        department: (a.departments as unknown as { name: string } | null)?.name ?? "",
        latitude: a.latitude ?? "",
        longitude: a.longitude ?? "",
      }));

      const csv = generateCSV(rows as Record<string, unknown>[], [
        { key: "title", label: "Title" },
        { key: "type", label: "Type" },
        { key: "date", label: "Date" },
        { key: "start_time", label: "Start Time" },
        { key: "end_time", label: "End Time" },
        { key: "location", label: "Location" },
        { key: "participants", label: "Participants" },
        { key: "department", label: "Department" },
        { key: "latitude", label: "Latitude" },
        { key: "longitude", label: "Longitude" },
      ]);

      // Log export
      await supabase.from("export_logs").insert({
        org_id: orgId,
        export_type: exportType,
        resource,
        filters,
        row_count: rows.length,
        created_by: user.id,
      });

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="activities-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (exportType === "csv" && resource === "metrics") {
      // Export KPI overview as CSV
      const { data: activities } = await supabase
        .from("activities")
        .select("type, date, participant_count, departments(name)")
        .eq("org_id", orgId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      const rows = (activities ?? []).map((a) => ({
        type: ACTIVITY_TYPE_LABELS[a.type] ?? a.type,
        date: a.date,
        participants: a.participant_count,
        department: (a.departments as unknown as { name: string } | null)?.name ?? "",
      }));

      const csv = generateCSV(rows as Record<string, unknown>[], [
        { key: "type", label: "Activity Type" },
        { key: "date", label: "Date" },
        { key: "participants", label: "Participants" },
        { key: "department", label: "Department" },
      ]);

      await supabase.from("export_logs").insert({
        org_id: orgId,
        export_type: exportType,
        resource,
        filters,
        row_count: rows.length,
        created_by: user.id,
      });

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="metrics-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // PDF and PNG exports return structured data for client-side rendering
    // (server-rendered PDF via react-pdf would require heavy dependency)
    // Log the export request and return structured data
    await supabase.from("export_logs").insert({
      org_id: orgId,
      export_type: exportType,
      resource,
      filters,
      row_count: 0,
      created_by: user.id,
    });

    return NextResponse.json({
      message: `${exportType.toUpperCase()} export for ${resource} logged. Use client-side rendering for ${exportType} generation.`,
      export_type: exportType,
      resource,
    });
  } catch (error) {
    console.error("[export] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
