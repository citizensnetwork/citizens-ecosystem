/** Matches standard UUID format */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Allowed image MIME types for event/place cover uploads. */
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/** Maximum image file size in bytes (15 MB).
 *
 * Raised from 5 MB so that modern phone photos (typically 5–12 MB JPEGs)
 * can be submitted without manual resizing. Uploads that exceed 5 MB are
 * auto-compressed in the browser by {@link compressImageIfNeeded} before
 * hitting Supabase Storage. The 15 MB cap is a safety net only — files at
 * that size will typically shrink to well under 2 MB after compression.
 */
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

/** Allowed file extensions for image uploads. */
const SAFE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

/**
 * Validate an image file for upload. Returns an error message string
 * if invalid, or `null` if the file is acceptable.
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, GIF, WebP, or SVG images are allowed.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Image must be smaller than 15 MB.";
  }
  return null;
}

/** Sanitise a filename extension for safe storage.
 * Returns a known-safe extension or "jpg" as fallback.
 */
export function safeImageExtension(filename: string): string {
  const rawExt = (filename.split(".").pop() ?? "jpg").toLowerCase();
  return SAFE_IMAGE_EXTENSIONS.includes(rawExt) ? rawExt : "jpg";
}

/* ────────────────────────────────────────────────────────── */
/* Event media (gallery) — images + videos                    */
/* ────────────────────────────────────────────────────────── */

/** Allowed video MIME types for event media uploads. */
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Maximum video file size in bytes (100 MB).
 *
 * Raised from 50 MB so that short phone clips (which often land at 60–90 MB
 * for 30–60 s of 1080p) go through on the first try. */
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

/** Allowed file extensions for video uploads. */
const SAFE_VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];

/** Reasonable per-event upload cap to keep request bodies sane. */
export const MAX_MEDIA_PER_UPLOAD = 10;

export type MediaKind = "image" | "video";

/**
 * Classify a file as image or video based on its MIME type.
 * Returns `null` if it's neither a supported image nor a supported video.
 */
export function detectMediaKind(file: File): MediaKind | null {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(file.type)) return "video";
  return null;
}

/**
 * Validate a media file (image or video) for gallery upload.
 * Returns an error message string if invalid, or `null` if acceptable.
 */
export function validateMediaFile(file: File): string | null {
  const kind = detectMediaKind(file);
  if (kind === "image") {
    if (file.size > MAX_IMAGE_SIZE) return "Images must be smaller than 15 MB.";
    return null;
  }
  if (kind === "video") {
    if (file.size > MAX_VIDEO_SIZE) return "Videos must be smaller than 100 MB.";
    return null;
  }
  return "Only JPEG, PNG, GIF, WebP, SVG, MP4, WebM, or MOV files are allowed.";
}

/** Sanitise a media filename extension. Falls back based on detected kind. */
export function safeMediaExtension(filename: string, kind: MediaKind): string {
  const rawExt = (filename.split(".").pop() ?? "").toLowerCase();
  if (kind === "image") {
    return SAFE_IMAGE_EXTENSIONS.includes(rawExt) ? rawExt : "jpg";
  }
  return SAFE_VIDEO_EXTENSIONS.includes(rawExt) ? rawExt : "mp4";
}
