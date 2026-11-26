import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  feedItemId,
  isHttpsUrl,
  isSafeHref,
  validateCentralApp,
  validateFeedItemInput,
} from '../src/contract';
import { SAMPLE_APPS, SAMPLE_ENCOURAGEMENT, SAMPLE_FEED } from '../src/fixtures';

const base = {
  kind: 'event',
  sourceId: 'abc-123',
  title: '  Community sports day ',
  kicker: 'Happening this weekend',
  shape: 'landscape',
  href: '/citizens/connect/e/abc-123',
  visibility: 'public',
};

const reasonOf = (raw: unknown): string => {
  const result = validateFeedItemInput(raw);
  return result.ok ? 'ok' : result.reason;
};

describe('validateFeedItemInput', () => {
  it('accepts a minimal item and trims its text', () => {
    const result = validateFeedItemInput(base);
    expect(result).toEqual({
      ok: true,
      value: { ...base, title: 'Community sports day' },
    });
  });

  it('accepts every optional field and rounds the venue to 2 decimals', () => {
    const result = validateFeedItemInput({
      ...base,
      summary: 'Sat 21 Nov · Community Park',
      image: { url: 'https://images.example/a.jpg', alt: ' A field ' },
      icon: 'calendar',
      list: ['One', ' Two '],
      place: { label: 'Community Park', lat: -25.771234, lng: 28.236789 },
      region: 'GP',
      startsAt: '2026-11-21T07:00:00Z',
      endsAt: '2026-11-21T12:00:00Z',
      payload: { category: 'sport' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.place).toEqual({ label: 'Community Park', lat: -25.77, lng: 28.24 });
    expect(result.value.image).toEqual({ url: 'https://images.example/a.jpg', alt: 'A field' });
    expect(result.value.list).toEqual(['One', 'Two']);
  });

  it('treats null, undefined and empty optional fields as absent', () => {
    const result = validateFeedItemInput({ ...base, summary: '', image: null, place: undefined });
    expect(result.ok && Object.keys(result.value).sort()).toEqual(Object.keys(base).sort());
  });

  it.each([
    ['not_an_object', null],
    ['not_an_object', [base]],
    ['kind_invalid', { ...base, kind: 'Event!' }],
    ['source_id_invalid', { ...base, sourceId: 'has space' }],
    ['source_id_invalid', { ...base, sourceId: 'x'.repeat(LIMITS.sourceId + 1) }],
    ['title_invalid', { ...base, title: '   ' }],
    ['title_invalid', { ...base, title: 'x'.repeat(LIMITS.title + 1) }],
    ['title_invalid', { ...base, title: 'line\nbreak' }],
    ['kicker_invalid', { ...base, kicker: 42 }],
    ['shape_invalid', { ...base, shape: 'portrait' }],
    ['not_public', { ...base, visibility: 'followers' }],
    ['href_invalid', { ...base, href: 'javascript:alert(1)' }],
    ['href_invalid', { ...base, href: 'http://insecure.example/' }],
    ['href_invalid', { ...base, href: '/admin' }],
    ['summary_invalid', { ...base, summary: 'x'.repeat(LIMITS.summary + 1) }],
    ['image_invalid', { ...base, image: { url: 'data:image/png;base64,AAAA', alt: '' } }],
    ['image_invalid', { ...base, image: { url: 'https://a.example/x', alt: 'x'.repeat(200) } }],
    ['icon_invalid', { ...base, icon: '<svg>' }],
    ['list_invalid', { ...base, list: [] }],
    ['list_invalid', { ...base, list: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['list_invalid', { ...base, list: ['ok', 7] }],
    ['place_invalid', { ...base, place: { label: 'Somewhere', lat: 91, lng: 0 } }],
    ['place_invalid', { ...base, place: { label: '', lat: 1, lng: 1 } }],
    ['place_invalid', { ...base, place: { label: 'Somewhere', lat: '1', lng: 1 } }],
    ['region_invalid', { ...base, region: 'x'.repeat(LIMITS.region + 1) }],
    ['time_invalid', { ...base, startsAt: 'next week' }],
    ['time_invalid', { ...base, startsAt: '2026-11-21T12:00:00Z', endsAt: '2026-11-21T07:00:00Z' }],
    ['payload_invalid', { ...base, payload: ['a'] }],
    ['payload_too_large', { ...base, payload: { blob: 'x'.repeat(LIMITS.payloadBytes) } }],
  ])('rejects with %s', (reason, raw) => {
    expect(reasonOf(raw)).toBe(reason);
  });

  it('rejects a payload that cannot be serialised', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(reasonOf({ ...base, payload: loop })).toBe('payload_invalid');
  });

  it('has no field for counts or popularity (guardrail G4)', () => {
    const result = validateFeedItemInput({ ...base, likes: 99, views: 1200, trending: true });
    expect(result.ok && Object.keys(result.value)).not.toEqual(
      expect.arrayContaining(['likes', 'views', 'trending']),
    );
  });
});

describe('links', () => {
  it('accepts https URLs and /citizens/ paths only', () => {
    expect(isSafeHref('https://219.co.za/citizens/connect')).toBe(true);
    expect(isSafeHref('/citizens/wear/brand/one')).toBe(true);
    expect(isSafeHref('/citizens//evil.example')).toBe(false);
    expect(isSafeHref('/citizens/a b')).toBe(false);
    expect(isSafeHref('//evil.example/citizens/')).toBe(false);
    expect(isSafeHref(`https://a.example/${'x'.repeat(LIMITS.url)}`)).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
    expect(isHttpsUrl('https://user@evil.example/')).toBe(false);
    expect(isHttpsUrl('https:///nohost')).toBe(false);
    expect(isHttpsUrl('https://a.example\\b')).toBe(false);
    expect(isHttpsUrl('https://localhost:3000/x?y=1#z')).toBe(true);
  });
});

describe('fixtures and the registry', () => {
  it('every sample card is a valid feed item with a registered app and kind', () => {
    for (const item of [...SAMPLE_FEED, SAMPLE_ENCOURAGEMENT]) {
      const { id, app, publishedAt: _p, updatedAt: _u, ...input } = item;
      expect(validateFeedItemInput(input)).toMatchObject({ ok: true });
      expect(id).toBe(feedItemId(app, item.kind, item.sourceId));
      const owner = SAMPLE_APPS.find((a) => a.slug === app);
      expect(owner?.kinds.map((k) => k.kind)).toContain(item.kind);
    }
  });

  it('every sample app is a valid registry entry', () => {
    for (const app of SAMPLE_APPS)
      expect(validateCentralApp(app)).toEqual({ ok: true, value: app });
  });

  it.each([
    ['not_an_object', 'connect'],
    ['slug_invalid', { slug: 'Connect' }],
    ['copy_invalid', { name: '' }],
    ['accent_invalid', { accent: 'gold' }],
    ['icon_invalid', { icon: 'no spaces' }],
    ['visit_url_invalid', { visitUrl: 'http://x.example' }],
    ['status_invalid', { status: 'beta' }],
    ['sort_order_invalid', { sortOrder: 1.5 }],
    ['kinds_invalid', { kinds: 'event' }],
    ['kinds_invalid', { kinds: [{ kind: 'event', label: 'Events', defaultShape: 'tall' }] }],
    ['kinds_invalid', { kinds: [null] }],
  ])('rejects a registry entry with %s', (reason, change) => {
    const raw = typeof change === 'string' ? change : { ...SAMPLE_APPS[1], ...change };
    expect(validateCentralApp(raw)).toEqual({ ok: false, reason });
  });
});
