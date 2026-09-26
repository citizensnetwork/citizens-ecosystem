import { describe, it, expect } from "vitest";
import { normaliseEmail, parseListingFields } from "@/lib/contributorFields";

const valid = {
  display_name: "Grace Point Community Church",
  claim_email: "  Daniel@GracePoint.org.za ",
  contributor_kind: "ministry",
  contributor_category: "churches-ministries",
};

function parse(extra: Record<string, unknown> = {}) {
  return parseListingFields({ ...valid, ...extra });
}

describe("parseListingFields", () => {
  it("normalises a minimal valid listing", () => {
    const res = parse();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields.claimEmail).toBe("daniel@gracepoint.org.za");
    expect(res.fields.kind).toBe("ministry");
    expect(res.fields.category).toBe("churches-ministries");
    expect(res.fields.contactEmail).toBeNull();
    expect(Object.values(res.fields.socials).every((v) => v === null)).toBe(true);
  });

  it("requires a 2+ character name and a valid owner email", () => {
    expect(parse({ display_name: " A " })).toEqual({ ok: false, error: "display_name_required" });
    expect(parse({ claim_email: "not-an-email" })).toEqual({ ok: false, error: "valid_claim_email_required" });
  });

  it("rejects a pathological email quickly (length before regex — ReDoS guard)", () => {
    const evil = "a".repeat(50_000) + "@" + "a".repeat(50_000) + "!";
    const start = Date.now();
    expect(parse({ claim_email: evil }).ok).toBe(false);
    expect(parse({ contact_email: evil }).ok).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("requires one of the 12 Contributor types; coerces an unknown kind to null", () => {
    expect(parse({ contributor_category: "worship-prayer" })).toEqual({ ok: false, error: "contributor_category_required" });
    const res = parse({ contributor_kind: "cooperative" });
    expect(res.ok && res.fields.kind).toBeNull();
  });

  it("coerces a scheme-less website and refuses a dangerous one", () => {
    const res = parse({ website_url: "gracepoint.org.za" });
    expect(res.ok && res.fields.websiteUrl).toBe("https://gracepoint.org.za/");
    expect(parse({ website_url: "javascript:alert(1)" })).toEqual({ ok: false, error: "invalid_website_url" });
  });

  it("validates the public contact email only when one is given", () => {
    expect(parse({ contact_email: "  " }).ok).toBe(true);
    const res = parse({ contact_email: "Hello@GracePoint.org.za" });
    expect(res.ok && res.fields.contactEmail).toBe("hello@gracepoint.org.za");
    expect(parse({ contact_email: "hello at gracepoint" })).toEqual({ ok: false, error: "invalid_contact_email" });
  });

  it("accepts a handle or a link for every social, and refuses a dangerous scheme", () => {
    const res = parse({
      instagram_handle: "@gracepointchurch",
      facebook_url: "facebook.com/gracepointchurch",
      x_handle: "@GracePointChurch",
      whatsapp_number: "https://wa.me/27824567812",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields.socials.instagram_handle).toBe("@gracepointchurch");
    expect(res.fields.socials.facebook_url).toBe("https://facebook.com/gracepointchurch");
    expect(res.fields.socials.whatsapp_number).toBe("https://wa.me/27824567812");
    expect(parse({ linkedin_url: "javascript:alert(1)" })).toEqual({ ok: false, error: "invalid_linkedin_url" });
  });

  it("nulls the address and pin for no fixed location, and keeps a pin only with both coordinates in range", () => {
    const none = parse({ no_fixed_location: true, physical_address: "1 Main", physical_latitude: -25.7, physical_longitude: 28.2 });
    expect(none.ok && [none.fields.physicalAddress, none.fields.latitude, none.fields.longitude]).toEqual([null, null, null]);

    const half = parse({ physical_latitude: -25.7 });
    expect(half.ok && [half.fields.latitude, half.fields.longitude]).toEqual([null, null]);

    const outOfRange = parse({ physical_latitude: -125.7, physical_longitude: 28.2 });
    expect(outOfRange.ok && [outOfRange.fields.latitude, outOfRange.fields.longitude]).toEqual([null, null]);

    const pin = parse({ physical_address: "18 Oak Ave", physical_latitude: -26.09, physical_longitude: 27.95 });
    expect(pin.ok && [pin.fields.physicalAddress, pin.fields.latitude, pin.fields.longitude]).toEqual(["18 Oak Ave", -26.09, 27.95]);
  });
});

describe("normaliseEmail", () => {
  it("trims and lower-cases a plausible address", () => {
    expect(normaliseEmail(" A@B.co ")).toBe("a@b.co");
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });
});
