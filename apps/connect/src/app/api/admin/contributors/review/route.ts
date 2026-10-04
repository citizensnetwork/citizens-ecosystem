/**
 * POST /api/admin/contributors/review
 *
 * Admin → Applications: approve or reject a self-serve Contributor application
 * (founder decision D-12 — nothing of an applicant's is public until this runs).
 *
 * Body: { application_id, action: "approve" | "reject", reason? }
 *   `reason` is required for "reject": the applicant is shown it, in a
 *   notification and in the email.
 *
 * It calls the database functions directly, on the ADMIN'S OWN session —
 * `approve_contributor_application` / `reject_contributor_application` are
 * SECURITY DEFINER with an `is_admin()` guard keyed on `auth.uid()`, so
 * service_role could not run them and must not. Approval copies the applicant's
 * staged profile onto `profiles`, assigns the slug, sets the role and clears any
 * `contributor_hidden` left by an earlier removal, all in one transaction.
 *
 * Afterwards, and only after the database change committed, the applicant is
 * emailed (fail-soft — a mail problem never undoes a decision; the response
 * says whether it was `sent`, `failed` or `skipped`). The applicant's address
 * is a private `profiles` column, so it is read with the service-role client
 * for exactly this purpose, after `requireAdmin` has authorised the call.
 *
 * This replaces the proxy to the `review-contributor-application` edge function
 * and its email deep-link (HMAC) mode. No live deep links exist, and one fewer
 * unauthenticated door is a good thing. The deployed edge function is no longer
 * called from here (RESUME item H5).
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { sendEmail, siteOrigin, type EmailOutcome } from "@/lib/email/send";
import { applicationApprovedEmail, applicationRejectedEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REASON = 1_000;

type RpcResult = { success?: boolean; reason?: string; slug?: string | null; user_id?: string };

/** What the database function can refuse with → an HTTP status and a sentence for the admin. */
const REFUSALS: Record<string, { status: number; message: string }> = {
  not_admin: { status: 403, message: "Forbidden" },
  not_found_or_not_pending: { status: 409, message: "This application has already been reviewed." },
  reason_required: { status: 400, message: "Please give the applicant a reason." },
  reason_too_long: { status: 400, message: `Please keep the reason under ${MAX_REASON} characters.` },
};

/** The applicant's name and (private) email, for the verdict email. Never throws. */
async function applicantContact(applicationId: string): Promise<{ name: string; email: string | null } | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("contributor_applications")
      .select("display_name, profiles:contributor_applications_user_id_fkey(email)")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      display_name?: string | null;
      profiles?: { email?: string | null } | { email?: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { name: row.display_name || "there", email: profile?.email ?? null };
  } catch (err) {
    console.warn("[/api/admin/contributors/review] could not look up the applicant", err instanceof Error ? err.name : "error");
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-review:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  let payload: { application_id?: unknown; action?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const applicationId = typeof payload.application_id === "string" ? payload.application_id : "";
  const action = payload.action;
  if (!isValidUUID(applicationId) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let reason = "";
  if (action === "reject") {
    reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ error: "reason_required", message: REFUSALS.reason_required.message }, { status: 400 });
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json({ error: "reason_too_long", message: REFUSALS.reason_too_long.message }, { status: 400 });
    }
  }

  const { data, error } =
    action === "approve"
      ? await supabase.rpc("approve_contributor_application", { _application_id: applicationId })
      : await supabase.rpc("reject_contributor_application", { _application_id: applicationId, _reason: reason });
  if (error) {
    console.error("[/api/admin/contributors/review] rpc", error);
    return NextResponse.json({ error: "review_failed" }, { status: 500 });
  }

  const result = (data ?? {}) as RpcResult;
  if (!result.success) {
    const known = result.reason ? REFUSALS[result.reason] : undefined;
    if (known) return NextResponse.json({ error: result.reason, message: known.message }, { status: known.status });
    return NextResponse.json({ error: "review_failed" }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: action === "approve" ? "contributor_application_approved" : "contributor_application_rejected",
    targetType: "profile",
    targetId: result.user_id,
    metadata: { application_id: applicationId, ...(action === "approve" ? { slug: result.slug ?? null } : {}) },
  });

  // The decision is made. Tell the applicant — fail-soft.
  let email: EmailOutcome = "skipped";
  const contact = await applicantContact(applicationId);
  if (contact?.email) {
    const origin = siteOrigin(request);
    const mail =
      action === "approve"
        ? applicationApprovedEmail({
            name: contact.name,
            listingUrl: result.slug ? `${origin}/c/${encodeURIComponent(result.slug)}` : origin,
            dashboardUrl: `${origin}/dashboard`,
          })
        : applicationRejectedEmail({ name: contact.name, reason, siteUrl: origin });
    email = await sendEmail({ to: contact.email, ...mail });
  }

  return NextResponse.json({
    success: true,
    action: action === "approve" ? "approved" : "rejected",
    ...(action === "approve" ? { slug: result.slug ?? null } : {}),
    email,
  });
}
