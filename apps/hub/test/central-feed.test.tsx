// @vitest-environment jsdom
/**
 * The Central feed component with a mocked fetch: pages append without moving earlier cards, "caught up" stops
 * fetching for good, the empty and error states show the quiet line and no cards, and kickers come from the registry.
 * Layout itself is proved by packages/central's property tests; here the DOM is stubbed only enough to give every
 * measuring copy a height and the feed a width.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardWidth, columnWidth } from '@citizens/central/layout';
import type { FeedItem } from '@citizens/central/contract';
import { CentralFeed, FEED_LINES } from '../src/components/central/CentralFeed';
import { safeHref } from '../src/components/central/FeedCard';
import { CENTRAL_API, fetchFeedPage } from '../src/components/central/feedApi';
import { CentralIcon } from '../src/components/central/icons';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- DOM stubs -------------------------------------------------------------------------------------------------

let feedWidth = 360;
const observers: Array<{
  callback: IntersectionObserverCallback;
  target: Element | null;
  live: boolean;
}> = [];

/** A measuring copy's height: different per card, taller when wide, so columns really stagger. */
function stubHeight(el: Element): number {
  const key = (el as HTMLElement).dataset?.measure;
  if (!key) return 0;
  const [span, id] = key.split('|') as [string, string];
  const n = Number(/(\d+)$/.exec(id)?.[1] ?? 0);
  return span === '2' ? 180 + (n % 3) * 10 : 120 + (n % 4) * 25;
}

beforeEach(() => {
  feedWidth = 360;
  observers.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('feed') ? feedWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = stubHeight(this);
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: height,
      width: 0,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: (typeof observers)[number];
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, target: null, live: true };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.live = false;
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---- Data and fetch ------------------------------------------------------------------------------------------------

const APPS = [
  {
    slug: 'connect',
    name: 'Connect',
    label: 'Citizens Connect',
    accent: '#f2bd22',
    status: 'live',
  },
  { slug: 'central', name: 'Central', label: 'Citizens Central', accent: null, status: 'live' },
];

function card(n: number, shape: 'square' | 'landscape' = 'square', app = 'connect'): FeedItem {
  return {
    id: `${app}:event:${n}`,
    app,
    kind: 'event',
    sourceId: String(n),
    title: `Card ${n}`,
    kicker: 'Happening this week',
    summary: 'Sat 21 Nov · Community Park',
    image: null,
    shape,
    place: null,
    href: `/citizens/connect/e/${n}`,
    visibility: 'public',
  } as FeedItem;
}

interface PageSpec {
  items: FeedItem[];
  caughtUp: boolean;
  encouragement?: FeedItem | null;
}

/** A fetch that serves the registry and the given feed pages in order, chained by cursor. */
function mockFetch(pages: Array<PageSpec | number>, apps: unknown = APPS) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const reply = (status: number, body: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
    if (url === `${CENTRAL_API}/apps`) {
      return typeof apps === 'number'
        ? reply(apps, {})
        : reply(200, { data: apps, meta: { status: 'ok' } });
    }
    const index = Number(new URL(url, 'https://x.test').searchParams.get('cursor') ?? 0);
    const page = pages[index];
    if (page === undefined) throw new Error(`unexpected fetch ${url}`);
    if (typeof page === 'number') return reply(page, { error: 'feed_unavailable' });
    return reply(200, {
      data: {
        edition: { day: '2026-11-11', cell: null, size: 0 },
        lead: { encouragement: page.encouragement ?? null },
        items: page.items,
        nextCursor: page.caughtUp ? null : String(index + 1),
        caughtUp: page.caughtUp,
        nextEditionAt: '2026-11-12T02:00:00.000Z',
      },
      meta: { status: 'ok', source: 'connect-live' },
    });
  });
}

const feedCalls = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith(`${CENTRAL_API}/feed`)).length;

// ---- Rendering helpers ------------------------------------------------------------------------------------------

let root: Root | null = null;
let host: HTMLElement;

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(fetchImpl: typeof fetch) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CentralFeed fetchImpl={fetchImpl} />));
  await settle();
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
});

/** Placed cards only (the measuring copies live in .fc-measure). */
const placedCards = () =>
  Array.from(host.querySelectorAll<HTMLElement>('.feed > .fc')).map((el) => ({
    id: el.dataset.id as string,
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: parseFloat(el.style.height),
    wide: el.classList.contains('wide'),
    el,
  }));

const line = () => host.querySelector('.more')?.textContent ?? '';

async function scrollToEnd() {
  const live = observers.filter((o) => o.live);
  await act(async () => {
    for (const o of live)
      o.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
  });
  await settle();
}

// ---- Tests ---------------------------------------------------------------------------------------------------------

