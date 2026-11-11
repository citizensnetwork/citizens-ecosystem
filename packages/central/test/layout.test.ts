import { describe, expect, it } from 'vitest';
import {
  columnsForWidth,
  createLayout,
  layoutAll,
  layoutBatch,
  type CardShape,
  type LayoutItem,
  type Placement,
} from '../src/layout';

const S = (id: string): LayoutItem => ({ id, shape: 'square' });
const L = (id: string): LayoutItem => ({ id, shape: 'landscape' });

/** Rows as strings: a lower-case id is a one-column card, an upper-case id a two-column card. */
function rows(placements: Placement[]): string[] {
  const out: string[] = [];
  for (const p of placements) {
    out[p.row] = (out[p.row] ?? '') + (p.span === 2 ? p.id.toUpperCase() : p.id);
  }
  return out;
}

/** Small seeded generator (mulberry32) so the property checks are repeatable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomItems(next: () => number, count: number, landscapeShare: number): LayoutItem[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `i${n}`,
    shape: (next() < landscapeShare ? 'landscape' : 'square') as CardShape,
  }));
}

/** Feed `items` to the engine in random batches. Returns each call's placements. */
function inBatches(items: LayoutItem[], cols: number, next: () => number): Placement[][] {
  let state = createLayout(cols);
  const calls: Placement[][] = [];
  let at = 0;
  while (at < items.length) {
    const size = 1 + Math.floor(next() * 9);
    const batch = items.slice(at, at + size);
    at += size;
    const result = layoutBatch(state, batch, { final: at >= items.length });
    expect(result.state.held.length).toBeLessThanOrEqual(cols);
    calls.push(result.placements);
    state = result.state;
  }
  if (items.length === 0) calls.push(layoutBatch(state, [], { final: true }).placements);
  return calls;
}

describe('worked examples from the guide', () => {
  it('2 columns (guide section 6.3)', () => {
    const result = layoutAll([S('a'), L('b'), S('c'), S('d'), L('e'), L('f'), S('g')], 2);
    expect(rows(result.placements)).toEqual(['ac', 'B', 'de', 'F', 'G']);
    expect(result.placements.map((p) => p.id).join('')).toBe('acbdefg');
    expect(result.raggedEnd).toBe(false);
    const e = result.placements.find((p) => p.id === 'e');
    expect(e).toMatchObject({ span: 1, shape: 'square', hinted: 'landscape', row: 2, col: 1 });
    const g = result.placements.find((p) => p.id === 'g');
    expect(g).toMatchObject({ span: 2, shape: 'landscape', hinted: 'square', row: 4, col: 0 });
  });

  it('4 columns (guide section 6.4)', () => {
    const items = [
      L('a'),
      S('b'),
      L('c'),
      S('d'),
      S('e'),
      S('f'),
      L('g'),
      S('h'),
      S('i'),
      S('j'),
      S('k'),
      S('l'),
    ];
    const result = layoutAll(items, 4);
    expect(rows(result.placements)).toEqual(['Abd', 'Cef', 'Ghi', 'jkL']);
    expect(result.raggedEnd).toBe(false);
    expect(result.placements.find((p) => p.id === 'l')).toMatchObject({ col: 2, span: 2 });
  });

  it('reports a ragged end when one card is left for the last 4-column row', () => {
    const result = layoutAll([S('a'), S('b'), S('c'), S('d'), S('e')], 4);
    expect(rows(result.placements)).toEqual(['abcd', 'E']);
    expect(result.raggedEnd).toBe(true);
  });
});

