import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/v1Gate', () => ({
  gateV1: vi.fn().mockResolvedValue({ key: null, identifier: 'test' }),
}));

type Result = { data?: unknown; error?: unknown; count?: number };
const state: {
  categories: Result;
  events: Result;
  headCalls: string[];
} = { categories: {}, events: {}, headCalls: [] };

// Minimal thenable query builder keyed by table, recording head counts.
function builder(table: string) {
  const ctx = { head: false, slug: '' };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'in', 'eq']) {
    b[m] = (...args: unknown[]) => {
      if (m === 'select' && (args[1] as { head?: boolean } | undefined)?.head) ctx.head = true;
      if (m === 'eq' && args[0] === 'category') ctx.slug = String(args[1]);
      return b;
    };
  }
  b.then = (resolve: (v: Result) => unknown) => {
    if (table === 'categories') return resolve(state.categories);
    if (ctx.head) {
      state.headCalls.push(ctx.slug);
      return resolve({ count: 7, error: null });
    }
    return resolve(state.events);
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: (t: string) => builder(t) }),
}));

const { GET } = await import('@/app/api/v1/categories/route');

const cats = [
  { id: '1', name: 'Worship', slug: 'worship', sort_order: 1 },
  { id: '2', name: 'Prayer', slug: 'prayer', sort_order: 2 },
];

describe('/api/v1/categories event counts', () => {
  beforeEach(() => {
    state.headCalls = [];
    state.categories = { data: cats, error: null };
  });

  it('counts per slug from one events read, with no per-category queries', async () => {
    state.events = {
      data: [
        { category: 'worship' },
        { category: 'worship' },
        { category: 'prayer' },
        { category: 'other' },
      ],
      error: null,
    };
    const res = await GET(new Request('http://localhost/api/v1/categories'));
    const j = await res.json();
    expect(j.data.map((c: { event_count: number }) => c.event_count)).toEqual([2, 1]);
    expect(j.meta.count).toBe(2);
    expect(state.headCalls).toEqual([]);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
  });

  it('falls back to exact per-category counts when the read hits the row cap', async () => {
    state.events = {
      data: Array.from({ length: 1000 }, () => ({ category: 'worship' })),
      error: null,
    };
    const res = await GET(new Request('http://localhost/api/v1/categories'));
    const j = await res.json();
    expect(state.headCalls.sort()).toEqual(['prayer', 'worship']);
    expect(j.data.map((c: { event_count: number }) => c.event_count)).toEqual([7, 7]);
  });

  it('returns 500 when the categories read fails', async () => {
    state.categories = { data: null, error: { message: 'x' } };
    state.events = { data: [], error: null };
    const res = await GET(new Request('http://localhost/api/v1/categories'));
    expect(res.status).toBe(500);
  });
});