describe('Central feed: paging', () => {
  it('appends the next page without moving any earlier card', async () => {
    const page1 = [card(1), card(2, 'landscape'), card(3), card(4), card(5)];
    const page2 = [card(6), card(7, 'landscape'), card(8), card(9)];
    const fetchMock = mockFetch([
      { items: page1, caughtUp: false },
      { items: page2, caughtUp: true },
    ]);
    await mount(fetchMock as unknown as typeof fetch);

    const before = placedCards();
    expect(before.length).toBeGreaterThanOrEqual(4);
    expect(line()).toBe(FEED_LINES.more);

    await scrollToEnd();
    const after = placedCards();
    expect(after.map((c) => c.id).sort()).toEqual([...page1, ...page2].map((c) => c.id).sort());
    for (const earlier of before) {
      const now = after.find((c) => c.id === earlier.id)!;
      expect({ left: now.left, top: now.top, width: now.width }).toEqual({
        left: earlier.left,
        top: earlier.top,
        width: earlier.width,
      });
      // Only a card that closes the gap under a landscape card may grow; nothing shrinks.
      expect(now.height).toBeGreaterThanOrEqual(earlier.height);
    }
    expect(line()).toBe(FEED_LINES.caughtUp);
  });

  it('draws a card two columns wide when the placement spans two, at the engine’s width', async () => {
    const fetchMock = mockFetch([
      { items: [card(1), card(2), card(3, 'landscape')], caughtUp: true },
    ]);
    await mount(fetchMock as unknown as typeof fetch);
    const colW = columnWidth(360, 2);
    const wide = placedCards().find((c) => c.id === 'connect:event:3')!;
    expect(wide.wide).toBe(true);
    expect(wide.width).toBe(`${cardWidth(colW, 2)}px`);
    for (const c of placedCards().filter((x) => !x.wide)) expect(c.width).toBe(`${colW}px`);
    // The feed's height is set from the layout, and nothing is left in the measuring layer.
    expect(parseFloat((host.querySelector('.feed') as HTMLElement).style.height)).toBeGreaterThan(
      0,
    );
    expect(host.querySelectorAll('.fc-measure > *')).toHaveLength(0);
  });

  it('uses 4 columns on a wide feed', async () => {
    feedWidth = 1200;
    const fetchMock = mockFetch([{ items: [card(1), card(2), card(3), card(4)], caughtUp: true }]);
    await mount(fetchMock as unknown as typeof fetch);
    const lefts = new Set(placedCards().map((c) => c.left));
    expect(lefts.size).toBe(4);
  });

  it('stops for good once caught up: no more fetches, no observer, no button', async () => {
    const fetchMock = mockFetch([
      { items: [card(1), card(2)], caughtUp: false },
      { items: [card(3)], caughtUp: true },
    ]);
    await mount(fetchMock as unknown as typeof fetch);
    await scrollToEnd();
    expect(feedCalls(fetchMock)).toBe(2);
    expect(line()).toBe(FEED_LINES.caughtUp);
    expect(observers.filter((o) => o.live)).toHaveLength(0);
    await scrollToEnd();
    await scrollToEnd();
    expect(feedCalls(fetchMock)).toBe(2);
    expect(host.querySelector('button')).toBeNull();
  });

  it('uses the page’s own fetch once per page, however often it re-renders', async () => {
    const fetchMock = mockFetch([
      { items: [card(1), card(2)], caughtUp: false },
      { items: [card(3)], caughtUp: true },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<CentralFeed />));
    await settle();
    await act(async () => root!.render(<CentralFeed />));
    await settle();
    await scrollToEnd();
    expect(feedCalls(fetchMock)).toBe(2);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/apps'))).toHaveLength(1);
    expect(line()).toBe(FEED_LINES.caughtUp);
  });

  it('treats a page with no cursor as the end, never as a reason to loop', async () => {
    const body = { data: { items: [card(1)], caughtUp: false, nextCursor: null, lead: {} } };
    const page = await fetchFeedPage(null, (async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    })) as never);
    expect(page.caughtUp).toBe(true);
  });
});

describe('Central feed: empty and error', () => {
  it('shows the quiet line and no cards when the edition is empty', async () => {
    const fetchMock = mockFetch([{ items: [], caughtUp: true }]);
    await mount(fetchMock as unknown as typeof fetch);
    expect(placedCards()).toHaveLength(0);
    expect(line()).toBe(FEED_LINES.empty);
    expect(feedCalls(fetchMock)).toBe(1);
  });

  it('shows the same quiet line, no cards and no retry when the feed fails', async () => {
    const fetchMock = mockFetch([503]);
    await mount(fetchMock as unknown as typeof fetch);
    expect(placedCards()).toHaveLength(0);
    expect(line()).toBe(FEED_LINES.empty);
    await scrollToEnd();
    expect(feedCalls(fetchMock)).toBe(1);
  });

  it('keeps the cards it has when a later page fails, and stops', async () => {
    const fetchMock = mockFetch([
      { items: [card(1), card(2), card(3, 'landscape')], caughtUp: false },
      503,
    ]);
    await mount(fetchMock as unknown as typeof fetch);
    await scrollToEnd();
    // The landscape card the engine was holding for its neighbour is placed when the feed ends.
    expect(
      placedCards()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['connect:event:1', 'connect:event:2', 'connect:event:3']);
    expect(line()).toBe('');
    await scrollToEnd();
    expect(feedCalls(fetchMock)).toBe(2);
  });
});

