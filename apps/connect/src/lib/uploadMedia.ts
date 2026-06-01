/**
 * Client-side helper that uploads a single image/video through the
 * server route `POST /api/media/upload` instead of hitting Supabase
 * Storage directly from the browser.
 *
 * Why: the browser Supabase client's JWT is unreliable at the Storage
 * endpoint (uploads can arrive as `anon`, tripping the bucket RLS policy
 * with "new row violates row-level security policy"). The server route
 * authenticates via the cookie session and writes with the service-role
 * admin client, so uploads always satisfy RLS. Same pattern as /api/avatar.
 *
 * Returns the public URL on success, or an `{ error }` object whose message
 * is safe to surface to the user.
 */

export type UploadScope =
  | "event-cover"
  | "place-cover"
  | "event-gallery"
  | "place-gallery";

export type UploadResult = { url: string; kind: "image" | "video" } | { error: string };

export async function uploadMediaFile(
  file: File,
  opts: { scope: UploadScope; entityId?: string },
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("scope", opts.scope);
  if (opts.entityId) form.append("entityId", opts.entityId);

  let res: Response;
  try {
    res = await fetch("/api/media/upload", { method: "POST", body: form });
  } catch {
    return { error: "Network error during upload. Please try again." };
  }

  const json = (await res.json().catch(() => null)) as
    | { url?: string; kind?: "image" | "video"; error?: string }
    | null;

  if (!res.ok || !json?.url) {
    return { error: json?.error ?? "Upload failed. Please try again." };
  }
  return { url: json.url, kind: json.kind ?? "image" };
}
