import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET: Fetch required indemnity templates + user's existing signatures */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const appliesTo = searchParams.get("applies_to") ?? "events";
  const eventId = searchParams.get("event_id");

  // Fetch required templates
  const { data: templates } = await supabase
    .from("indemnity_templates")
    .select("*")
    .eq("required", true)
    .or(`applies_to.eq.${appliesTo},applies_to.eq.both`)
    .order("created_at");

  if (!templates || templates.length === 0) {
    return NextResponse.json({ templates: [], signatures: [], allSigned: true });
  }

  // Fetch user's existing signatures for these templates
  let sigQuery = supabase
    .from("indemnity_signatures")
    .select("*")
    .eq("user_id", user.id)
    .in("template_id", templates.map((t) => t.id));

  if (eventId && isValidUUID(eventId)) {
    sigQuery = sigQuery.eq("event_id", eventId);
  }

  const { data: signatures } = await sigQuery;

  const signedTemplateIds = new Set((signatures ?? []).map((s) => s.template_id));
  const allSigned = templates.every((t) => signedTemplateIds.has(t.id));

  return NextResponse.json({ templates, signatures: signatures ?? [], allSigned });
}

/** POST: Sign an indemnity form */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`indemnity:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { template_id, full_name, event_id, place_id } = body;

  if (!template_id || !isValidUUID(template_id)) {
    return NextResponse.json({ error: "Invalid template_id" }, { status: 400 });
  }

  if (!full_name || typeof full_name !== "string" || full_name.trim().length < 2) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  if (event_id && !isValidUUID(event_id)) {
    return NextResponse.json({ error: "Invalid event_id" }, { status: 400 });
  }

  if (place_id && !isValidUUID(place_id)) {
    return NextResponse.json({ error: "Invalid place_id" }, { status: 400 });
  }

  // Get template version
  const { data: template } = await supabase
    .from("indemnity_templates")
    .select("version")
    .eq("id", template_id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("indemnity_signatures").insert({
    template_id,
    user_id: user.id,
    full_name: full_name.trim(),
    event_id: event_id || null,
    place_id: place_id || null,
    template_version: template.version,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });

  if (insertError) {
    // Duplicate = already signed
    if (insertError.code === "23505") {
      return NextResponse.json({ message: "Already signed" });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Signed successfully" });
}
