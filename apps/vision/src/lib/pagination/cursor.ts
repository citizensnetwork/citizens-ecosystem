/**
 * Phase 14b cursor pagination.
 *
 * The copilot-instructions rule "Never use OFFSET pagination for
 * user-facing lists" was not being followed — `/api/activities`,
 * `/api/projects`, `/api/goals`, and the connect list endpoints all
 * used `.range(offset, offset + limit - 1)` which degrades at scale
 * because PostgreSQL has to scan and discard `offset` rows for every
 * page request.
 *
 * This module introduces a tiny, typed cursor primitive. A cursor is
 * an opaque base64url-encoded JSON object of the shape:
 *
 *   { k: <sort_key_value>, i: <tiebreaker_id> }
 *
 * where `sort_key_value` is whatever column the list is ordered by
 * (typically a TIMESTAMPTZ or DATE) and `tiebreaker_id` is the row's
 * UUID — needed because the sort key is not guaranteed unique.
 *
 * Keeping the shape opaque on the wire lets us change the payload
 * later (compound keys, direction marker) without breaking clients.
 */

export interface CursorPayload {
  /** The value of the primary sort column (ISO date string, number, etc.). */
  k: string | number;
  /** The UUID of the row at the cursor, used as a stable tiebreaker. */
  i: string;
}

/** Encode a cursor payload to a URL-safe opaque string. */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  // Node's Buffer is available in the Next.js runtime (node and edge).
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decode a cursor string supplied by the client. Returns `null` for
 * any malformed input — callers should treat that as "start at the
 * beginning" rather than erroring, because cursors are advisory.
 */
export function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === "object" &&
      "k" in parsed &&
      "i" in parsed &&
      (typeof (parsed as CursorPayload).k === "string" ||
        typeof (parsed as CursorPayload).k === "number") &&
      typeof (parsed as CursorPayload).i === "string"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Default page size used by cursor-paginated endpoints. Kept in sync
 * with `ITEMS_PER_PAGE` so the list UX stays consistent with
 * existing offset-paginated routes.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Parse and clamp a `limit` query-string value. */
export function parsePageSize(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Shape returned by cursor-paginated endpoints. `next_cursor` is
 * `null` when the last page has been reached.
 */
export interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
  page_size: number;
}

/**
 * Build a cursor page from a raw result set that was fetched with
 * `limit = pageSize + 1`. The extra row is used purely to detect
 * whether a next page exists; it is NOT returned to the client.
 *
 * `keyFn` extracts the sort-key value from a row; `idFn` extracts
 * the UUID. These are supplied by the caller because the sort key
 * differs by entity (date for activities, start_date for projects,
 * created_at for everything else).
 */
export function buildCursorPage<T>(
  rows: T[],
  pageSize: number,
  keyFn: (row: T) => string | number,
  idFn: (row: T) => string,
): CursorPage<T> {
  if (rows.length <= pageSize) {
    return { data: rows, next_cursor: null, page_size: pageSize };
  }
  const pageRows = rows.slice(0, pageSize);
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = encodeCursor({ k: keyFn(lastRow), i: idFn(lastRow) });
  return { data: pageRows, next_cursor: nextCursor, page_size: pageSize };
}
