import { describe, it, expect } from "vitest";
import {
  normalisePublicUrl,
  coercePublicUrl,
  hasUnsafeScheme,
  normaliseSocialValue,
  MAX_PUBLIC_URL_LENGTH,
} from "@/lib/publicUrl";

describe("normalisePublicUrl", () => {
  it("accepts http and https and returns a normalised absolute URL", () => {
    expect(normalisePublicUrl("https://example.org")).toBe("https://example.org/");
    expect(normalisePublicUrl("http://example.org/path?q=1")).toBe(
      "http://example.org/path?q=1",
    );
    expect(normalisePublicUrl("  https://example.org/x  ")).toBe(
      "https://example.org/x",
    );
  });

  it("rejects every scheme that could execute or embed content", () => {
    // The whole point of this helper: these are stored XSS the moment
    // something renders them as an href or hands them to window.open().
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(normalisePublicUrl(bad)).toBeNull();
    }
  });

  it("rejects relative, empty and non-string values", () => {
    expect(normalisePublicUrl("/relative/path")).toBeNull();
    expect(normalisePublicUrl("example.org")).toBeNull();
    expect(normalisePublicUrl("")).toBeNull();
    expect(normalisePublicUrl("   ")).toBeNull();
    expect(normalisePublicUrl(null)).toBeNull();
    expect(normalisePublicUrl(undefined)).toBeNull();
    expect(normalisePublicUrl(42)).toBeNull();
    expect(normalisePublicUrl({ href: "https://example.org" })).toBeNull();
  });

  it("enforces the length bound before parsing", () => {
    const long = "https://example.org/" + "a".repeat(MAX_PUBLIC_URL_LENGTH);
    expect(normalisePublicUrl(long)).toBeNull();
    expect(normalisePublicUrl(long, long.length + 1)).not.toBeNull();
  });
});

describe("hasUnsafeScheme", () => {
  it("flags an explicitly dangerous scheme", () => {
    expect(hasUnsafeScheme("javascript:alert(1)")).toBe(true);
    expect(hasUnsafeScheme(" DATA:text/html,x")).toBe(true);
    expect(hasUnsafeScheme("vbscript:x")).toBe(true);
    expect(hasUnsafeScheme("file:///etc/passwd")).toBe(true);
  });

  it("does not flag http(s), bare handles, or host:port values", () => {
    expect(hasUnsafeScheme("https://example.org")).toBe(false);
    expect(hasUnsafeScheme("http://example.org")).toBe(false);
    expect(hasUnsafeScheme("@ourchurch")).toBe(false);
    expect(hasUnsafeScheme("ourchurch")).toBe(false);
    expect(hasUnsafeScheme(null)).toBe(false);
  });

  it("treats a bare host:port as the scheme it grammatically is", () => {
    // `new URL("example.org:8080/path")` really does parse "example.org:" as
    // the scheme, so refusing it (rather than guessing the user meant a host)
    // is the honest reading — https://example.org:8080 still works fine.
    expect(hasUnsafeScheme("example.org:8080/path")).toBe(true);
    expect(coercePublicUrl("example.org:8080/path")).toBeNull();
  });
});

describe("coercePublicUrl", () => {
  it("treats a scheme-less value as https — the apply wizard's placeholder shape", () => {
    expect(coercePublicUrl("yourministry.org")).toBe("https://yourministry.org/");
    expect(coercePublicUrl("example.org/give")).toBe("https://example.org/give");
    expect(coercePublicUrl("  example.org  ")).toBe("https://example.org/");
  });

  it("passes an explicit http(s) URL through, normalised", () => {
    expect(coercePublicUrl("http://example.org")).toBe("http://example.org/");
    expect(coercePublicUrl("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
  });

  it("still refuses a dangerous scheme rather than coercing it", () => {
    expect(coercePublicUrl("javascript:alert(1)")).toBeNull();
    expect(coercePublicUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(coercePublicUrl("")).toBeNull();
    expect(coercePublicUrl("   ")).toBeNull();
    expect(coercePublicUrl(null)).toBeNull();
  });
});

describe("normaliseSocialValue", () => {
  it("keeps a bare handle exactly as typed", () => {
    // The bug this exists to prevent: a person types "@ourchurch" into the
    // Facebook box (a column the schema happens to call facebook_URL) and the
    // route, which rejects on the FIRST bad field, 400s the whole profile save
    // — losing every OTHER handle they filled in at the same time.
    for (const handle of ["@ourchurch", "ourchurch", "dam_cool_bois", "@dam.cool"]) {
      expect(normaliseSocialValue(handle)).toBe(handle);
    }
  });

  it("normalises a URL-shaped value the same way coercePublicUrl does", () => {
    expect(normaliseSocialValue("facebook.com/ourchurch")).toBe(
      "https://facebook.com/ourchurch",
    );
    expect(normaliseSocialValue("https://instagram.com/ourchurch")).toBe(
      "https://instagram.com/ourchurch",
    );
  });

  it("treats absent and empty as 'no value', never as a rejection", () => {
    expect(normaliseSocialValue(undefined)).toBeNull();
    expect(normaliseSocialValue(null)).toBeNull();
    expect(normaliseSocialValue("")).toBeNull();
    expect(normaliseSocialValue("   ")).toBeNull();
  });

  it("still refuses a dangerous scheme, handle-shaped or not", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      expect(normaliseSocialValue(bad)).toBeUndefined();
    }
  });

  it("rejects a non-string and anything over the length bound", () => {
    expect(normaliseSocialValue(42)).toBeUndefined();
    expect(normaliseSocialValue({})).toBeUndefined();
    expect(normaliseSocialValue("a".repeat(MAX_PUBLIC_URL_LENGTH + 1))).toBeUndefined();
  });
});
