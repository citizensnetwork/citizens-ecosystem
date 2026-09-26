import { describe, it, expect } from "vitest";
import {
  decodeIntakeImage,
  mapOrganisationType,
  mapPrimaryCategory,
  MAX_IMAGE_BYTES,
  normaliseLabel,
  parseFixedLocation,
  parseMapsCoordinates,
  signIntake,
  sniffImageType,
  verifyIntakeSignature,
} from "@/lib/intake/googleForm";
import { CONTRIBUTOR_TYPES } from "@/lib/categories";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("normaliseLabel", () => {
  it("ignores case, spacing, & vs and, and slash spacing", () => {
    expect(normaliseLabel("  Sport &  Recreation ")).toBe("sport and recreation");
    expect(normaliseLabel("Outreach/Mission")).toBe(normaliseLabel("Outreach / Mission"));
  });
});

describe("mapOrganisationType (Q2.2)", () => {
  it("maps the live Form's labels", () => {
    expect(mapOrganisationType("Church")).toEqual({ ok: true, value: "ministry" });
    expect(mapOrganisationType("Christian Nonprofit / Ministry")).toEqual({ ok: true, value: "organization" });
    expect(mapOrganisationType("Christian Business")).toEqual({ ok: true, value: "business" });
    expect(mapOrganisationType("Individual")).toEqual({ ok: true, value: "individual" });
  });

  it("tolerates spacing, case and a trailing (note)", () => {
    expect(mapOrganisationType("christian nonprofit/ministry")).toEqual({ ok: true, value: "organization" });
    expect(mapOrganisationType("Individual (freelancer, speaker)")).toEqual({ ok: true, value: "individual" });
    expect(mapOrganisationType("Organisation")).toEqual({ ok: true, value: "organization" });
  });

  it("treats blank as no kind and rejects anything unknown", () => {
    expect(mapOrganisationType("")).toEqual({ ok: true, value: null });
    expect(mapOrganisationType(undefined)).toEqual({ ok: true, value: null });
    expect(mapOrganisationType("Cooperative")).toEqual({ ok: false });
  });
});

describe("mapPrimaryCategory (Q2.3)", () => {
  it("maps every one of the 12 Form labels to its slug", () => {
    for (const t of CONTRIBUTOR_TYPES) {
      expect(mapPrimaryCategory(t.label)).toEqual({ ok: true, value: t.value });
    }
  });

  it("tolerates spacing/& variants and accepts the slug itself", () => {
    expect(mapPrimaryCategory("Outreach/Mission")).toEqual({ ok: true, value: "outreach-missions" });
    expect(mapPrimaryCategory("sport and recreation")).toEqual({ ok: true, value: "sport-recreation" });
    expect(mapPrimaryCategory("clinic")).toEqual({ ok: true, value: "clinic" });
  });

  it("rejects blanks and labels outside the 12 (never a silent default)", () => {
    expect(mapPrimaryCategory("")).toEqual({ ok: false });
    expect(mapPrimaryCategory("Community Outreach")).toEqual({ ok: false });
    expect(mapPrimaryCategory("Café / Community")).toEqual({ ok: false });
  });
});

describe("parseFixedLocation (Q3.1)", () => {
  it("reads yes / no / blank / other", () => {
    expect(parseFixedLocation("Yes")).toBe(true);
    expect(parseFixedLocation("No — we're online only")).toBe(false);
    expect(parseFixedLocation("")).toBeNull();
    expect(parseFixedLocation("Sometimes")).toBe("unknown");
  });
});

