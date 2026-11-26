import { describe, expect, it } from 'vitest';
import type { FeedItem } from '../src/contract';
import {
  EDITION_MAX_ITEMS,
  PAGE_DEFAULT,
  PAGE_MAX,
  buildEdition,
  cellFromNear,
  cellKey,
  clampPageSize,
  decodeCursor,
  distanceKm,
  editionDay,
  editionStart,
  encodeCursor,
  nearnessBand,
  pageOfEdition,
  seededHash,
  timeBucket,
} from '../src/edition';
import { SAMPLE_ENCOURAGEMENT, SAMPLE_FEED } from '../src/fixtures';

// Saturday 21 November 2026, 10:00 in South Africa.
const NOW = new Date('2026-11-21T08:00:00Z');
const HERE = cellFromNear('-25.7,28.2');

let n = 0;
function card(over: Partial<FeedItem> = {}): FeedItem {
  n += 1;
  const app = over.app ?? 'connect';
  const kind = over.kind ?? 'event';
  const sourceId = over.sourceId ?? `c${n}`;
  return {
    app,
    kind,
    sourceId,
    id: `${app}:${kind}:${sourceId}`,
    title: `Card ${n}`,
    kicker: 'Sample',
    shape: 'square',
    href: '/citizens/connect',
    visibility: 'public',
    ...over,
  };
}
const inDays = (days: number): string => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('coarse place', () => {
  it('keeps only one decimal of whatever the client sends', () => {
    expect(cellFromNear('-25.74861,28.22931')).toEqual({ lat: -25.7, lng: 28.2 });
    expect(cellKey(cellFromNear(' -25.75 , 28.25 '))).toBe('-25.7,28.3');
    expect(cellKey(cellFromNear('-0.04,0.04'))).toBe('0.0,0.0');
  });

  it('treats anything malformed as no place', () => {
    for (const raw of [
      null,
      undefined,
      '',
      'pretoria',
      '91,0',
      '0,181',
      '1;2',
      '1,2,3',
      'x'.repeat(50),
    ]) {
      expect(cellFromNear(raw)).toBeNull();
    }
    expect(cellKey(null)).toBe('none');
  });

  it('bands distance, and has one band for everyone when there is no place', () => {
    const at = (lat: number, lng: number) => card({ place: { label: 'x', lat, lng } });
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
    expect(nearnessBand(HERE, at(-25.75, 28.23))).toBe(0);
    expect(nearnessBand(HERE, at(-25.86, 28.19))).toBe(1);
    expect(nearnessBand(HERE, at(-26.1, 28.05))).toBe(2);
    expect(nearnessBand(HERE, at(-26.7, 27.9))).toBe(3);
    expect(nearnessBand(HERE, at(-33.92, 18.42))).toBe(4);
    expect(nearnessBand(HERE, card())).toBe(4);
    expect(nearnessBand(null, at(-25.75, 28.23))).toBe(4);
  });
});

describe('edition day', () => {
  it('turns over at 04:00 South African time', () => {
    expect(editionDay(new Date('2026-11-21T01:59:59Z'))).toBe('2026-11-20');
    expect(editionDay(new Date('2026-11-21T02:00:00Z'))).toBe('2026-11-21');
    expect(new Date(editionStart('2026-11-21')).toISOString()).toBe('2026-11-21T02:00:00.000Z');
  });
});

describe('time relevance', () => {
  it('buckets by how soon, and drops what is over or too far ahead', () => {
    expect(timeBucket(card({ startsAt: inDays(0.2) }), NOW)).toBe(0);
    expect(timeBucket(card({ startsAt: inDays(-0.1), endsAt: inDays(0.1) }), NOW)).toBe(0);
    expect(timeBucket(card({ endsAt: inDays(2) }), NOW)).toBe(0);
    expect(timeBucket(card({ startsAt: inDays(2) }), NOW)).toBe(1);
    expect(timeBucket(card({ startsAt: inDays(6) }), NOW)).toBe(2);
    expect(timeBucket(card(), NOW)).toBe(3);
    expect(timeBucket(card({ startsAt: inDays(15) }), NOW)).toBe(4);
    expect(timeBucket(card({ startsAt: inDays(22) }), NOW)).toBeNull();
    expect(timeBucket(card({ startsAt: inDays(-3), endsAt: inDays(-2) }), NOW)).toBeNull();
    expect(timeBucket(card({ startsAt: inDays(-2) }), NOW)).toBeNull();
  });
});

