/**
 * The Central feed layout engine: staggered columns.
 *
 * The founder's rule: 2 columns on phones, 4 on desktop; a landscape card spans two columns, a
 * square card one; no holes. Cards keep their own heights, so the columns are staggered, as in the
 * approved design check. (An earlier draft of this file packed cards into equal-height rows. The
 * founder corrected that: columns, not rows.)
 *
 * Pure and framework-free: no DOM. The caller passes a `measure` function that says how tall a card
 * is at the width it will be drawn; the engine does only arithmetic. The same input always gives the
 * same output, however the stream is split into batches. Full description with worked examples:
 * docs/central/CENTRAL_FEED_GUIDE.md, section 6.
 *
 * Guarantees (each one is a property test in test/layout.test.ts):
 *   1. every item is placed exactly once (after the final batch);
 *   2. no holes and no overlaps: in every column the cards follow each other with exactly one gap
 *      between them, from the top down to that column's last card;
 *   3. a landscape card sits on two neighbouring columns at one height;
 *   4. cards are placed in rank order, except that one square may go in front of one landscape;
 *   5. a card, once placed, never moves: only its height may grow (reported in `extended`) when it
 *      is the card that closes the gap under a landscape card;
 *   6. the result does not depend on where the batch boundaries fall.
 */

export type CardShape = 'square' | 'landscape';

/** What the engine needs to know about a feed item. `shape` is a hint: the engine may override it. */
export interface LayoutItem {
  id: string;
  shape: CardShape;
}

/** The height in CSS pixels of this item's card when it is drawn `span` columns wide. */
export type MeasureCard = (item: LayoutItem, span: 1 | 2) => number;

export interface Placement {
  id: string;
  /** The item's rank: its position in the whole stream, starting at 0. */
  index: number;
  /** First column, starting at 0. */
  col: number;
  /** Columns covered. This, not the item's own shape, decides how the card is drawn. */
  span: 1 | 2;
  /** Distance in pixels from the top of the feed. */
  top: number;
  /** The card's height in pixels (already grown, if it closed a gap in this same call). */
  height: number;
  /** The shape the card is drawn in (`landscape` when span is 2). */
  shape: CardShape;
  /** The shape the item asked for. Differs from `shape` when a landscape had to be drawn square. */
  hinted: CardShape;
}

interface Queued extends LayoutItem {
  index: number;
}

interface Tail {
  id: string;
  height: number;
  span: 1 | 2;
}

interface Column {
  /** Where the next card in this column starts: the last card's bottom plus one gap (0 if empty). */
  bottom: number;
  /** The lowest card in this column. */
  tail: Tail | null;
}

export interface LayoutState {
  readonly cols: number;
  readonly gap: number;
  readonly columns: readonly Column[];
  /** The rank the next new item will get. */
  readonly nextIndex: number;
  /** A landscape card waiting to see the next item (at most one). */
  readonly held: readonly Queued[];
  /** True once a final batch has been laid out. */
  readonly done: boolean;
}

export interface LayoutResult {
  /** New placements only, in the order to add them to the page. */
  placements: Placement[];
  /** Cards placed by an EARLIER call whose height has grown. Nothing else about them changes. */
  extended: Array<{ id: string; height: number }>;
  /** Pass this to the next call. */
  state: LayoutState;
  /** The height of the whole feed in pixels (its tallest column). */
  height: number;
}

/** The feed is 4 columns wide from this container width (in CSS pixels), otherwise 2. */
export const DESKTOP_MIN_WIDTH = 1000;
export const PHONE_COLUMNS = 2;
export const DESKTOP_COLUMNS = 4;
/** The space between cards, both ways, in CSS pixels. */
export const CARD_GAP = 12;

/** Column count for a feed container of the given width. Measure the container, not the window. */
export function columnsForWidth(containerWidth: number): number {
  return containerWidth >= DESKTOP_MIN_WIDTH ? DESKTOP_COLUMNS : PHONE_COLUMNS;
}

/** Width of one column. */
export function columnWidth(containerWidth: number, cols: number, gap: number = CARD_GAP): number {
  return (containerWidth - gap * (cols - 1)) / cols;
}

/** Width of a card that covers `span` columns. */
export function cardWidth(colWidth: number, span: 1 | 2, gap: number = CARD_GAP): number {
  return colWidth * span + gap * (span - 1);
}

/** Distance of a card from the left edge of the feed. */
export function cardLeft(col: number, colWidth: number, gap: number = CARD_GAP): number {
  return col * (colWidth + gap);
}

const MAX_COLUMNS = 12;

export function createLayout(cols: number, gap: number = CARD_GAP): LayoutState {
  if (!Number.isInteger(cols) || cols < 2 || cols > MAX_COLUMNS) {
    throw new RangeError(`cols must be a whole number from 2 to ${MAX_COLUMNS}`);
  }
  if (!Number.isFinite(gap) || gap < 0) throw new RangeError('gap must be zero or more');
  return {
    cols,
    gap,
    columns: Array.from({ length: cols }, () => ({ bottom: 0, tail: null })),
    nextIndex: 0,
    held: [],
    done: false,
  };
}