describe('batches', () => {
  it('emits only complete rows until the final batch', () => {
    let state = createLayout(4);
    const first = layoutBatch(state, [S('a'), S('b'), S('c')]);
    expect(first.placements).toEqual([]);
    expect(first.state.held.map((h) => h.id)).toEqual(['a', 'b', 'c']);
    state = first.state;

    const second = layoutBatch(state, [L('d')]);
    // d does not fit in the last cell and the next item is unknown: everything waits.
    expect(second.placements).toEqual([]);
    expect(second.state.held.map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
    state = second.state;

    const third = layoutBatch(state, [S('e'), S('f')]);
    expect(rows(third.placements)).toEqual(['abce']);
    expect(third.state.held.map((h) => h.id)).toEqual(['d', 'f']);

    const last = layoutBatch(third.state, [], { final: true });
    expect(rows(last.placements)[1]).toBe('DF');
    expect(last.placements.map((p) => p.row)).toEqual([1, 1]);
    expect(last.placements.find((p) => p.id === 'f')).toMatchObject({ span: 2, col: 2 });
    expect(last.state.done).toBe(true);
  });

  it('refuses another batch after the final one, and bad input', () => {
    const done = layoutBatch(createLayout(2), [S('a')], { final: true }).state;
    expect(() => layoutBatch(done, [S('b')])).toThrow(/already finished/);
    expect(() => createLayout(1)).toThrow(RangeError);
    expect(() => createLayout(2.5)).toThrow(RangeError);
    expect(() => createLayout(13)).toThrow(RangeError);
    expect(() =>
      layoutBatch(createLayout(2), [{ id: 'x', shape: 'portrait' as CardShape }]),
    ).toThrow(TypeError);
  });

  it('an empty edition lays out to nothing', () => {
    const result = layoutAll([], 2);
    expect(result.placements).toEqual([]);
    expect(result.raggedEnd).toBe(false);
  });
});

describe('column count', () => {
  it('is 2 below 1000px of container width and 4 from 1000px', () => {
    expect(columnsForWidth(358)).toBe(2);
    expect(columnsForWidth(999)).toBe(2);
    expect(columnsForWidth(1000)).toBe(4);
    expect(columnsForWidth(1200)).toBe(4);
  });
});

describe('properties (seeded random streams)', () => {
  const cases: Array<{ cols: number; share: number }> = [];
  for (const cols of [2, 3, 4, 6])
    for (const share of [0, 0.25, 0.5, 0.8, 1]) cases.push({ cols, share });

  it.each(cases)('cols=$cols landscape share=$share', ({ cols, share }) => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = rng(seed * 7919 + cols * 131 + Math.round(share * 100));
      const items = randomItems(next, Math.floor(next() * 70), share);
      const whole = layoutAll(items, cols);
      const placed = whole.placements;

      // 1. every item placed exactly once
      expect(placed.map((p) => p.id).sort()).toEqual(items.map((it) => it.id).sort());

      // 2 + 3. rows are full, cards stay inside their row, no overlap, no hole
      const lastRow = placed.length ? (placed[placed.length - 1] as Placement).row : -1;
      for (let r = 0; r <= lastRow; r += 1) {
        const inRow = placed.filter((p) => p.row === r);
        let col = 0;
        for (const p of inRow) {
          expect(p.col).toBe(col);
          expect(p.col + p.span).toBeLessThanOrEqual(cols);
          col += p.span;
        }
        if (r < lastRow || !whole.raggedEnd) expect(col).toBe(cols);
        else expect(col).toBeLessThan(cols);
      }
      if (cols === 2) expect(whole.raggedEnd).toBe(false);

      // 4. bounded reordering: reading position is within 1 of the rank
      placed.forEach((p, position) => {
        expect(Math.abs(position - p.index)).toBeLessThanOrEqual(1);
        expect(items[p.index]?.id).toBe(p.id);
        expect(p.hinted).toBe(items[p.index]?.shape);
        expect(p.shape).toBe(p.span === 2 ? 'landscape' : 'square');
      });

      // 5 + 6. batches: the calls' placements, joined, equal the one-call layout exactly,
      // so nothing emitted earlier was moved by a later batch.
      const calls = inBatches(items, cols, next);
      expect(calls.flat()).toEqual(placed);
    }
  });
});
