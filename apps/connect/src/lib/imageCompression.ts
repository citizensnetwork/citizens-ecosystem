/**
 * Client-side image compression.
 *
 * Phone cameras routinely produce 8–20 MB JPEGs that blow past the 5 MB
 * storage limit and make every upload slow. This helper resizes (to a
 * configurable longest-edge pixel cap) and re-encodes the file as JPEG so
 * submissions fit well within the bucket limit without the user ever having
 * to think about it.
 *
 * No external dependencies — uses <canvas> + <img> which are available in
 * every modern browser + the Capacitor WebView.
 *
 * Falls back gracefully:
 *   - SVG / GIF files are returned as-is (can't be re-rendered to JPEG
 *     without losing animation or vector fidelity).
 *   - Files that are already smaller than the target threshold are returned
 *     as-is.
 *   - If the browser can't decode the image we return the original file.
 */

export type CompressImageOptions = {
  /** Longest-edge cap in pixels. Default 2560 — HD + safety margin. */
  maxDimension?: number;
  /** JPEG quality 0–1. Default 0.85 — near-lossless for photography. */
  quality?: number;
  /** Skip compression if file is already smaller than this (bytes). */
  skipIfSmallerThan?: number;
};

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxDimension: 2560,
  quality: 0.85,
  // 1.5 MB — below this size, compression gain rarely justifies the quality
  // loss, so we skip to keep full fidelity.
  skipIfSmallerThan: 1.5 * 1024 * 1024,
};

/** Skip these types (re-encoding would be lossy or change their behaviour). */
const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

/**
 * Compress (resize + re-encode) an image file in the browser. Always returns
 * a File — either the compressed version, or the original if compression
 * isn't beneficial / possible.
 */
export async function compressImageIfNeeded(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip non-rasterisable formats
  if (SKIP_TYPES.has(file.type)) return file;
  if (!file.type.startsWith("image/")) return file;

  // Small enough already — skip to preserve fidelity
  if (file.size <= opts.skipIfSmallerThan) return file;

  // Safety checks for SSR / non-browser callers (tests).
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = scaleWithin(img.naturalWidth, img.naturalHeight, opts.maxDimension);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", opts.quality);
    });
    if (!blob) return file;

    // If compression made the file bigger (rare — e.g. tiny images),
    // return the original.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Any decoding error — fall back to the original file so the user still
    // gets a chance to upload it (and validation will surface any issue).
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Resolve with an <img> element that has finished decoding. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

/** Compute new width/height so the longest edge fits within `max`. */
function scaleWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w >= h ? max / w : max / h;
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
  };
}
