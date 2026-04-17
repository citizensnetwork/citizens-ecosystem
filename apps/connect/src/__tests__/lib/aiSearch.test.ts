import { describe, expect, it } from "vitest";
import { rankResults, scoreEvent, scorePlace } from "@/lib/aiSearch";
import { parseQuery } from "@/lib/searchProfile";
import type { Event, Place } from "@/types/db";

/** Build a minimal Event fixture — only fields the ranker reads. */
function makeEvent(over: Partial<Event> & { id: string }): Event {
  return {
    id: over.id,
    title: over.title ?? "",
    description: over.description ?? "",
    date: over.date ?? "2030-01-01T00:00:00Z",
    end_time: over.end_time ?? null,
    location: over.location ?? "",
    category: over.category ?? null,
    image_url: null,
    website_url: null,
    contact_email: null,
    contact_phone: null,
    max_attendees: null,
    status: "published",
    visibility: "public",
    attendees_visible: "public",
    latitude: over.latitude ?? null,
    longitude: over.longitude ?? null,
    marker_type: "category",
    marker_icon: null,
    marker_color: null,
    marker_image_url: null,
    category_id: null,
    search_profile: over.search_profile ?? null,
    created_by: "u",
    created_at: "2030-01-01T00:00:00Z",
  };
}

function makePlace(over: Partial<Place> & { id: string; latitude: number; longitude: number }): Place {
  return {
    id: over.id,
    name: over.name ?? "",
    description: over.description ?? "",
    address: over.address ?? "",
    category_id: null,
    custom_category: null,
    image_url: null,
    phone: null,
    website: null,
    latitude: over.latitude,
    longitude: over.longitude,
    created_by: "u",
    verified: false,
    search_profile: over.search_profile ?? null,
    created_at: "2030-01-01T00:00:00Z",
  };
}

describe("scoreEvent", () => {
  it("returns null when nothing matches", () => {
    const e = makeEvent({ id: "a", title: "Random", description: "Nothing" });
    const res = scoreEvent(e, parseQuery("coffee"));
    expect(res).toBeNull();
  });

  it("scores via text overlap when no profile is set", () => {
    const e = makeEvent({ id: "a", title: "Youth worship night", description: "Come sing" });
    const res = scoreEvent(e, parseQuery("youth worship"));
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(0);
  });

  it("scores higher with profile tag overlap than with text alone", () => {
    const tagged = makeEvent({
      id: "a",
      title: "Event",
      description: "",
      search_profile: { needs: ["counselling"], audience: ["hurting"] },
    });
    const textOnly = makeEvent({
      id: "b",
      title: "Counselling session",
      description: "come talk",
    });
    const intent = parseQuery("I need counselling");
    const taggedRes = scoreEvent(tagged, intent)!;
    const textRes = scoreEvent(textOnly, intent)!;
    expect(taggedRes.score).toBeGreaterThan(textRes.score);
    expect(taggedRes.reason).toContain("Counselling");
  });

  it("applies proximity boost when nearMe + coordinates available", () => {
    const near = makeEvent({
      id: "near",
      title: "Homecell gathering",
      search_profile: { needs: ["community"] },
      latitude: -25.75,
      longitude: 28.23,
    });
    const far = makeEvent({
      id: "far",
      title: "Homecell gathering",
      search_profile: { needs: ["community"] },
      latitude: -33.9,
      longitude: 18.4,
    });
    const intent = parseQuery("homecells in my area");
    const nearRes = scoreEvent(near, intent, { lat: -25.76, lng: 28.24 })!;
    const farRes = scoreEvent(far, intent, { lat: -25.76, lng: 28.24 })!;
    expect(nearRes.score).toBeGreaterThan(farRes.score);
  });
});

describe("scorePlace", () => {
  it("matches coffee places via tags", () => {
    const p = makePlace({
      id: "p",
      name: "The Good Bean",
      description: "Specialty coffee",
      latitude: 0,
      longitude: 0,
      search_profile: { needs: ["food-coffee"] },
    });
    const res = scorePlace(p, parseQuery("good coffee places nearby"));
    expect(res).not.toBeNull();
    expect(res!.reason).toContain("Food & Coffee");
  });
});

describe("rankResults", () => {
  it("sorts results descending by score", () => {
    const events = [
      makeEvent({ id: "weak", title: "homecell mentioned once" }),
      makeEvent({ id: "strong", search_profile: { needs: ["community", "food-coffee"] } }),
      makeEvent({ id: "none", title: "chess club" }),
    ];
    const { events: ranked, intent } = rankResults("homecells and coffee", events, []);
    expect(intent.hasSignal).toBe(true);
    expect(ranked[0].id).toBe("strong");
    expect(ranked.find((r) => r.id === "none")).toBeUndefined();
  });

  it("returns empty arrays for empty queries", () => {
    const { events, places, intent } = rankResults("", [], []);
    expect(events).toEqual([]);
    expect(places).toEqual([]);
    expect(intent.raw).toBe("");
  });

  it("auto-derives tags from title/description when no profile is set", () => {
    const e = makeEvent({
      id: "auto",
      title: "Weekly homecell gathering",
      description: "Come grow in community with us.",
    });
    // No explicit search_profile on the event, but the query asks for community:
    const res = scoreEvent(e, parseQuery("homecells"));
    expect(res).not.toBeNull();
    expect(res!.reason).toContain("Community");
  });

  it("explicit tags score higher than auto-derived ones", () => {
    const explicit = makeEvent({
      id: "explicit",
      title: "Event",
      description: "",
      search_profile: { needs: ["community"] },
    });
    const derived = makeEvent({
      id: "derived",
      title: "Homecell",
      description: "Homecell gathering",
    });
    const intent = parseQuery("homecells");
    const a = scoreEvent(explicit, intent)!;
    const b = scoreEvent(derived, intent)!;
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("recency tie-break: sooner event ranks higher than far-future", () => {
    const soon = makeEvent({
      id: "soon",
      search_profile: { needs: ["community"] },
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const far = makeEvent({
      id: "far",
      search_profile: { needs: ["community"] },
      date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const { events } = rankResults("homecells", [far, soon], []);
    expect(events[0].id).toBe("soon");
  });
});
