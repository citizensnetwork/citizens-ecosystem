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
//  EXPLORE PANEL: the listings near the person (or near the middle of the map before we know where they are),
//  closest first, as cards on the shared sideways row (map-v2-row.jsx, map-v2-card.jsx). Tapping a pin scrolls
//  the row to that card and outlines it in gold. Tapping a card does the same without moving the row: it is
//  chosen, the map eases to its pin, and the SECOND tap on the chosen card opens the full listing (home.jsx).
//  The panel also holds the category choice (founder, 2026-10-30): its title is a switch between the cards and a
//  compact list of the groups, and a handle lowers it to a title strip so the map's own buttons come back.
//  The home screen shows the panel OR the full listing, never both. The row ranks again only when the map settles (moveend),
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
   * The category list inside the Explore panel (founder, 2026-10-30): compact rows, in the pill row's own order
   * (All, the six groups, Events), then Ideas. A group row says its colour with the same dot the cards carry. Choosing
   * one sends the panel back to its cards, filtered; Ideas is a switch beside them, so it leaves the list open.
   * A check mark says which rows are on (never the colour alone).
   * props: value (pill id), ideas (bool), onPick(id), onIdeas()
   */
  function Categories(props) {
    const words = S().groups || {};
    const Icon = window.Icon;
    const row = (id, on, click, lead) => h('li', { key: id, 'data-mv2': 'cat-item' },
      h('button', { type: 'button', 'data-mv2': 'cat', 'data-cat-id': id, 'aria-pressed': on ? 'true' : 'false', onClick: click },
        lead,
        h('span', { 'data-mv2': 'cat-name' }, words[id]),
        on && Icon ? h(Icon, { name: 'Check', size: 16 }) : null));
    const lead = (p) => (p.group ? h('span', { 'data-mv2': 'pill-dot', 'data-cat': p.id, 'aria-hidden': 'true' })
      : Icon ? h(Icon, { name: p.icon || 'LayoutGrid', size: 16 }) : null);
    return h('ul', { 'data-mv2': 'cats', role: 'list', 'aria-label': S().categoriesLabel },
      PILLS.map((p) => row(p.id, (props.value || 'all') === p.id, () => props.onPick(p.id), lead(p))),
      row('ideas', !!props.ideas, props.onIdeas, Icon ? h(Icon, { name: 'Lightbulb', size: 16 }) : null));
  }

  /**
   * The Explore panel. props: markers (what the map draws), sources ({ events, places, contributors }),
   * apiRef (the map's), selectedId (the chosen listing), reveal ({ id, focus }: a PIN was tapped, so bring its card into
   * view; a card tap sends none, and the row stays exactly where it is), hidden (the full listing is open),
   * pill + onPill(id) + ideas + onIdeas() (the category choice, which lives in this panel), min + onMin(bool) (the panel
   * is lowered to its title strip, so the map's own buttons come back), onOpen(id, type) (a card was tapped),
   * onSeeAll(), onHeight(px).
   *
   * While a listing is chosen the ranking is FROZEN: the map moves to the pin, and the cards must not reshuffle under
   * the thumb. The panel ranks again the moment nothing is chosen.
   */
  function Explore(props) {
    const api = props.apiRef;
    const [view, setView] = useState(() => (api && api.current ? api.current.view() : { centre: null, user: null }));
    const [mode, setMode] = useState('cards');      // 'cards' | 'cats' (the category list)
    const root = useRef(null);
    const switchBtn = useRef(null);
    const views = useRef({});
    const readView = useRef(null);
    const viewed = useRef(!!(view.centre || view.user));   // the map has told us where it is at least once
    const chosen = useRef(props.selectedId);
    chosen.current = props.selectedId;
    const grab = useRef(null);
    const str = S();
    const Card = window.MapV2Card;
    const Row = window.MapV2Row && window.MapV2Row.Row;
    const Icon = window.Icon;

    // Rank again when the map settles or the person's position arrives: one state update per settle, never per frame.
    // A burst of moves (an eased pan ends a move on every frame) is one update, SETTLE_MS after the last.
    useEffect(() => {
      if (!api || !api.current || !api.current.onView) return undefined;
      let timer = null;
      const read = () => {
        const v = api.current ? api.current.view() : null;
        if (!v) return;
        lastView = v;
        // The hold starts only once the panel knows where the map is: a pin tapped before the first reading must not leave
        // every card without its distance until the choice is cleared.
        if (chosen.current && viewed.current) return;
        if (v.centre || v.user) viewed.current = true;
        setView((p) => {
          const same = (a, b) => (a === b) || (a && b && a.lat === b.lat && a.lng === b.lng);
          return same(p.centre, v.centre) && same(p.user, v.user) ? p : v;
        });
      };
      readView.current = read;
      const later = () => { clearTimeout(timer); timer = setTimeout(read, SETTLE_MS); };
      read();
      const off = api.current.onView(later);
      return () => { clearTimeout(timer); readView.current = null; off(); };
    }, [api]);
    useEffect(() => { if (!props.selectedId && readView.current) readView.current(); }, [props.selectedId]);

    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);

    const origin = view.user || view.centre;
    const rows = useMemo(() => rank(origin, props.markers, props.selectedId, ROW_CAP),
      [origin, props.markers, props.selectedId]);

    // Tell the screen how tall the panel is, so the map's own controls and credit sit above it.
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

    // The view that is not shown cannot be focused or read: `inert`, set by hand (a prop would be read differently by React 18, which the
    // page loads, and 19, which the unit tests do)
    useEffect(() => {
      const on = mode === 'cats';
      const v = views.current;
      if (v.cards) { if (on) v.cards.setAttribute('inert', ''); else v.cards.removeAttribute('inert'); }
      if (v.cats) { if (on) v.cats.removeAttribute('inert'); else v.cats.setAttribute('inert', ''); }
    }, [mode]);

    // Lowered: the category list has nowhere to show, so the panel comes back to its cards.
    useEffect(() => { if (props.min) setMode('cards'); }, [props.min]);

    // A new ranking starts again at the nearest card (a scroll, never a layout shift). Runs before the pin's own scroll below.
    const rankKey = rows.map((r) => r.m.id).join('|');
    useEffect(() => {
      const list = root.current && root.current.querySelector("[data-mv2='list']");
      if (list) list.scrollLeft = 0;
    }, [rankKey]);

    // A PIN was tapped: bring its card to the row's start (a glide, unless reduced motion), without moving focus
    // unless the keyboard chose the pin. A card tap never comes here: the row stays exactly where it is.
    useEffect(() => {
      const el = root.current;
      const r = props.reveal;
      if (!el || !r || !props.selectedId || r.id !== props.selectedId) return;
      const card = el.querySelector('[data-explore-id="' + cssId(props.selectedId) + '"]');
      const list = el.querySelector("[data-mv2='list']");
      if (!card || !list) return;
      const li = card.closest('li') || card;
      const gutter = parseFloat(window.getComputedStyle(list).paddingLeft) || 0;
      const left = li.offsetLeft - list.offsetLeft - gutter;
      if (typeof list.scrollTo === 'function') list.scrollTo({ left: left, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
      else list.scrollLeft = left;
      if (r.focus) {
        const btn = card.querySelector('button, a');
        if (btn) btn.focus({ preventScroll: true });
      }
    }, [props.reveal, rankKey]);

    const distWords = view.user ? str : (str.centre || {});
    const render = ({ m, meters }) => cardFor({
      m: m, meters: meters, rec: byKey.get(m.type + ':' + m.id), idPrefix: 'mv2-x-' + m.id, words: distWords,
      selected: props.selectedId === m.id, badge: str.selectedBadge, onOpen: props.onOpen,
    });

    // The handle: a tap lowers or raises the panel, and so does a short swipe down or up (never a drag that follows the
    // finger: the panel has two heights). A swipe that ends on the handle must not also count as the tap.
    const GRAB_PX = 24;
    const onGrabDown = (e) => { grab.current = { y: e.clientY, swiped: false }; };
    const onGrabUp = (e) => {
      const g = grab.current;
      if (!g) return;
      const dy = e.clientY - g.y;
      if (Math.abs(dy) >= GRAB_PX) { g.swiped = true; props.onMin(dy > 0); }
    };
    const onGrabClick = () => {
      const g = grab.current;
      grab.current = null;
      if (g && g.swiped) return;
      props.onMin(!props.min);
    };

    const toggleMode = () => {
      if (props.min) { props.onMin(false); return; }
      setMode((m) => (m === 'cats' ? 'cards' : 'cats'));
    };
    const backToCards = () => {
      setMode('cards');
      if (switchBtn.current) switchBtn.current.focus({ preventScroll: true });
    };
    const onKeyDown = (e) => { if (e.key === 'Escape' && mode === 'cats') { e.stopPropagation(); backToCards(); } };

    const words = str.groups || {};
    const filter = [];
    if (props.pill && props.pill !== 'all') filter.push(words[props.pill]);
    if (props.ideas) filter.push(words.ideas);
    const picked = rows.find((r) => r.m.id === props.selectedId);
    const cats = mode === 'cats';

    const cards = rows.length && Row && Card
      ? h(Row, {
        // Keyed by SLOT, not by listing: a new ranking (the map moved, a pill changed) refills the same card boxes in
        // place, so no card ever slides into a new position under the person's eyes (a layout shift).
        items: rows, keyOf: (r, i) => 'slot' + i, idPrefix: 'mv2-explore', render: render,
        strings: { label: view.user ? str.label : str.labelCentre },
      })
      : h('p', { 'data-mv2': 'explore-empty' }, str.empty);

    return h('section', {
      ref: root, 'data-mv2': 'explore', 'data-mode': mode, 'data-min': props.min ? '' : undefined,
      'aria-labelledby': 'mv2-explore-title', hidden: props.hidden || undefined, onKeyDown: onKeyDown,
    },
      h('button', {
        type: 'button', 'data-mv2': 'explore-grab', 'aria-expanded': props.min ? 'false' : 'true', 'aria-label': props.min ? str.raise : str.lower,
        onPointerDown: onGrabDown, onPointerUp: onGrabUp, onPointerCancel: () => { grab.current = null; }, onClick: onGrabClick,
      }, h('span', { 'data-mv2': 'explore-grab-bar', 'aria-hidden': 'true' })),
      h('div', { 'data-mv2': 'explore-head' },
        h('h2', { id: 'mv2-explore-title', 'data-mv2': 'explore-title' },
          // named "Explore" (the heading and the region keep that name); what it does is its description
          h('button', {
            ref: switchBtn, type: 'button', 'data-mv2': 'explore-switch', 'aria-expanded': cats ? 'true' : 'false', 'aria-controls': 'mv2-explore-body',
            'aria-describedby': 'mv2-explore-hint', onClick: toggleMode,
          }, h('span', null, str.title), Icon ? h(Icon, { name: 'ChevronDown', size: 18 }) : null)),
        h('span', { id: 'mv2-explore-hint', 'data-mv2': 'sr' }, cats ? str.backToListings : str.chooseCategory),
        filter.length ? h('span', { 'data-mv2': 'explore-filter' }, filter.join(' · ')) : null,
        h('button', { type: 'button', 'data-mv2': 'explore-all', 'aria-label': str.seeAllLabel, onClick: props.onSeeAll }, str.seeAll)),
      // both views share one box, so the panel is as tall for the list as for the cards (nothing above the map moves)
      h('div', { id: 'mv2-explore-body', 'data-mv2': 'explore-body' },
        h('div', { ref: (el) => { views.current.cards = el; }, 'data-mv2': 'explore-view', 'data-view': 'cards', 'aria-hidden': cats ? 'true' : undefined }, cards),
        h('div', { ref: (el) => { views.current.cats = el; }, 'data-mv2': 'explore-view', 'data-view': 'cats', inert: '', 'aria-hidden': cats ? undefined : 'true' },
          h(Categories, { value: props.pill, ideas: props.ideas, onPick: (id) => { props.onPill(id); backToCards(); }, onIdeas: props.onIdeas }))),
      h('div', { 'data-mv2': 'sr', role: 'status', 'aria-live': 'polite' }, picked ? str.selectedAnnounce(picked.m.title) : ''));
  }

  // An id inside an attribute selector: listing ids are uuids or slugs, but never trust that.
  function cssId(id) {
    const s = String(id);
    return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  /** True on a phone-width screen, where the folding nav sits at the foot (the home screen clears room for it). */
  const useNarrow = () => useMedia(NARROW_MQ);

  window.MapV2Explore = {
    ROW_CAP, SETTLE_MS, GROUPS, GROUP_OF, PILLS, groupOf, pillMatches, rank, useNarrow, indexSources, cardFor, Pills, Categories, Explore,
    lastView: () => lastView,
  };
})();
