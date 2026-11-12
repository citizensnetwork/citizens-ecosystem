/**
 * Sample content for tests and for the reference page (docs/central/reference). SAMPLE ONLY:
 * invented titles and places, no real organisation, person or image. Never serve these from an API.
 *
 * The twelve feed cards mirror the sample cards of the approved design check, one per template.
 */

import type { CentralApp, FeedItem, FeedItemInput } from './contract';
import { feedItemId } from './contract';

const app = (
  slug: string,
  name: string,
  accent: string | null,
  status: CentralApp['status'],
  sortOrder: number,
  explanation: string,
  kinds: CentralApp['kinds'],
): CentralApp => ({
  slug,
  name,
  label: slug === 'central' ? 'Citizens Central' : `Citizens ${name}`,
  accent,
  icon: slug,
  explanation,
  visitUrl: `/citizens/${slug}`,
  status,
  sortOrder,
  kinds,
});

/** Sample registry. Accent colours are the approved reference's; the copy is placeholder. */
export const SAMPLE_APPS: CentralApp[] = [
  app('central', 'Central', null, 'live', 0, 'Sample explanation for Central.', [
    { kind: 'pause', label: 'A slower moment', defaultShape: 'square' },
    { kind: 'encouragement', label: "Today's Encouragement", defaultShape: 'landscape' },
    { kind: 'digest', label: 'This week around you', defaultShape: 'square' },
  ]),
  app('connect', 'Connect', '#f2bd22', 'live', 1, 'Sample explanation for Connect.', [
    { kind: 'event', label: 'Events', defaultShape: 'landscape' },
    { kind: 'place', label: 'Places', defaultShape: 'square' },
    { kind: 'contributor', label: 'Contributors', defaultShape: 'square' },
  ]),
  app('wear', 'Wear', '#a8685a', 'live', 2, 'Sample explanation for Wear.', [
    { kind: 'drop', label: 'New from makers', defaultShape: 'square' },
  ]),
  app('learn', 'Learn', '#4f8a8b', 'coming_soon', 3, 'Sample explanation for Learn.', [
    { kind: 'course', label: 'Courses', defaultShape: 'square' },
  ]),
  app('play', 'Play', '#94708c', 'coming_soon', 4, 'Sample explanation for Play.', [
    { kind: 'playlist', label: 'Listening', defaultShape: 'square' },
  ]),
  app('move', 'Move', '#718b78', 'coming_soon', 5, 'Sample explanation for Move.', [
    { kind: 'route', label: 'Routes', defaultShape: 'square' },
  ]),
  app('impact', 'Impact', '#b4535a', 'coming_soon', 6, 'Sample explanation for Impact.', [
    { kind: 'campaign', label: 'Campaigns', defaultShape: 'square' },
  ]),
];

const sample = (n: number): { url: string; alt: string } => ({
  url: `https://images.example/central-sample-${n}`,
  alt: '',
});

const item = (appSlug: string, input: Omit<FeedItemInput, 'visibility' | 'href'>): FeedItem => ({
  ...input,
  href: `/citizens/${appSlug}`,
  visibility: 'public',
  app: appSlug,
  id: feedItemId(appSlug, input.kind, input.sourceId),
});

const at = (lat: number, lng: number, label: string) => ({ label, lat, lng });

/** Twelve sample cards in the order the approved design check showed them. */
export const SAMPLE_FEED: FeedItem[] = [
  item('connect', {
    kind: 'place',
    sourceId: 's1',
    title: 'A table for more',
    kicker: 'Places to pause nearby',
    summary: 'Hatfield · open until 17:00',
    image: sample(4),
    shape: 'square',
    place: at(-25.75, 28.24, 'Hatfield'),
  }),
  item('impact', {
    kind: 'campaign',
    sourceId: 's2',
    title: 'Winter blankets: 400 still to find',
    kicker: 'Voices and campaigns',
    summary: 'Three churches and a laundromat, so far',
    icon: 'volume',
    shape: 'square',
  }),
  item('connect', {
    kind: 'event',
    sourceId: 's3',
    title: 'Community sports day',
    kicker: 'Happening this weekend',
    summary: 'Sat 21 Nov · Community Park',
    image: sample(2),
    shape: 'landscape',
    place: at(-25.77, 28.23, 'Community Park'),
  }),
  item('play', {
    kind: 'playlist',
    sourceId: 's4',
    title: 'Songs for a slow morning',
    kicker: 'Something to listen to',
    list: ['Still', 'Morning by morning', 'Table in the wilderness'],
    shape: 'square',
  }),
  item('central', {
    kind: 'pause',
    sourceId: 's5',
    title: 'Time to Rest',
    kicker: 'A slower moment',
    summary: 'A slower moment',
    shape: 'square',
  }),
  item('move', {
    kind: 'route',
    sourceId: 's6',
    title: 'Saturday 6 km through Groenkloof',
    kicker: 'Routes for runners',
    summary: '06:00 · all paces',
    icon: 'run',
    shape: 'square',
    place: at(-25.78, 28.2, 'Groenkloof'),
  }),
  item('wear', {
    kind: 'drop',
    sourceId: 's7',
    title: 'Hand-printed tees, small batch',
    kicker: 'New from local makers',
    summary: 'Two brands, one drop',
    image: sample(6),
    shape: 'landscape',
  }),
  item('learn', {
    kind: 'course',
    sourceId: 's8',
    title: 'Bookkeeping for small ministries',
    kicker: 'A skill for this month',
    summary: 'Four Thursday evenings · Menlo Park',
    icon: 'book',
    shape: 'square',
    place: at(-25.77, 28.26, 'Menlo Park'),
  }),
  item('connect', {
    kind: 'contributor',
    sourceId: 's9',
    title: 'Soup kitchen needs four more hands',
    kicker: 'People serving nearby',
    summary: 'Thu 17:30 · Sunnyside',
    image: sample(3),
    shape: 'square',
    place: at(-25.75, 28.21, 'Sunnyside'),
  }),
  item('central', {
    kind: 'digest',
    sourceId: 's10',
    title: '12 new places and 5 gatherings joined the map',
    kicker: 'This week around you',
    summary: 'Pretoria',
    shape: 'square',
  }),
  item('connect', {
    kind: 'place',
    sourceId: 's11',
    title: 'Sample Church',
    kicker: 'A church near you',
    summary: 'Brooklyn · Sundays 09:00',
    image: sample(0),
    shape: 'landscape',
    place: at(-25.77, 28.24, 'Brooklyn'),
  }),
  item('wear', {
    kind: 'drop',
    sourceId: 's12',
    title: 'Saturday makers market',
    kicker: 'Makers to meet',
    summary: 'Brooklyn · 08:00 to 13:00',
    icon: 'bag',
    shape: 'square',
    place: at(-25.77, 28.24, 'Brooklyn'),
  }),
];

/** Today's Encouragement, as a Central item (the lead block, never a grid card). */
export const SAMPLE_ENCOURAGEMENT: FeedItem = item('central', {
  kind: 'encouragement',
  sourceId: 'e1',
  title:
    '…you are no longer strangers and foreigners, but fellow citizens with the saints and members of the household of God…',
  kicker: "Today's Encouragement",
  summary: 'Ephesians 2:19',
  shape: 'landscape',
});
