import { describe, it, expect } from "vitest";
import { isValidUUID } from "@/lib/validation";

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
