/**
 * Event groups (issue #222, founder 2026-10-21). The 17 event categories stay.
 * Each one belongs to exactly one group, and the card's sub-heading is
 * `Group | Category` from this mapping. `data.jsx` mirrors `group` and
 * `heading` because the classic frontend cannot import this module; the
 * mirror is checked here, and cards only read what getItemCategory returns.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_LABELS,
  EVENT_CATEGORIES,
  EVENT_GROUPS,
  EVENT_CATEGORY_GROUP,
  eventCategoryGroup,
  eventGroupHeading,
} from "@/lib/categories";
import { loadFrontend } from "../frontend/support/loadFrontend";

const FOUNDER: Record<string, string[]> = {
  "Worship & church": ["worship-prayer", "church-services", "conferences-summits"],
  Serve: ["outreach-missions", "community-upliftment", "care-recovery"],
  "Learn & grow": ["education-equipping", "marriage-family"],
  "Culture & fun": ["arts-culture", "sport-recreation", "social-gatherings", "markets-expos"],
  Audiences: ["mens-community", "womens-community", "youth-students", "kids"],
  Access: ["members-only"],
};

describe("event groups", () => {
  it("keeps the 17 categories and gives each exactly one group", () => {
    expect(EVENT_CATEGORIES).toHaveLength(17);
    const slugs = EVENT_CATEGORIES.map((c) => c.value);
    expect(Object.keys(EVENT_CATEGORY_GROUP).sort()).toEqual([...slugs].sort());
    for (const slug of slugs) expect(eventCategoryGroup(slug)).toBeDefined();
    expect(eventCategoryGroup("not-a-category")).toBeUndefined();
    expect(eventGroupHeading("not-a-category")).toBeUndefined();
  });

  it("matches the founder membership and labels", () => {
    expect(EVENT_GROUPS.map((g) => g.label)).toEqual(Object.keys(FOUNDER));
    for (const [label, slugs] of Object.entries(FOUNDER)) {
      const got = slugs.map((slug) => eventCategoryGroup(slug)?.label);
      expect(got).toEqual(slugs.map(() => label));
    }
    expect(eventGroupHeading("care-recovery")).toBe("Serve | Care & Recovery");
    expect(eventCategoryGroup("members-only")?.label).toBe("Access");
    expect(eventGroupHeading("members-only")).toBe("Access | Members Only");
    for (const slug of Object.keys(EVENT_CATEGORY_GROUP)) {
      const name = CATEGORY_LABELS[slug as keyof typeof CATEGORY_LABELS];
      expect(eventGroupHeading(slug)).toBe(eventCategoryGroup(slug)!.label + " | " + name);
    }
  });

  it("is the same mapping window.DATA.getItemCategory returns", () => {
    const DATA = loadFrontend("data.jsx").DATA as {
      EVENT_CATEGORIES: { id: string; name: string; group?: string; heading?: string }[];
      PLACE_CATEGORIES: { id: string; group?: string; heading?: string }[];
      getItemCategory: (item: { type?: string; category?: string }) => { name?: string; group?: string; heading?: string } | undefined;
    };
    expect(DATA.EVENT_CATEGORIES.map((c) => c.id).sort()).toEqual(
      EVENT_CATEGORIES.map((c) => c.value).sort(),
    );
    for (const row of DATA.EVENT_CATEGORIES) {
      expect(row.group).toBe(eventCategoryGroup(row.id)?.label);
      expect(row.heading).toBe(eventGroupHeading(row.id));
      expect(DATA.getItemCategory({ type: "event", category: row.id })?.heading).toBe(row.heading);
    }
    const church = DATA.getItemCategory({ type: "contributor", category: "churches-ministries" });
    expect(church?.name).toBe("Church");
    expect(church?.group).toBeUndefined();
    expect(church?.heading).toBeUndefined();
    const place = DATA.PLACE_CATEGORIES.find((c) => c.id === "safe-spaces");
    expect(place?.group).toBeUndefined();
    expect(place?.heading).toBeUndefined();
  });

  it("keeps the mapping out of the card component", () => {
    const src = readFileSync(join(process.cwd(), "src/frontend/app/map-v2-card.jsx"), "utf8");
    for (const label of ["Worship & church", "Learn & grow", "Culture & fun", "Care & Recovery", "Members Only", "Serve |"]) {
      expect(src).not.toContain(label);
    }
  });
});
