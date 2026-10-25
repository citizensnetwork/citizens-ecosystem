/**
 * POST /api/intake/google-form/status
 *
 * The Google Sheet's read-only window onto the database (C10). The Apps Script calls this about every ten
 * minutes with the slugs of the rows it has published, and writes the answer into each row's Status:
 *   awaiting  → "Awaiting owner" (with its age)
 *   confirmed → "Owner confirmed ✓"
 *   declined  → "Owner declined"
 * The DATABASE holds the state (the listing_claims ledger, migration 196); the Sheet only displays it and
 * never triggers anything, so a stale or edited Sheet can change nothing.
 *
 * Auth is the same HMAC as /api/intake/google-form (lib/intake/gate.ts).
 *
 * Body:     { slugs: string[] }              1 to 200 listing slugs, as they appear in the row's Listing URL
 * Response: { statuses: { [slug]: { status: 'awaiting'|'confirmed'|'declined', age_days: number, reminded: boolean } } }
 *
 * A slug with no ledger row (a listing from before migration 196, or one an admin deleted) is simply left out, so
 * the script leaves that row's Status alone. No email address, name or id ever leaves this route.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateIntakeRequest } from "@/lib/intake/gate";
import { ageInDays } from "@/lib/listingClaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 64_000;
export const MAX_SLUGS = 200;
/** Listing slugs are lower-case letters, digits and hyphens (generate_contributor_slug). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

type LedgerRow = { slug: string; status: "awaiting" | "confirmed" | "declined"; created_at: string; reminder_sent_at: string | null };

export async function POST(request: Request) {
  const gate = await gateIntakeRequest(request, {
    rateKey: "intake-google-form-status",
    logTag: "/api/intake/google-form/status",
    maxBodyChars: MAX_BODY_CHARS,
  });
  if (!gate.ok) return gate.response;

  let slugs: string[];
  try {
    const parsed: unknown = JSON.parse(gate.rawBody);
    const list = parsed && typeof parsed === "object" ? (parsed as { slugs?: unknown }).slugs : null;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_SLUGS) throw new Error("bad list");
    if (!list.every((s): s is string => typeof s === "string" && SLUG_RE.test(s))) throw new Error("bad slug");
    slugs = [...new Set(list)];
  } catch {
    return NextResponse.json({ error: "invalid_slugs" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listing_claims")
    .select("slug, status, created_at, reminder_sent_at")
    .in("slug", slugs)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[/api/intake/google-form/status] ledger read", error);
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }

  const now = Date.now();
  const statuses: Record<string, { status: LedgerRow["status"]; age_days: number; reminded: boolean }> = {};
  // Oldest first, so if a slug ever appears twice the newest request wins.
  for (const row of (data ?? []) as LedgerRow[]) {
    statuses[row.slug] = { status: row.status, age_days: ageInDays(row.created_at, now), reminded: row.reminder_sent_at !== null };
  }
  return NextResponse.json({ statuses });
}
