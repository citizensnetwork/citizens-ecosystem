import { describe, it, expect } from "vitest";
import {
  normalisePublicUrl,
  coercePublicUrl,
  hasUnsafeScheme,
  normaliseSocialValue,
  checkSocialValue,
  checkSocialField,
  normaliseSocialField,
  normaliseWhatsappNumber,
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

  it("refuses a display name — a value with spaces is not a handle", () => {
    // The first real Form submission stored facebook_url = "Grace Radio" and
    // youtube_url = "Grace Online", which render as dead links.
    for (const name of ["Grace Radio", "Grace Online", "Grace Point Church", "our page on facebook"]) {
      expect(normaliseSocialValue(name), name).toBeUndefined();
      expect(checkSocialValue(name), name).toEqual({ ok: false, reason: "not_a_link" });
    }
  });

  it("still accepts a spaced URL-shaped value and every one-token handle", () => {
    expect(normaliseSocialValue("facebook.com/grace radio")).toBe("https://facebook.com/grace%20radio");
    for (const handle of ["@gracefm103", "gracefm103", "grace_radio", "@grace.radio"]) {
      expect(normaliseSocialValue(handle), handle).toBe(handle);
    }
  });

  it("tells an unrecoverable value (invalid) from a wrong kind of value (not_a_link)", () => {
    expect(checkSocialValue("javascript:alert(1)")).toEqual({ ok: false, reason: "invalid" });
    expect(checkSocialValue(42)).toEqual({ ok: false, reason: "invalid" });
    expect(checkSocialValue("Grace Radio")).toEqual({ ok: false, reason: "not_a_link" });
  });
});

describe("normaliseWhatsappNumber", () => {
  it("turns a local South African number into international digits", () => {
    // The first real Form submission stored "0712345678", which wa.me cannot open.
    for (const local of ["0712345678", "071 234 5678", "071-234-5678", "(071) 234 5678", "071.234.5678"]) {
      expect(normaliseWhatsappNumber(local), local).toBe("27712345678");
    }
  });

  it("keeps a country-coded number and drops South Africa's trunk 0 after the code", () => {
    for (const intl of ["27712345678", "+27 71 234 5678", "+27712345678", "0027 71 234 5678", "+27 (0)71 234 5678"]) {
      expect(normaliseWhatsappNumber(intl), intl).toBe("27712345678");
    }
  });

  it("accepts another country's number only when it is explicitly international", () => {
    expect(normaliseWhatsappNumber("+44 7911 123456")).toBe("447911123456");
    expect(normaliseWhatsappNumber("0044 7911 123456")).toBe("447911123456");
    // Local-looking but not a 10-digit South African number: whose country? Refuse.
    expect(normaliseWhatsappNumber("07911 123456")).toBeNull();
    expect(normaliseWhatsappNumber("712345678")).toBeNull();
  });

  it("refuses anything that isn't a phone number, and is bounded on hostile input", () => {
    for (const bad of ["", "call the office", "071 234 56", "+1234", "12345678901234567890", "071 234 5678 ext 5", "0712345678\n<script>"]) {
      expect(normaliseWhatsappNumber(bad), bad).toBeNull();
    }
    const start = Date.now();
    expect(normaliseWhatsappNumber("0".repeat(100_000))).toBeNull();
    expect(normaliseWhatsappNumber("+" + " ".repeat(100_000) + "1")).toBeNull();
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("checkSocialField / normaliseSocialField", () => {
  it("treats the WhatsApp column as a number or a wa.me link, every other column as a handle or link", () => {
    expect(normaliseSocialField("whatsapp_number", "0712345678")).toBe("27712345678");
    expect(normaliseSocialField("whatsapp_number", "https://wa.me/27824567812")).toBe("https://wa.me/27824567812");
    expect(normaliseSocialField("whatsapp_number", "call the office")).toBeUndefined();
    expect(normaliseSocialField("whatsapp_number", "")).toBeNull();
    expect(normaliseSocialField("facebook_url", "Grace Radio")).toBeUndefined();
    expect(normaliseSocialField("instagram_handle", "@gracefm103")).toBe("@gracefm103");
  });

  it("only checks the platform's own host when asked — an owner's existing link-in-bio must still save", () => {
    const linkInBio = "https://linktr.ee/graceradio";
    expect(checkSocialField("instagram_handle", linkInBio)).toEqual({ ok: true, value: linkInBio });
    expect(checkSocialField("instagram_handle", linkInBio, 500, { matchPlatformHost: true })).toEqual({
      ok: false,
      reason: "not_a_link",
    });
  });

  it("accepts each platform's own hosts and subdomains when the host is checked", () => {
    const ok: [string, string][] = [
      ["facebook_url", "https://www.facebook.com/graceradio"],
      ["facebook_url", "https://m.facebook.com/graceradio"],
      ["facebook_url", "fb.me/graceradio"],
      ["instagram_handle", "instagram.com/gracefm103"],
      ["tiktok_handle", "https://www.tiktok.com/@gracefm103"],
      ["youtube_url", "https://youtu.be/abc"],
      ["youtube_url", "https://www.youtube.com/@graceonline"],
      ["x_handle", "https://twitter.com/gracefm103"],
      ["linkedin_url", "https://www.linkedin.com/company/impact"],
      ["whatsapp_number", "wa.me/27712345678"],
      ["whatsapp_number", "https://chat.whatsapp.com/AbCdEf"],
    ];
    for (const [col, value] of ok) {
      expect(checkSocialField(col, value, 500, { matchPlatformHost: true }).ok, `${col} ← ${value}`).toBe(true);
    }
  });

  it("refuses another site, a look-alike host and the wrong platform when the host is checked", () => {
    const bad: [string, string][] = [
      ["facebook_url", "https://evil.example/facebook.com"],
      ["facebook_url", "https://facebook.com.evil.example/x"],
      ["facebook_url", "https://notfacebook.com/x"],
      ["facebook_url", "https://youtube.com/@impact"],
      ["youtube_url", "https://facebook.com/impact"],
    ];
    for (const [col, value] of bad) {
      expect(checkSocialField(col, value, 500, { matchPlatformHost: true }), `${col} ← ${value}`).toEqual({
        ok: false,
        reason: "not_a_link",
      });
    }
  });
});
