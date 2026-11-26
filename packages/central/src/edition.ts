/**
 * Today's edition of the Central feed: sourcing filter, ranking, the finite cut, pause cards and
 * cursor paging. Pure functions, no clock or randomness of their own: the caller passes `now`.
 *
 * The edition is a function of the day and a coarse place, never of the person. Nothing here
 * knows who is asking, how popular an item is, or when it was published (beyond the cutoff).
 * Rules and reasons: docs/central/CENTRAL_FEED_GUIDE.md, section 5.
 */

import { CENTRAL_APP, KIND_ENCOURAGEMENT, KIND_PAUSE, type FeedItem } from './contract';

/** Cards in one day's edition, before pause cards are added. */
export const EDITION_MAX_ITEMS = 48;
export const PAGE_DEFAULT = 12;
export const PAGE_MAX = 24;
/** The edition's clock: South African Standard Time (UTC+2, no daylight saving). */
export const EDITION_UTC_OFFSET_MINUTES = 120;
/** The edition turns over at 04:00 local time. */
export const EDITION_TURNOVER_HOUR = 4;
/** An item that starts later than this many days from now is not in the edition yet. */
export const HORIZON_DAYS = 21;
/** Upper edges of the nearness bands, in km. Beyond the last one (or no place) is the final band. */
export const NEARNESS_BANDS_KM = [10, 25, 60, 150] as const;
/** How far ahead the variety pass may reach for a card from a different app or kind. */
export const VARIETY_WINDOW = 6;
/** The first pause card comes after this many cards, then one after every PAUSE_EVERY cards. */
export const PAUSE_FIRST_AFTER = 4;
export const PAUSE_EVERY = 12;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const TIMELESS_BUCKET = 3;

/** A viewer's coarse place: latitude and longitude rounded to 1 decimal (a cell of about 11 km). */
export interface Cell {
  lat: number;
  lng: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10 + 0;

/**
 * Read the `near` query value ("lat,lng"). Whatever precision arrives, only 1 decimal is kept.
 * Anything malformed means "no place" (null), never an error.
 */
export function cellFromNear(raw: string | null | undefined): Cell | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const match = /^\s*(-?\d{1,3}(?:\.\d{1,8})?)\s*,\s*(-?\d{1,3}(?:\.\d{1,8})?)\s*$/.exec(raw);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: round1(lat), lng: round1(lng) };
}

export function cellKey(cell: Cell | null): string {
  return cell ? `${cell.lat.toFixed(1)},${cell.lng.toFixed(1)}` : 'none';
}

