/**
 * Media validation for the Wear signed-upload pipeline.
 *
 * Images only today (Wear ships no video UI) — a tight allow-list mirrors the
 * `wear-media` bucket's `allowed_mime_types` + `file_size_limit` (migration 158),
 * which are the real backstop since the API never sees the uploaded bytes. These
 * helpers are pure (no I/O) and carry direct unit tests in `media.test.ts`.
 */

export type MediaKind = 'image';

/** 15 MB — matches the bucket `file_size_limit` in migration 158. */
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

/** MIME → safe file extension. The bucket allow-list is the authoritative gate. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** The upload targets the pipeline supports; each maps to a storage subfolder. */
export const UPLOAD_SCOPES = ['post', 'story', 'brand-logo', 'concept'] as const;
export type UploadScope = (typeof UPLOAD_SCOPES)[number];

export function isUploadScope(value: unknown): value is UploadScope {
  return typeof value === 'string' && (UPLOAD_SCOPES as readonly string[]).includes(value);
}

/** `'image'` for a supported image MIME type, else `null`. */
export function detectMediaKind(type: string): MediaKind | null {
  return type in IMAGE_TYPES ? 'image' : null;
}

/**
 * `null` when the claimed metadata is acceptable, otherwise a user-safe rejection
 * message. Note `image/svg+xml` is intentionally absent (stored-XSS on a public
 * bucket origin) — the bucket allow-list rejects it for real regardless.
 */
export function validateMediaMeta(type: string, size: number): string | null {
  if (!detectMediaKind(type)) {
    return 'Only JPG, PNG, GIF, or WebP images are supported.';
  }
  if (!Number.isFinite(size) || size <= 0) return 'No file provided.';
  if (size > MAX_IMAGE_SIZE) return 'Images must be smaller than 15 MB.';
  return null;
}

/**
 * Allow-listed extension derived from the MIME type — NEVER from the client
 * filename (which could smuggle `.php`, path traversal, etc.). Falls back to
 * `bin` for anything not in the allow-list (unreachable after validateMediaMeta).
 */
export function mediaExtension(type: string): string {
  return IMAGE_TYPES[type] ?? 'bin';
}

/** Storage subfolder for a scope — groups a user's uploads by kind for tidy audit. */
export function scopeFolder(scope: UploadScope): string {
  switch (scope) {
    case 'post':
      return 'posts';
    case 'story':
      return 'stories';
    case 'brand-logo':
      return 'brands';
    case 'concept':
      return 'concepts';
  }
}
