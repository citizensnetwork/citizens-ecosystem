/**
 * POST /api/intake/google-form/status
 *
 * The sheet polls this (HMAC, same secret as the intake route) for rows
 * left on "Awaiting confirmation". It never creates or changes a listing.
 * Due rows are expired here. The response the sheet sees has no storage
 * paths and no account email.
 *
 * Body: { ids: uuid[] }  (at most 40)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validation";
import { readSignedIntake } from "@/lib/intake/signedIntake";
import { settleFlaggedUpgrade } from "@/lib/intake/upgradeSideEffects";
import { siteOrigin } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusRow = {
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
  const signed = await readSignedIntake(request, { bucket: "google-form-status", maxBodyChars: 16_000 });
  if (!signed.ok) return signed.response;

  const raw = signed.body.ids;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ids = raw.filter(isValidUUID).slice(0, 40);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("intake_upgrade_statuses", { _ids: ids });
  const payload = data as { success?: boolean; results?: StatusRow[] } | null;
  if (error || !payload?.success || !Array.isArray(payload.results)) {
    console.error("[/api/intake/google-form/status]", error?.code ?? "failed");
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }

  const origin = siteOrigin(request);
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
