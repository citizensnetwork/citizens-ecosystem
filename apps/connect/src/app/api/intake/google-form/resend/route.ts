/**
 * POST /api/intake/google-form/resend
 *
 * The sheet's Resend tick. HMAC, same secret. Rotates the single-use token
 * and emails the account again. The original 7-day expiry does not move.
 * Refuses inside 10 minutes or after 8 resends (the database), and also
 * 3 times an hour per request (the rate limiter).
 *
 * Body: { id: uuid }
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseEmail } from "@/lib/contributorFields";
import { sendEmail, siteOrigin } from "@/lib/email/send";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { readSignedIntake } from "@/lib/intake/signedIntake";
import { newUpgradeToken } from "@/lib/intake/upgradeToken";
import { settleFlaggedUpgrade, upgradeEmail } from "@/lib/intake/upgradeSideEffects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };

type ResendResult = {
  success?: boolean;
  reason?: string;
  request_id?: string;
  profile_id?: string;
  display_name?: string;
  expires_at?: string;
  notify_admin?: boolean;
  logo_storage_path?: string | null;
  cover_storage_path?: string | null;
};

export async function POST(request: Request) {
  const signed = await readSignedIntake(request, { bucket: "google-form-resend", maxBodyChars: 4_000 });
  if (!signed.ok) return signed.response;

  const id = signed.body.id;
  if (!isValidUUID(id)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const rl = await checkRateLimit(`intake-upgrade-resend:${id}`, RESEND_LIMIT);
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited", message: "Resend is limited. Try again later." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  const admin = createAdminClient();
  const token = newUpgradeToken();
  const { data, error } = await admin.rpc("resend_intake_upgrade", { _id: id, _token_hash: token.hash });
  const row = (data ?? {}) as ResendResult;
  if (error) {
    console.error("[/api/intake/google-form/resend]", error.code ?? "failed");
    return NextResponse.json({ error: "resend_failed" }, { status: 500 });
  }
  if (row.reason === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (row.reason === "expired") {
    await settleFlaggedUpgrade(admin, row, "expired");
    return NextResponse.json({ error: "expired", message: "The confirmation expired. Tick Approve again to start a new one." }, { status: 410 });
  }
  if (row.reason === "rate_limited") {
    return NextResponse.json({ error: "rate_limited", message: "Resend is limited. Try again in a few minutes." }, { status: 429 });
  }
  if (!row.success || row.reason === "not_found") {
    return NextResponse.json({ error: row.reason ?? "not_found" }, { status: row.reason === "not_found" ? 404 : 409 });
  }

  const { data: profile } = await admin.from("profiles").select("email").eq("id", row.profile_id ?? "").maybeSingle();
  const to = normaliseEmail((profile as { email?: string } | null)?.email);
  if (!to || !row.display_name || !row.expires_at) {
    return NextResponse.json(
      { error: "email_failed", message: "The link was rotated, but the confirmation email could not be addressed. Tick Resend again later." },
      { status: 502 },
    );
  }

  const email = await sendEmail({
    to,
    ...upgradeEmail({ name: row.display_name, origin: siteOrigin(request), rawToken: token.raw, expiresAt: row.expires_at }),
  });
  if (email !== "sent") {
    return NextResponse.json(
      { success: true, status: "awaiting_confirmation", email, message: "The link was rotated, but the email could not be sent. Tick Resend again later." },
      { status: 200 },
    );
  }

  return NextResponse.json({
    success: true,
    status: "awaiting_confirmation",
    email: "sent",
    message: "Confirmation email sent again. It uses the same expiry as the first one.",
  });
}
