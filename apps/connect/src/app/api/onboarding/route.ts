import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function POST(request: Request) {
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
  const {
    interest_ids,
    home_latitude,
    home_longitude,
    notification_radius_km,
    notification_email,
  } = body as {
    interest_ids?: string[];
    home_latitude?: number | null;
    home_longitude?: number | null;
    notification_radius_km?: number;
    notification_email?: string | null;
  };

  // Validate interest IDs
  if (interest_ids && !Array.isArray(interest_ids)) {
    return NextResponse.json(
      { error: "interest_ids must be an array" },
      { status: 400 }
    );
  }

  if (interest_ids) {
    for (const id of interest_ids) {
      if (!isValidUUID(id)) {
        return NextResponse.json(
          { error: "Invalid interest ID" },
          { status: 400 }
        );
      }
    }
  }

  // Validate coordinates
  if (
    home_latitude !== undefined &&
    home_latitude !== null &&
    (typeof home_latitude !== "number" ||
      home_latitude < -90 ||
      home_latitude > 90)
  ) {
    return NextResponse.json(
      { error: "Invalid latitude" },
      { status: 400 }
    );
  }

  if (
    home_longitude !== undefined &&
    home_longitude !== null &&
    (typeof home_longitude !== "number" ||
      home_longitude < -180 ||
      home_longitude > 180)
  ) {
    return NextResponse.json(
      { error: "Invalid longitude" },
      { status: 400 }
    );
  }

  // Validate radius
  const radius =
    notification_radius_km !== undefined ? notification_radius_km : 50;
  if (typeof radius !== "number" || radius < 10 || radius > 200) {
    return NextResponse.json(
      { error: "Radius must be between 10 and 200 km" },
      { status: 400 }
    );
  }

  // Validate notification email
  if (
    notification_email !== undefined &&
    notification_email !== null &&
    notification_email !== ""
  ) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(notification_email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }
  }

  // Update profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      home_latitude: home_latitude ?? null,
      home_longitude: home_longitude ?? null,
      notification_radius_km: radius,
      notification_email: notification_email || null,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("[API onboarding] profile update", profileError);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  // Replace user interests: delete all, then insert new ones
  if (interest_ids) {
    const { error: deleteError } = await supabase
      .from("user_interests")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[API onboarding] delete interests", deleteError);
      return NextResponse.json(
        { error: "Failed to update interests" },
        { status: 500 }
      );
    }

    if (interest_ids.length > 0) {
      const rows = interest_ids.map((interest_id) => ({
        user_id: user.id,
        interest_id,
      }));

      const { error: insertError } = await supabase
        .from("user_interests")
        .insert(rows);

      if (insertError) {
        console.error("[API onboarding] insert interests", insertError);
        return NextResponse.json(
          { error: "Failed to save interests" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}
