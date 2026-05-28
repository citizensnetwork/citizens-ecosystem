/**
 * CSV builder for contributor analytics exports.
 * No third-party deps — keeps Stage H exports lean.
 *
 * Escapes per RFC 4180:
 *   - Wraps fields containing comma, quote, CR, or LF in quotes.
 *   - Doubles embedded quotes.
 *   - Joins rows with CRLF.
 */

export interface AnalyticsRow {
  date: string;
  metric: string;
  value: number;
  entity_type: string;
  entity_id: string | null;
}

/**
 * Neutralise CSV formula injection (OWASP CSV Injection).
 * Excel/Sheets evaluate values starting with `=`, `+`, `-`, `@` or TAB/CR
 * as formulas. Prefix with a single quote so the spreadsheet renders the
 * literal text. Numbers pass through untouched.
 */
function neutraliseFormula(str: string): string {
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = typeof value === "number" ? raw : neutraliseFormula(raw);
  if (/[,"\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildAnalyticsCsv(rows: AnalyticsRow[]): string {
  const header = ["date", "metric", "value", "entity_type", "entity_id"].join(",");
  const body = rows.map((r) =>
    [r.date, r.metric, r.value, r.entity_type, r.entity_id].map(escapeField).join(",")
  );
  return [header, ...body].join("\r\n");
}

/**
 * Sanitises a filename token so it is safe in a `Content-Disposition`
 * header on Windows + macOS + Linux. Strips path separators and
 * control characters; collapses other non-alphanumeric chars to `_`.
 */
export function sanitiseExportFilename(token: string): string {
  return token
    .replace(/[\x00-\x1F\x7F/\\:*?"<>|]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "export";
}
