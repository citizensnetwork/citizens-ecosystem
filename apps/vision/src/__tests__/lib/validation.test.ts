import { describe, it, expect } from "vitest";
import { isValidUUID, isValidSlug, slugify } from "@/lib/validation";

describe("isValidUUID", () => {
  it("accepts a valid v4 UUID", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidUUID("")).toBe(false);
  });

  it("rejects malformed UUID", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
  });

  it("rejects UUID with invalid variant", () => {
    expect(isValidUUID("550e8400-e29b-41d4-f716-446655440000")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("my-org")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("test-org-123")).toBe(true);
  });

  it("rejects slugs shorter than 2 chars", () => {
    expect(isValidSlug("a")).toBe(false);
  });

  it("rejects slugs with uppercase", () => {
    expect(isValidSlug("My-Org")).toBe(false);
  });

  it("rejects slugs with spaces", () => {
    expect(isValidSlug("my org")).toBe(false);
  });

  it("rejects trailing hyphens", () => {
    expect(isValidSlug("my-org-")).toBe(false);
  });

  it("rejects leading hyphens", () => {
    expect(isValidSlug("-my-org")).toBe(false);
  });
});

describe("slugify", () => {
  it("converts to lowercase and hyphenates", () => {
    expect(slugify("My Organisation")).toBe("my-organisation");
  });

  it("removes special characters", () => {
    expect(slugify("Test & Trial!")).toBe("test-trial");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  it("trims whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("handles underscores", () => {
    expect(slugify("my_org_name")).toBe("my-org-name");
  });
});
