/**
 * The Connect adapter: maps Connect's public content to Central feed items.
 *
 * This is the model for every app's hook. It is a pure function over the shapes Connect's public
 * API already serves (`/api/v1/events`, `/api/v1/places`, `/api/v1/contributors`), so it can only
 * ever publish what is already public. It never touches a database.
 *
 * Nothing about a card is fixed here except how Connect's fields map to the contract. The kicker
 * lines and the link builders are passed in (`ConnectAdapterOptions`), because they are public
 * copy and URLs that Connect owns.
 */

import { validateFeedItemInput, type FeedItemInput } from '../contract';
import { EDITION_UTC_OFFSET_MINUTES } from '../edition';
import type { CardShape } from '../layout';

/** The fields of `/api/v1/events` rows the adapter reads. Unknown fields are ignored. */
export interface ConnectEvent {
  id: string;
  title: string;
  date: string;
  end_time?: string | null;
  location?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** The fields of `/api/v1/places` rows the adapter reads. */
export interface ConnectPlace {
  id: string;
  name: string;
  address?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** The fields of `/api/v1/contributors` rows the adapter reads. */
export interface ConnectContributor {
  id: string;
  full_name: string;
  contributor_slug?: string | null;
  logo_url?: string | null;
  avatar_url?: string | null;
  physical_address?: string | null;
  physical_latitude?: number | null;
  physical_longitude?: number | null;
}

export interface ConnectContent {
  events?: readonly ConnectEvent[];
  places?: readonly ConnectPlace[];
  contributors?: readonly ConnectContributor[];
}

export interface ConnectAdapterOptions {
  now: Date;
  /** Link builders. Each returns an https URL or a /citizens/... path. */
  links: {
    event: (id: string) => string;
    place: (id: string) => string;
    contributor: (slug: string) => string;
  };
  /** The short line after "Connect" on each card. Public copy: the founder reviews it. */
  kickers: {
    eventToday: string;
    eventThisWeek: string;
    eventLater: string;
    place: string;
    contributor: string;
  };
  /** Shape hints per kind. Defaults: an event with a photo is landscape, everything else square. */
  shapes?: Partial<Record<'event' | 'place' | 'contributor', CardShape>>;
}

export interface AdapterResult {
  items: FeedItemInput[];
  /** Rows that could not become a valid feed item, with the validator's reason. */
  skipped: Array<{ kind: string; sourceId: string; reason: string }>;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const clip = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/** "Sat 21 Nov 09:00" in the edition's timezone. */
export function formatWhen(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const local = new Date(t + EDITION_UTC_OFFSET_MINUTES * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${hh}:${mm}`;
}

/** The first part of an address ("Community Park, 12 Long Street, Pretoria" gives "Community Park"). */
function shortPlace(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null;
  const first = address.split(',', 1)[0]?.trim();
  return first ? clip(first, 60) : null;
}

function venue(
  label: string | null,
  lat: number | null | undefined,
  lng: number | null | undefined,
): FeedItemInput['place'] {
  if (!label || typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { label, lat, lng };
}

const image = (url: string | null | undefined): FeedItemInput['image'] =>
  typeof url === 'string' && url.startsWith('https://') ? { url, alt: '' } : null;

export function connectToFeedItems(
  content: ConnectContent,
  options: ConnectAdapterOptions,
): AdapterResult {
  const { now, links, kickers, shapes = {} } = options;
  const result: AdapterResult = { items: [], skipped: [] };

  const add = (candidate: FeedItemInput): void => {
    const checked = validateFeedItemInput(candidate);
    if (checked.ok) result.items.push(checked.value);
    else {
      result.skipped.push({
        kind: candidate.kind,
        sourceId: String(candidate.sourceId),
        reason: checked.reason,
      });
    }
  };

  for (const event of content.events ?? []) {
    const start = Date.parse(event.date);
    const days = (start - now.getTime()) / DAY_MS;
    const kicker =
      days < 1 ? kickers.eventToday : days <= 7 ? kickers.eventThisWeek : kickers.eventLater;
    const where = shortPlace(event.location);
    const photo = image(event.image_url);
    add({
      kind: 'event',
      sourceId: event.id,
      title: clip(String(event.title ?? '').trim(), 120),
      kicker,
      summary: [formatWhen(event.date), where].filter(Boolean).join(' · ') || undefined,
      image: photo,
      icon: photo ? undefined : 'calendar',
      shape: shapes.event ?? (photo ? 'landscape' : 'square'),
      place: venue(where, event.latitude, event.longitude),
      startsAt: event.date,
      endsAt: event.end_time ?? undefined,
      href: links.event(event.id),
      visibility: 'public',
    });
  }

  for (const place of content.places ?? []) {
    const where = shortPlace(place.address);
    const photo = image(place.image_url);
    add({
      kind: 'place',
      sourceId: place.id,
      title: clip(String(place.name ?? '').trim(), 120),
      kicker: kickers.place,
      summary: where ?? undefined,
      image: photo,
      icon: photo ? undefined : 'pin',
      shape: shapes.place ?? 'square',
      place: venue(where, place.latitude, place.longitude),
      href: links.place(place.id),
      visibility: 'public',
    });
  }

  for (const contributor of content.contributors ?? []) {
    const slug = contributor.contributor_slug;
    if (!slug) {
      result.skipped.push({ kind: 'contributor', sourceId: contributor.id, reason: 'no_slug' });
      continue;
    }
    const where = shortPlace(contributor.physical_address);
    const photo = image(contributor.logo_url ?? contributor.avatar_url);
    add({
      kind: 'contributor',
      sourceId: contributor.id,
      title: clip(String(contributor.full_name ?? '').trim(), 120),
      kicker: kickers.contributor,
      summary: where ?? undefined,
      image: photo,
      icon: photo ? undefined : 'hands',
      shape: shapes.contributor ?? 'square',
      place: venue(where, contributor.physical_latitude, contributor.physical_longitude),
      href: links.contributor(slug),
      visibility: 'public',
    });
  }

  return result;
}
