import { describe, it, expect } from "vitest";
import {
  isValidUUID,
  detectMediaKind,
  validateMediaFile,
  safeMediaExtension,
} from "@/lib/validation";

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Build a file with the requested size by padding an ArrayBuffer.
  const buffer = new Uint8Array(sizeBytes);
  return new File([buffer], name, { type });
}

describe("isValidUUID", () => {
  it("returns true for a valid v4 UUID", () => {
    expect(isValidUUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
  });

  it("returns true for uppercase UUID", () => {
    expect(isValidUUID("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(true);
  });

  it("returns true for mixed-case UUID", () => {
    expect(isValidUUID("a0EEBC99-9c0B-4eF8-Bb6d-6BB9bd380A11")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidUUID("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidUUID(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidUUID(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isValidUUID(12345)).toBe(false);
  });

  it("returns false for a partial UUID", () => {
    expect(isValidUUID("a0eebc99-9c0b")).toBe(false);
  });

  it("returns false for UUID with extra characters", () => {
    expect(isValidUUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11-extra")).toBe(false);
  });

  it("returns false for non-hex characters", () => {
    expect(isValidUUID("g0eebc99-xxxx-4ef8-bb6d-6bb9bd380a11")).toBe(false);
  });

  it("returns false for UUID without dashes", () => {
    expect(isValidUUID("a0eebc999c0b4ef8bb6d6bb9bd380a11")).toBe(false);
  });

  it("narrows the type to string (type guard)", () => {
    const value: unknown = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    if (isValidUUID(value)) {
      // TypeScript should narrow `value` to `string`
      expect(value.toUpperCase()).toBe("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11");
    }
  });
});

describe("detectMediaKind", () => {
  it("classifies common image MIME types", () => {
    expect(detectMediaKind(makeFile("a.jpg", "image/jpeg", 10))).toBe("image");
    expect(detectMediaKind(makeFile("a.png", "image/png", 10))).toBe("image");
    expect(detectMediaKind(makeFile("a.webp", "image/webp", 10))).toBe("image");
  });

  it("classifies common video MIME types", () => {
    expect(detectMediaKind(makeFile("a.mp4", "video/mp4", 10))).toBe("video");
    expect(detectMediaKind(makeFile("a.webm", "video/webm", 10))).toBe("video");
    expect(detectMediaKind(makeFile("a.mov", "video/quicktime", 10))).toBe("video");
  });

  it("returns null for unsupported types", () => {
    expect(detectMediaKind(makeFile("a.pdf", "application/pdf", 10))).toBe(null);
  });
});

describe("validateMediaFile", () => {
  it("accepts small images", () => {
    expect(validateMediaFile(makeFile("a.png", "image/png", 10))).toBe(null);
  });

  it("rejects oversized images", () => {
    const big = makeFile("a.png", "image/png", 16 * 1024 * 1024);
    expect(validateMediaFile(big)).toMatch(/15 MB/);
  });

  it("rejects oversized videos", () => {
    const big = makeFile("a.mp4", "video/mp4", 101 * 1024 * 1024);
    expect(validateMediaFile(big)).toMatch(/100 MB/);
  });

  it("rejects unsupported types", () => {
    expect(
      validateMediaFile(makeFile("a.zip", "application/zip", 10))
    ).toMatch(/allowed/i);
  });
});

describe("safeMediaExtension", () => {
  it("returns known image extensions", () => {
    expect(safeMediaExtension("photo.png", "image")).toBe("png");
    expect(safeMediaExtension("PHOTO.JPG", "image")).toBe("jpg");
  });

  it("returns known video extensions", () => {
    expect(safeMediaExtension("clip.mp4", "video")).toBe("mp4");
    expect(safeMediaExtension("clip.webm", "video")).toBe("webm");
  });

  it("falls back safely when extension is unknown", () => {
    expect(safeMediaExtension("sneaky.exe", "image")).toBe("jpg");
    expect(safeMediaExtension("sneaky.exe", "video")).toBe("mp4");
  });
});