describe('buildEdition', () => {
  it('puts nearness before time, and time before everything else (guardrail G3)', () => {
    const farToday = card({
      startsAt: inDays(0.1),
      place: { label: 'far', lat: -29.8, lng: 31.0 },
    });
    const nearLater = card({
      startsAt: inDays(10),
      place: { label: 'near', lat: -25.75, lng: 28.23 },
    });
    const nearToday = card({
      startsAt: inDays(0.1),
      place: { label: 'near', lat: -25.74, lng: 28.19 },
    });
    const nearTimeless = card({ kind: 'place', place: { label: 'near', lat: -25.7, lng: 28.2 } });
    const edition = buildEdition({
      candidates: [farToday, nearLater, nearTimeless, nearToday],
      now: NOW,
      cell: HERE,
    });
    expect(edition.items.map((i) => i.id)).toEqual([
      nearToday.id,
      nearTimeless.id,
      nearLater.id,
      farToday.id,
    ]);
  });

  it('never looks at publication time or popularity', () => {
    const a = card({ sourceId: 'same-a', publishedAt: '2026-01-01T00:00:00Z' });
    const b = card({ sourceId: 'same-b', publishedAt: '2026-11-20T00:00:00Z' });
    const order = (x: FeedItem, y: FeedItem) =>
      buildEdition({ candidates: [x, y], now: NOW, cell: null }).items.map((i) => i.id);
    const swapped = { ...a, publishedAt: b.publishedAt, payload: { likes: 5000 } };
    expect(order(a, b)).toEqual(order({ ...swapped }, { ...b, publishedAt: a.publishedAt }));
  });

  it('is the same all day and for every caller, and differs by day and by place', () => {
    const candidates = Array.from({ length: 30 }, () => card({ kind: 'place' }));
    const ids = (now: Date, near: string | null) =>
      buildEdition({ candidates, now, cell: cellFromNear(near) })
        .items.map((i) => i.id)
        .join();
    const morning = ids(NOW, '-25.7,28.2');
    expect(ids(new Date('2026-11-21T20:30:00Z'), '-25.74,28.23')).toBe(morning);
    expect(ids([...Array(1)].map(() => NOW)[0] as Date, '-25.7,28.2')).toBe(morning);
    expect(ids(new Date('2026-11-22T08:00:00Z'), '-25.7,28.2')).not.toBe(morning);
    expect(ids(NOW, '-33.9,18.4')).not.toBe(morning);
    expect(ids(NOW, null)).not.toBe(morning);
  });

  it('is finite: never more than the cap, whatever arrives (guardrail G1)', () => {
    const candidates = Array.from({ length: 200 }, () => card({ kind: 'place' }));
    expect(buildEdition({ candidates, now: NOW, cell: HERE }).items).toHaveLength(
      EDITION_MAX_ITEMS,
    );
    expect(buildEdition({ candidates, now: NOW, cell: HERE, maxItems: 500 }).items).toHaveLength(
      EDITION_MAX_ITEMS,
    );
    expect(buildEdition({ candidates, now: NOW, cell: HERE, maxItems: 5 }).items).toHaveLength(5);
  });

  it('holds back items published after the edition began, and drops non-public and duplicate ones', () => {
    const early = card({ publishedAt: '2026-11-20T10:00:00Z' });
    const late = card({ publishedAt: '2026-11-21T06:00:00Z' });
    const hidden = card({ visibility: 'private' as 'public' });
    const edition = buildEdition({
      candidates: [early, late, hidden, { ...early }],
      now: NOW,
      cell: null,
    });
    expect(edition.items.map((i) => i.id)).toEqual([early.id]);
    expect(edition.nextEditionAt).toBe('2026-11-22T02:00:00.000Z');
  });

  it('spreads apps and kinds without moving a card more than the window', () => {
    const connect = Array.from({ length: 12 }, () => card({ app: 'connect', kind: 'place' }));
    const wear = Array.from({ length: 3 }, () => card({ app: 'wear', kind: 'drop' }));
    const items = buildEdition({ candidates: [...connect, ...wear], now: NOW, cell: null }).items;
    expect(items).toHaveLength(15);
    const firstRun = items.findIndex(
      (item, i) => i > 0 && item.app === 'wear' && items[i - 1]?.app === 'wear',
    );
    const wearSeen = items
      .slice(0, firstRun === -1 ? items.length : firstRun)
      .filter((i) => i.app === 'wear');
    expect(wearSeen.length).toBeGreaterThan(0);
  });

  it('adds pause cards at a fixed rhythm and lifts the encouragement out of the grid (G7)', () => {
    const pause = SAMPLE_FEED.find((i) => i.kind === 'pause') as FeedItem;
    const cards = Array.from({ length: 30 }, () => card({ kind: 'place' }));
    const edition = buildEdition({
      candidates: [...cards, pause, SAMPLE_ENCOURAGEMENT],
      now: NOW,
      cell: HERE,
    });
    expect(edition.encouragement?.id).toBe(SAMPLE_ENCOURAGEMENT.id);
    expect(edition.items.some((i) => i.kind === 'encouragement')).toBe(false);
    const positions = edition.items.flatMap((item, i) => (item.kind === 'pause' ? [i] : []));
    expect(positions).toEqual([4, 17, 30]);
    expect(new Set(edition.items.map((i) => i.id)).size).toBe(edition.items.length);
    const none = buildEdition({ candidates: cards, now: NOW, cell: HERE });
    expect(none.items).toHaveLength(30);
    expect(none.encouragement).toBeNull();
  });
});

