/**
 * POST /api/contributor/apply
 *
 * Proxies the applicant's payload to the `submit-contributor-application`
 * Supabase Edge Function. The Edge Function is the source of truth for
 * insertion + admin email; this route just forwards the caller's Supabase
 * session so RLS applies, and returns a user-friendly shape.
 *
 * Why a Next.js route and not a direct client → Edge Function call?
 *   1. Lets us keep the Edge Function URL out of the browser bundle.
 *   2. Gives us one place to add rate-limit + audit logging later.
 *   3. Works seamlessly from the Capacitor mobile app without CORS churn.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Short-circuit if the caller is already an approved contributor.
  // Without this, the Edge Function inserts a stale pending application,
  // the `protect_role_column` trigger rejects the follow-up status
  // flip (approved is outside the allow-list), and the admin inbox
  // gets a bogus review email.
  const { data: me } = await supabase
    .from("profiles")
    .select("contributor_status")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.contributor_status === "approved") {
    return NextResponse.json(
      { error: "already_approved" },
      { status: 409 },
    );
  }

  // Block duplicate pending applications up-front so the caller gets a
  // clean error instead of an Edge Function 409.
  const { data: existing } = await supabase
    .from("contributor_applications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "already_pending", application_id: existing.id },
      { status: 409 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Minimal server-side validation — the Edge Function re-validates.
  const displayName =
    typeof payload.display_name === "string"
      ? payload.display_name.trim()
      : "";
  if (displayName.length < 2) {
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 },
    );
  }

  // Retrieve the caller's session so we can forward the JWT to the
  // Edge Function. We call the function with `supabase.functions.invoke`
  // which handles the URL + headers for us.
  const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
    "submit-contributor-application",
    { body: payload },
  );

  if (invokeErr) {
    // `invokeErr.context` sometimes contains the upstream Response.
    const context = (invokeErr as { context?: Response }).context;
    let status = 500;
    let upstream: unknown = null;
    if (context) {
      status = context.status;
      try {
        upstream = await context.json();
      } catch {
        /* swallow */
      }
    }
    console.error("[/api/contributor/apply] invoke error", invokeErr, upstream);
    return NextResponse.json(
      { error: "submission_failed", detail: upstream },
      { status },
    );
  }

  return NextResponse.json(invokeData ?? { success: true });
}
