/**
 * The two reads the Central feed makes, both from Connect's public `/api/v1` (contract R2: cross-app data goes
 * through Connect's API, which is where Central's feed API lives). Guide: docs/central/CENTRAL_FEED_GUIDE.md, section 10.
 *
 * Same origin: the front door proxies `/citizens/connect/*` to Connect (config/hub-config.js `proxyRewrites`), so the
 * page's own `connect-src 'self'` covers these calls and no CORS is involved.
 *
 * Privacy: no `near` value is sent. The hub has no location of its own and never asks the browser for one (guide 5.1),
 * so everyone gets the edition for "no place". Nothing about the reader is sent or stored.
 */
import { appPath } from '@citizens/ecosystem';
import type { CentralApp, FeedItem } from '@citizens/central/contract';

/** Where Central's API lives: under the app that owns `/api/v1`. Not the source app of any card. */
export const CENTRAL_API = `${appPath('connect')}/api/v1/central`;

export interface FeedPage {
  items: FeedItem[];
  encouragement: FeedItem | null;
  nextCursor: string | null;
  caughtUp: boolean;
}

type Fetch = typeof fetch;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A card the screen can draw: the fields every template reads, with the right types. Anything else is dropped. */
export function isDrawable(v: unknown): v is FeedItem {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    v.id !== '' &&
    typeof v.app === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.title === 'string' &&
    (v.shape === 'square' || v.shape === 'landscape')
  );
}

async function getJson(path: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(path, {
    headers: { accept: 'application/json' },
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(`central_http_${response.status}`);
  return response.json();
}

/** One page of today's edition. Throws on any failure; the screen shows its quiet line. */
export async function fetchFeedPage(
  cursor: string | null,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<FeedPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const body = await getJson(`${CENTRAL_API}/feed${query}`, fetchImpl, signal);
  const data = isObject(body) && isObject(body.data) ? body.data : null;
  if (!data || !Array.isArray(data.items) || typeof data.caughtUp !== 'boolean') {
    throw new Error('central_bad_response');
  }
  const lead = isObject(data.lead) ? data.lead : null;
  const nextCursor =
    typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
  return {
    items: data.items.filter(isDrawable),
    encouragement: lead && isDrawable(lead.encouragement) ? lead.encouragement : null,
    nextCursor,
    // A page that is not caught up but gives no cursor cannot be followed: treat it as the end, never loop.
    caughtUp: data.caughtUp || nextCursor === null,
  };
}

/** The app registry, by slug. An unreadable registry gives an empty map: cards then show only their own kicker line. */
export async function fetchApps(
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<Map<string, CentralApp>> {
  try {
    const body = await getJson(`${CENTRAL_API}/apps`, fetchImpl, signal);
    const rows = isObject(body) && Array.isArray(body.data) ? body.data : [];
    const apps = new Map<string, CentralApp>();
    for (const row of rows) {
      if (isObject(row) && typeof row.slug === 'string' && typeof row.name === 'string') {
        apps.set(row.slug, row as unknown as CentralApp);
      }
    }
    return apps;
  } catch (error) {
    if (signal?.aborted) throw error;
    return new Map();
  }
}
