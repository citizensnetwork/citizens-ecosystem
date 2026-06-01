import { describe, it, expect } from "vitest";
import {
  clamp01,
  timeProximity,
  newcomerBoost,
  computeProminence,
  markerTier,
  DOT_MODE_ZOOM,
  MID_MODE_ZOOM,
  PROMINENCE_ZOOM_SPAN,
  NEWCOMER_WINDOW_DAYS,
} from "@/lib/map/prominence";

const DAY = 86_400_000;
const NOW = new Date("2026-06-01T12:00:00.000Z").getTime();
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

describe("clamp01", () => {
  it("clamps to [0,1] and treats non-finite as 0", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0); // non-finite → 0 (safe guard)
    expect(clamp01(-Infinity)).toBe(0);
  });
});

describe("timeProximity", () => {
  it("is maximal for a live event", () => {
    expect(timeProximity(iso(-30 * 60 * 1000), iso(90 * 60 * 1000), NOW)).toBe(1);
  });

  it("decays as the start recedes into the future", () => {
    expect(timeProximity(iso(2 * 60 * 60 * 1000), null, NOW)).toBe(1); // <1 day
    expect(timeProximity(iso(3 * DAY), null, NOW)).toBe(0.8); // <1 week
    expect(timeProximity(iso(14 * DAY), null, NOW)).toBe(0.6); // <30 days
    expect(timeProximity(iso(60 * DAY), null, NOW)).toBe(0.4); // <90 days
    expect(timeProximity(iso(200 * DAY), null, NOW)).toBe(0.25); // far out
  });

  it("gives a finished event the lowest band (still shown, deprioritised)", () => {
    expect(timeProximity(iso(-5 * DAY), iso(-5 * DAY + 2 * 60 * 60 * 1000), NOW)).toBe(0.2);
  });

  it("monotonically decreases with distance into the future", () => {
    const a = timeProximity(iso(2 * 60 * 60 * 1000), null, NOW);
    const b = timeProximity(iso(3 * DAY), null, NOW);
    const c = timeProximity(iso(60 * DAY), null, NOW);
    expect(a).toBeGreaterThanOrEqual(b);
    expect(b).toBeGreaterThanOrEqual(c);
  });
});

describe("newcomerBoost", () => {
  it("is at peak for a brand-new item and zero past the window", () => {
    expect(newcomerBoost(iso(0), NOW)).toBeCloseTo(0.2, 5);
    expect(newcomerBoost(iso(-NEWCOMER_WINDOW_DAYS * DAY), NOW)).toBe(0);
    expect(newcomerBoost(iso(-(NEWCOMER_WINDOW_DAYS + 5) * DAY), NOW)).toBe(0);
  });

  it("decays linearly across the window", () => {
    const half = newcomerBoost(iso(-(NEWCOMER_WINDOW_DAYS / 2) * DAY), NOW);
    expect(half).toBeCloseTo(0.1, 5);
  });

  it("handles missing/invalid/future timestamps safely", () => {
    expect(newcomerBoost(null, NOW)).toBe(0);
    expect(newcomerBoost(undefined, NOW)).toBe(0);
    expect(newcomerBoost("not-a-date", NOW)).toBe(0);
    expect(newcomerBoost(iso(5 * DAY), NOW)).toBeCloseTo(0.2, 5); // future-dated → brand new
  });
});

describe("computeProminence", () => {
  it("keeps the fairness floor: a far-future unpopular item still scores > 0", () => {
    const p = computeProminence({ base: 0, dateStr: iso(200 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.3);
  });

  it("time dominates popularity (don't bury the small)", () => {
    // Today's small event vs a far-future popular event.
    const todaySmall = computeProminence({ base: 0, dateStr: iso(2 * 60 * 60 * 1000), createdAt: iso(-30 * DAY), now: NOW });
    const farPopular = computeProminence({ base: 1, dateStr: iso(200 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    expect(todaySmall).toBeGreaterThan(farPopular);
  });

  it("popularity still lifts items at equal time-proximity", () => {
    const lo = computeProminence({ base: 0, dateStr: iso(3 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    const hi = computeProminence({ base: 1, dateStr: iso(3 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    expect(hi).toBeGreaterThan(lo);
    expect(hi - lo).toBeCloseTo(0.4, 5); // W_POP applied to full base delta
  });

  it("newcomer boost lifts a brand-new small item", () => {
    const old = computeProminence({ base: 0, dateStr: iso(14 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    const fresh = computeProminence({ base: 0, dateStr: iso(14 * DAY), createdAt: iso(0), now: NOW });
    expect(fresh).toBeGreaterThan(old);
  });

  it("treats places (no dateStr) with neutral time-proximity", () => {
    const place = computeProminence({ base: 0.5, createdAt: iso(-30 * DAY), now: NOW });
    // 0.6*0.5 (neutral) + 0.4*0.5 = 0.5
    expect(place).toBeCloseTo(0.5, 5);
  });

  it("never exceeds 1 even at max everything", () => {
    const p = computeProminence({ base: 1, dateStr: iso(-30 * 60 * 1000), endDateStr: iso(60 * 60 * 1000), createdAt: iso(0), now: NOW });
    expect(p).toBe(1);
  });

  it("absent base is treated as 0", () => {
    const a = computeProminence({ dateStr: iso(3 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    const b = computeProminence({ base: 0, dateStr: iso(3 * DAY), createdAt: iso(-30 * DAY), now: NOW });
    expect(a).toBe(b);
  });
});

describe("markerTier", () => {
  it("uses base thresholds at prominence 0", () => {
    expect(markerTier(DOT_MODE_ZOOM - 0.5, 0)).toBe("dot");
    expect(markerTier(DOT_MODE_ZOOM + 0.5, 0)).toBe("mid");
    expect(markerTier(MID_MODE_ZOOM + 0.5, 0)).toBe("full");
  });

  it("promotes high-prominence markers earlier", () => {
    // At a zoom that's 'dot' for prominence 0, a top item is already 'mid' or 'full'.
    const z = DOT_MODE_ZOOM - 1; // = 6
    expect(markerTier(z, 0)).toBe("dot");
    expect(markerTier(z, 1)).not.toBe("dot");
  });

  it("a prominence-0 marker still reaches full at MID_MODE_ZOOM (fairness floor)", () => {
    expect(markerTier(MID_MODE_ZOOM, 0)).toBe("full");
  });

  it("max prominence shifts thresholds down by PROMINENCE_ZOOM_SPAN", () => {
    expect(markerTier(MID_MODE_ZOOM - PROMINENCE_ZOOM_SPAN, 1)).toBe("full");
    expect(markerTier(MID_MODE_ZOOM - PROMINENCE_ZOOM_SPAN - 0.5, 1)).toBe("mid");
  });

  it("is monotonic in zoom for fixed prominence", () => {
    const tiers = [0, 5, 8, 11, 15].map((z) => markerTier(z, 0.5));
    const rank = { dot: 0, mid: 1, full: 2 } as const;
    for (let i = 1; i < tiers.length; i++) {
      expect(rank[tiers[i]]).toBeGreaterThanOrEqual(rank[tiers[i - 1]]);
    }
  });
});
