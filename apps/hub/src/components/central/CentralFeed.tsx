/**
 * The Central feed on screen: today's finite edition in staggered columns (2 on phones, 4 from a 1000px-wide feed).
 * Guide: docs/central/CENTRAL_FEED_GUIDE.md, sections 6.5 (how the layout maps to the page) and 7 (the look).
 * The approach is the reference page's (docs/central/reference/central-reference.template.html):
 *
 *   1. every card that is not placed yet is drawn out of sight at the width it may take (one column, and two for a
 *      landscape hint) and its height is read;
 *   2. `layoutBatch` gets only the NEW items and the kept state, and returns where each card goes;
 *   3. cards are positioned absolutely; a card placed earlier never moves, only the heights in `extended` grow;
 *   4. when the feed's width changes, the layout starts again from empty with everything received so far.
 *
 * Guardrails (guide section 1): the feed is finite and stops for good at `caughtUp` (no load-more button, no loop,
 * no retry); nothing is counted, badged, autoplayed or stored about the reader; no location is sent.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  CARD_GAP,
  cardLeft,
  cardWidth,
  columnWidth,
  columnsForWidth,
  createLayout,
  layoutBatch,
} from '@citizens/central/layout';
import type { LayoutState } from '@citizens/central/layout';
import type { CentralApp, FeedItem } from '@citizens/central/contract';
import { fetchApps, fetchFeedPage } from './feedApi';
import { FeedCard } from './FeedCard';

/** The quiet lines under the feed (guide section 7.6). */
export const FEED_LINES = {
  more: 'More is arriving…',
  caughtUp: 'You’re all caught up',
  empty: 'Nothing to show here yet.',
} as const;

/** How far below the screen the next page starts loading, so it is usually there before the reader is. */
const PRELOAD_MARGIN = '600px 0px';

/** loading: a page is on its way. idle: more pages exist. done: caught up. failed: a read failed; nothing more. */
type Phase = 'loading' | 'idle' | 'done' | 'failed';

interface Geometry {
  width: number;
  cols: number;
  colWidth: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  span: 1 | 2;
}

/** Placements belong to one feed width; a different width makes them void. */
interface Placed {
  width: number;
  boxes: ReadonlyMap<string, Box>;
}

const NONE: ReadonlyMap<string, Box> = new Map();
const measureKey = (id: string, span: 1 | 2) => `${span}|${id}`;

export interface CentralFeedProps {
  /** For tests. The page uses the browser's own `fetch`. */
  fetchImpl?: typeof fetch;
}

