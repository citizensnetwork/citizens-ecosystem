import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

/**
 * POST /api/location — upsert user's live location for an event
 * Body: { event_id, latitude, longitude, accuracy? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: location updates are frequent, allow 60/min
    const rl = checkRateLimit(`loc:${user.id}`, { limit: 60, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      });
    }

    let body: { event_id?: string; latitude?: number; longitude?: number; accuracy?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { event_id, latitude, longitude, accuracy } = body;

    if (!event_id || !isValidUUID(event_id) || typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        { error: "event_id, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    // Coordinate range validation
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: "Coordinates out of range" },
        { status: 400 }
      );
    }

    // Validate user has RSVP'd to this event
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (!rsvp) {
      return NextResponse.json(
        { error: "You must RSVP to share location at this event" },
        { status: 403 }
      );
    }

    // Check user has location sharing enabled
    const { data: profile } = await supabase
      .from("profiles")
      .select("location_sharing")
      .eq("id", user.id)
      .single();

    if (!profile?.location_sharing) {
      return NextResponse.json(
        { error: "Location sharing is not enabled" },
        { status: 403 }
      );
    }

    // Upsert location
    const { error } = await supabase
      .from("user_locations")
      .upsert(
        {
          user_id: user.id,
          event_id,
          latitude: Math.round(latitude * 10000) / 10000,
          longitude: Math.round(longitude * 10000) / 10000,
          accuracy: accuracy ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,event_id" }
      );

    if (error) {
      console.error("[API location POST]", error);
      return NextResponse.json(
        { error: "Failed to update location" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API location POST]", err);
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/location?event_id=xxx — get attendee locations for an event
 * Only returns locations for users you can see (fellow RSVP attendees)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit GET to prevent tracking abuse
    const rl = checkRateLimit(`loc-get:${user.id}`, RATE_LIMITS.mutation);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      });
    }

    const eventId = request.nextUrl.searchParams.get("event_id");
    if (!eventId || !isValidUUID(eventId)) {
      return NextResponse.json(
        { error: "Valid event_id query parameter is required" },
        { status: 400 }
      );
    }

    // RLS ensures only fellow attendees can see locations
    const { data, error } = await supabase
      .from("user_locations")
      .select("*, profiles(full_name, avatar_url)")
      .eq("event_id", eventId)
      .gte("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Only last 10 min
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[API location GET]", error);
      return NextResponse.json(
        { error: "Failed to fetch locations" },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[API location GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/location — stop sharing location for an event
 * Body: { event_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { event_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.event_id || !isValidUUID(body.event_id)) {
      return NextResponse.json(
        { error: "Valid event_id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("user_locations")
      .delete()
      .eq("user_id", user.id)
      .eq("event_id", body.event_id);

    if (error) {
      console.error("[API location DELETE]", error);
      return NextResponse.json(
        { error: "Failed to stop sharing" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API location DELETE]", err);
    return NextResponse.json(
      { error: "Failed to stop sharing" },
      { status: 500 }
    );
  }
}
