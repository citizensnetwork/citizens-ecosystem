/**
 * POST /api/media/upload
 *
 * Single authenticated upload endpoint for event/place cover images and
 * gallery media (images + videos). Mirrors /api/avatar: the browser Supabase
 * client's JWT is unreliable at the Storage endpoint (uploads can arrive as
 * `anon` → "new row violates row-level security policy"), so all binary
 * uploads are routed through here and written with the service-role admin
 * client. The destination path is ALWAYS scoped to the authenticated user's
 * id server-side, so a caller can never write outside its own folder.
 *
 * Body: multipart FormData
 *   - file:     the image/video File (required)
 *   - scope:    "event-cover" | "place-cover" | "event-gallery" | "place-gallery" (required)
 *   - entityId: UUID — required for the *-gallery scopes (groups media per entity)
 *
 * Returns: { url: string, kind: "image" | "video" }
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateMediaFile,
  detectMediaKind,
  safeMediaExtension,
  isValidUUID,
} from "@/lib/validation";

type Scope = "event-cover" | "place-cover" | "event-gallery" | "place-gallery";

const SCOPE_CONFIG: Record<
  Scope,
  { bucket: "event-images" | "place-images"; needsEntity: boolean; folder: (entityId: string) => string }
> = {
  "event-cover": { bucket: "event-images", needsEntity: false, folder: () => "" },
  "place-cover": { bucket: "place-images", needsEntity: false, folder: () => "covers" },
  "event-gallery": { bucket: "event-images", needsEntity: true, folder: (id) => `gallery/events/${id}` },
  "place-gallery": { bucket: "place-images", needsEntity: true, folder: (id) => `gallery/places/${id}` },
};

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit (per user) — binary uploads are heavier than a normal mutation.
  const rl = checkRateLimit(`media-upload:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Parse FormData
  let file: File | null = null;
  let scope: string | null = null;
  let entityId: string | null = null;
  try {
    const form = await request.formData();
    file = form.get("file") as File | null;
    scope = (form.get("scope") as string | null) ?? null;
    entityId = (form.get("entityId") as string | null) ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 4. Validate scope
  if (!scope || !(scope in SCOPE_CONFIG)) {
    return NextResponse.json({ error: "Invalid upload scope" }, { status: 400 });
  }
  const config = SCOPE_CONFIG[scope as Scope];

  if (config.needsEntity && (!entityId || !isValidUUID(entityId))) {
    return NextResponse.json({ error: "Missing or invalid entityId" }, { status: 400 });
  }

  // 5. Validate file (image or video, size caps live in validateMediaFile)
  const validationError = validateMediaFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const kind = detectMediaKind(file);
  if (!kind) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // 6. Build a server-controlled, user-scoped path. The client never supplies
  //    the path, so it cannot escape its own folder even though we upload with
  //    the admin (RLS-bypassing) client.
  const ext = safeMediaExtension(file.name, kind);
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = config.folder(entityId ?? "");
  const segments = [user.id, ...(folder ? folder.split("/") : []), `${Date.now()}-${rand}.${ext}`];
  const path = segments.join("/");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(config.bucket)
    .upload(path, buffer, {
      contentType: file.type || undefined,
      upsert: true,
    });

  if (uploadError) {
    console.error("[api/media/upload] storage upload error:", uploadError);
    return NextResponse.json(
      { error: "Storage upload failed. Please try again." },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(config.bucket).getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, kind });
}
