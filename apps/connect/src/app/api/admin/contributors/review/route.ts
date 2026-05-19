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
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set(["approve", "reject"]);

/**
 * Resolve the caller IP for rate-limit bucketing.
 *
 * On Vercel, the platform normalises `x-forwarded-for` and we can trust
 * its first hop. Off-Vercel, XFF is fully client-controlled and an
 * attacker can rotate the leading value to defeat the per-IP limiter,
 * so we only honour the header when running on a known-trusted edge.
 * When no IP can be determined in deep-link mode we return `null` so
 * the caller can fail closed rather than letting every header-less
 * request share the "unknown" bucket (which would DoS-amplify across
 * legitimate callers).
 */
function getClientIp(req: NextRequest): string | null {
  // `NextRequest.ip` was removed in Next.js 15 — the surviving trustworthy
  // source is Vercel's normalised `x-forwarded-for` (only honoured when
  // we know we are running on Vercel's edge).
  if (process.env.VERCEL) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) {
      const first = fwd.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get("x-real-ip");
    if (real) return real;
  }
  return null;
}

export async function POST(request: NextRequest) {
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

  if (
    !payload.application_id ||
    !isValidUUID(payload.application_id) ||
    !payload.action ||
    !ALLOWED_ACTIONS.has(payload.action)
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Deep-link mode: skip admin check; the Edge Function verifies HMAC.
  // In-app mode: require admin session via shared requireAdmin guard.
  const isDeepLink = Boolean(payload.sig && payload.exp);
  if (isDeepLink) {
    // Deep-link mode: rate-limit by IP to prevent HMAC brute-force enumeration.
    // Fail closed when the client IP cannot be trusted — otherwise every
    // header-less request would share one bucket and could DoS each other.
    const ip = getClientIp(request);
    if (!ip) {
      return NextResponse.json({ error: "client_identity_required" }, { status: 400 });
    }
    const rl = checkRateLimit(`admin-review-deeplink:${ip}`, RATE_LIMITS.heavy);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
      );
    }
  } else {
    const guard = await requireAdmin(supabase);
    if (!guard.ok) return guard.deny;
    const rl = checkRateLimit(`admin-review-inapp:${guard.user.id}`, RATE_LIMITS.mutation);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
      );
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
