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

/** Maximum image file size in bytes (5 MB). */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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
    return "Image must be smaller than 5 MB.";
  }
  return null;
}

/**
 * Sanitise a filename extension for safe storage.
 * Returns a known-safe extension or "jpg" as fallback.
 */
export function safeImageExtension(filename: string): string {
  const rawExt = (filename.split(".").pop() ?? "jpg").toLowerCase();
  return SAFE_IMAGE_EXTENSIONS.includes(rawExt) ? rawExt : "jpg";
}
