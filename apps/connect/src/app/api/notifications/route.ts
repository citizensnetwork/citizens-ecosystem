import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/** GET — fetch current user's notifications (newest first, max 50) */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[API notifications GET]", error);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }

  return NextResponse.json({ notifications: data });
}

/** PATCH — mark notification(s) as read */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, all } = body;

  if (all === true) {
    // Mark all as read
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      console.error("[API notifications PATCH all]", error);
      return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[API notifications PATCH]", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** DELETE — delete a single notification */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = body;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[API notifications DELETE]", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
