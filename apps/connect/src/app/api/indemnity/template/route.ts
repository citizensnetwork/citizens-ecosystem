import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/indemnity/template?slug=...
 *
 * Public (RLS allows anyone to read indemnity_templates). Also returns
 * whether the current user has already signed this template (globally,
 * ignoring event_id/place_id scoping) — used by the first-time waiver
 * modal to decide whether to show itself.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const { data: template, error } = await supabase
    .from("indemnity_templates")
    .select("id, slug, title, body, version, applies_to, required")
    .eq("slug", slug)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasSigned = false;
  if (user) {
    // `hasSigned` is a GLOBAL-per-template check — it ignores event_id / place_id
    // scoping. This is intentional for the attendee-participation-waiver pre-flight
    // in RSVPButton, where a user should only sign once across all events.
    // If you need per-event/per-place enforcement, query `indemnity_signatures`
    // directly from the caller rather than relying on this endpoint.
    const { data: sig } = await supabase
      .from("indemnity_signatures")
      .select("id")
      .eq("template_id", template.id)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    hasSigned = Boolean(sig);
  }

  return NextResponse.json({ template, hasSigned });
}
