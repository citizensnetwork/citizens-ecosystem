import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** GET /api/featured — returns active featured listings with joined event/place data */
export async function GET() {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("featured_listings")
      .select(
        `id, entity_type, entity_id, cover_image_url, tagline, priority, starts_at, ends_at, events(id, title, description, date, end_date, location, latitude, longitude, category, image_url, status), places(id, name, description, address, latitude, longitude, category_id, categories(name))`
      )
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[API featured GET]", error);
      return NextResponse.json(
        { error: "Failed to load featured listings" },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[API featured GET]", err);
    return NextResponse.json(
      { error: "Failed to load featured listings" },
      { status: 500 }
    );
  }
}

/** POST /api/featured — create a featured listing (admin only) */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(`featured:${user.id}`, RATE_LIMITS.heavy);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    let body: {
      entity_type?: string;
      entity_id?: string;
      cover_image_url?: string;
      tagline?: string;
      priority?: number;
      starts_at?: string;
      ends_at?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { entity_type, entity_id, cover_image_url, tagline, priority, starts_at, ends_at } = body;

    if (!entity_type || !["event", "place"].includes(entity_type)) {
      return NextResponse.json({ error: "entity_type must be 'event' or 'place'" }, { status: 400 });
    }
    if (!entity_id || !isValidUUID(entity_id)) {
      return NextResponse.json({ error: "Valid entity_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("featured_listings")
      .insert({
        entity_type,
        entity_id,
        cover_image_url: cover_image_url ?? null,
        tagline: tagline ?? null,
        priority: priority ?? 0,
        starts_at: starts_at ?? new Date().toISOString(),
        ends_at: ends_at ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[API featured POST]", error);
      return NextResponse.json({ error: "Failed to create featured listing" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[API featured POST]", err);
    return NextResponse.json({ error: "Failed to create featured listing" }, { status: 500 });
  }
}

/** DELETE /api/featured — remove a featured listing (admin only) */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.id || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid listing id is required" }, { status: 400 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { error } = await supabase
      .from("featured_listings")
      .delete()
      .eq("id", body.id);

    if (error) {
      console.error("[API featured DELETE]", error);
      return NextResponse.json({ error: "Failed to remove listing" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API featured DELETE]", err);
    return NextResponse.json({ error: "Failed to remove listing" }, { status: 500 });
  }
}
