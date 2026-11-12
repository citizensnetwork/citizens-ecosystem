import { describe, expect, it } from 'vitest';
import {
  cardLeft,
  cardWidth,
  columnWidth,
  columnsForWidth,
  createLayout,
  layoutAll,
  layoutBatch,
  type CardShape,
  type LayoutItem,
  type MeasureCard,
  type Placement,
} from '../src/layout';

const S = (id: string): LayoutItem => ({ id, shape: 'square' });
const L = (id: string): LayoutItem => ({ id, shape: 'landscape' });

/** A measure function from a table of heights (the same height at either width). */
const heights =
  (table: Record<string, number>): MeasureCard =>
  (item) =>
    table[item.id] as number;

const find = (placements: Placement[], id: string): Placement =>
  placements.find((p) => p.id === id) as Placement;

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

/** A repeatable height for an item at a width: whole numbers, different for each width. */
const fakeMeasure: MeasureCard = (item, span) => {
  let h = span * 7919;
  for (let i = 0; i < item.id.length; i += 1) h = (Math.imul(h, 31) + item.id.charCodeAt(i)) >>> 0;
  return span === 2 ? 120 + (h % 140) : 90 + (h % 260);
};

function randomItems(next: () => number, count: number, landscapeShare: number): LayoutItem[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `i${n}`,
    shape: (next() < landscapeShare ? 'landscape' : 'square') as CardShape,
  }));
}

/** Feed `items` to the engine in random batches and return every card's final placement. */
function inBatches(items: LayoutItem[], cols: number, next: () => number): Placement[] {
  let state = createLayout(cols);
  const all: Placement[] = [];
  let at = 0;
  do {
    const size = 1 + Math.floor(next() * 9);
    const batch = items.slice(at, at + size);
    at += size;
    const before = all.map((p) => ({ ...p }));
    const result = layoutBatch(state, batch, fakeMeasure, { final: at >= items.length });
    expect(result.state.held.length).toBeLessThanOrEqual(1);
    for (const grown of result.extended) {
      const earlier = find(all, grown.id);
      expect(earlier.span).toBe(1);
      expect(grown.height).toBeGreaterThan(earlier.height);
      earlier.height = grown.height;
    }
    // Guarantee 5: nothing placed earlier moved; only the listed heights grew.
    before.forEach((was, k) => {
      const now = all[k] as Placement;
      expect({ ...now, height: 0 }).toEqual({ ...was, height: 0 });
      if (!result.extended.some((g) => g.id === was.id)) expect(now.height).toBe(was.height);
    });
    all.push(...result.placements);
    state = result.state;
  } while (at < items.length);
  return all;
}

describe('worked examples from the guide', () => {
  it('2 columns (guide section 6.3)', () => {
    const items = [S('a'), S('b'), L('c'), S('d'), L('e'), S('f'), S('g')];
    const measure = heights({ a: 200, b: 260, c: 180, d: 220, e: 180, f: 240, g: 200 });
    const result = layoutAll(items, 2, measure);
    const p = result.placements;
    expect(p.map((x) => x.id).join('')).toBe('abcdfeg');
    // a grew from 200 to 260 so that c sits level on both columns.
    expect(find(p, 'a')).toMatchObject({ col: 0, span: 1, top: 0, height: 260 });
    expect(find(p, 'b')).toMatchObject({ col: 1, span: 1, top: 0, height: 260 });
    expect(find(p, 'c')).toMatchObject({ col: 0, span: 2, top: 272, height: 180 });
    // e could not sit under c and d (the shorter column ended in a two-column card),
    // so the square f went first; then d grew from 220 to 240.
    expect(find(p, 'd')).toMatchObject({ col: 0, span: 1, top: 464, height: 240 });
    expect(find(p, 'f')).toMatchObject({ col: 1, span: 1, top: 464, height: 240 });
    expect(find(p, 'e')).toMatchObject({ col: 0, span: 2, top: 716, height: 180 });
    expect(find(p, 'g')).toMatchObject({ col: 0, span: 1, top: 908, height: 200 });
    expect(result.height).toBe(1108);
    expect(result.extended).toEqual([]);
  });

  it('4 columns (guide section 6.4)', () => {
    const items = [L('a'), S('b'), S('c'), S('d'), L('e')];
    const measure = heights({ a: 180, b: 200, c: 260, d: 220, e: 180 });
    const p = layoutAll(items, 4, measure).placements;
    expect(find(p, 'a')).toMatchObject({ col: 0, span: 2, top: 0 });
    expect(find(p, 'b')).toMatchObject({ col: 2, span: 1, top: 0, height: 260 });
    expect(find(p, 'c')).toMatchObject({ col: 3, span: 1, top: 0, height: 260 });
    expect(find(p, 'd')).toMatchObject({ col: 0, span: 1, top: 192, height: 220 });
    expect(find(p, 'e')).toMatchObject({ col: 2, span: 2, top: 272, height: 180 });
  });

  it('draws a landscape as a square when nothing can make room for it', () => {
    const measure = heights({ a: 200, b: 150, c: 150 });
    const p = layoutAll([S('a'), L('b'), L('c')], 2, measure).placements;
    expect(find(p, 'b')).toMatchObject({ col: 1, span: 1, shape: 'square', hinted: 'landscape' });
    expect(find(p, 'c')).toMatchObject({ col: 0, span: 2, top: 212, shape: 'landscape' });
    // b (150) grew to 200 to be level with a.
    expect(find(p, 'b').height).toBe(200);
    const alone = layoutAll([S('a'), L('b')], 2, measure).placements;
    expect(find(alone, 'b')).toMatchObject({ col: 1, span: 1, top: 0 });
  });
});

