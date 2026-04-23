import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/terms/accept
 *
 * Records the user's acceptance of the current platform Terms & Community
 * Agreement. Writes both:
 *   - an `indemnity_signatures` row against `platform-terms-v1` (audit trail)
 *   - `profiles.terms_accepted_at = now()` (fast lookup gate)
 *
 * Idempotent: a second call returns 200 { message: "Already accepted" }.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`terms-accept:${user.id}`, RATE_LIMITS.auth);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  let body: { full_name?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawName = body.full_name;
  const fullName =
    typeof rawName === "string" && rawName.trim().length >= 2
      ? rawName.trim().slice(0, 200)
      : null;

  if (!fullName) {
    return NextResponse.json(
      { error: "Full name is required (min 2 characters)" },
      { status: 400 }
    );
  }

  // Look up platform-terms-v1 template
  const { data: template, error: templateError } = await supabase
    .from("indemnity_templates")
    .select("id, version")
    .eq("slug", "platform-terms-v1")
    .single();

  if (templateError || !template) {
    return NextResponse.json(
      { error: "Platform terms template not found" },
      { status: 500 }
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()?.slice(0, 64) ||
    null;

  // Insert signature (idempotent via partial unique index on event_id IS NULL AND place_id IS NULL)
  const { error: insertError } = await supabase.from("indemnity_signatures").insert({
    template_id: template.id,
    user_id: user.id,
    full_name: fullName,
    event_id: null,
    place_id: null,
    template_version: template.version,
    ip_address: ipAddress,
  });

  let alreadySigned = false;
  if (insertError) {
    if (insertError.code === "23505") {
      alreadySigned = true;
    } else {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Race-free: only set terms_accepted_at when still NULL — preserves the
  // original acceptance timestamp on concurrent idempotent calls.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ terms_accepted_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("terms_accepted_at", null);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: alreadySigned ? "Already accepted" : "Accepted",
  });
}
