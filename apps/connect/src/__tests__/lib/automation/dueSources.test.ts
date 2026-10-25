import { describe, it, expect } from "vitest";
import { MAX_SOURCES_PER_RUN, SOURCE_DUE_AFTER_HOURS, dueCutoff, isDue, pickDueSources, type SourceRow } from "@/lib/automation/dueSources";

const NOW = new Date("2026-10-25T04:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let n = 0;
const row = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  contributor_id: A,
  kind: "website",
  url: "https://www.church.example/",
  enabled: true,
  last_checked_at: null,
  last_status: null,
  ...over,
});
const eligible = new Set([A]);

describe("isDue", () => {
  it("never checked, or an unreadable time, is due", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
    expect(isDue("not a date", NOW)).toBe(true);
  });
  it(`is due only after ${SOURCE_DUE_AFTER_HOURS} hours`, () => {
    expect(isDue(hoursAgo(SOURCE_DUE_AFTER_HOURS - 1), NOW)).toBe(false);
    expect(isDue(hoursAgo(SOURCE_DUE_AFTER_HOURS), NOW)).toBe(false);
    expect(isDue(hoursAgo(SOURCE_DUE_AFTER_HOURS + 0.01), NOW)).toBe(true);
    expect(dueCutoff(NOW).toISOString()).toBe(hoursAgo(SOURCE_DUE_AFTER_HOURS));
  });
  it("a check in the future (clock skew) is not due", () => {
    expect(isDue(hoursAgo(-2), NOW)).toBe(false);
  });
});

describe("pickDueSources", () => {
  it("keeps enabled, readable, https, due sources of eligible Contributors and returns only the documented fields", () => {
    const r = row({ last_status: "2 events found" });
    expect(pickDueSources([r], eligible, NOW)).toEqual([
      { source_id: r.id, contributor_id: A, kind: "website", url: "https://www.church.example/", last_status: "2 events found" },
    ]);
  });

  it("drops a disabled source, an unreadable kind, an ineligible owner, a recent check and a non-https address", () => {
    const rows = [
      row({ enabled: false }),
      row({ kind: "facebook", url: "https://www.facebook.com/x" }),
      row({ kind: "instagram" }),
      row({ kind: "tiktok" }),
      row({ kind: "rss" }),
      row({ contributor_id: B }),
      row({ last_checked_at: hoursAgo(2) }),
      row({ url: "http://www.church.example/" }),
      row({ url: "https://user:pw@www.church.example/" }),
      row({ url: "javascript:alert(1)" }),
    ];
    expect(pickDueSources(rows, eligible, NOW)).toEqual([]);
  });

  it("youtube and calendar sources are offered (the Reader decides what it can read)", () => {
    const kinds = pickDueSources([row({ kind: "youtube" }), row({ kind: "calendar" })], eligible, NOW).map((s) => s.kind);
    expect(kinds.sort()).toEqual(["calendar", "youtube"]);
  });

  it("oldest check first, never-checked first of all, ties by id; a repeated id is kept once", () => {
    const older = row({ last_checked_at: hoursAgo(72) });
    const newer = row({ last_checked_at: hoursAgo(30) });
    const never2 = row({ id: "00000000-0000-4000-8000-ffffffffffff" });
    const never1 = row({ id: "00000000-0000-4000-8000-000000000000" });
    const picked = pickDueSources([newer, never2, older, never1, newer], eligible, NOW).map((s) => s.source_id);
    expect(picked).toEqual([never1.id, never2.id, older.id, newer.id]);
  });

  it(`caps at ${MAX_SOURCES_PER_RUN} by default, and at any smaller cap`, () => {
    const rows = Array.from({ length: MAX_SOURCES_PER_RUN + 25 }, () => row());
    expect(pickDueSources(rows, eligible, NOW)).toHaveLength(MAX_SOURCES_PER_RUN);
    expect(pickDueSources(rows, eligible, NOW, 3)).toHaveLength(3);
    expect(pickDueSources(rows, eligible, NOW, -1)).toHaveLength(0);
  });
});