describe('batches', () => {
  it('holds a landscape that needs the next item, and reports a card that grows later', () => {
    const measure = heights({ a: 200, b: 150, c: 260 });
    const first = layoutBatch(createLayout(2), [S('a'), L('b')], measure);
    expect(first.placements.map((p) => p.id)).toEqual(['a']);
    expect(first.state.held.map((h) => h.id)).toEqual(['b']);

    const second = layoutBatch(first.state, [S('c')], measure, { final: true });
    expect(second.placements.map((p) => p.id)).toEqual(['c', 'b']);
    expect(find(second.placements, 'c')).toMatchObject({ col: 1, top: 0, height: 260 });
    expect(find(second.placements, 'b')).toMatchObject({ col: 0, span: 2, top: 272 });
    // a was placed by the first call: its new height comes back in `extended`.
    expect(second.extended).toEqual([{ id: 'a', height: 260 }]);
    expect(second.height).toBe(422);
    expect(second.state.done).toBe(true);
  });

  it('refuses another batch after the final one, and bad input', () => {
    const one: MeasureCard = () => 100;
    const done = layoutBatch(createLayout(2), [S('a')], one, { final: true }).state;
    expect(() => layoutBatch(done, [S('b')], one)).toThrow(/already finished/);
    expect(() => createLayout(1)).toThrow(RangeError);
    expect(() => createLayout(2.5)).toThrow(RangeError);
    expect(() => createLayout(13)).toThrow(RangeError);
    expect(() => createLayout(2, -1)).toThrow(RangeError);
    expect(() =>
      layoutBatch(createLayout(2), [{ id: 'x', shape: 'tall' as CardShape }], one),
    ).toThrow(TypeError);
    expect(() => layoutBatch(createLayout(2), [S('a')], () => 0)).toThrow(RangeError);
    expect(() => layoutBatch(createLayout(2), [S('a')], () => Number.NaN)).toThrow(RangeError);
  });

  it('an empty edition lays out to nothing', () => {
    const result = layoutAll([], 2, () => 100);
    expect(result).toMatchObject({ placements: [], extended: [], height: 0 });
  });
});

describe('sizes', () => {
  it('is 2 columns below 1000px of container width and 4 from 1000px', () => {
    expect(columnsForWidth(358)).toBe(2);
    expect(columnsForWidth(999)).toBe(2);
    expect(columnsForWidth(1000)).toBe(4);
    expect(columnsForWidth(1200)).toBe(4);
  });

  it('gives column and card widths and offsets', () => {
    expect(columnWidth(1200, 4)).toBe(291);
    expect(columnWidth(358, 2, 12)).toBe(173);
    expect(cardWidth(291, 1)).toBe(291);
    expect(cardWidth(291, 2)).toBe(594);
    expect(cardLeft(0, 291)).toBe(0);
    expect(cardLeft(2, 291)).toBe(606);
  });
});

describe('properties (seeded random streams)', () => {
  const cases: Array<{ cols: number; share: number }> = [];
  for (const cols of [2, 3, 4, 6])
    for (const share of [0, 0.25, 0.5, 0.8, 1]) cases.push({ cols, share });

  it.each(cases)('cols=$cols landscape share=$share', ({ cols, share }) => {
    const gap = 12;
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = rng(seed * 7919 + cols * 131 + Math.round(share * 100));
      const items = randomItems(next, Math.floor(next() * 70), share);
      const whole = layoutAll(items, cols, fakeMeasure);
      const placed = whole.placements;

      // 1. every item placed exactly once
      expect(placed.map((p) => p.id).sort()).toEqual(items.map((it) => it.id).sort());

      // 2 + 3. in every column the cards follow each other from the top with exactly one gap:
      // no hole, no overlap; a two-column card has one top for both of its columns.
      let tallest = 0;
      for (let c = 0; c < cols; c += 1) {
        const inColumn = placed
          .filter((p) => p.col <= c && c < p.col + p.span)
          .sort((a, b) => a.top - b.top);
        let expectedTop = 0;
        for (const p of inColumn) {
          expect(p.top).toBe(expectedTop);
          expectedTop = p.top + p.height + gap;
        }
        tallest = Math.max(tallest, expectedTop - gap);
      }
      expect(whole.height).toBe(Math.max(0, tallest));

      // 4. rank order, except that one square may go in front of one landscape
      placed.forEach((p, position) => {
        expect(Math.abs(position - p.index)).toBeLessThanOrEqual(1);
        expect(items[p.index]?.id).toBe(p.id);
        expect(p.hinted).toBe(items[p.index]?.shape);
        expect(p.shape).toBe(p.span === 2 ? 'landscape' : 'square');
        expect(p.col + p.span).toBeLessThanOrEqual(cols);
        // A card only ever grows from its measured height.
        expect(p.height).toBeGreaterThanOrEqual(fakeMeasure(items[p.index] as LayoutItem, p.span));
        if (p.span === 2) expect(p.height).toBe(fakeMeasure(items[p.index] as LayoutItem, 2));
      });

      // 5 + 6. batches: same final layout as the one-call layout (the helper checks that no
      // earlier card moved along the way).
      expect(inBatches(items, cols, next)).toEqual(placed);
    }
  });
});
