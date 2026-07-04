/**
 * Typed client for Citizens Connect's public API (`/api/v1`).
 *
 * This is the ONLY way Vision reads Connect's commons data (events, places,
 * contributors). We never touch Connect's raw tables across schemas — the
 * versioned API is the cross-app contract. See citizens-connect/docs/api-v1.md
 * and citizens-connect/docs/SHARED_DB_CONTRACT.md (Rule 2).
 *
 * Server-only: reads CONNECT_API_BASE_URL / CONNECT_API_KEY from the env.
 */

const BASE_URL = process.env.CONNECT_API_BASE_URL;
const API_KEY = process.env.CONNECT_API_KEY;

/** Consistent envelope returned by every /api/v1 endpoint. */
interface V1Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface V1Event {
  id: string;
  title: string;
  date: string | null;
  end_time: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string | null;
  community_contributor: boolean;
}

export interface V1EventDetail extends V1Event {
  description: string | null;
  stats: {
    going: number;
    considering: number;
    views: number;
    average_rating: number | null;
    review_count: number;
  };
}

export interface V1Place {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  custom_category: string | null;
  image_url: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string | null;
  verified: boolean;
  volunteer_openings: number;
  category: string | null;
  category_emoji: string | null;
  category_color: string | null;
}

export interface V1Contributor {
  id: string;
  full_name: string;
  role: string;
  contributor_kind: string | null;
  contributor_slug: string | null;
  bio: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  website_url: string | null;
  physical_latitude: number | null;
  physical_longitude: number | null;
  created_at: string;
}

export interface V1ContributorStats {
  total_events: number;
  upcoming_events: number;
  total_rsvps: number;
  followers: number;
}

/** Raised when the Connect API is misconfigured or returns a non-2xx response. */
export class ConnectApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ConnectApiError";
  }
}

type QueryValue = string | number | boolean | undefined | null;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!BASE_URL) {
    throw new ConnectApiError("CONNECT_API_BASE_URL is not configured", 500);
  }
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function get<T>(
  path: string,
  query?: Record<string, QueryValue>,
): Promise<V1Envelope<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const res = await fetch(buildUrl(path, query), {
    headers,
    // Mirror Connect's edge cache (s-maxage=60) so we don't hammer the origin.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    let message = `Connect API ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    throw new ConnectApiError(message, res.status);
  }

  return (await res.json()) as V1Envelope<T>;
}

export type ListEventsParams = {
  category?: string;
  from?: string;
  to?: string;
  created_by?: string;
  limit?: number;
  offset?: number;
};

export const connectApi = {
  listEvents: (params: ListEventsParams = {}) =>
    get<V1Event[]>("/api/v1/events", params),

  getEvent: (id: string) => get<V1EventDetail>(`/api/v1/events/${id}`),

  listPlaces: (
    params: { created_by?: string; q?: string; limit?: number; offset?: number } = {},
  ) => get<V1Place[]>("/api/v1/places", params),

  getContributor: (slug: string) =>
    get<{ profile: V1Contributor; places: V1Place[] }>(
      `/api/v1/contributors/${slug}`,
    ),

  getContributorStats: (slug: string) =>
    get<V1ContributorStats>(`/api/v1/contributors/${slug}/stats`),
};