export function CentralFeed({ fetchImpl }: CentralFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);

  const [apps, setApps] = useState<ReadonlyMap<string, CentralApp> | null>(null);
  const [items, setItems] = useState<readonly FeedItem[]>([]);
  const [encouragement, setEncouragement] = useState<FeedItem | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [placed, setPlaced] = useState<Placed>({ width: -1, boxes: NONE });
  const [feedHeight, setFeedHeight] = useState(0);

  const cursor = useRef<string | null>(null);
  const busy = useRef(false);
  const aborter = useRef<AbortController | null>(null);
  /** The engine's state and how many of `items` it has been given, for the current width. */
  const engine = useRef<{ width: number; state: LayoutState; fed: number } | null>(null);

  // Stable across renders: the first-page effect depends on it, and a new function each render would refetch forever.
  const doFetch = useMemo(
    () => fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined),
    [fetchImpl],
  );

  /** Add a page's cards, skipping any id already on screen (a repeated id would break the layout's bookkeeping). */
  const receive = useCallback(
    (page: { items: FeedItem[]; nextCursor: string | null; caughtUp: boolean }) => {
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const fresh = page.items.filter((item) => !seen.has(item.id) && seen.add(item.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      cursor.current = page.nextCursor;
      setPhase(page.caughtUp ? 'done' : 'idle');
    },
    [],
  );

  // First page and the app registry, together: a kicker's app name changes a card's height, so cards are measured
  // only once the registry has answered (or failed, which leaves the kickers without app names).
  useEffect(() => {
    if (!doFetch) {
      setApps(new Map());
      setPhase('failed');
      return;
    }
    const controller = new AbortController();
    aborter.current = controller;
    busy.current = true;
    Promise.all([
      fetchApps(doFetch, controller.signal),
      fetchFeedPage(null, doFetch, controller.signal),
    ])
      .then(([registry, page]) => {
        setApps(registry);
        setEncouragement(page.encouragement);
        receive(page);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setApps((prev) => prev ?? new Map());
        setPhase('failed');
      })
      .finally(() => {
        if (aborter.current === controller) busy.current = false;
      });
    return () => controller.abort();
  }, [doFetch, receive]);

  const loadNext = useCallback(() => {
    if (busy.current || !doFetch || !cursor.current) return;
    const controller = aborter.current;
    busy.current = true;
    setPhase('loading');
    fetchFeedPage(cursor.current, doFetch, controller?.signal)
      .then(receive)
      .catch(() => {
        if (!controller?.signal.aborted) setPhase('failed');
      })
      .finally(() => {
        busy.current = false;
      });
  }, [doFetch, receive]);

  // Columns follow the feed container's width (not the window's).
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const read = () => {
      const width = feed.clientWidth;
      if (width <= 0) return;
      setGeometry((prev) => {
        if (prev && prev.width === width) return prev;
        const cols = columnsForWidth(width);
        return { width, cols, colWidth: columnWidth(width, cols, CARD_GAP) };
      });
    };
    read();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(read);
    observer.observe(feed);
    return () => observer.disconnect();
  }, []);

  // The next page loads when the line under the feed comes near the screen. It stops at `caughtUp` or a failure.
  useEffect(() => {
    const line = lineRef.current;
    if (phase !== 'idle' || !line || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(line);
    return () => observer.disconnect();
  }, [phase, loadNext]);

  const final = phase === 'done' || phase === 'failed';

  // Lay out whatever is new, after the measuring copies are in the page and before the browser paints.
  useLayoutEffect(() => {
    if (!geometry || !apps || !measureRef.current) return;
    let run = engine.current;
    if (!run || run.width !== geometry.width) {
      run = { width: geometry.width, state: createLayout(geometry.cols, CARD_GAP), fed: 0 };
      engine.current = run;
    }
    const batch = items.slice(run.fed);
    // Nothing new, unless the edition just ended while a landscape card was waiting for its neighbour.
    const flush = final && run.state.held.length > 0;
    if (run.state.done || (!batch.length && !flush)) return;

    const heights = new Map<string, number>();
    for (const node of Array.from(measureRef.current.children)) {
      const key = (node as HTMLElement).dataset.measure;
      if (key) heights.set(key, node.getBoundingClientRect().height);
    }
    const measure = (item: { id: string }, span: 1 | 2) =>
      heights.get(measureKey(item.id, span)) ?? 0;
    // A card with no height means the feed is not really on screen (hidden, or not laid out yet): wait for the next
    // width change rather than hand the engine a zero.
    for (const item of [...run.state.held, ...batch]) {
      if (!(measure(item, 1) > 0) || (item.shape === 'landscape' && !(measure(item, 2) > 0)))
        return;
    }

    const { colWidth } = geometry;
    const result = layoutBatch(run.state, batch, measure, { final });
    run.state = result.state;
    run.fed = items.length;

    setPlaced((prev) => {
      const boxes = new Map(prev.width === geometry.width ? prev.boxes : NONE);
      for (const p of result.placements) {
        boxes.set(p.id, {
          left: cardLeft(p.col, colWidth, CARD_GAP),
          top: p.top,
          width: cardWidth(colWidth, p.span, CARD_GAP),
          height: p.height,
          span: p.span,
        });
      }
      // A card placed earlier may grow to close the gap under a landscape card. It never moves.
      for (const grown of result.extended) {
        const box = boxes.get(grown.id);
        if (box) boxes.set(grown.id, { ...box, height: grown.height });
      }
      return { width: geometry.width, boxes };
    });
    setFeedHeight(result.height);
  }, [items, geometry, apps, final]);

  const boxes = geometry && placed.width === geometry.width ? placed.boxes : NONE;
  const registry = apps ?? NONE_APPS;
  // Cards still to be measured (including a landscape the engine is holding for the next item).
  const unplaced = geometry && apps ? items.filter((item) => !boxes.has(item.id)) : [];

  let line: string | null = FEED_LINES.more;
  if (phase === 'done') line = items.length ? FEED_LINES.caughtUp : FEED_LINES.empty;
  else if (phase === 'failed') line = items.length ? null : FEED_LINES.empty;

  return (
    <>
      {encouragement ? (
        <div className="lead2">
          <div className="enc">
            <span className="kicker">{encouragement.kicker}</span>
            <p>{`“${encouragement.title}”`}</p>
            {encouragement.summary ? <small>{encouragement.summary}</small> : null}
          </div>
        </div>
      ) : null}
      <div
        className="feed"
        ref={feedRef}
        style={feedHeight ? { height: `${feedHeight}px` } : undefined}
        aria-busy={phase === 'loading' || unplaced.length > 0}
      >
        {items.map((item) => {
          const box = boxes.get(item.id);
          if (!box) return null;
          const style: CSSProperties = {
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
          };
          return (
            <FeedCard
              key={item.id}
              item={item}
              app={registry.get(item.app)}
              span={box.span}
              style={style}
              width={box.width}
            />
          );
        })}
        <div className="fc-measure" ref={measureRef} aria-hidden="true" inert>
          {geometry
            ? unplaced.flatMap((item) => {
                const spans: Array<1 | 2> = item.shape === 'landscape' ? [1, 2] : [1];
                return spans.map((span) => (
                  <FeedCard
                    key={measureKey(item.id, span)}
                    item={item}
                    app={registry.get(item.app)}
                    span={span}
                    measureKey={measureKey(item.id, span)}
                    style={{ width: `${cardWidth(geometry.colWidth, span, CARD_GAP)}px` }}
                    width={cardWidth(geometry.colWidth, span, CARD_GAP)}
                  />
                ));
              })
            : null}
        </div>
      </div>
      <p className="more" ref={lineRef} role="status">
        {line}
      </p>
    </>
  );
}

const NONE_APPS: ReadonlyMap<string, CentralApp> = new Map();
