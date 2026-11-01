/**
 * POST /api/intake/google-form/status
 *
 * One HMAC poll, two questions, chosen by the body. The Sheet never changes
 * anything here: it only reads what the database already decided.
 *
 * C10 (migration 196) — `{ slugs: string[] }`, 1 to 200 listing slugs:
 *   { statuses: { [slug]: { status: 'awaiting'|'confirmed'|'declined', age_days, reminded } } }
 *   A slug with no listing_claims row is left out. No email, name or id leaves.
 *
 * Existing-account upgrade (#248, migration 198) — `{ ids: uuid[] }`, at most 40:
 *   { results: { id, status, url, on_map }[] }
 *   Due rows are expired here. Storage paths and the account email stay on the server.
 *
 * Auth is the same HMAC as /api/intake/google-form (lib/intake/gate.ts).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteBase } from "@/lib/siteUrl";
import { gateIntakeRequest } from "@/lib/intake/gate";
import { settleFlaggedUpgrade } from "@/lib/intake/upgradeSideEffects";
import { ageInDays } from "@/lib/listingClaim";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 64_000;
const MAX_SLUGS = 200;
/** Listing slugs are lower-case letters, digits and hyphens (generate_contributor_slug). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

type LedgerRow = { slug: string; status: "awaiting" | "confirmed" | "declined"; created_at: string; reminder_sent_at: string | null };

type UpgradeRow = {
  id?: string;
  status?: string;
  url_slug?: string | null;
  on_map?: boolean;
  notify_admin?: boolean;
  display_name?: string | null;
  logo_storage_path?: string | null;
  cover_storage_path?: string | null;
};

export async function POST(request: Request) {
  const gate = await gateIntakeRequest(request, {
    rateKey: "intake-google-form-status",
    logTag: "/api/intake/google-form/status",
    maxBodyChars: MAX_BODY_CHARS,
  });
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(gate.rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_slugs" }, { status: 400 });
  }

  // Upgrade rows are keyed by request id. Listing rows are keyed by slug.
  // A body that names `ids` is the upgrade poll even when the list is unusable,
  // so a bad id never falls through into the slug reader.
  if ("ids" in body) return upgradeStatuses(request, body.ids);
  return listingStatuses(body.slugs);
}

async function listingStatuses(raw: unknown): Promise<NextResponse> {
  let slugs: string[];
  try {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SLUGS) throw new Error("bad list");
    if (!raw.every((s): s is string => typeof s === "string" && SLUG_RE.test(s))) throw new Error("bad slug");
    slugs = [...new Set(raw)];
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

async function upgradeStatuses(request: Request, raw: unknown): Promise<NextResponse> {
  if (!Array.isArray(raw)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ids = raw.filter(isValidUUID).slice(0, 40);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("intake_upgrade_statuses", { _ids: ids });
  const payload = data as { success?: boolean; results?: UpgradeRow[] } | null;
  if (error || !payload?.success || !Array.isArray(payload.results)) {
    console.error("[/api/intake/google-form/status]", error?.code ?? "failed");
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }

  const origin = siteBase(request);
  const results = [];
  for (const row of payload.results) {
    if (row.notify_admin && row.status === "expired") {
      await settleFlaggedUpgrade(admin, { ...row, request_id: row.id, display_name: row.display_name }, "expired");
    } else if ((row.logo_storage_path || row.cover_storage_path) && (row.status === "declined" || row.status === "expired")) {
      await settleFlaggedUpgrade(admin, { ...row, request_id: row.id, notify_admin: false }, row.status === "declined" ? "declined" : "expired");
    }
    results.push({
      id: row.id,
      status: row.status,
      url: row.status === "confirmed" && row.url_slug ? `${origin}/c/${row.url_slug}` : null,
      on_map: row.on_map === true,
    });
  }

  return NextResponse.json({ results });
}
