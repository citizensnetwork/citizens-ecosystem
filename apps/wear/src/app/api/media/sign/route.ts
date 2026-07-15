import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyNumber, bodyString, readJsonBody } from '@/lib/api/params';
import { getRequestStorageClient } from '@/lib/supabase/storage';
import {
  isUploadScope,
  mediaExtension,
  scopeFolder,
  validateMediaMeta,
  type UploadScope,
} from '@/lib/media';
import { checkRateLimit, RATE_LIMITS } from '@citizens/utils';

export const dynamic = 'force-dynamic';

const BUCKET = 'wear-media';

/**
 * POST /api/media/sign — mint a short-lived **signed upload URL** for an image.
 *
 * The browser then uploads the bytes STRAIGHT to Storage with the returned token
 * (`uploadToSignedUrl`), so they never pass through this server (one hop, no proxy
 * memory pressure). Mirrors Connect's `/api/media/upload`, but the signed URL is
 * minted by a client authenticated AS THE USER — no service_role in Wear. The
 * `wear-media` bucket's size/MIME limits (migration 158) are the real backstop;
 * the checks here reject early with a friendly message.
 *
 * Body: `{ scope, filename?, contentType, size }` (filename is unused — the
 * extension is derived from `contentType`, never trusted from the client).
 * Returns: `{ bucket, path, token, publicUrl }`.
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);

  // Per-user heavy cap ON TOP of handler()'s blanket per-IP gate — minting signed
  // URLs is the pricey path, so it earns its own tighter limit (Connect precedent).
  const rl = await checkRateLimit(`wear-media-sign:${userId}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    throw new ApiError(429, 'rate_limited', 'Too many uploads. Please slow down.');
  }

  const body = await readJsonBody(req);
  const scope = bodyString(body, 'scope');
  const contentType = bodyString(body, 'contentType');
  const size = bodyNumber(body, 'size') ?? NaN;

  if (!isUploadScope(scope)) {
    throw new ApiError(400, 'invalid_scope', 'Unknown upload scope.');
  }
  const metaError = validateMediaMeta(contentType, size);
  if (metaError) throw new ApiError(400, 'invalid_media', metaError);

  const client = await getRequestStorageClient(req);
  if (!client) {
    // Dev/test/preview with no Supabase env — the frontend falls back to URL input.
    throw new ApiError(503, 'storage_unconfigured', 'Uploads are unavailable here.');
  }

  // Server-controlled, user-scoped path. The client never supplies the path, and
  // the storage INSERT policy independently pins `folder[1] = auth.uid()`.
  const ext = mediaExtension(contentType);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${scopeFolder(scope as UploadScope)}/${Date.now()}-${rand}.${ext}`;

  const { data: signed, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !signed) {
    console.error('[api/media/sign] createSignedUploadUrl error:', error);
    throw new ApiError(500, 'sign_failed', 'Could not start the upload. Please try again.');
  }

  const { data: pub } = client.storage.from(BUCKET).getPublicUrl(path);

  return json({
    bucket: BUCKET,
    path: signed.path,
    token: signed.token,
    publicUrl: pub.publicUrl,
  });
});
