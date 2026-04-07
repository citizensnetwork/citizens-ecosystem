import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function POST(request: NextRequest) {
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

  const placeId = body.place_id;
  if (!isValidUUID(placeId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const { error } = await supabase
    .from("place_follows")
    .insert({ user_id: user.id, place_id: placeId });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already following" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to follow place" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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

  const placeId = body.place_id;
  if (!isValidUUID(placeId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const { error } = await supabase
    .from("place_follows")
    .delete()
    .eq("user_id", user.id)
    .eq("place_id", placeId);

  if (error) {
    return NextResponse.json({ error: "Failed to unfollow place" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
