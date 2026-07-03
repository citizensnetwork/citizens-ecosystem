import { describe, it, expect } from "vitest";
import { bearerTokenFrom } from "@/lib/auth/bearer";

describe("bearerTokenFrom", () => {
  it("extracts the token from a Bearer header", () => {
    expect(bearerTokenFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme", () => {
    expect(bearerTokenFrom("bearer tok")).toBe("tok");
    expect(bearerTokenFrom("BEARER tok")).toBe("tok");
  });

  it("trims surrounding whitespace", () => {
    expect(bearerTokenFrom("  Bearer   tok  ")).toBe("tok");
  });

  it("returns null for null, empty, or non-Bearer headers", () => {
    expect(bearerTokenFrom(null)).toBeNull();
    expect(bearerTokenFrom("")).toBeNull();
    expect(bearerTokenFrom("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerTokenFrom("Bearer")).toBeNull();
  });
});
