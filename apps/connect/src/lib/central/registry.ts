/**
 * TRANSITIONAL app registry and card copy for Central.
 *
 * The lasting home of this data is the database (`central.apps`, migration 203, drafted and not
 * applied). Until the founder applies it, the feed API serves the same rows from here, so that
 * Central can show Connect's real content without any database change. When migration 203 is
 * applied, `GET /api/v1/central/apps` reads `public.central_apps()` instead and this list is
 * deleted. Keep the two in step until then (the rows below are the seed of migration 203).
 *
 * Everything here is PUBLIC COPY awaiting the founder's review (guide, open questions O9 and O11).
 * Guide: docs/central/CENTRAL_FEED_GUIDE.md, sections 4.4 and 4.5.
 */
import type { CentralApp, ConnectAdapterOptions } from "@citizens/central";

const app = (
  slug: string,
  name: string,
  accent: string | null,
  status: CentralApp["status"],
  sortOrder: number,
  explanation: string,
  kinds: CentralApp["kinds"] = [],
): CentralApp => ({
  slug,
  name,
  label: `Citizens ${name}`,
  accent,
  icon: slug,
  explanation,
  visitUrl: slug === "central" ? "/citizens/" : `/citizens/${slug}`,
  status,
  sortOrder,
  kinds,
});

export const TRANSITIONAL_APPS: readonly CentralApp[] = [
  app("central", "Central", null, "live", 0, "One calm stream of everything Citizens offers, drawn from every app.", [
    { kind: "encouragement", label: "Today's Encouragement", defaultShape: "landscape" },
    { kind: "pause", label: "A slower moment", defaultShape: "square" },
  ]),
  app(
    "connect",
    "Connect",
    "#f2bd22",
    "live",
    1,
    "The discovery and connection layer: the map, events, places, contributors and community.",
    [
      { kind: "contributor", label: "Contributors", defaultShape: "square" },
      { kind: "event", label: "Events", defaultShape: "landscape" },
      { kind: "place", label: "Places", defaultShape: "square" },
    ],
  ),
  app(
    "vision",
    "Vision",
    "#718ba9",
    "live",
    2,
    "The intelligence and impact layer: organisations see their real community impact, reach and engagement.",
  ),
  app("wear", "Wear", "#a8685a", "live", 3, "Kingdom-aligned fashion and ethical, community-rooted brands."),
  app(
    "learn",
    "Learn",
    "#4f8a8b",
    "coming_soon",
    4,
    "Find Christian courses, teachers and all learning material, from educational, equipping and training organisations.",
  ),
  app(
    "play",
    "Play",
    "#94708c",
    "coming_soon",
    5,
    "Storage, resources, tools, games and entertainment to break the ice and share memories at Christian gatherings of any size.",
  ),
  app(
    "move",
    "Move",
    "#718b78",
    "coming_soon",
    6,
    "Active events for individuals and families: community runs, hikes, prayer walks, archery, soccer, paddling, cycling and car runs.",
  ),
  app(
    "impact",
    "Impact",
    "#b4535a",
    "coming_soon",
    7,
    "Where community change is proposed, agreed, funded and officially launched, uniting large financial role players and organisations in addressing community needs.",
  ),
];

/** The short line after "Connect" on each of its cards. One line per kind; the founder approves them (O11). */
export const CONNECT_KICKERS: ConnectAdapterOptions["kickers"] = {
  eventToday: "Happening today",
  eventThisWeek: "Happening this week",
  eventLater: "Coming up",
  place: "A place near you",
  contributor: "People serving nearby",
};
