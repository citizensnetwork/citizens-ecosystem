import { describe, it, expect } from "vitest";
import {
  compressImageIfNeeded,
  DEFAULT_MAX_DIMENSION,
  DEFAULT_QUALITY,
  SKIP_IF_SMALLER_THAN,
} from "@/lib/imageCompression";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("imageCompression exported constants", () => {
  it("exposes sensible defaults", () => {
    expect(DEFAULT_MAX_DIMENSION).toBeGreaterThanOrEqual(1920);
    expect(DEFAULT_QUALITY).toBeGreaterThan(0);
    expect(DEFAULT_QUALITY).toBeLessThanOrEqual(1);
    expect(SKIP_IF_SMALLER_THAN).toBeGreaterThan(0);
  });
});

describe("compressImageIfNeeded", () => {
  it("returns the original file for non-image MIME types", async () => {
    const f = makeFile("doc.pdf", "application/pdf", 10 * 1024 * 1024);
    await expect(compressImageIfNeeded(f)).resolves.toBe(f);
  });

  // SVG removed from upload allowlist (XSS on public storage buckets) —
  // GIF still exercises the SKIP_TYPES branch below.

  it("skips GIF (animation would be lost)", async () => {
    const f = makeFile("anim.gif", "image/gif", 10 * 1024 * 1024);
    await expect(compressImageIfNeeded(f)).resolves.toBe(f);
  });

  it("returns the original file when it's already under the skip threshold", async () => {
    const f = makeFile("small.jpg", "image/jpeg", 10 * 1024);
    await expect(compressImageIfNeeded(f)).resolves.toBe(f);
  });
});
