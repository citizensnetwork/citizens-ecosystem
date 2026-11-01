/**
 * GET /api/cron/listing-claim-reminders
 *
 * The ONE reminder (C10, founder decision 2026-10-03). A listing made for an owner by the Google Form or by an
 * admin stays live while it waits for them. If they have not answered after REMINDER_AFTER_DAYS (7), they get a
 * single email. Nothing is attached without their yes and nothing ever expires, so this route can only send an
 * email and stamp `reminder_sent_at`; it cannot change a listing or an account.
 *
 * Who calls it: a Vercel Cron (apps/connect/vercel.json, once a day). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; without a CRON_SECRET of at least 32 characters this route does nothing
 * (503, fail closed), and any other caller gets a bare 401. The Google Sheet never calls it.
 *
 * At most once per listing, even if two runs overlap: the stamp is taken with a conditional UPDATE first
 * (`reminder_sent_at is null`), and only the run that wins it sends. If the send then fails (or no mail key is
 * set) the stamp is cleared so tomorrow's run tries again.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteBase } from "@/lib/siteUrl";
import { listingClaimReminderEmail } from "@/lib/email/listingClaimTemplates";
import { REMINDER_AFTER_DAYS } from "@/lib/listingClaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 32;
/** A day's worth at most; the rest wait for tomorrow (the daily volume is a handful). */
const BATCH = 50;

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Due = { id: string; placeholder_id: string; slug: string; claim_email: string };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error("[/api/cron/listing-claim-reminders] CRON_SECRET missing or too short");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("listing_claims")
    .select("id, placeholder_id, slug, claim_email")
    .eq("status", "awaiting")
    .is("reminder_sent_at", null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[/api/cron/listing-claim-reminders] ledger read", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const origin = siteBase(request);
  const tally = { due: (data ?? []).length, sent: 0, skipped: 0, failed: 0 };

  for (const row of (data ?? []) as Due[]) {
    // Win the stamp first: only one run can.
    const stamp = await admin
      .from("listing_claims")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "awaiting")
      .is("reminder_sent_at", null)
      .select("id");
    if (stamp.error || !stamp.data || stamp.data.length === 0) continue;

    const { data: listing } = await admin
      .from("profiles")
      .select("full_name, contributor_hidden, deleted_at")
      .eq("id", row.placeholder_id)
      .maybeSingle();
    const profile = listing as { full_name?: string; contributor_hidden?: boolean; deleted_at?: string | null } | null;
    // A listing an admin has since hidden or removed is not worth a reminder (the stamp stays: it is done).
    if (!profile || profile.contributor_hidden || profile.deleted_at) {
      tally.skipped++;
      continue;
    }

    const outcome = await sendEmail({
      to: row.claim_email,
      ...listingClaimReminderEmail({
        name: profile.full_name || "your listing",
        ownerEmail: row.claim_email,
        listingUrl: `${origin}/c/${encodeURIComponent(row.slug)}`,
        signInUrl: `${origin}/dashboard`,
      }),
    });
    if (outcome === "sent") {
      tally.sent++;
    } else {
      // Not delivered (no mail key, or Resend refused): clear the stamp so the next run tries again.
      await admin.from("listing_claims").update({ reminder_sent_at: null }).eq("id", row.id);
      if (outcome === "skipped") tally.skipped++;
      else tally.failed++;
    }
  }

  console.info("[/api/cron/listing-claim-reminders]", tally);
  return NextResponse.json(tally);
}
