/**
 * The Central feed layout engine.
 *
 * Turns ranked feed items plus a column count into grid placements, following the founder's rule:
 * 2 columns on phones, 4 on desktop; a landscape card spans two columns, a square card one; no holes.
 *
 * Pure and framework-free: no DOM, no measuring, no dependencies. The same input always gives the
 * same output, however the stream is split into batches. Full description with worked examples:
 * docs/central/CENTRAL_FEED_GUIDE.md, section 6.
 *
 * Guarantees (each one is a property test in test/layout.test.ts):
 *   1. every item is placed exactly once (after the final batch);
 *   2. every emitted row is completely full, except possibly the very last row of the edition
 *      (reported as `raggedEnd`);
 *   3. a landscape card is never split across rows;
 *   4. a card's reading position differs from its rank by at most 1;
 *   5. a placement, once emitted, never changes: appending a batch never moves earlier cards;
 *   6. the result does not depend on where the batch boundaries fall.
 */

export type CardShape = 'square' | 'landscape';

/** What the engine needs to know about a feed item. `shape` is a hint: the engine may override it. */
export interface LayoutItem {
  id: string;
  shape: CardShape;
}

export interface Placement {
  id: string;
  /** The item's rank: its position in the whole stream, starting at 0. */
  index: number;
  /** Grid row, starting at 0 and counted across every batch. */
  row: number;
  /** First grid column, starting at 0. */
  col: number;
  /** Columns covered. This, not the item's own shape, decides how the card is drawn. */
  span: 1 | 2;
  /** The shape the card is drawn in (`landscape` when span is 2). */
  shape: CardShape;
  /** The shape the item asked for. Differs from `shape` when the engine changed it to avoid a hole. */
  hinted: CardShape;
}

interface Queued extends LayoutItem {
  index: number;
}

export interface LayoutState {
  readonly cols: number;
  /** The next row to be emitted. */
  readonly nextRow: number;
  /** The rank the next new item will get. */
  readonly nextIndex: number;
  /** Items received but not yet on screen: they do not complete a row yet. At most `cols` of them. */
  readonly held: readonly Queued[];
  /** True once a final batch has been laid out. */
  readonly done: boolean;
}

export interface LayoutResult {
  /** New placements only, in reading order (row by row, left to right). Render them in this order. */
  placements: Placement[];
  /** Pass this to the next call. */
  state: LayoutState;
  /** True only when the last row of the edition could not be filled (see guarantee 2). */
  raggedEnd: boolean;
}

/** The feed is 4 columns wide from this container width (in CSS pixels), otherwise 2. */
export const DESKTOP_MIN_WIDTH = 1000;
export const PHONE_COLUMNS = 2;
export const DESKTOP_COLUMNS = 4;

/** Column count for a feed container of the given width. Measure the container, not the window. */
export function columnsForWidth(containerWidth: number): number {
  return containerWidth >= DESKTOP_MIN_WIDTH ? DESKTOP_COLUMNS : PHONE_COLUMNS;
}

const MAX_COLUMNS = 12;

export function createLayout(cols: number): LayoutState {
  if (!Number.isInteger(cols) || cols < 2 || cols > MAX_COLUMNS) {
    throw new RangeError(`cols must be a whole number from 2 to ${MAX_COLUMNS}`);
  }
  return { cols, nextRow: 0, nextIndex: 0, held: [], done: false };
}

const widthOf = (shape: CardShape): 1 | 2 => (shape === 'landscape' ? 2 : 1);

/**
 * Lay out the next batch of ranked items.
 *
 * Only complete rows are emitted. Items that do not complete a row wait in `state.held` and are
 * placed by the next call. Pass `final: true` with the last batch of the edition (it may be empty)
 * to place whatever is still held.
 */
export function layoutBatch(
  state: LayoutState,
  items: readonly LayoutItem[],
  options: { final?: boolean } = {},
): LayoutResult {
  if (state.done) throw new Error('This layout was already finished with a final batch.');
  const final = options.final === true;
  const { cols } = state;

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
  let row: Placement[] = [];
  let used = 0;
  let nextRow = state.nextRow;
  let rowStart = 0;
  let i = 0;

  const put = (q: Queued, span: 1 | 2): void => {
    row.push({
      id: q.id,
      index: q.index,
      row: nextRow,
      col: used,
      span,
      shape: span === 2 ? 'landscape' : 'square',
      hinted: q.shape,
    });
    used += span;
  };
  const emitRow = (): void => {
    placements.push(...row);
    row = [];
    used = 0;
    nextRow += 1;
  };

  while (i < queue.length) {
    const current = queue[i] as Queued;
    const width = widthOf(current.shape);
    if (used + width <= cols) {
      put(current, width);
      i += 1;
    } else {
      // A landscape card, and exactly one cell is left in this row.
      const next = queue[i + 1];
      if (next && next.shape === 'square') {
        // Swap: the square fills the cell, the landscape opens the next row.
        queue[i] = next;
        queue[i + 1] = current;
        put(next, 1);
        i += 1;
      } else if (next || final) {
        // Nothing can fill the cell: show this landscape as a square.
        put(current, 1);
        i += 1;
      } else {
        // The next item is not known yet. Wait for it.
        break;
      }
    }
    if (used === cols) {
      emitRow();
      rowStart = i;
    }
  }

  let raggedEnd = false;
  let held: Queued[] = [];
  if (!final) {
    held = queue.slice(rowStart);
  } else if (row.length > 0) {
    // Last row of the edition: widen squares from the right until the row is full.
    for (let k = row.length - 1; k >= 0 && used < cols; k -= 1) {
      const placed = row[k] as Placement;
      if (placed.span === 1) {
        placed.span = 2;
        placed.shape = 'landscape';
        used += 1;
      }
    }
    let col = 0;
    for (const placed of row) {
      placed.col = col;
      col += placed.span;
    }
    raggedEnd = used < cols;
    emitRow();
  }

  return {
    placements,
    state: { cols, nextRow, nextIndex, held, done: final },
    raggedEnd,
  };
}

/** Lay out a complete edition in one call. */
export function layoutAll(items: readonly LayoutItem[], cols: number): LayoutResult {
  return layoutBatch(createLayout(cols), items, { final: true });
}
