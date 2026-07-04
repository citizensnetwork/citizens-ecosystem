/**
 * Server-side assembly of an org's Citizens Connect footprint.
 *
 * Replaces the old `cc_*_mirror` reads: Connect's events/places come live from
 * `/api/v1` (scoped to the org's linked contributor), and claim status is
 * overlaid from `vision.cc_event_claims` / `vision.cc_place_claims`.
 *
 * Shared by the `[orgSlug]/connect` page (Server Component) and the
 * `/api/connect/*` GET routes so the merge logic lives in exactly one place.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectApi } from "./api";
import type { CCEvent, CCPlace } from "@/types/db";

/** Returns the org's linked Connect contributor id, or null if not linked. */
export async function getOrgConnectContributorId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organisations")
    .select("connect_contributor_id")
    .eq("id", orgId)
    .single();
  return (data?.connect_contributor_id as string | null) ?? null;
}

interface FeedArgs {
  orgId: string;
  connectContributorId: string | null;
  page: number;
  perPage: number;
}

export interface OrgConnectEventsResult {
  events: CCEvent[];
  total: number;
  /** false when the org hasn't linked a Connect contributor yet. */
  linked: boolean;
}

export async function listOrgConnectEvents(
  supabase: SupabaseClient,
  args: FeedArgs & { category?: string },
): Promise<OrgConnectEventsResult> {
  const { orgId, connectContributorId, category, page, perPage } = args;
  if (!connectContributorId) return { events: [], total: 0, linked: false };

  const offset = (page - 1) * perPage;
  const { data: feed, meta } = await connectApi.listEvents({
    created_by: connectContributorId,
    category,
    limit: perPage,
    offset,
  });

  const ids = feed.map((e) => e.id);
  const claims = new Map<
    string,
    { cv_org_id: string; cv_project_id: string | null; cv_activity_id: string | null }
  >();
  if (ids.length) {
    const { data: rows } = await supabase
      .from("cc_event_claims")
      .select("cc_event_id, cv_org_id, cv_project_id, cv_activity_id")
      .eq("cv_org_id", orgId)
      .in("cc_event_id", ids);
    for (const r of rows ?? []) claims.set(r.cc_event_id, r);
  }

  const events: CCEvent[] = feed.map((e) => {
    const claim = claims.get(e.id);
    return {
      cc_event_id: e.id,
      title: e.title,
      description: null,
      date: e.date,
      end_time: e.end_time,
      location: e.location,
      latitude: e.latitude,
      longitude: e.longitude,
      category: e.category,
      created_by: e.created_by,
      rsvp_count: 0,
      avg_rating: null,
      cv_org_id: claim?.cv_org_id ?? null,
      cv_project_id: claim?.cv_project_id ?? null,
      cv_activity_id: claim?.cv_activity_id ?? null,
    };
  });

  return {
    events,
    total: typeof meta.count === "number" ? meta.count : events.length,
    linked: true,
  };
}

export interface OrgConnectPlacesResult {
  places: CCPlace[];
  total: number;
  linked: boolean;
}

export async function listOrgConnectPlaces(
  supabase: SupabaseClient,
  args: FeedArgs,
): Promise<OrgConnectPlacesResult> {
  const { orgId, connectContributorId, page, perPage } = args;
  if (!connectContributorId) return { places: [], total: 0, linked: false };

  const offset = (page - 1) * perPage;
  const { data: feed, meta } = await connectApi.listPlaces({
    created_by: connectContributorId,
    limit: perPage,
    offset,
  });

  const ids = feed.map((p) => p.id);
  const claimed = new Set<string>();
  if (ids.length) {
    const { data: rows } = await supabase
      .from("cc_place_claims")
      .select("cc_place_id")
      .eq("cv_org_id", orgId)
      .in("cc_place_id", ids);
    for (const r of rows ?? []) claimed.add(r.cc_place_id);
  }

  const places: CCPlace[] = feed.map((p) => ({
    cc_place_id: p.id,
    name: p.name,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    category: p.category,
    verified: p.verified,
    avg_rating: null,
    cv_org_id: claimed.has(p.id) ? orgId : null,
  }));

  return {
    places,
    total: typeof meta.count === "number" ? meta.count : places.length,
    linked: true,
  };
}
