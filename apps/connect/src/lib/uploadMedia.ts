/**
 * Client-side helper that uploads a single image/video to Supabase Storage.
 *
 * Two-phase flow:
 *   1. Ask `POST /api/media/upload` (authenticated via cookie session) for a
 *      short-lived **signed upload URL**. The server validates the request and
 *      builds a user-scoped, server-controlled path.
 *   2. Upload the bytes DIRECTLY to Storage with that token (`uploadToSignedUrl`).
 *
 * Why not upload straight from the browser client, and why not proxy the bytes
 * through the server: the browser Supabase client's JWT is unreliable at the
 * Storage endpoint (uploads can arrive as `anon`, tripping bucket RLS). The
 * signed-URL token authorises the upload independently of that JWT, so it always
 * succeeds — while the bytes still travel only one hop (browser → Storage)
 * instead of browser → server → Storage. Faster, especially for video.
 *
 * Returns the public URL on success, or an `{ error }` object whose message
 * is safe to surface to the user.
 */

import { createClient } from "@/lib/supabase/client";

export type UploadScope =
  | "event-cover"
  | "place-cover"
  | "event-gallery"
  | "place-gallery";

export type UploadResult = { url: string; kind: "image" | "video" } | { error: string };

type SignResponse = {
  bucket?: string;
  path?: string;
  token?: string;
  publicUrl?: string;
  kind?: "image" | "video";
  error?: string;
};

export async function uploadMediaFile(
  file: File,
  opts: { scope: UploadScope; entityId?: string },
): Promise<UploadResult> {
  // Phase 1 — get a signed upload URL from our authenticated server route.
  let res: Response;
  try {
    res = await fetch("/api/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: opts.scope,
        entityId: opts.entityId,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });
  } catch {
    return { error: "Network error during upload. Please try again." };
  }

  const signed = (await res.json().catch(() => null)) as SignResponse | null;
  if (!res.ok || !signed?.bucket || !signed.path || !signed.token || !signed.publicUrl) {
    return { error: signed?.error ?? "Upload failed. Please try again." };
  }

  // Phase 2 — upload the bytes straight to Storage with the signed token.
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || undefined,
      upsert: true,
    });

  if (error) {
    return { error: "Upload failed. Please try again." };
  }

  return { url: signed.publicUrl, kind: signed.kind ?? "image" };
}
