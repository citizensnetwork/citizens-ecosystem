/**
 * POST /api/media/upload
 *
 * Mints a short-lived **signed upload URL** for event/place cover images and
 * gallery media (images + videos). The browser then uploads the bytes straight
 * to Supabase Storage with that token — one network hop instead of two, which
 * matters a lot for large-ish videos and for users far from the project region.
 *
 * Why a signed URL (not a direct browser upload, nor proxying bytes through here):
 *   - The browser Supabase client's JWT is unreliable at the Storage endpoint
 *     (uploads can arrive as `anon` → "new row violates row-level security
 *     policy"). A signed upload URL is authorised by its own token, independent
 *     of that JWT, so the upload always succeeds.
 *   - The destination path is built ENTIRELY server-side and scoped to the
 *     authenticated user's id, so a caller can never write outside its own folder.
 *   - Because the bytes no longer pass through here, per-request size/MIME checks
 *     can't be enforced server-side. The bucket-level `file_size_limit` +
 *     `allowed_mime_types` (migration 121) are the hard backstop; the sign-time
 *     checks below reject early with a friendly message and block videos on cover
 *     scopes (which the bucket allowlist alone can't distinguish).
 *
 * Body: JSON
 *   - scope:       "event-cover" | "place-cover" | "event-gallery" | "place-gallery" (required)
 *   - filename:    original file name — used only to derive a safe extension (required)
 *   - contentType: the file's MIME type (required)
 *   - size:        the file's size in bytes (required)
 *   - entityId:    UUID — required for the *-gallery scopes (groups media per entity)
 *
 * Returns: { bucket, path, token, publicUrl, kind: "image" | "video" }
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateMediaMeta,
  detectMediaKindByType,
  safeMediaExtension,
  isValidUUID,
} from "@/lib/validation";

type Scope = "event-cover" | "place-cover" | "event-gallery" | "place-gallery";

const SCOPE_CONFIG: Record<
  Scope,
  {
    bucket: "event-images" | "place-images";
    needsEntity: boolean;
    allowsVideo: boolean;
    folder: (entityId: string) => string;
  }
> = {
  "event-cover": { bucket: "event-images", needsEntity: false, allowsVideo: false, folder: () => "" },
  "place-cover": { bucket: "place-images", needsEntity: false, allowsVideo: false, folder: () => "covers" },
  "event-gallery": { bucket: "event-images", needsEntity: true, allowsVideo: true, folder: (id) => `gallery/events/${id}` },
  "place-gallery": { bucket: "place-images", needsEntity: true, allowsVideo: true, folder: (id) => `gallery/places/${id}` },
};

export async function POST(request: Request) {
  // 1. Auth — Bearer (cross-origin static/Capacitor frontend) OR cookie (same-origin).
  const { user } = await getRouteAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit (per user) — caps how many uploads a user can initiate.
  const rl = await checkRateLimit(`media-upload:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Parse JSON metadata
  let body: {
    scope?: unknown;
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    entityId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scope = typeof body.scope === "string" ? body.scope : null;
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : NaN;
  const entityId = typeof body.entityId === "string" ? body.entityId : null;

  // 4. Validate scope
  if (!scope || !(scope in SCOPE_CONFIG)) {
    return NextResponse.json({ error: "Invalid upload scope" }, { status: 400 });
  }
  const config = SCOPE_CONFIG[scope as Scope];

  if (config.needsEntity && (!entityId || !isValidUUID(entityId))) {
    return NextResponse.json({ error: "Missing or invalid entityId" }, { status: 400 });
  }

  // 5. Validate claimed metadata (size cap + supported type). The bucket-level
  //    limits enforce these for real even if the client lies; this is the early,
  //    friendly rejection and the kind we tag the row with.
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const metaError = validateMediaMeta(contentType, size);
  if (metaError) {
    return NextResponse.json({ error: metaError }, { status: 400 });
  }
  const kind = detectMediaKindByType(contentType);
  if (!kind) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (kind === "video" && !config.allowsVideo) {
    return NextResponse.json({ error: "Videos are not allowed here." }, { status: 400 });
  }

  // 6. Build a server-controlled, user-scoped path. The client never supplies
  //    the path, so it cannot escape its own folder even though the signed URL
  //    bypasses Storage RLS.
  const ext = safeMediaExtension(filename, kind);
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = config.folder(entityId ?? "");
  const segments = [user.id, ...(folder ? folder.split("/") : []), `${Date.now()}-${rand}.${ext}`];
  const path = segments.join("/");

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(config.bucket)
    .createSignedUploadUrl(path, { upsert: true });

  if (signError || !signed) {
    console.error("[api/media/upload] createSignedUploadUrl error:", signError);
    return NextResponse.json(
      { error: "Could not start the upload. Please try again." },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(config.bucket).getPublicUrl(path);

  return NextResponse.json({
    bucket: config.bucket,
    path: signed.path,
    token: signed.token,
    publicUrl,
    kind,
  });
}
