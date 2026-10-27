// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 category pills and the Explore row (issue #210)
//  ------------------------------------------------------------------
//  GROUPS: one muted colour per group of categories (founder, 2026-10-26). Every event category, place
//  category and Contributor type belongs to exactly one group (a unit test reads data.jsx and checks it).
//  The colour is a token, --cat-<group> (assets/map-v2.css), never a value in this file. Gold stays the
//  brand and the selection colour. The words carry the meaning; the colour only helps the eye.
//
//  PILLS: one sideways row (All, the groups, Events, Ideas). The selected pill is a gold fill. A pill filters
//  by a test per marker, which the map uses to dim the rest; "Events" is a type, not a group.
//
//  EXPLORE ROW: the listings near the person (or near the middle of the map before we know where they are),
//  closest first, as large cards on the shared sideways row (map-v2-row.jsx, map-v2-card.jsx). Tapping a pin
//  scrolls the row to that card and outlines it in gold; tapping a card opens the listing sheet. The home
//  screen shows the row OR the sheet, never both. The row ranks again only when the map settles (moveend),
//  never per frame, and holds its own state, so a pan never re-renders the map screen. "See all" opens the
//  Discover page (map-v2-discover.jsx), which draws the SAME card (cardFor) and measures from lastView().
//
//  Pure helpers (groupOf, pillMatches, rank, PILLS) are unit-tested in mapV2Explore.test.tsx.
//  Styles: assets/map-v2.css sections 4j and 4k (tokens only). Text: MapV2Strings.explore.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo } = React;

  const ROW_CAP = 20;                // cards in the row: the nearest twenty (plus the selected one, wherever it is)
  const SETTLE_MS = 150;             // rank again only once the map has been still this long (a programmatic pan ends a move every frame)
  const REDUCED_MQ = '(prefers-reduced-motion: reduce)';
  const NARROW_MQ = '(max-width: 767px)';
  const S = () => (window.MapV2Strings && window.MapV2Strings.explore) || {};
  const matches = (q) => !!(window.matchMedia && window.matchMedia(q).matches);

  // Category id -> group. Event categories follow their own `group` (data.jsx); places and Contributor
  // types are placed by meaning. The founder reviews this list in the PR.
  const GROUP_OF = {
    'worship-prayer': 'worship', 'church-services': 'worship', 'conferences-summits': 'worship', 'churches-ministries': 'worship',
    'outreach-missions': 'serve', 'community-upliftment': 'serve', 'care-recovery': 'serve', 'health-wellness': 'serve',
    'safe-spaces': 'serve', 'retreat-healing': 'serve', clinic: 'serve', 'rehab-development': 'serve',
    'markets-expos': 'culture', 'sport-recreation': 'culture', 'arts-culture': 'culture', 'social-gatherings': 'culture',
    'recreation-sport': 'culture', 'arts-creative': 'culture', 'media-broadcasting': 'culture',
    'education-equipping': 'learn', 'marriage-family': 'learn', 'education-training': 'learn',
    'mens-community': 'audiences', 'womens-community': 'audiences', 'youth-students': 'audiences', kids: 'audiences',
    'members-only': 'audiences',
    'hospitality-cafes': 'business', 'retail-shopping': 'business', 'christian-businesses': 'business',
  };
  const GROUPS = ['worship', 'serve', 'culture', 'learn', 'audiences', 'business'];

  // The pill row, in order. `group` pills carry their colour dot; Events and Ideas carry an icon instead.
  const PILLS = [
    { id: 'all' },
    { id: 'worship', group: true },
    { id: 'events', icon: 'CalendarDays' },
    { id: 'business', group: true },
    { id: 'serve', group: true },
    { id: 'culture', group: true },
    { id: 'learn', group: true },
    { id: 'audiences', group: true },
  ];

  /** The group a marker or listing belongs to, or '' when its category is unknown. */
  function groupOf(item) {
    return (item && Object.prototype.hasOwnProperty.call(GROUP_OF, item.category) && GROUP_OF[item.category]) || '';
  }

  /** Does a marker pass the chosen pill? 'all' (or nothing) passes everything. */
  function pillMatches(pill, m) {
    if (!pill || pill === 'all') return true;
    if (!m) return false;
    if (pill === 'events') return m.type === 'event';
    return groupOf(m) === pill;
  }

  /**
   * The Explore row's order: listings with a position, nearest to `origin` first (then by name), at most `cap`.
   * The selected listing is always included: when it is further than the cap it is added at the END, so the cards
   * already in the row never move (no reorder, no layout shift under the person's thumb).
   * Returns [{ m, meters }]. Ideas are not listings and never appear.
   */
  function rank(origin, markers, selectedId, cap) {
    const near = window.MapV2Nearby;
    const max = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : ROW_CAP;
    const list = (Array.isArray(markers) ? markers : [])
      .filter((m) => m && m.type !== 'idea' && typeof m.lat === 'number' && typeof m.lng === 'number')
      .map((m) => ({ m: m, meters: origin && near ? near.metersBetween(origin, m) : NaN }));
    list.sort((a, b) => {
      const da = Number.isFinite(a.meters) ? a.meters : Infinity;
      const db = Number.isFinite(b.meters) ? b.meters : Infinity;
      if (da !== db) return da - db;
      return String(a.m.title || '').localeCompare(String(b.m.title || ''));
    });
    if (list.length <= max) return list;
    const head = list.slice(0, max);
    if (selectedId && !head.some((r) => r.m.id === selectedId)) {
      const sel = list.find((r) => r.m.id === selectedId);
      if (sel) head.push(sel);
    }
    return head;
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

  /**
   * The pill row. props: value (pill id), onChange(id), label (defaults to the map's), and ideas (bool) + onIdeas():
   * the Ideas pill is drawn only with onIdeas (the Discover page lists listings, and Ideas are not listings).
   */
  function Pills(props) {
    const words = S().groups || {};
    const Icon = window.Icon;
    const pill = (id, selected, onClick, lead) => h('button', {
      key: id, type: 'button', 'data-mv2': 'pill', 'data-pill': id, 'aria-pressed': selected ? 'true' : 'false', onClick: onClick,
    }, lead, h('span', null, words[id]));
    return h('div', { 'data-mv2': 'pills', role: 'group', 'aria-label': props.label || S().pillsLabel },
      PILLS.map((p) => pill(p.id, (props.value || 'all') === p.id, () => props.onChange(p.id),
        p.group ? h('span', { 'data-mv2': 'pill-dot', 'data-cat': p.id, 'aria-hidden': 'true' })
          : (p.icon && Icon ? h(Icon, { name: p.icon, size: 16 }) : null))),
      props.onIdeas ? pill('ideas', !!props.ideas, props.onIdeas, Icon ? h(Icon, { name: 'Lightbulb', size: 16 }) : null) : null);
  }

  /** Full records by 'type:id': covers and names live there; the map's markers carry only what a pin needs. */
  function indexSources(src) {
    const map = new Map();
    const s = src || {};
    (s.contributors || []).forEach((r) => map.set('contributor:' + r.id, r));
    (s.places || []).forEach((r) => map.set('place:' + r.id, r));
    (s.events || []).forEach((r) => map.set('event:' + r.id, r));
    return map;
  }

  /**
   * ONE large Explore card, shared by the Explore row and the Discover page (map-v2-discover.jsx): the cover (or a
   * neutral tile with the category icon), the category chip in its group colour, the title and the distance in km.
   * opts: m (marker), meters, rec (full record), idPrefix (unique per row: one listing can sit in several rows),
   * words (distance words), selected + badge (the map's gold outline and its word), onOpen(id, type).
   */
  function cardFor(opts) {
    const Card = window.MapV2Card;
    const near = window.MapV2Nearby;
    const m = opts.m;
    const rec = opts.rec || {};
    const cat = window.DATA && window.DATA.getItemCategory ? window.DATA.getItemCategory(m) : null;
    const group = groupOf(m);
    const cover = rec.coverPhoto || '';
    return h('div', { 'data-mv2': 'explore-card', 'data-explore-id': m.id, 'data-selected': opts.selected ? '' : undefined },
      // "Selected" in words (never the outline alone), laid OVER the picture so the card never changes size
      opts.selected ? h('span', { 'data-mv2': 'explore-badge', 'aria-hidden': 'true' }, opts.badge) : null,
      h(Card, {
        variant: 'image', idPrefix: opts.idPrefix, title: m.title,
        media: cover ? { src: cover } : null,
        tile: { icon: (cat && cat.icon) || 'MapPin' },
        category: cat ? { name: cat.name } : null, kind: m.kind, cat: group || undefined,
        meta: [Number.isFinite(opts.meters) && near ? near.distanceText(opts.meters, opts.words) : ''],
        'aria-current': opts.selected ? 'true' : undefined,
        onClick: () => opts.onOpen(m.id, m.type),
      }));
  }

  // Where the Explore row last looked ({ centre, user }), so the Discover page can measure from the same place.
  let lastView = { centre: null, user: null };

  /**
   * The Explore row. props: markers (what the map draws), sources ({ events, places, contributors }),
   * apiRef (the map's), selectedId, focusCard (the keyboard chose the pin), tap (counts pin taps), hidden (the sheet is open),
   * onOpen(id, type), onSeeAll(), onHeight(px).
   */
  function Explore(props) {
    const api = props.apiRef;
    const [view, setView] = useState(() => (api && api.current ? api.current.view() : { centre: null, user: null }));
    const root = useRef(null);
    const str = S();
    const Card = window.MapV2Card;
    const Row = window.MapV2Row && window.MapV2Row.Row;

    // Rank again when the map settles or the person's position arrives: one state update per settle, never per frame.
    // A burst of moves (an eased pan ends a move on every frame) is one update, SETTLE_MS after the last.
    useEffect(() => {
      if (!api || !api.current || !api.current.onView) return undefined;
      let timer = null;
      const read = () => {
        const v = api.current ? api.current.view() : null;
        if (!v) return;
        lastView = v;
        setView((p) => {
          const same = (a, b) => (a === b) || (a && b && a.lat === b.lat && a.lng === b.lng);
          return same(p.centre, v.centre) && same(p.user, v.user) ? p : v;
        });
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(read, SETTLE_MS); };
      read();
      const off = api.current.onView(later);
      return () => { clearTimeout(timer); off(); };
    }, [api]);

    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);

    const origin = view.user || view.centre;
    const rows = useMemo(() => rank(origin, props.markers, props.selectedId, ROW_CAP),
      [origin, props.markers, props.selectedId]);

    // Tell the screen how tall the row is, so the map's own controls and credit sit above it.
    useEffect(() => {
      const el = root.current;
      if (!el || !props.onHeight) return undefined;
      // hidden under the sheet it measures 0: keep the last height, so the map's controls do not jump as the sheet opens
      const tell = () => { if (!el.hidden) props.onHeight(el.offsetHeight); };
      tell();
      let ro = null;
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(tell); ro.observe(el); }
      return () => { if (ro) ro.disconnect(); props.onHeight(0); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A new ranking starts again at the nearest card (a scroll, never a layout shift). Runs before the pin's own scroll below.
    const rankKey = rows.map((r) => r.m.id).join('|');
    useEffect(() => {
      const list = root.current && root.current.querySelector("[data-mv2='list']");
      if (list) list.scrollLeft = 0;
    }, [rankKey]);

    // A pin was tapped: bring its card to the row's start (a glide, unless reduced motion), without moving focus
    // unless the keyboard chose the pin.
    useEffect(() => {
      const el = root.current;
      if (!el || !props.selectedId) return;
      const card = el.querySelector('[data-explore-id="' + cssId(props.selectedId) + '"]');
      const list = el.querySelector("[data-mv2='list']");
      if (!card || !list) return;
      const li = card.closest('li') || card;
      const gutter = parseFloat(window.getComputedStyle(list).paddingLeft) || 0;
      const left = li.offsetLeft - list.offsetLeft - gutter;
      if (typeof list.scrollTo === 'function') list.scrollTo({ left: left, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
      else list.scrollLeft = left;
      if (props.focusCard) {
        const btn = card.querySelector('button, a');
        if (btn) btn.focus({ preventScroll: true });
      }
    }, [props.selectedId, props.focusCard, props.tap, rankKey]);

    const distWords = view.user ? str : (str.centre || {});
    const render = ({ m, meters }) => cardFor({
      m: m, meters: meters, rec: byKey.get(m.type + ':' + m.id), idPrefix: 'mv2-x-' + m.id, words: distWords,
      selected: props.selectedId === m.id, badge: str.selectedBadge, onOpen: props.onOpen,
    });

    return h('section', {
      ref: root, 'data-mv2': 'explore', 'aria-labelledby': 'mv2-explore-title', hidden: props.hidden || undefined,
    },
      h('div', { 'data-mv2': 'explore-head' },
        h('h2', { id: 'mv2-explore-title', 'data-mv2': 'explore-title' }, str.title),
        h('button', { type: 'button', 'data-mv2': 'explore-all', 'aria-label': str.seeAllLabel, onClick: props.onSeeAll }, str.seeAll)),
      rows.length && Row && Card
        ? h(Row, {
          // Keyed by SLOT, not by listing: a new ranking (the map moved, a pill changed) refills the same card boxes in
          // place, so no card ever slides into a new position under the person's eyes (a layout shift).
          items: rows, keyOf: (r, i) => 'slot' + i, idPrefix: 'mv2-explore', render: render,
          strings: { label: view.user ? str.label : str.labelCentre },
        })
        : h('p', { 'data-mv2': 'explore-empty' }, str.empty));
  }

  // An id inside an attribute selector: listing ids are uuids or slugs, but never trust that.
  function cssId(id) {
    const s = String(id);
    return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  /** True on a phone-width screen, where the folding nav sits at the foot (the home screen clears room for it). */
  const useNarrow = () => useMedia(NARROW_MQ);

  window.MapV2Explore = {
    ROW_CAP, SETTLE_MS, GROUPS, GROUP_OF, PILLS, groupOf, pillMatches, rank, useNarrow, indexSources, cardFor, Pills, Explore,
    lastView: () => lastView,
  };
})();
