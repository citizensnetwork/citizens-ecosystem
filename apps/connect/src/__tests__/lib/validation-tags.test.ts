import { describe, it, expect } from "vitest";
import {
  isValidTagSlug,
  isValidTagLabel,
  slugifyTag,
  TAG_LABEL_MAX,
} from "@/lib/validation";

describe("tag validation", () => {
  describe("isValidTagSlug", () => {
    it("accepts simple lowercase slugs", () => {
      expect(isValidTagSlug("worship")).toBe(true);
      expect(isValidTagSlug("youth-night")).toBe(true);
      expect(isValidTagSlug("a")).toBe(true);
      expect(isValidTagSlug("123")).toBe(true);
    });

    it("rejects empty, leading/trailing hyphens, uppercase, and over 40 chars", () => {
      expect(isValidTagSlug("")).toBe(false);
      expect(isValidTagSlug("-foo")).toBe(false);
      expect(isValidTagSlug("foo-")).toBe(false);
      expect(isValidTagSlug("Foo")).toBe(false);
      expect(isValidTagSlug("foo bar")).toBe(false);
      expect(isValidTagSlug("a".repeat(41))).toBe(false);
    });

    it("rejects non-strings", () => {
      expect(isValidTagSlug(undefined)).toBe(false);
      expect(isValidTagSlug(null)).toBe(false);
      expect(isValidTagSlug(123)).toBe(false);
      expect(isValidTagSlug({})).toBe(false);
    });
  });

  describe("isValidTagLabel", () => {
    it("accepts trimmed labels within bounds", () => {
      expect(isValidTagLabel("Worship Night")).toBe(true);
      expect(isValidTagLabel("a")).toBe(true);
      expect(isValidTagLabel("a".repeat(TAG_LABEL_MAX))).toBe(true);
    });

    it("rejects empty/whitespace and oversized labels", () => {
      expect(isValidTagLabel("")).toBe(false);
      expect(isValidTagLabel("   ")).toBe(false);
      expect(isValidTagLabel("a".repeat(TAG_LABEL_MAX + 1))).toBe(false);
      expect(isValidTagLabel(123)).toBe(false);
    });
  });

  describe("slugifyTag", () => {
    it("normalises labels to DB-safe slugs", () => {
      expect(slugifyTag("Worship Night")).toBe("worship-night");
      expect(slugifyTag("  Youth & Coffee  ")).toBe("youth-coffee");
      expect(slugifyTag("Café")).toBe("cafe");
      expect(slugifyTag("multi   spaces")).toBe("multi-spaces");
    });

    it("collapses leading/trailing punctuation", () => {
      expect(slugifyTag("--foo--")).toBe("foo");
      expect(slugifyTag("!!!hello!!!")).toBe("hello");
    });

    it("returns null when nothing usable remains", () => {
      expect(slugifyTag("")).toBeNull();
      expect(slugifyTag("  ")).toBeNull();
      expect(slugifyTag("---")).toBeNull();
      expect(slugifyTag("!!!")).toBeNull();
    });

    it("truncates to 40 chars and re-trims trailing hyphens", () => {
      const long = "a".repeat(45);
      const slug = slugifyTag(long);
      expect(slug).toBe("a".repeat(40));
    });

    it("truncation never leaves a trailing hyphen", () => {
      // 39 'a' + space + 'b' → after slugify "aaaa…aaa-b" length 41 →
      // truncated to 40 ends with "-", which we then trim.
      const input = "a".repeat(39) + " b";
      const slug = slugifyTag(input)!;
      expect(slug.endsWith("-")).toBe(false);
      expect(slug.startsWith("-")).toBe(false);
    });
  });
});
