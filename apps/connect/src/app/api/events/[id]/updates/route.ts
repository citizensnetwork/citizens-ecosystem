import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_BODY = 1000;

/** GET — list recent updates for an event (public). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_updates")
    .select("id, event_id, author_id, body, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ updates: data ?? [] });
}

/** POST — create a new update (RLS enforces creator/admin only). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { body?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Update must be ${MAX_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("event_updates")
    .insert({ event_id: id, author_id: user.id, body })
    .select("id, event_id, author_id, body, created_at")
    .single();

  if (error) {
    // RLS violations surface as "new row violates row-level security policy".
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ update: data }, { status: 201 });
}
