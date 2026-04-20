/**
 * POST /api/admin/contributors/review
 *
 * Admin-only endpoint used by the in-app review UI and by the email
 * deep-link redirect handler. Proxies to the
 * `review-contributor-application` Supabase Edge Function, which
 * performs the actual state transition + applicant notification.
 *
 * Body:
 *   { application_id, action: "approve" | "reject", reason?: string,
 *     sig?, exp? }   // sig+exp = email deep-link mode
 *
 * In-app mode: we verify the caller is an admin before invoking the
 * Edge Function.  Deep-link mode: we let the Edge Function verify
 * the HMAC signature itself (it's the source of truth for that
 * check).
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  let payload: {
    application_id?: string;
    action?: "approve" | "reject";
    reason?: string;
    sig?: string;
    exp?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.application_id || !payload.action) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Deep-link mode: skip admin check; the Edge Function verifies HMAC.
  // In-app mode: require admin session.
  const isDeepLink = Boolean(payload.sig && payload.exp);
  if (!isDeepLink) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabase.functions.invoke(
    "review-contributor-application",
    { body: payload },
  );

  if (error) {
    const context = (error as { context?: Response }).context;
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
    console.error("[/api/admin/contributors/review] invoke", error, upstream);
    return NextResponse.json(
      { error: "review_failed", detail: upstream },
      { status },
    );
  }

  return NextResponse.json(data ?? { success: true });
}
