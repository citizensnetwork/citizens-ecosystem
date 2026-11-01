/**
 * PATCH /api/automation/suggestions/[id]
 *
 * The owner (or an active editor of the listing) changes the text of a suggestion that is still
 * waiting, without publishing it. Body: `{ edits: { title?, description?, start?, end?, location? } }`
 * for an event, `{ title?, body?, post_date? }` for a news post, `{ value }` for a profile update.
 *
 *   1. who is asking: the caller's own session (`Authorization: Bearer`, like every owner call)
 *   2. the row is read under THEIR session, so RLS decides whether they may see it at all (their own
 *      row, or a listing they are an active editor of; mig 181 and 193)
 *   3. only a pending suggestion can change                                    -> 409 not_pending
 *   4. the edit is laid over the stored payload and checked by the SAME rules as a suggestion from
 *      the Reader (`validateSuggestionEdit` -> `validateSuggestion`)            -> 422 <reason>
 *   5. the write is `edit_listing_suggestion()` (mig 199), a SECURITY DEFINER function that re-checks
 *      owner-or-editor and pending, and changes ONLY `payload`. There is no service-role client here.
 *
 * The row's fingerprint is never touched (the database function cannot touch it): it stays the
 * identity of the source item, so the next Reader run still sees that item as already known.
 *
 * Response: `{ ok: true, payload, warnings }` with the payload exactly as stored (cleaned), or
 * `{ error: reason }`. If mig 199 is not applied yet the function does not exist and this answers
 * 503 `edit_unavailable`; nothing else is affected.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { validateSuggestionEdit } from "@/lib/automation/suggestions";

export const dynamic = "force-dynamic";

/** An event's text is at most about 2.5 KB; this only stops a runaway body. */
const MAX_BODY_CHARS = 50_000;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

type Row = { id: string; kind: string; payload: unknown; source_url: string | null; status: string };

const STATUS_BY_REASON: Record<string, number> = {
  not_found: 404,
  not_pending: 409,
  invalid_payload: 422,
  not_signed_in: 401,
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUUID(id)) return json({ error: "invalid_id" }, 400);

  const { supabase, user } = await getRouteAuth(request);
  if (!user) return json({ error: "unauthorized" }, 401);

  const rl = await checkRateLimit(`suggestion-edit:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return json({ error: "rate_limited" }, 429);

  let edits: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return json({ error: "payload_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    edits = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as { edits?: unknown }).edits : undefined;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Read under the caller's own session: RLS answers "may this person see this row at all".
  const { data, error: readErr } = await supabase
    .from("listing_suggestions")
    .select("id, kind, payload, source_url, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[PATCH /api/automation/suggestions/:id] read", readErr);
    return json({ error: "edit_unavailable" }, 503);
  }
  const row = data as Row | null;
  if (!row) return json({ error: "not_found" }, 404);
  if (row.status !== "pending") return json({ error: "not_pending" }, 409);

  const checked = validateSuggestionEdit(row.kind, row.payload, edits, row.source_url);
  if (!checked.ok) return json({ error: checked.reason }, 422);

  const { data: res, error: writeErr } = await supabase.rpc("edit_listing_suggestion", { _id: id, _payload: checked.payload });
  if (writeErr) {
    console.error("[PATCH /api/automation/suggestions/:id] write", writeErr);
    return json({ error: "edit_unavailable" }, 503);
  }
  const outcome = res as { success?: boolean; reason?: string } | null;
  if (!outcome || !outcome.success) {
    const reason = outcome?.reason ?? "edit_failed";
    return json({ error: reason }, STATUS_BY_REASON[reason] ?? 500);
  }

  return json({ ok: true, payload: checked.payload, warnings: checked.warnings });
}
