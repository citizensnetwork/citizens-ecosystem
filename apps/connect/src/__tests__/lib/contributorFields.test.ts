import { describe, it, expect } from "vitest";
import { hasMapPin, normaliseEmail, parseListingFields } from "@/lib/contributorFields";

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

describe("parseListingFields — socials that are the wrong kind of value", () => {
  // What the first real Form submission (Grace Radio) actually contained.
  const impact = {
    instagram_handle: "GraceFM103",
    facebook_url: "Grace Radio",
    youtube_url: "Grace Online",
    whatsapp_number: "0712345678",
  };

  it("is strict by default: a display name is an error naming the field (a person is here to fix it)", () => {
    expect(parse({ facebook_url: "Grace Radio" })).toEqual({ ok: false, error: "invalid_facebook_url" });
    expect(parse({ whatsapp_number: "call the office" })).toEqual({ ok: false, error: "invalid_whatsapp_number" });
  });

  it("normalises a local South African WhatsApp number in both modes", () => {
    for (const lenientSocials of [false, true]) {
      const res = parseListingFields({ ...valid, whatsapp_number: "071 234 5678" }, { lenientSocials });
      expect(res.ok && res.fields.socials.whatsapp_number, `lenient=${lenientSocials}`).toBe("27712345678");
    }
  });

  it("lenient: leaves each bad social empty, keeps the good ones, and writes one Note per skipped field", () => {
    const res = parseListingFields({ ...valid, ...impact }, { lenientSocials: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields.socials).toMatchObject({
      instagram_handle: "GraceFM103",
      facebook_url: null,
      youtube_url: null,
      whatsapp_number: "27712345678",
    });
    expect(res.notes).toHaveLength(2);
    expect(res.notes[0]).toMatch(/^Facebook skipped: "Grace Radio" isn't a link or a handle \(facebook_not_a_link\)/);
    expect(res.notes[1]).toMatch(/^YouTube skipped: "Grace Online" isn't a link or a handle \(youtube_not_a_link\)/);
  });

  it("lenient: reports an unreadable WhatsApp number and a link to another site", () => {
    const res = parseListingFields(
      { ...valid, whatsapp_number: "ring the church", x_handle: "https://evil.example/x" },
      { lenientSocials: true },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields.socials.whatsapp_number).toBeNull();
    expect(res.fields.socials.x_handle).toBeNull();
    expect(res.notes.join("\n")).toContain("whatsapp_invalid_number");
    expect(res.notes.join("\n")).toContain("x_not_a_link");
  });

  it("lenient never excuses a dangerous or oversized value", () => {
    expect(parseListingFields({ ...valid, facebook_url: "javascript:alert(1)" }, { lenientSocials: true })).toEqual({
      ok: false,
      error: "invalid_facebook_url",
    });
    expect(parseListingFields({ ...valid, x_handle: "a".repeat(501) }, { lenientSocials: true })).toEqual({
      ok: false,
      error: "invalid_x_handle",
    });
  });

  it("a Note is one clipped line, so a hostile value can't break the Sheet row or flood it", () => {
    const res = parseListingFields(
      { ...valid, facebook_url: `${"Grace Radio ".repeat(30)}\n=HYPERLINK("http://evil")` },
      { lenientSocials: true },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0]).not.toContain("\n");
    expect(res.notes[0].length).toBeLessThan(300);
  });

  it("lenient: a literal No in website or socials is empty, with no skip note", () => {
    const res = parseListingFields(
      { ...valid, website_url: " No ", facebook_url: "no", instagram_handle: "NO" },
      { lenientSocials: true },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields.websiteUrl).toBeNull();
    expect(res.fields.socials.facebook_url).toBeNull();
    expect(res.fields.socials.instagram_handle).toBeNull();
    expect(res.notes).toEqual([]);
  });

  it("strict: a literal No is not blanked before validation", () => {
    const website = parse({ website_url: "No" });
    if (website.ok) expect(website.fields.websiteUrl).not.toBeNull();
    else expect(website.error).toBe("invalid_website_url");
    const social = parse({ facebook_url: "No" });
    if (social.ok) expect(social.fields.socials.facebook_url).not.toBeNull();
    else expect(social.error).toBe("invalid_facebook_url");
  });

  it("returns no notes when every social is fine", () => {
    const res = parseListingFields({ ...valid, instagram_handle: "@gracepoint", facebook_url: "facebook.com/gracepoint" });
    expect(res.ok && res.notes).toEqual([]);
  });
});

describe("normaliseEmail", () => {
  it("trims and lower-cases a plausible address", () => {
    expect(normaliseEmail(" A@B.co ")).toBe("a@b.co");
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });
});

describe("hasMapPin (tracker C21: say 'on the map' only when it is true)", () => {
  const pin = { no_fixed_location: false, physical_latitude: -25.7479, physical_longitude: 28.2293 };

  it("is true with both coordinates, as numbers or as numeric strings", () => {
    expect(hasMapPin(pin)).toBe(true);
    expect(hasMapPin({ ...pin, physical_latitude: "-25.7479", physical_longitude: "28.2293" })).toBe(true);
    expect(hasMapPin({ physical_latitude: 0, physical_longitude: 0 })).toBe(true); // 0,0 is a real (if odd) pin; a missing flag is not "no fixed location"
  });

  it("is false for a Contributor with no fixed location, even with stale coordinates on the row", () => {
    expect(hasMapPin({ ...pin, no_fixed_location: true })).toBe(false);
    expect(hasMapPin({ no_fixed_location: true, physical_latitude: null, physical_longitude: null })).toBe(false);
  });

  it("is false with one coordinate, none, or a column that is missing", () => {
    expect(hasMapPin({ ...pin, physical_longitude: null })).toBe(false);
    expect(hasMapPin({ ...pin, physical_latitude: undefined })).toBe(false);
    expect(hasMapPin({})).toBe(false);
  });

  it("is false for values that are not coordinates (empty, text, booleans, NaN, out of range)", () => {
    for (const bad of ["", "  ", "n/a", true, false, NaN, Infinity, {}, [], 91]) {
      expect(hasMapPin({ ...pin, physical_latitude: bad }), String(bad)).toBe(false);
    }
    expect(hasMapPin({ ...pin, physical_longitude: 181 })).toBe(false);
  });
});
