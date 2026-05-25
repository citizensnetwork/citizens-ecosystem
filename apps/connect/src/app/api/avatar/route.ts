/**
 * POST /api/avatar
 *
 * Accepts multipart FormData with a single "file" field.
 * Authenticates the user server-side (cookie session), validates
 * and uploads the image to the event-images bucket, then updates
 * the profile's avatar_url.  Uses the admin client for storage so
 * the server-side JWT always satisfies the RLS check regardless of
 * client-session freshness.
 *
 * Returns: { avatar_url: string }
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageFile, safeImageExtension } from "@/lib/validation";

const MAX_AVATAR_BYTES = 15 * 1024 * 1024; // 15 MB (matches validateImageFile cap)

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit
  const rl = checkRateLimit(`avatar:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Parse FormData
  let file: File | null = null;
  try {
    const form = await request.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 4. Validate
  const validationError = validateImageFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "Image must be smaller than 15 MB." },
      { status: 400 }
    );
  }

  // 5. Upload using admin client (server-side, bypasses client-JWT staleness).
  //    Path: {user.id}/avatars/{timestamp}.{ext}  — user-scoped folder.
  const ext = safeImageExtension(file.name);
  const path = `${user.id}/avatars/${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("event-images")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("[api/avatar] storage upload error:", uploadError);
    return NextResponse.json(
      { error: "Storage upload failed. Please try again." },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("event-images").getPublicUrl(path);

  // 6. Update profile (use user-scoped client so RLS audit trail is preserved)
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) {
    console.error("[api/avatar] profile update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save avatar URL. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ avatar_url: publicUrl });
}
