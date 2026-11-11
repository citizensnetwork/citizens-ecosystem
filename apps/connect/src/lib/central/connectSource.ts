/**
 * The live Connect source for the Central feed.
 *
 * Until the `central` tables exist (migrations 203 to 205 are drafted, not applied), the feed API
 * reads Connect's OWN public content straight from Connect's own tables, maps it with the shared
 * adapter and ranks it. No table is added, nothing is written, no service_role is used: the reads
 * run on the ordinary request client, under RLS and the column grants, exactly like the public
 * `/api/v1/events`, `/places` and `/contributors` routes.
 *
 * PRIVACY: the three filters below MUST stay identical to the visibility rules of those routes
 * (events: published + public; places: published; contributors: approved and not hidden). If a
 * rule changes there, change it here in the same commit. Only the columns the adapter needs are
 * selected, all of them already served by the public API.
 *
 * This is Connect reading Connect, so contract rule R2 is kept. Other apps never get this
 * shortcut: they publish through the normalised table (guide section 4).
 */
import {
  HORIZON_DAYS,
  connectToFeedItems,
  feedItemId,
  type ConnectContributor,
  type ConnectEvent,
  type ConnectPlace,
  type FeedItem,
} from "@citizens/central";
import type { createClient } from "@/lib/supabase/server";
import { CONNECT_KICKERS } from "@/lib/central/registry";

type Db = Awaited<ReturnType<typeof createClient>>;
type Stamped = { id: string; created_at?: string | null };
export type ConnectSourceName = "events" | "places" | "contributors";

/** Rows read per kind. Far above today's counts; the table-based sourcing replaces this at scale. */
export const SOURCE_ROW_CAP = 300;
const DAY_MS = 86_400_000;

export interface ConnectCandidates {
  items: FeedItem[];
  /** Rows that could not become a valid card. */
  skipped: number;
  /** Kinds whose read failed. The feed is still served from the others. */
  failed: ConnectSourceName[];
}

export async function loadConnectCandidates(
  supabase: Db,
  options: { now: Date; linkBase: string },
): Promise<ConnectCandidates> {
  const { now, linkBase } = options;
  const from = new Date(now.getTime() - DAY_MS).toISOString();
  const to = new Date(now.getTime() + HORIZON_DAYS * DAY_MS).toISOString();

  const [events, places, contributors] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,date,end_time,location,image_url,latitude,longitude,created_at")
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .limit(SOURCE_ROW_CAP),
    supabase
      .from("places")
      .select("id,name,address,image_url,latitude,longitude,created_at")
      .eq("status", "published")
      .order("id", { ascending: true })
      .limit(SOURCE_ROW_CAP),
    supabase
      .from("profiles")
      .select(
        "id,full_name,contributor_slug,logo_url,avatar_url,physical_address,physical_latitude,physical_longitude,created_at",
      )
      .eq("role", "contributor")
      .eq("contributor_status", "approved")
      .eq("contributor_hidden", false)
      .order("id", { ascending: true })
      .limit(SOURCE_ROW_CAP),
  ]);

  const failed: ConnectSourceName[] = [];
  const rows = <T>(name: ConnectSourceName, answer: { data: unknown; error: unknown }): T[] => {
    if (answer.error) {
      // Never log the request or its query string here: it can carry the viewer's coarse place.
      console.error(`[v1/central/feed] ${name} read failed`, answer.error);
      failed.push(name);
      return [];
    }
    return (answer.data ?? []) as T[];
  };
  const eventRows = rows<ConnectEvent & Stamped>("events", events);
  const placeRows = rows<ConnectPlace & Stamped>("places", places);
  const contributorRows = rows<ConnectContributor & Stamped>("contributors", contributors);

  const created = new Map<string, string>();
  const stamp = (kind: string, list: Stamped[]): void => {
    for (const row of list) if (row.created_at) created.set(`${kind}:${row.id}`, row.created_at);
  };
  stamp("event", eventRows);
  stamp("place", placeRows);
  stamp("contributor", contributorRows);

  const mapped = connectToFeedItems(
    { events: eventRows, places: placeRows, contributors: contributorRows },
    {
      now,
      kickers: CONNECT_KICKERS,
      links: {
        event: (id) => `${linkBase}/e/${encodeURIComponent(id)}`,
        place: (id) => `${linkBase}/p/${encodeURIComponent(id)}`,
        contributor: (slug) => `${linkBase}/c/${encodeURIComponent(slug)}`,
      },
    },
  );

  const items: FeedItem[] = mapped.items.map((input) => {
    const publishedAt = created.get(`${input.kind}:${input.sourceId}`);
    return {
      ...input,
      app: "connect",
      id: feedItemId("connect", input.kind, input.sourceId),
      ...(publishedAt ? { publishedAt } : {}),
    };
  });

  return { items, skipped: mapped.skipped.length, failed };
}