describe('Central feed: kickers and lead', () => {
  it('takes the app name and accent dot from the registry; Central’s own cards have no dot', async () => {
    const fetchMock = mockFetch([
      { items: [card(1), card(2, 'square', 'central')], caughtUp: true },
    ]);
    await mount(fetchMock as unknown as typeof fetch);
    const [connect, central] = ['connect:event:1', 'central:event:2'].map(
      (id) => host.querySelector<HTMLElement>(`.feed > .fc[data-id="${id}"] .pl`)!,
    );
    expect(connect.textContent).toBe('Connect· Happening this week');
    expect(connect.querySelector('b')!.style.getPropertyValue('--a')).toBe('#f2bd22');
    expect(connect.querySelector('i')).not.toBeNull();
    expect(central.textContent).toBe('Central· Happening this week');
    expect(central.querySelector('i')).toBeNull();
  });

  it('shows only the card’s own kicker when the registry cannot be read', async () => {
    const fetchMock = mockFetch([{ items: [card(1)], caughtUp: true }], 500);
    await mount(fetchMock as unknown as typeof fetch);
    expect(host.querySelector('.feed > .fc .pl')!.textContent).toBe('Happening this week');
  });

  it('hides the encouragement block when the API sends none, and shows it when it does', async () => {
    await mount(mockFetch([{ items: [card(1)], caughtUp: true }]) as unknown as typeof fetch);
    expect(host.querySelector('.enc')).toBeNull();
    await act(async () => root!.unmount());
    root = null;
    host.remove();
    const encouragement = {
      ...card(9, 'square', 'central'),
      kind: 'encouragement',
      title: 'Be still',
      kicker: 'Today',
    };
    await mount(
      mockFetch([{ items: [card(1)], caughtUp: true, encouragement }]) as unknown as typeof fetch,
    );
    expect(host.querySelector('.enc p')!.textContent).toBe('“Be still”');
  });

  it('links a card only to https: or the site’s own /citizens/ paths', () => {
    expect(safeHref('/citizens/connect/e/1')).toBe('/citizens/connect/e/1');
    expect(safeHref('https://example.org/x')).toBe('https://example.org/x');
    for (const bad of [
      'javascript:alert(1)',
      'http://example.org',
      '//evil.test',
      'data:text/html,x',
      42,
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });

  it('draws a known icon and nothing for an unknown key', () => {
    const div = document.createElement('div');
    const r = createRoot(div);
    act(() => r.render(<CentralIcon name="book" />));
    expect(div.querySelector('svg')).not.toBeNull();
    act(() => r.render(<CentralIcon name="calendar" />));
    expect(div.querySelector('svg')).toBeNull();
    act(() => r.unmount());
  });
});

describe('Central feed: guardrails in the source', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const component = ['CentralFeed.tsx', 'FeedCard.tsx', 'icons.tsx', 'CentralSection.tsx'].map(
    (f) => read(`../src/components/central/${f}`),
  );

  it('names no app and no app colour (G9): apps are registry rows, templates are chosen by data', () => {
    for (const source of component) {
      expect(source).not.toMatch(/\b(?:connect|vision|wear|learn|play|impact|move)\b['"]/i);
      expect(source).not.toMatch(/app\s*===|\.app\s*==/);
      expect(source).not.toMatch(/#[0-9a-f]{6}\b/i);
    }
  });

  it('builds with webpack, so the strict script-src stays as it is', () => {
    // Turbopack writes an inline chunk-loader script into every page that has JavaScript; the front door's CSP
    // (script-src 'self', config/hub-config.js) blocks it and the feed never starts. Webpack emits only external
    // scripts and the non-executed __NEXT_DATA__ JSON. Changing this means changing the CSP: a founder decision.
    const scripts = JSON.parse(read('../package.json')).scripts as Record<string, string>;
    expect(scripts.build).toMatch(/^next build --webpack/);
    expect(scripts.dev).toMatch(/^next dev --webpack/);
    expect(read('../next.config.js')).toMatch(/transpilePackages: \['@citizens\/central'\]/);
  });

  it('stores nothing about the reader and asks for no location (G8, guide 5.1)', () => {
    for (const source of [...component, read('../src/components/central/feedApi.ts')]) {
      expect(source).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie|geolocation|near=/,
      );
    }
  });
});
