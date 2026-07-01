import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitiseExportFilename } from "@/lib/analytics/csv";
import { buildXlsx, type XlsxCell } from "@/lib/analytics/xlsx";

const VALID_STATUSES = ["open", "in_review", "actioned", "declined", "all"] as const;
const VALID_FORMATS = ["csv", "xlsx"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];
type ValidFormat = (typeof VALID_FORMATS)[number];

const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "status",
  "title",
  "body",
  "page_url",
  "submitter_id",
  "submitter_name",
  "submitter_email",
  "admin_response",
  "resolved_at",
  "resolved_by",
] as const;

/**
 * GET /api/admin/suggestions/export?format=csv|xlsx&status=open|...|all
 *
 * Admin-only. Streams a flat tabular export of the suggestion inbox.
 *
 *   - format : "csv" (default) | "xlsx". "xlsx" emits a real OOXML workbook
 *              via the zero-dep writer in @/lib/analytics/xlsx.
 *   - status : `open` | `in_review` | `actioned` | `declined` | `all`
 *              (default `all`).
 *
 * Rate-limited via `RATE_LIMITS.heavy` (export is heavier than list).
 * `Cache-Control: no-store` so personal data never lands in shared caches.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimit(`suggestions-export:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);

  const statusRaw = searchParams.get("status") ?? "all";
  const status: ValidStatus = VALID_STATUSES.includes(statusRaw as ValidStatus)
    ? (statusRaw as ValidStatus)
    : "all";

  const formatRaw = (searchParams.get("format") ?? "csv").toLowerCase();
  const format: ValidFormat = VALID_FORMATS.includes(formatRaw as ValidFormat)
    ? (formatRaw as ValidFormat)
    : "csv";

  let query = supabase
    .from("suggestions")
    .select(
      "id, created_at, status, title, body, page_url, user_id, admin_response, resolved_at, resolved_by, user:profiles!suggestions_user_id_fkey(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API admin suggestions export]", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 },
    );
  }

  const rows = (data ?? []).map((s) => {
    const submitter = s.user as
      | { full_name?: string; email?: string }
      | { full_name?: string; email?: string }[]
      | null;
    const submitterObj = Array.isArray(submitter) ? submitter[0] : submitter;
    return {
      id: s.id as string,
      created_at: s.created_at as string,
      status: s.status as string,
      title: s.title as string,
      body: s.body as string,
      page_url: s.page_url as string,
      submitter_id: (s.user_id as string | null) ?? "",
      submitter_name: submitterObj?.full_name ?? "",
      submitter_email: submitterObj?.email ?? "",
      admin_response: (s.admin_response as string | null) ?? "",
      resolved_at: (s.resolved_at as string | null) ?? "",
      resolved_by: (s.resolved_by as string | null) ?? "",
    };
  });

  const filename = `suggestions-${sanitiseExportFilename(status)}-${new Date()
    .toISOString()
    .slice(0, 10)}.${format}`;

  if (format === "xlsx") {
    // Real OOXML workbook. All columns are text → inline strings, which are
    // never evaluated as formulas (so the CSV formula-injection guard isn't
    // needed on this path).
    const xlsxRows: XlsxCell[][] = rows.map((r) =>
      EXPORT_COLUMNS.map((col) => String(r[col] ?? "")),
    );
    const workbook = buildXlsx("Suggestions", [...EXPORT_COLUMNS], xlsxRows);
    return new NextResponse(workbook.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = buildSuggestionsCsv(rows);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string>;

/**
 * Neutralise CSV formula injection (OWASP CSV Injection).
 * Excel/Sheets evaluate values starting with `=`, `+`, `-`, `@` or TAB/CR
 * as formulas — a malicious suggestion title like `=cmd|'/c calc'!A0`
 * would execute on the admin's machine. Prefix with a single quote so the
 * spreadsheet renders the literal text instead.
 */
function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC-4180-conformant CSV escape: wrap on , " \r \n; double embedded quotes. */
function escapeField(value: string): string {
  const safe = neutraliseFormula(value);
  if (/[,"\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildSuggestionsCsv(rows: ExportRow[]): string {
  const header = EXPORT_COLUMNS.join(",");
  const body = rows.map((r) =>
    EXPORT_COLUMNS.map((col) => escapeField(String(r[col] ?? ""))).join(","),
  );
  return [header, ...body].join("\r\n");
}