describe("parseMapsCoordinates", () => {
  it("prefers the dropped pin (!3d!4d) over the viewport (@)", () => {
    const link =
      "https://www.google.com/maps/place/Grace+Point/@-26.0901,27.9501,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-26.0948!4d27.9591";
    expect(parseMapsCoordinates(link)).toEqual({ lat: -26.0948, lng: 27.9591 });
  });

  it("reads ?q=lat,lng (incl. url-encoded comma) and @lat,lng", () => {
    expect(parseMapsCoordinates("https://maps.google.com/?q=-25.7479,28.2293")).toEqual({ lat: -25.7479, lng: 28.2293 });
    expect(parseMapsCoordinates("https://www.google.com/maps/search/?api=1&query=-25.7%2C28.2")).toEqual({ lat: -25.7, lng: 28.2 });
    expect(parseMapsCoordinates("https://www.google.com/maps/@-25.75,28.23,15z")).toEqual({ lat: -25.75, lng: 28.23 });
  });

  it("returns null for an address-only link, out-of-range values, junk and over-long input", () => {
    expect(parseMapsCoordinates("https://maps.google.com/?q=18+Oak+Avenue+Randpark+Ridge")).toBeNull();
    expect(parseMapsCoordinates("https://maps.google.com/?q=-125.7,28.2")).toBeNull();
    expect(parseMapsCoordinates("https://maps.google.com/?q=0,0")).toBeNull();
    expect(parseMapsCoordinates("%E0%A4%A")).toBeNull();
    expect(parseMapsCoordinates("https://maps.google.com/?q=-25.7,28.2&x=" + "9".repeat(3000))).toBeNull();
    expect(parseMapsCoordinates(undefined)).toBeNull();
  });
});

describe("HMAC signature", () => {
  const secret = "s".repeat(64);
  const body = '{"a":1}';
  const now = 1_790_000_000;
  const ts = String(now);

  it("accepts the exact signed body inside the window", () => {
    const signature = signIntake(secret, ts, body);
    expect(verifyIntakeSignature({ secret, timestamp: ts, signature, body, nowSeconds: now + 299 })).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a stale or future timestamp, and malformed headers", () => {
    const signature = signIntake(secret, ts, body);
    const base = { secret, timestamp: ts, signature, body, nowSeconds: now };
    expect(verifyIntakeSignature({ ...base, body: '{"a":2}' })).toBe(false);
    expect(verifyIntakeSignature({ ...base, secret: "x".repeat(64) })).toBe(false);
    expect(verifyIntakeSignature({ ...base, nowSeconds: now + 301 })).toBe(false);
    expect(verifyIntakeSignature({ ...base, nowSeconds: now - 301 })).toBe(false);
    expect(verifyIntakeSignature({ ...base, timestamp: null })).toBe(false);
    expect(verifyIntakeSignature({ ...base, timestamp: "12.5" })).toBe(false);
    expect(verifyIntakeSignature({ ...base, signature: null })).toBe(false);
    expect(verifyIntakeSignature({ ...base, signature: "abc" })).toBe(false);
    expect(verifyIntakeSignature({ ...base, signature: "z".repeat(64) })).toBe(false);
  });
});

describe("images", () => {
  it("sniffs JPEG / PNG / WebP from magic bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("decodes a valid image and takes the type from its bytes, not the claim", () => {
    const res = decodeIntakeImage({ mime: "image/png", base64: JPEG.toString("base64") });
    expect(res).toMatchObject({ ok: true, image: { contentType: "image/jpeg", ext: "jpg" } });
  });

  it("returns null when no image was sent", () => {
    expect(decodeIntakeImage(null)).toBeNull();
    expect(decodeIntakeImage(undefined)).toBeNull();
  });

  it("refuses unsupported, oversize and malformed images", () => {
    expect(decodeIntakeImage({ mime: "image/heic", base64: JPEG.toString("base64") })).toEqual({ ok: false, reason: "unsupported_type" });
    expect(decodeIntakeImage({ mime: "image/png", base64: Buffer.from("GIF89a....").toString("base64") })).toEqual({ ok: false, reason: "unsupported_type" });
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 10, 0xff).toString("base64");
    expect(decodeIntakeImage({ mime: "image/jpeg", base64: big })).toEqual({ ok: false, reason: "too_large" });
    expect(decodeIntakeImage({ mime: "image/jpeg", base64: "not base64!!" })).toEqual({ ok: false, reason: "invalid" });
    expect(decodeIntakeImage({ mime: "image/jpeg" })).toEqual({ ok: false, reason: "invalid" });
    expect(decodeIntakeImage("nope")).toEqual({ ok: false, reason: "invalid" });
  });
});
