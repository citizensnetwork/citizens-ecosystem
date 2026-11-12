/**
 * The Central feed contracts: the one normalised feed item every ecosystem app produces, and the
 * app registry entry that makes an app known to Central.
 *
 * Validation is hand-written (the repo's server code uses no schema library) and has no
 * dependencies. Every string is plain text: Central never renders any of it as HTML.
 * Field-by-field rules: docs/central/CENTRAL_FEED_GUIDE.md, sections 3 and 4.4.
 */

import type { CardShape } from './layout';

export const LIMITS = {
  slug: 31,
  sourceId: 80,
  title: 120,
  kicker: 60,
  summary: 140,
  url: 500,
  imageAlt: 160,
  icon: 40,
  listLines: 5,
  listLine: 60,
  placeLabel: 60,
  region: 40,
  payloadBytes: 2048,
  isoDate: 40,
  appName: 40,
  appLabel: 60,
  explanation: 600,
  /** Items accepted by one publish call. */
  itemsPerCall: 100,
} as const;

/** Central's own app slug and the two kinds it publishes itself. */
export const CENTRAL_APP = 'central';
export const KIND_PAUSE = 'pause';
export const KIND_ENCOURAGEMENT = 'encouragement';

export interface FeedImage {
  url: string;
  alt: string;
}

/** Coarse location of a public venue. `lat` and `lng` are rounded to 2 decimals (about 1.1 km). */
export interface FeedPlace {
  label: string;
  lat: number;
  lng: number;
}

/** What an app's adapter produces. The app itself is taken from the publisher's key, never from here. */
export interface FeedItemInput {
  kind: string;
  sourceId: string;
  title: string;
  /** The short line after the app name. Must not repeat or explain the app. */
  kicker: string;
  summary?: string;
  image?: FeedImage | null;
  icon?: string;
  list?: string[];
  /** A hint. The layout engine may draw the card in the other shape to avoid a hole. */
  shape: CardShape;
  place?: FeedPlace | null;
  region?: string;
  startsAt?: string;
  endsAt?: string;
  /** An https URL, or a site path that starts with /citizens/. */
  href: string;
  visibility: 'public';
  payload?: Record<string, unknown>;
}

/** A stored feed item, as the feed API serves it. */
export interface FeedItem extends FeedItemInput {
  /** `app:kind:sourceId`. */
  id: string;
  app: string;
  publishedAt?: string;
  updatedAt?: string;
}

export type AppStatus = 'live' | 'coming_soon' | 'paused';

export interface AppKind {
  kind: string;
  label: string;
  defaultShape: CardShape;
}

/** One row of the app registry: what the card kicker and the Crown's roll-out panel are drawn from. */
export interface CentralApp {
  slug: string;
  /** Short name for the kicker: "Connect". */
  name: string;
  /** Full name: "Citizens Connect". */
  label: string;
  /** The app's accent colour, #rrggbb. Null means no kicker dot (Central's own cards). */
  accent: string | null;
  icon: string;
  explanation: string;
  visitUrl: string;
  status: AppStatus;
  sortOrder: number;
  kinds: AppKind[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
const ACCENT_RE = /^#[0-9a-f]{6}$/i;
const SOURCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Trimmed plain text of 1..max characters, or null. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || hasControlChars(trimmed)) return null;
  return trimmed;
}

const isAbsent = (value: unknown): boolean => value === undefined || value === null || value === '';

/** True for an https URL with a host and no spaces, backslashes or embedded credentials. */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > LIMITS.url) return false;
  if (!/^https:\/\/[^\s\\]+$/i.test(value)) return false;
  const host = value.slice('https://'.length).split(/[/?#]/, 1)[0] ?? '';
  return host.length > 0 && !host.includes('@') && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host);
}

/** A link target Central will follow: an https URL or a /citizens/... path on the shared domain. */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > LIMITS.url) return false;
  if (value.startsWith('/citizens/')) return !/[\s\\]/.test(value) && !value.includes('//');
  return isHttpsUrl(value);
}

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value);
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor + 0;
};

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > LIMITS.isoDate) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function feedItemId(app: string, kind: string, sourceId: string): string {
  return `${app}:${kind}:${sourceId}`;
}

/**
 * Check one item an app wants to publish, and return a cleaned copy (trimmed strings, venue
 * coordinates rounded to 2 decimals). The reason codes are stable: the publish endpoint returns them.
 */