/** The edition day (YYYY-MM-DD) that `now` falls in. */
export function editionDay(now: Date): string {
  const shifted =
    now.getTime() + EDITION_UTC_OFFSET_MINUTES * 60_000 - EDITION_TURNOVER_HOUR * HOUR_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** The moment an edition day began (its cutoff), as epoch milliseconds. */
export function editionStart(day: string): number {
  return (
    Date.parse(`${day}T00:00:00.000Z`) +
    EDITION_TURNOVER_HOUR * HOUR_MS -
    EDITION_UTC_OFFSET_MINUTES * 60_000
  );
}

/** Great-circle distance in km. */
export function distanceKm(a: Cell, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 0 is nearest. With no viewer cell, or an item with no place, the last band. */
export function nearnessBand(cell: Cell | null, item: FeedItem): number {
  const last = NEARNESS_BANDS_KM.length;
  if (!cell || !item.place) return last;
  const km = distanceKm(cell, item.place);
  const band = NEARNESS_BANDS_KM.findIndex((edge) => km <= edge);
  return band === -1 ? last : band;
}

/**
 * 0 = happening today, 1 = within 3 days, 2 = within 7 days, 3 = timeless (no time window),
 * 4 = within the horizon. Null = not in this edition (already over, or too far ahead).
 */
export function timeBucket(item: FeedItem, now: Date): number | null {
  const t = now.getTime();
  const start = item.startsAt ? Date.parse(item.startsAt) : null;
  const end = item.endsAt ? Date.parse(item.endsAt) : null;
  if (end !== null && end < t) return null;
  if (start === null) return end === null ? TIMELESS_BUCKET : 0;
  const days = (start - t) / DAY_MS;
  if (days > HORIZON_DAYS) return null;
  if (end === null && days < -1) return null;
  if (days < 1) return 0;
  if (days <= 3) return 1;
  if (days <= 7) return 2;
  return 4;
}

/** FNV-1a, 32-bit. The daily shuffle: stable for one day and place, different the next. */
export function seededHash(seed: string, id: string): number {
  let h = 0x811c9dc5;
  const input = `${seed}|${id}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Edition {
  day: string;
  cell: string;
  /** The ordered cards, pause cards included. */
  items: FeedItem[];
  /** Today's Encouragement, shown above the feed and never inside it. */
  encouragement: FeedItem | null;
  /** When the next edition begins (ISO). */
  nextEditionAt: string;
}

export interface BuildEditionInput {
  candidates: readonly FeedItem[];
  now: Date;
  cell: Cell | null;
  maxItems?: number;
}

/** Build the whole edition for one day and place. Same input, same edition. */
export function buildEdition(input: BuildEditionInput): Edition {
  const { candidates, now, cell } = input;
  const maxItems = Math.max(0, Math.min(input.maxItems ?? EDITION_MAX_ITEMS, EDITION_MAX_ITEMS));
  const day = editionDay(now);
  const cutoff = editionStart(day);
  const key = cellKey(cell);
  const seed = `${day}|${key}`;

  const seen = new Set<string>();
  const ranked: Array<{ item: FeedItem; band: number; bucket: number; hash: number }> = [];
  const pauses: Array<{ item: FeedItem; hash: number }> = [];
  let encouragement: { item: FeedItem; hash: number } | null = null;

  for (const item of candidates) {
    if (item.visibility !== 'public' || seen.has(item.id)) continue;
    if (item.publishedAt && Date.parse(item.publishedAt) > cutoff) continue;
    const bucket = timeBucket(item, now);
    if (bucket === null) continue;
    seen.add(item.id);
    const hash = seededHash(seed, item.id);
    if (item.app === CENTRAL_APP && item.kind === KIND_ENCOURAGEMENT) {
      if (!encouragement || hash < encouragement.hash) encouragement = { item, hash };
    } else if (item.app === CENTRAL_APP && item.kind === KIND_PAUSE) {
      pauses.push({ item, hash });
    } else {
      ranked.push({ item, band: nearnessBand(cell, item), bucket, hash });
    }
  }

  ranked.sort(
    (a, b) =>
      a.band - b.band ||
      a.bucket - b.bucket ||
      a.hash - b.hash ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  pauses.sort((a, b) => a.hash - b.hash || (a.item.id < b.item.id ? -1 : 1));

  // Variety pass: prefer a card from a different app or kind than the one just placed,
  // looking at most VARIETY_WINDOW candidates ahead.
  const pool = ranked.map((r) => r.item);
  const varied: FeedItem[] = [];
  while (pool.length > 0 && varied.length < maxItems) {
    const previous = varied[varied.length - 1];
    let pick = 0;
    if (previous) {
      const reach = Math.min(VARIETY_WINDOW, pool.length);
      for (let k = 0; k < reach; k += 1) {
        const candidate = pool[k] as FeedItem;
        if (candidate.app !== previous.app || candidate.kind !== previous.kind) {
          pick = k;
          break;
        }
      }
    }
    varied.push(...pool.splice(pick, 1));
  }

  // Pause cards at a fixed rhythm, cycling through the ones available.
  const items: FeedItem[] = [];
  let pauseCount = 0;
  varied.forEach((item, position) => {
    const due = position >= PAUSE_FIRST_AFTER && (position - PAUSE_FIRST_AFTER) % PAUSE_EVERY === 0;
    if (due && pauses.length > 0) {
      const pause = (pauses[pauseCount % pauses.length] as { item: FeedItem }).item;
      // The same pause card may recur in one edition: give each occurrence its own id.
      items.push(
        pauseCount < pauses.length ? pause : { ...pause, id: `${pause.id}#${pauseCount}` },
      );
      pauseCount += 1;
    }
    items.push(item);
  });

  return {
    day,
    cell: key,
    items,
    encouragement: encouragement ? encouragement.item : null,
    nextEditionAt: new Date(cutoff + DAY_MS).toISOString(),
  };
}

export interface Cursor {
  day: string;
  cell: string;
  offset: number;
}

const CURSOR_RE = /^v1~(\d{4}-\d{2}-\d{2})~(none|-?\d{1,2}\.\d,-?\d{1,3}\.\d)~(\d{1,4})$/;

/** The cursor is opaque to clients. It carries no authority: every part is re-checked on use. */
export function encodeCursor(cursor: Cursor): string {
  return `v1~${cursor.day}~${cursor.cell}~${cursor.offset}`;
}

export function decodeCursor(raw: string): Cursor | null {
  if (typeof raw !== 'string' || raw.length > 60) return null;
  const match = CURSOR_RE.exec(raw);
  if (!match) return null;
  return { day: match[1] as string, cell: match[2] as string, offset: Number(match[3]) };
}

export type PageResult =
  | {
      ok: true;
      items: FeedItem[];
      nextCursor: string | null;
      /** True on the page that holds the edition's last card: show "You're all caught up". */
      caughtUp: boolean;
    }
  | { ok: false; error: 'invalid_cursor' | 'edition_changed' };

export function clampPageSize(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return PAGE_DEFAULT;
  return Math.min(PAGE_MAX, Math.max(1, Math.trunc(n)));
}

/** Slice one page out of an edition. A cursor for another day or place means "start again". */
export function pageOfEdition(
  edition: Edition,
  rawCursor: string | null | undefined,
  limit: number,
): PageResult {
  let offset = 0;
  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    if (!cursor) return { ok: false, error: 'invalid_cursor' };
    if (cursor.day !== edition.day || cursor.cell !== edition.cell) {
      return { ok: false, error: 'edition_changed' };
    }
    offset = cursor.offset;
  }
  const size = clampPageSize(limit);
  const items = edition.items.slice(offset, offset + size);
  const end = offset + items.length;
  const caughtUp = end >= edition.items.length;
  return {
    ok: true,
    items,
    caughtUp,
    nextCursor: caughtUp
      ? null
      : encodeCursor({ day: edition.day, cell: edition.cell, offset: end }),
  };
}
