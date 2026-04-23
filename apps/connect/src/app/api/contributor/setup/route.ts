/**
 * POST /api/contributor/setup — complete the minimum-bio gate for a
 *                               freshly-promoted contributor.
 *
 * Required:  display_name (1..120)
 * Optional:  contact_email / website_url / bio (<=500)
 *
 * On success, clears `profiles.bio_setup_required` so middleware stops
 * redirecting to /contributor/setup.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  display_name?: string;
  contact_email?: string | null;
  website_url?: string | null;
  bio?: string | null;
};

function cleanStr(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]{4,400}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`contributor-setup:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  // Eligibility check: user must currently be a contributor with bio
  // setup required. We fetch role+flag in one query and short-circuit.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, bio_setup_required")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "contributor") {
    return NextResponse.json(
      { error: "Only contributors may complete contributor setup." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const display = cleanStr(body.display_name, 120);
  if (!display || display.length < 1) {
    return NextResponse.json(
      { error: "Display name is required." },
      { status: 400 },
    );
  }

  const contactEmail = cleanStr(body.contact_email, 200);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return NextResponse.json(
      { error: "Contact email is not valid." },
      { status: 400 },
    );
  }

  const website = cleanStr(body.website_url, 400);
  if (website && !URL_RE.test(website)) {
    return NextResponse.json(
      { error: "Website URL must start with http(s)://" },
      { status: 400 },
    );
  }

  const bio = cleanStr(body.bio, 500);

  const patch: Record<string, unknown> = {
    full_name: display,
    bio_setup_required: false,
  };
  if (contactEmail !== null) patch.notification_email = contactEmail;
  if (website !== null) patch.website_url = website;
  if (bio !== null) patch.bio = bio;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);
  if (error) {
    console.error("[contributor/setup]", error);
    return NextResponse.json(
      { error: "Failed to save contributor profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
