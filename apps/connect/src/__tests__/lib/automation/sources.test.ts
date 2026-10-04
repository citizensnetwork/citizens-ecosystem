import { describe, it, expect } from "vitest";
import { sourcesFromListing } from "@/lib/automation/sources";

describe("sourcesFromListing: the Form's answers become https sources", () => {
  const all = {
    websiteUrl: "https://church.example/",
    youtube: "ImpactOnline",
    facebook: "https://www.facebook.com/gracechurch",
    instagram: "@gracechurch",
    tiktok: "@gracechurch",
  };

  it("builds a page URL from a bare handle, per platform, and keeps real links", () => {
    expect(sourcesFromListing(all, true)).toEqual([
      { kind: "website", url: "https://church.example/", enabled: true },
      { kind: "youtube", url: "https://www.youtube.com/@ImpactOnline", enabled: true },
      { kind: "facebook", url: "https://www.facebook.com/gracechurch", enabled: false },
      { kind: "instagram", url: "https://www.instagram.com/gracechurch/", enabled: false },
      { kind: "tiktok", url: "https://www.tiktok.com/@gracechurch", enabled: false },
    ]);
  });

  it("switches nothing on when consent is off", () => {
    expect(sourcesFromListing(all, false).every((r) => r.enabled === false)).toBe(true);
    expect(sourcesFromListing(all, false)).toHaveLength(5);
  });

  it("only website, YouTube and calendar can ever be enabled: Facebook, Instagram and TikTok stay 'coming soon' even with consent", () => {
    const rows = sourcesFromListing(all, true);
    for (const r of rows) expect(r.enabled, r.kind).toBe(["website", "youtube"].includes(r.kind));
  });

  it("upgrades http to https and refuses every other scheme", () => {
    expect(sourcesFromListing({ websiteUrl: "http://church.example/events" }, true)).toEqual([{ kind: "website", url: "https://church.example/events", enabled: true }]);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://church.example", "mailto:a@b.example", "church", ""]) {
      expect(sourcesFromListing({ websiteUrl: bad }, true), bad).toEqual([]);
    }
  });

  it("accepts a link typed without a scheme in a social box, refuses a display name and hostile handles", () => {
    expect(sourcesFromListing({ facebook: "facebook.com/gracechurch" }, true)).toEqual([{ kind: "facebook", url: "https://facebook.com/gracechurch", enabled: false }]);
    for (const bad of ["Grace Church Radio", "@", "a/b c", "x".repeat(80), "<script>"]) {
      expect(sourcesFromListing({ instagram: bad }, true), bad).toEqual([]);
    }
  });

  it("leaves out what was not given", () => {
    expect(sourcesFromListing({}, true)).toEqual([]);
    expect(sourcesFromListing({ websiteUrl: null, youtube: null, facebook: "  " }, true)).toEqual([]);
  });
});
