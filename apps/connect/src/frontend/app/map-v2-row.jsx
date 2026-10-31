// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 sideways row (News and Nearby on the sheet)
//  ------------------------------------------------------------------
//  A list that used to stack downward is one row of cards that scrolls sideways, so a Contributor who posts
//  every day cannot turn the sheet into one endless card. The cards are the ones from map-v2-card.jsx: this
//  file only lays them out, so a new card variant needs nothing here.
//
//  SIZE RULE (mixed portrait and landscape cards): every card in a row has the SAME width, and the row is
//  as tall as its tallest card. The next card always peeks past the edge, so there is no need for an arrow
//  to say "there is more". Widths are tokens (--hrow-card-w, --hrow-peek). A landscape card (a listing, an event)
//  keeps its picture on the left inside that width; a portrait card (text, image, video) keeps it on top.
//
//  CAP AND SEE ALL: at most `max` cards are drawn (the newest ten by default). When more exist, "See all N"
//  turns the row back into the vertical stack, in place, and "Show fewer" returns it. No dialog, no route,
//  no history entry: nothing is lost and the sheet's Back behaviour is untouched. Nothing is ever shown
//  or hidden by popularity; the caller decides the order and this file never reorders.
//
//  ACCESS: the wrapper is a labelled region and the cards stay real buttons in their order, so Tab walks
//  them and the focused card is scrolled whole into view (nothing traps the keyboard; Chrome would leave a card
//  that shows only its edge, so keyboard focus adds a small nudge of its own). Previous and Next
//  are for a mouse and appear only on a fine pointer, only while the row overflows; they use aria-disabled
//  at the ends so focus is never dropped. The glide is smooth unless the person asked for reduced motion.
//
//  TOUCH: a scroller ends the touch-action chain, so the row carries its own value, --mv2-ta-row
//  (assets/map-v2.css), which is the sheet's value plus pan-x. Pure helpers (visibleItems, edgesOf,
//  pageStep, focusShift) are unit-tested in src/__tests__/frontend/mapV2Row.test.tsx.
//  Styles: assets/map-v2.css section 4i (tokens only). Text: MapV2Strings.sheet.row, .news.row, .nearby.row.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;

  const ROW_MAX = 10;                 // cards drawn before "See all"
  const EDGE_PX = 1;                  // a scroll offset can be fractional on a dense screen
  const FINE_MQ = '(pointer: fine)';
  const REDUCED_MQ = '(prefers-reduced-motion: reduce)';

  const rowStrings = () => (window.MapV2Strings && window.MapV2Strings.sheet && window.MapV2Strings.sheet.row) || {};
  const matches = (query) => !!(window.matchMedia && window.matchMedia(query).matches);

  /** What is drawn: the first `max` items, or all of them once "See all" is pressed. The order is the caller's. */
  function visibleItems(items, max, expanded) {
    const list = Array.isArray(items) ? items : [];
    const cap = max === Infinity || (Number.isFinite(max) && max > 0) ? Math.floor(max) : ROW_MAX;
    return expanded || list.length <= cap ? list : list.slice(0, cap);
  }

  /** Where the row sits: `scrollable` when it overflows at all, `start` / `end` when it cannot go further that way. */
  function edgesOf(scrollLeft, clientWidth, scrollWidth) {
    const room = (Number(scrollWidth) || 0) - (Number(clientWidth) || 0);
    const at = Math.abs(Number(scrollLeft) || 0);
    const scrollable = room > EDGE_PX;
    return { scrollable, start: !scrollable || at <= EDGE_PX, end: !scrollable || at >= room - EDGE_PX };
  }

  /** How far one press of Previous / Next moves: a whole number of cards, never fewer than one. */
  function pageStep(cardStep, viewWidth) {
    const view = Number(viewWidth) || 0;
    if (!(cardStep > 0)) return view;
    return cardStep * Math.max(1, Math.floor((view + EDGE_PX) / cardStep));
  }

  /**
   * How far to scroll so a focused card is whole: 0 when it already is, else the move that puts its start on the
   * row's gutter (its snap position). Chrome counts a card that shows only its edge as visible and leaves it, so
   * Tab would land on a card that is mostly cut off by the screen.
   */
  function focusShift(rowLeft, rowRight, cardLeft, cardRight, gutter) {
    if (cardLeft >= rowLeft && cardRight <= rowRight) return 0;
    return cardLeft - (rowLeft + (Number(gutter) || 0));
  }

  /** True only for focus a keyboard put there: a tap or a click on a peeking card must not move the row under the finger. */
  function byKeyboard(el) {
    try { return !!el.matches(':focus-visible'); } catch { return false; }
  }

  function useMedia(query) {
    const [on, setOn] = useState(() => matches(query));
    useEffect(() => {
      if (!window.matchMedia) return undefined;
      const mq = window.matchMedia(query);
      const update = () => setOn(mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }, [query]);
    return on;
  }

  const SAME = { scrollable: false, start: true, end: true };

  /**
   * props: items (the whole list, in the order to show), render(item, index) -> a card, keyOf(item) -> a stable key,
   * strings ({ label, count(shown, total), all(total), seeAll(total), showFewer }), idPrefix, max (default ROW_MAX).
   */
  function Row(props) {
    const items = Array.isArray(props.items) ? props.items : [];
    const str = props.strings || {};
    const words = rowStrings();
    // A list with no "See all" words (Nearby) is never cut: it shows every card it was given.
    const cap = typeof str.seeAll === 'function' ? props.max || ROW_MAX : Infinity;
    const total = items.length;
    const hidden = total > cap;
    const [expanded, setExpanded] = useState(false);
    // The list shrank back under the cap (a post was taken down) while it was open: close it, so it is a row if it grows again.
    useEffect(() => { if (!hidden && expanded) setExpanded(false); }, [hidden, expanded]);
    const [edges, setEdges] = useState(SAME);
    const fine = useMedia(FINE_MQ);
    const list = useRef(null);
    const last = useRef(SAME);
    const stack = expanded && hidden;
    const shown = visibleItems(items, cap, stack);
    const listId = (props.idPrefix || 'mv2-row') + '-list';
    const Icon = window.Icon;

    // Keep the arrows honest: set by the scroll position, not on every scroll event (a render only when an edge is crossed).
    useEffect(() => {
      const el = list.current;
      if (!el || stack) { last.current = SAME; setEdges(SAME); return undefined; }
      const sync = () => {
        const e = edgesOf(el.scrollLeft, el.clientWidth, el.scrollWidth);
        const p = last.current;
        if (p.scrollable === e.scrollable && p.start === e.start && p.end === e.end) return;
        last.current = e;
        setEdges(e);
      };
      sync();
      el.addEventListener('scroll', sync, { passive: true });
      let watch = null;
      if (typeof ResizeObserver === 'function') { watch = new ResizeObserver(sync); watch.observe(el); }
      else window.addEventListener('resize', sync);
      return () => {
        el.removeEventListener('scroll', sync);
        if (watch) watch.disconnect(); else window.removeEventListener('resize', sync);
      };
    }, [stack, shown.length]);

    // Back to a row: start at the first card again.
    useEffect(() => { if (!stack && list.current) list.current.scrollLeft = 0; }, [stack]);

    const move = (dir) => {
      const el = list.current;
      if (!el) return;
      const cards = el.children;
      const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth;
      const dx = dir * pageStep(step, el.clientWidth);
      if (typeof el.scrollBy === 'function') el.scrollBy({ left: dx, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
      else el.scrollLeft += dx;
    };

    // Tab onto a card that only shows its edge: bring it whole into view (instantly: it is the keyboard, not an animation).
    const onFocus = (e) => {
      const el = list.current;
      const li = e.target && e.target.closest ? e.target.closest('li') : null;
      if (!el || !li || stack || !byKeyboard(e.target)) return;
      const box = el.getBoundingClientRect();
      const at = li.getBoundingClientRect();
      const gutter = parseFloat(window.getComputedStyle(el).paddingLeft);
      const dx = focusShift(box.left, box.right, at.left, at.right, gutter);
      if (dx) el.scrollLeft += dx;
    };

    const arrows = fine && !stack && edges.scrollable;
    const arrow = (dir, atEdge, label, name) => h('button', {
      type: 'button', 'data-mv2': 'hrow-btn', 'aria-label': label, 'aria-controls': listId,
      'aria-disabled': atEdge ? 'true' : undefined,
      onClick: () => { if (!atEdge) move(dir); },
    }, Icon ? h(Icon, { name: name, size: 20 }) : null);

    const head = (hidden || arrows) && h('div', { 'data-mv2': 'hrow-head' },
      hidden && h('p', { 'data-mv2': 'hrow-count' }, stack ? str.all(total) : str.count(shown.length, total)),
      arrows && h('div', { 'data-mv2': 'hrow-nav' },
        arrow(-1, edges.start, words.prev, 'ChevronLeft'),
        arrow(1, edges.end, words.next, 'ChevronRight')),
      hidden && h('button', {
        type: 'button', 'data-mv2': 'hrow-all', 'aria-expanded': stack, 'aria-controls': listId,
        onClick: () => setExpanded((v) => !v),
      }, stack ? str.showFewer : str.seeAll(total)));

    return h('div', {
      'data-mv2': 'hrow', role: 'region', 'aria-label': str.label,
    },
      head,
      h('ul', { id: listId, ref: list, 'data-mv2': 'list', 'data-layout': stack ? 'stack' : 'row', role: 'list', onFocus },
        shown.map((item, i) => h('li', { key: props.keyOf ? props.keyOf(item, i) : i, 'data-mv2': 'hrow-item' }, props.render(item, i)))));
  }

  window.MapV2Row = { ROW_MAX, visibleItems, edgesOf, pageStep, focusShift, Row };
})();