/**
 * Place the next batch of ranked items.
 *
 * A square card goes to the shortest column (the leftmost one on a tie). A landscape card goes on
 * the lowest pair of neighbouring columns where it leaves no hole: either the two columns are level,
 * or the shorter one ends in a one-column card, which then grows to make them level. When no pair
 * qualifies, the next item, if it is a square, is placed first and the landscape tries again; failing
 * that, the landscape is drawn as a square.
 *
 * Pass `final: true` with the last batch of the edition (it may be empty).
 */
export function layoutBatch(
  state: LayoutState,
  items: readonly LayoutItem[],
  measure: MeasureCard,
  options: { final?: boolean } = {},
): LayoutResult {
  if (state.done) throw new Error('This layout was already finished with a final batch.');
  const final = options.final === true;
  const { cols, gap } = state;
  const columns: Column[] = state.columns.map((c) => ({
    bottom: c.bottom,
    tail: c.tail ? { ...c.tail } : null,
  }));

  const queue: Queued[] = state.held.map((h) => ({ ...h }));
  let nextIndex = state.nextIndex;
  for (const item of items) {
    if (item.shape !== 'square' && item.shape !== 'landscape') {
      throw new TypeError(`Unknown card shape for item ${item.id}`);
    }
    queue.push({ id: item.id, shape: item.shape, index: nextIndex });
    nextIndex += 1;
  }

  const placements: Placement[] = [];
  const fresh = new Map<string, Placement>();
  const extended = new Map<string, number>();

  const place = (q: Queued, col: number, span: 1 | 2, top: number): void => {
    const height = measure({ id: q.id, shape: q.shape }, span);
    if (!Number.isFinite(height) || height <= 0) {
      throw new RangeError(`measure must return a height above zero (item ${q.id})`);
    }
    const placed: Placement = {
      id: q.id,
      index: q.index,
      col,
      span,
      top,
      height,
      shape: span === 2 ? 'landscape' : 'square',
      hinted: q.shape,
    };
    placements.push(placed);
    fresh.set(q.id, placed);
    for (let c = col; c < col + span; c += 1) {
      columns[c] = { bottom: top + height + gap, tail: { id: q.id, height, span } };
    }
  };

  const placeSquare = (q: Queued): void => {
    let col = 0;
    for (let c = 1; c < cols; c += 1) {
      if ((columns[c] as Column).bottom < (columns[col] as Column).bottom) col = c;
    }
    place(q, col, 1, (columns[col] as Column).bottom);
  };

  /** The lowest pair of neighbouring columns a landscape card can sit on without a hole, or -1. */
  const widePair = (): number => {
    let best = -1;
    let bestTop = Infinity;
    for (let c = 0; c + 1 < cols; c += 1) {
      const a = columns[c] as Column;
      const b = columns[c + 1] as Column;
      if (a.bottom !== b.bottom) {
        const shorter = a.bottom < b.bottom ? a : b;
        // Only a one-column card can grow to close the gap.
        if (!shorter.tail || shorter.tail.span !== 1) continue;
      }
      const top = Math.max(a.bottom, b.bottom);
      if (top < bestTop) {
        best = c;
        bestTop = top;
      }
    }
    return best;
  };

  const placeWide = (q: Queued, col: number): void => {
    const a = columns[col] as Column;
    const b = columns[col + 1] as Column;
    const top = Math.max(a.bottom, b.bottom);
    if (a.bottom !== b.bottom) {
      const shorter = a.bottom < b.bottom ? a : b;
      const tail = shorter.tail as Tail;
      const height = tail.height + (top - shorter.bottom);
      const placed = fresh.get(tail.id);
      if (placed) placed.height = height;
      else extended.set(tail.id, height);
    }
    place(q, col, 2, top);
  };

  let held: Queued[] = [];
  let i = 0;
  while (i < queue.length) {
    const current = queue[i] as Queued;
    if (current.shape === 'square') {
      placeSquare(current);
      i += 1;
      continue;
    }
    let pair = widePair();
    if (pair !== -1) {
      placeWide(current, pair);
      i += 1;
      continue;
    }
    const next = queue[i + 1];
    if (!next && !final) {
      // The next item is not known yet. Wait for it.
      held = [current];
      break;
    }
    if (next && next.shape === 'square') {
      // The square goes first, then the landscape tries again.
      placeSquare(next);
      pair = widePair();
      if (pair !== -1) placeWide(current, pair);
      else placeSquare(current);
      i += 2;
      continue;
    }
    // Nothing can make room: draw this landscape as a square.
    placeSquare(current);
    i += 1;
  }

  let height = 0;
  for (const column of columns) height = Math.max(height, column.bottom - gap);

  return {
    placements,
    extended: [...extended].map(([id, grown]) => ({ id, height: grown })),
    state: { cols, gap, columns, nextIndex, held, done: final },
    height: Math.max(0, height),
  };
}

/** Lay out a complete edition in one call. */
export function layoutAll(
  items: readonly LayoutItem[],
  cols: number,
  measure: MeasureCard,
  gap: number = CARD_GAP,
): LayoutResult {
  return layoutBatch(createLayout(cols, gap), items, measure, { final: true });
}
