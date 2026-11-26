import { describe, expect, it } from 'vitest';
import {
  connectToFeedItems,
  formatWhen,
  type ConnectAdapterOptions,
  type ConnectContent,
} from '../src/adapters/connect';
import { validateFeedItemInput } from '../src/contract';

const NOW = new Date('2026-11-19T08:00:00Z');

const options: ConnectAdapterOptions = {
  now: NOW,
  links: {
    event: (id) => `/citizens/connect/event/${id}`,
    place: (id) => `/citizens/connect/place/${id}`,
    contributor: (slug) => `/citizens/connect/c/${slug}`,
  },
  kickers: {
    eventToday: 'Happening today',
    eventThisWeek: 'Happening this week',
    eventLater: 'Coming up',
    place: 'A place near you',
    contributor: 'People serving nearby',
  },
};

// Sample rows in the shape /api/v1 serves them, with extra columns the adapter must ignore.
const content: ConnectContent = {
  events: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Community sports day',
      date: '2026-11-21T07:00:00Z',
      end_time: '2026-11-21T12:00:00Z',
      location: 'Community Park, 1 Sample Road, Pretoria',
      image_url: 'https://images.example/sports.jpg',
      latitude: -25.771234,
      longitude: 28.236789,
      ...{ created_by: 'someone', whatsapp_url: 'https://wa.example/x', description: 'Long text' },
    },
    { id: 'e-today', title: 'Evening prayer', date: '2026-11-19T16:00:00Z' },
    { id: 'e-later', title: 'Summer camp', date: '2026-12-05T06:00:00Z', location: '  ' },
    { id: 'e-bad', title: '   ', date: '2026-11-22T06:00:00Z' },
  ],
  places: [
    {
      id: 'p-1',
      name: 'A table for more',
      address: 'Hatfield, Pretoria',
      image_url: 'http://insecure.example/a.jpg',
      latitude: -25.75,
      longitude: 28.24,
    },
    { id: 'p-2', name: 'No address yet' },
  ],
  contributors: [
    {
      id: 'c-1',
      full_name: 'Sample Soup Kitchen',
      contributor_slug: 'sample-soup-kitchen',
      avatar_url: 'https://images.example/logo.png',
      physical_address: 'Sunnyside',
      physical_latitude: -25.75,
      physical_longitude: 28.21,
    },
    { id: 'c-2', full_name: 'No handle', contributor_slug: null },
  ],
};

describe('connectToFeedItems', () => {
  const { items, skipped } = connectToFeedItems(content, options);
  const byId = (id: string) => items.find((i) => i.sourceId === id);

  it('maps an event with a photo to a landscape card with a coarse venue', () => {
    expect(byId('11111111-1111-4111-8111-111111111111')).toEqual({
      kind: 'event',
      sourceId: '11111111-1111-4111-8111-111111111111',
      title: 'Community sports day',
      kicker: 'Happening this week',
      summary: 'Sat 21 Nov 09:00 · Community Park',
      image: { url: 'https://images.example/sports.jpg', alt: '' },
      shape: 'landscape',
      place: { label: 'Community Park', lat: -25.77, lng: 28.24 },
      startsAt: '2026-11-21T07:00:00Z',
      endsAt: '2026-11-21T12:00:00Z',
      href: '/citizens/connect/event/11111111-1111-4111-8111-111111111111',
      visibility: 'public',
    });
  });

  it('picks the kicker from how soon the event is, and an icon when there is no photo', () => {
    expect(byId('e-today')).toMatchObject({
      kicker: 'Happening today',
      icon: 'calendar',
      shape: 'square',
    });
    expect(byId('e-today')?.place).toBeUndefined();
    expect(byId('e-later')).toMatchObject({ kicker: 'Coming up', summary: 'Sat 5 Dec 08:00' });
  });

  it('maps places and contributors, and never carries a non-https image', () => {
    expect(byId('p-1')).toMatchObject({
      kind: 'place',
      kicker: 'A place near you',
      summary: 'Hatfield',
      icon: 'pin',
      place: { label: 'Hatfield', lat: -25.75, lng: 28.24 },
    });
    expect(byId('p-1')?.image).toBeUndefined();
    expect(byId('p-2')).toMatchObject({ title: 'No address yet' });
    expect(byId('c-1')).toMatchObject({
      kind: 'contributor',
      title: 'Sample Soup Kitchen',
      href: '/citizens/connect/c/sample-soup-kitchen',
      image: { url: 'https://images.example/logo.png', alt: '' },
    });
  });

  it('skips what cannot be a valid card and says why', () => {
    expect(skipped).toEqual([
      { kind: 'event', sourceId: 'e-bad', reason: 'title_invalid' },
      { kind: 'contributor', sourceId: 'c-2', reason: 'no_slug' },
    ]);
  });

  it('only ever produces valid, public feed items with no private columns', () => {
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(validateFeedItemInput(item)).toEqual({ ok: true, value: item });
      expect(JSON.stringify(item)).not.toMatch(/created_by|whatsapp|Long text/);
    }
  });

  it('honours shape overrides and an empty input', () => {
    const wide = connectToFeedItems(
      { places: content.places },
      { ...options, shapes: { place: 'landscape' } },
    );
    expect(wide.items.every((i) => i.shape === 'landscape')).toBe(true);
    expect(connectToFeedItems({}, options)).toEqual({ items: [], skipped: [] });
  });

  it('clips an over-long title instead of dropping the card', () => {
    const long = connectToFeedItems({ places: [{ id: 'p-long', name: 'x'.repeat(300) }] }, options);
    expect(long.items[0]?.title).toHaveLength(120);
  });
});

describe('formatWhen', () => {
  it('formats in South African time and rejects a bad date', () => {
    expect(formatWhen('2026-11-21T22:30:00Z')).toBe('Sun 22 Nov 00:30');
    expect(formatWhen('soon')).toBeNull();
  });
});