describe('paging and the caught-up signal (guardrail G2)', () => {
  const candidates = Array.from({ length: 30 }, () => card({ kind: 'place' }));
  const edition = buildEdition({ candidates, now: NOW, cell: HERE });

  it('walks the whole edition once, in order, and ends caught up', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const page = pageOfEdition(edition, cursor, 12);
      if (!page.ok) throw new Error(page.error);
      seen.push(...page.items.map((i) => i.id));
      pages += 1;
      expect(page.caughtUp).toBe(page.nextCursor === null);
      if (page.caughtUp) break;
      cursor = page.nextCursor;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(edition.items.map((i) => i.id));
  });

  it('an empty edition is caught up at once', () => {
    const empty = buildEdition({ candidates: [], now: NOW, cell: null });
    expect(pageOfEdition(empty, null, 12)).toEqual({
      ok: true,
      items: [],
      nextCursor: null,
      caughtUp: true,
    });
  });

  it('refuses a broken cursor and a cursor from another day or place', () => {
    expect(pageOfEdition(edition, 'v1~nonsense', 12)).toEqual({
      ok: false,
      error: 'invalid_cursor',
    });
    expect(pageOfEdition(edition, 'x'.repeat(80), 12)).toEqual({
      ok: false,
      error: 'invalid_cursor',
    });
    const yesterday = encodeCursor({ day: '2026-11-20', cell: edition.cell, offset: 12 });
    expect(pageOfEdition(edition, yesterday, 12)).toEqual({ ok: false, error: 'edition_changed' });
    const elsewhere = encodeCursor({ day: edition.day, cell: 'none', offset: 12 });
    expect(pageOfEdition(edition, elsewhere, 12)).toEqual({ ok: false, error: 'edition_changed' });
    const past = encodeCursor({ day: edition.day, cell: edition.cell, offset: 900 });
    expect(pageOfEdition(edition, past, 12)).toEqual({
      ok: true,
      items: [],
      nextCursor: null,
      caughtUp: true,
    });
  });

  it('round-trips a cursor and clamps the page size', () => {
    const cursor = { day: '2026-11-21', cell: '-25.7,28.2', offset: 24 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(clampPageSize(null)).toBe(PAGE_DEFAULT);
    expect(clampPageSize('abc')).toBe(PAGE_DEFAULT);
    expect(clampPageSize('500')).toBe(PAGE_MAX);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(7.9)).toBe(7);
  });

  it('the shuffle hash is stable and spread out', () => {
    expect(seededHash('2026-11-21|none', 'connect:event:1')).toBe(
      seededHash('2026-11-21|none', 'connect:event:1'),
    );
    const hashes = new Set(Array.from({ length: 500 }, (_, i) => seededHash('seed', `id${i}`)));
    expect(hashes.size).toBeGreaterThan(495);
  });
});
