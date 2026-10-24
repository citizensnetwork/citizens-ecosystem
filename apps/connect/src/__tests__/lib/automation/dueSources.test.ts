import { describe, it, expect } from "vitest";
import {
  MAX_SOURCES_PER_RUN,
  SOURCE_DUE_AFTER_HOURS,
  contributorEligibility,
  isDue,
  pickDueSources,
  type SourceRow,
} from "@/lib/automation/dueSources";

const NOW = new Date("2026-10-21T04:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const src = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  contributor_id: A,
  kind: "website",
  url: "https://www.church.example/",
  enabled: true,
  last_checked_at: null,
  last_status: null,
  ...over,
});

describe("contributorEligibility", () => {
  const ok = {
    role: "contributor",
    contributor_status: "approved",
    contributor_hidden: false,
    deleted_at: null,
    auto_update_level: "suggest",
  };
  it("accepts an approved, visible Contributor at 'suggest' or 'events_auto', and names the level", () => {
    expect(contributorEligibility(ok)).toEqual({ level: "suggest" });
    expect(contributorEligibility({ ...ok, auto_update_level: "events_auto" })).toEqual({
      level: "events_auto",
    });
  });
  it("refuses a missing, unapproved, hidden, deleted or non-Contributor profile", () => {
    for (const over of [{ contributor_status: "pending" }, { contributor_hidden: true }, { deleted_at: "2026-01-01" }, { role: "citizen" }]) {
      expect(contributorEligibility({ ...ok, ...over })).toEqual({
        reason: "contributor_not_eligible",
      });
    }
    expect(contributorEligibility(null)).toEqual({ reason: "contributor_not_eligible" });
    expect(contributorEligibility(undefined)).toEqual({ reason: "contributor_not_eligible" });
  });
  it("treats 'off', an unknown level and null as consent_off", () => {
    for (const level of ["off", "yes", null, undefined]) {
      expect(contributorEligibility({ ...ok, auto_update_level: level })).toEqual({
        reason: "consent_off",
      });
    }
  });
});

describe("isDue", () => {
  it("is due when never checked, when the date is unreadable, and after more than the threshold", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
    expect(isDue("not a date", NOW)).toBe(true);
    expect(isDue(hoursAgo(SOURCE_DUE_AFTER_HOURS + 1), NOW)).toBe(true);
  });
  it("is not due at or inside the threshold", () => {
    expect(isDue(hoursAgo(SOURCE_DUE_AFTER_HOURS), NOW)).toBe(false);
    expect(isDue(hoursAgo(1), NOW)).toBe(false);
    expect(isDue(NOW.toISOString(), NOW)).toBe(false);
  });
});

describe("pickDueSources", () => {
  const eligible = new Set([A]);

  it("returns the five public fields and nothing else", () => {
    const [one] = pickDueSources([src({ last_status: "2 events" })], eligible, NOW);
    expect(Object.keys(one!).sort()).toEqual(["contributor_id", "kind", "last_status", "source_id", "url"]);
    expect(one).toEqual({
      source_id: "aaaaaaaa-0000-4000-8000-000000000001",
      contributor_id: A,
      kind: "website",
      url: "https://www.church.example/",
      last_status: "2 events",
    });
  });

  it("drops a disabled source, one whose Contributor is not eligible, and one checked recently", () => {
    const rows = [
      src({ id: "a1", enabled: false }),
      src({ id: "a2", contributor_id: B }),
      src({ id: "a3", last_checked_at: hoursAgo(3) }),
      src({ id: "a4" }),
    ];
    expect(pickDueSources(rows, eligible, NOW).map((s) => s.source_id)).toEqual(["a4"]);
  });

  it("never offers Facebook, Instagram or TikTok, or an unknown kind, even if a row says enabled", () => {
    const rows = ["facebook", "instagram", "tiktok", "twitter"].map((kind, i) => src({ id: `k${i}`, kind }));
    expect(pickDueSources(rows, eligible, NOW)).toEqual([]);
  });

  it("offers website, youtube and calendar", () => {
    const rows = ["website", "youtube", "calendar"].map((kind, i) => src({ id: `k${i}`, kind, url: `https://${kind}.example/x` }));
    expect(
      pickDueSources(rows, eligible, NOW)
        .map((s) => s.kind)
        .sort(),
    ).toEqual(["calendar", "website", "youtube"]);
  });

  it("drops an address that is not https, has credentials, or is not a URL", () => {
    const rows = ["http://church.example/", "https://user:pw@church.example/", "javascript:alert(1)", "not a url", "https://localhost/"].map(
      (url, i) => src({ id: `u${i}`, url }),
    );
    expect(pickDueSources(rows, eligible, NOW)).toEqual([]);
  });

  it("orders never-checked first, then oldest check first, with a stable tie-break on id", () => {
    const rows = [
      src({ id: "d", last_checked_at: hoursAgo(30) }),
      src({ id: "c", last_checked_at: hoursAgo(90) }),
      src({ id: "b" }),
      src({ id: "a" }),
      src({ id: "e", last_checked_at: hoursAgo(30) }),
    ];
    expect(pickDueSources(rows, eligible, NOW).map((s) => s.source_id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("caps the list at 200 by default and at a given cap, keeping the oldest", () => {
    const rows = Array.from({ length: 250 }, (_, i) => src({ id: `s${String(i).padStart(3, "0")}`, last_checked_at: hoursAgo(100 + i) }));
    const picked = pickDueSources(rows, eligible, NOW);
    expect(picked).toHaveLength(MAX_SOURCES_PER_RUN);
    expect(picked[0]!.source_id).toBe("s249");
    expect(pickDueSources(rows, eligible, NOW, 3)).toHaveLength(3);
    expect(pickDueSources(rows, eligible, NOW, 0)).toEqual([]);
  });
});
