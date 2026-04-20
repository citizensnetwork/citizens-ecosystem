/**
 * POST /api/contributor/profile
 *
 * Lets an approved Contributor update the public profile fields
 * specific to their role (bio, website, physical address, gallery,
 * etc.).  Regular profile fields (name, avatar, onboarding, …) still
 * go through their existing routes — this is additive.
 *
 * Authorisation: must be role='contributor' AND
 * contributor_status='approved'.  The RLS policy on `profiles`
 * already allows a user to update their own row; we gate here as
 * well so the UI surface stays clean.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = [
  "bio",
  "website_url",
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "physical_address",
  "physical_latitude",
  "physical_longitude",
  "logo_url",
  "gallery_urls",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role, contributor_status")
    .eq("id", user.id)
    .single();

  if (
    !me ||
    me.role !== "contributor" ||
    me.contributor_status !== "approved"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Whitelist only the keys we allow — prevents a hostile payload
  // from flipping role, contributor_status, slug, etc.
  const update: Partial<Record<AllowedKey, unknown>> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key];
      // Coerce empty strings to null so the column is actually empty
      // rather than holding "".
      update[key] =
        typeof value === "string" && value.trim() === "" ? null : value;
    }
  }

  // Basic shape guards.
  if (
    update.gallery_urls !== undefined &&
    update.gallery_urls !== null &&
    !Array.isArray(update.gallery_urls)
  ) {
    return NextResponse.json(
      { error: "gallery_urls must be an array" },
      { status: 400 },
    );
  }
  if (
    update.physical_latitude !== undefined &&
    update.physical_latitude !== null &&
    typeof update.physical_latitude !== "number"
  ) {
    return NextResponse.json(
      { error: "physical_latitude must be a number" },
      { status: 400 },
    );
  }
  if (
    update.physical_longitude !== undefined &&
    update.physical_longitude !== null &&
    typeof update.physical_longitude !== "number"
  ) {
    return NextResponse.json(
      { error: "physical_longitude must be a number" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error("[/api/contributor/profile] update", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