export function validateFeedItemInput(raw: unknown): Validation<FeedItemInput> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('not_an_object');
  const r = raw as Record<string, unknown>;

  if (!isSlug(r.kind)) return fail('kind_invalid');
  if (
    typeof r.sourceId !== 'string' ||
    r.sourceId.length > LIMITS.sourceId ||
    !SOURCE_ID_RE.test(r.sourceId)
  ) {
    return fail('source_id_invalid');
  }
  const title = text(r.title, LIMITS.title);
  if (!title) return fail('title_invalid');
  const kicker = text(r.kicker, LIMITS.kicker);
  if (!kicker) return fail('kicker_invalid');
  if (r.shape !== 'square' && r.shape !== 'landscape') return fail('shape_invalid');
  if (r.visibility !== 'public') return fail('not_public');
  if (!isSafeHref(r.href)) return fail('href_invalid');

  const item: FeedItemInput = {
    kind: r.kind,
    sourceId: r.sourceId,
    title,
    kicker,
    shape: r.shape,
    href: r.href,
    visibility: 'public',
  };

  if (!isAbsent(r.summary)) {
    const summary = text(r.summary, LIMITS.summary);
    if (!summary) return fail('summary_invalid');
    item.summary = summary;
  }

  if (!isAbsent(r.image)) {
    const image = r.image as Record<string, unknown>;
    if (typeof image !== 'object' || !isHttpsUrl(image.url)) return fail('image_invalid');
    const alt = typeof image.alt === 'string' ? image.alt.trim() : '';
    if (alt.length > LIMITS.imageAlt || hasControlChars(alt)) return fail('image_invalid');
    item.image = { url: image.url, alt };
  }

  if (!isAbsent(r.icon)) {
    if (!isSlug(r.icon) || r.icon.length > LIMITS.icon) return fail('icon_invalid');
    item.icon = r.icon;
  }

  if (!isAbsent(r.list)) {
    if (!Array.isArray(r.list) || r.list.length === 0 || r.list.length > LIMITS.listLines) {
      return fail('list_invalid');
    }
    const lines: string[] = [];
    for (const line of r.list) {
      const clean = text(line, LIMITS.listLine);
      if (!clean) return fail('list_invalid');
      lines.push(clean);
    }
    item.list = lines;
  }

  if (!isAbsent(r.place)) {
    const place = r.place as Record<string, unknown>;
    const label = typeof place === 'object' ? text(place.label, LIMITS.placeLabel) : null;
    const { lat, lng } = place;
    if (
      !label ||
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return fail('place_invalid');
    }
    item.place = { label, lat: round(lat, 2), lng: round(lng, 2) };
  }

  if (!isAbsent(r.region)) {
    const region = text(r.region, LIMITS.region);
    if (!region) return fail('region_invalid');
    item.region = region;
  }

  for (const key of ['startsAt', 'endsAt'] as const) {
    if (isAbsent(r[key])) continue;
    const date = isoDate(r[key]);
    if (!date) return fail('time_invalid');
    item[key] = date;
  }
  if (item.startsAt && item.endsAt && Date.parse(item.endsAt) < Date.parse(item.startsAt)) {
    return fail('time_invalid');
  }

  if (!isAbsent(r.payload)) {
    if (typeof r.payload !== 'object' || Array.isArray(r.payload)) return fail('payload_invalid');
    let size: number;
    try {
      size = JSON.stringify(r.payload).length;
    } catch {
      return fail('payload_invalid');
    }
    if (size > LIMITS.payloadBytes) return fail('payload_too_large');
    item.payload = r.payload as Record<string, unknown>;
  }

  return { ok: true, value: item };
}

/** Check one registry entry. */
export function validateCentralApp(raw: unknown): Validation<CentralApp> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('not_an_object');
  const r = raw as Record<string, unknown>;
  if (!isSlug(r.slug)) return fail('slug_invalid');
  const name = text(r.name, LIMITS.appName);
  const label = text(r.label, LIMITS.appLabel);
  const explanation = text(r.explanation, LIMITS.explanation);
  if (!name || !label || !explanation) return fail('copy_invalid');
  if (r.accent !== null && (typeof r.accent !== 'string' || !ACCENT_RE.test(r.accent))) {
    return fail('accent_invalid');
  }
  if (!isSlug(r.icon)) return fail('icon_invalid');
  if (!isSafeHref(r.visitUrl)) return fail('visit_url_invalid');
  if (r.status !== 'live' && r.status !== 'coming_soon' && r.status !== 'paused') {
    return fail('status_invalid');
  }
  if (typeof r.sortOrder !== 'number' || !Number.isInteger(r.sortOrder)) {
    return fail('sort_order_invalid');
  }
  if (!Array.isArray(r.kinds)) return fail('kinds_invalid');
  const kinds: AppKind[] = [];
  for (const entry of r.kinds as Array<Record<string, unknown>>) {
    const kindLabel = entry ? text(entry.label, LIMITS.appLabel) : null;
    if (
      !entry ||
      !isSlug(entry.kind) ||
      !kindLabel ||
      (entry.defaultShape !== 'square' && entry.defaultShape !== 'landscape')
    ) {
      return fail('kinds_invalid');
    }
    kinds.push({ kind: entry.kind, label: kindLabel, defaultShape: entry.defaultShape });
  }
  return {
    ok: true,
    value: {
      slug: r.slug,
      name,
      label,
      accent: r.accent as string | null,
      icon: r.icon,
      explanation,
      visitUrl: r.visitUrl,
      status: r.status,
      sortOrder: r.sortOrder,
      kinds,
    },
  };
}
