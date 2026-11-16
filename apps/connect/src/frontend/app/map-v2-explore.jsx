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
//  That list has a second view, "Where to…" (C40): the same rows, each a saved set of existing categories.
//  The home screen shows the panel OR the full listing, never both. The row ranks again only when the map settles (moveend),
//  never per frame, and holds its own state, so a pan never re-renders the map screen. "See all" opens the
//  Discover page (map-v2-discover.jsx), which draws the SAME card (cardFor) and measures from lastView().
//
//  Pure helpers (groupOf, pillMatches, intentMatches, matchesFilter, rank, PILLS, INTENTS) are unit-tested in mapV2Explore.test.tsx.
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

  // "Where to…" (C40): each intent is a saved set of category ids that already belong to a group. No new data.
  // Serve is outreach and community upliftment until C46 (needs and ways to serve need a migration). It is not
  // the whole Serve & care group: heal and reset keep their own rows.
  const INTENTS = [
    { id: 'coffee', icon: 'Coffee', categories: ['hospitality-cafes'] },
    { id: 'learn', icon: 'BookOpen', categories: ['education-equipping', 'education-training'] },
    { id: 'worship', icon: 'Church', categories: ['worship-prayer', 'church-services', 'conferences-summits', 'churches-ministries'] },
    { id: 'run', icon: 'Footprints', categories: ['sport-recreation', 'recreation-sport'] },
    { id: 'reset', icon: 'Leaf', categories: ['retreat-healing', 'safe-spaces'] },
    { id: 'heal', icon: 'HeartPulse', categories: ['health-wellness', 'care-recovery', 'clinic', 'rehab-development'] },
    { id: 'parent', icon: 'Users', categories: ['marriage-family', 'kids'] },
    { id: 'chill', icon: 'Smile', categories: ['social-gatherings', 'arts-culture', 'arts-creative'] },
    { id: 'shop', icon: 'ShoppingBag', categories: ['retail-shopping', 'markets-expos'] },
    { id: 'serve', icon: 'HandHeart', categories: ['outreach-missions', 'community-upliftment'] },
  ];
  // id -> null-prototype set, so a category named "constructor" can never match by accident.
  const INTENT_SETS = Object.create(null);
  INTENTS.forEach((intent) => {
    const set = Object.create(null);
    intent.categories.forEach((id) => { set[id] = true; });
    INTENT_SETS[intent.id] = set;
  });

  /** The intent with this id, or null. */
  function intentOf(id) {
    for (let i = 0; i < INTENTS.length; i++) if (INTENTS[i].id === id) return INTENTS[i];
    return null;
  }

  /** Does a marker's category belong to this intent? Unknown intents and missing categories do not. */
  function intentMatches(id, m) {
    const set = id && Object.prototype.hasOwnProperty.call(INTENT_SETS, id) ? INTENT_SETS[id] : null;
    if (!set || !m || typeof m.category !== 'string') return false;
    return Object.prototype.hasOwnProperty.call(set, m.category) && set[m.category] === true;
  }

  /**
   * What a card or a pin must pass. An intent wins over the pill (the two are never on together; this is the guard).
   * With neither, everything passes.
   */
  function matchesFilter(pill, intent, m) {
    if (intentOf(intent)) return intentMatches(intent, m);
    return pillMatches(pill, m);
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
   * "Where to…" (C40): the same compact rows as the category list, one per saved intent. Choosing one filters to
   * that intent's categories and leaves the list. A check says which one is on (never the icon colour alone).
   * Serve stays a normal row: C46 is not built, so it filters to outreach and community upliftment.
   * props: value (intent id, or null), onPick(id)
   */
  function Intents(props) {
    const words = S().intents || {};
    const labelOf = S().whereTo;
    const Icon = window.Icon;
    return h('ul', { 'data-mv2': 'cats', 'data-list': 'intents', role: 'list', 'aria-label': S().intentsLabel },
      INTENTS.map((intent) => {
        const on = props.value === intent.id;
        const word = words[intent.id] || intent.id;
        return h('li', { key: intent.id },
          h('button', {
            type: 'button', 'data-mv2': 'intent', 'data-intent-id': intent.id,
            'aria-pressed': on ? 'true' : 'false', onClick: () => props.onPick(intent.id),
          },
            Icon ? h(Icon, { name: intent.icon, size: 16 }) : null,
            h('span', { 'data-mv2': 'cat-name' }, labelOf ? labelOf(word) : word),
            on && Icon ? h(Icon, { name: 'Check', size: 16 }) : null));
      }));
  }

  // Pack 08. Action tiles over the live categories. The founder's twelve come first;
  // the rest are the categories those twelve do not already cover, so nothing on the map is unsuggested.
  const PIN_HEX = { worship: '#7040b5', serve: '#087d69', culture: '#c14f2a', learn: '#245fba', audiences: '#b33272', business: '#687d20' };
  const TILES = [
    { id: 'coffee', word: 'Coffee', icon: 'Coffee', categories: ['hospitality-cafes'] },
    { id: 'church', word: 'Church', icon: 'Church', categories: ['churches-ministries'] },
    { id: 'worship', word: 'Worship', icon: 'Music', categories: ['church-services', 'conferences-summits'] },
    { id: 'market', word: 'Market', icon: 'Store', categories: ['markets-expos'] },
    { id: 'run', word: 'Run', icon: 'Footprints', categories: ['sport-recreation', 'recreation-sport'] },
    { id: 'social', word: 'Social', icon: 'Users', categories: ['social-gatherings'] },
    { id: 'relax', word: 'Relax', icon: 'Leaf', categories: ['retreat-healing', 'safe-spaces'] },
    { id: 'learn', word: 'Learn', icon: 'BookOpen', categories: ['education-equipping', 'education-training'] },
    { id: 'serve', word: 'Serve', icon: 'HandHeart', categories: ['outreach-missions', 'community-upliftment'] },
    { id: 'pray', word: 'Pray', icon: 'HeartHandshake', categories: ['worship-prayer'] },
    { id: 'create', word: 'Create', icon: 'Palette', categories: ['arts-culture', 'arts-creative'] },
    { id: 'kids', word: 'Kids', icon: 'Candy', categories: ['kids', 'youth-students'] },
    { id: 'family', word: 'Family', icon: 'Users', categories: ['marriage-family'] },
    { id: 'care', word: 'Care', icon: 'HeartPulse', categories: ['care-recovery', 'health-wellness', 'clinic', 'rehab-development'] },
    { id: 'men', word: 'Men', icon: 'User', categories: ['mens-community'] },
    { id: 'women', word: 'Women', icon: 'UserRound', categories: ['womens-community'] },
    { id: 'shop', word: 'Shop', icon: 'ShoppingBag', categories: ['retail-shopping', 'christian-businesses'] },
    { id: 'media', word: 'Media', icon: 'Radio', categories: ['media-broadcasting'] },
    { id: 'members', word: 'Members', icon: 'KeyRound', categories: ['members-only'] },
    { id: 'ideas', word: 'Ideas', icon: 'Lightbulb', categories: [], ideas: true },
  ];
  const TILE_OF = Object.create(null);
  TILES.forEach((tile) => {
    const set = Object.create(null);
    (tile.categories || []).forEach((id) => { set[id] = true; });
    TILE_OF[tile.id] = set;
  });
  function tileOf(id) {
    for (let i = 0; i < TILES.length; i++) if (TILES[i].id === id) return TILES[i];
    return null;
  }
  function tileMatches(id, m) {
    const tile = tileOf(id);
    const set = id && Object.prototype.hasOwnProperty.call(TILE_OF, id) ? TILE_OF[id] : null;
    if (!tile || !set || !m) return false;
    if (tile.ideas) return m.type === 'idea';
    return typeof m.category === 'string' && Object.prototype.hasOwnProperty.call(set, m.category) && set[m.category] === true;
  }
  function tileFor(m) {
    for (let i = 0; i < TILES.length; i++) if (tileMatches(TILES[i].id, m)) return TILES[i];
    return null;
  }
  function pinHex(m) {
    if (!m || m.type === 'idea') return '#F2BD22';
    const g = groupOf(m);
    return (g && PIN_HEX[g]) || PIN_HEX.business;
  }

  const DOCK = [
    { id: 'me', icon: 'User', page: 'profile', params: {} },
    { id: 'map', icon: 'Map', close: true },
    { id: 'central', letter: 'C', page: 'kingdom-discovery', params: {} },
    { id: 'do', icon: 'LayoutGrid', page: 'lets', params: {} },
    { id: 'explore', icon: 'Compass', page: 'explore', params: {} },
  ];
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const NEW_WINDOW = 30 * DAY;

  function weekendBounds(now) {
    const d = new Date(now);
    const day = d.getDay();
    const sat = new Date(d);
    if (day === 0) sat.setDate(d.getDate() - 1);
    else sat.setDate(d.getDate() + ((6 - day + 7) % 7));
    sat.setHours(0, 0, 0, 0);
    const end = new Date(sat);
    end.setDate(sat.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return { start: sat.getTime(), end: end.getTime() };
  }
  function whenLine(m, rec) {
    if (!m) return '';
    if (m.type === 'place') return (rec && rec.openHours) || m.openHours || '';
    const t = Date.parse(m.startsAt || (rec && rec.startsAt) || '');
    if (isNaN(t)) return '';
    const d = new Date(t);
    return d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function looksOnline(m, rec) {
    const bits = [m && m.location, m && m.address, rec && rec.location, rec && rec.address, rec && rec.website];
    const socials = rec && rec.socials;
    if (socials && typeof socials === 'object') Object.keys(socials).forEach((k) => { if (typeof socials[k] === 'string') bits.push(socials[k]); });
    return /online|zoom|livestream|live stream|meet\.google|teams\.microsoft/i.test(bits.filter(Boolean).join(' '));
  }

  function XCard(props) {
    const m = props.m;
    const rec = props.rec || {};
    const group = groupOf(m);
    const words = props.groupWords || {};
    const raw = rec.coverPhoto || m.coverPhoto || (m.type === 'contributor' ? m.profilePhoto : '') || '';
    const cover = window.UI && window.UI.safeUrl ? (window.UI.safeUrl(raw) || '') : (/^https?:\/\//i.test(raw) ? raw : '');
    const Icon = window.Icon;
    const cat = window.DATA && window.DATA.getItemCategory ? window.DATA.getItemCategory(m) : null;
    const near = window.MapV2Nearby;
    const dist = Number.isFinite(props.meters) && near ? near.distanceText(props.meters, props.distWords || {}) : '';
    const when = whenLine(m, rec);
    return h('button', {
      type: 'button', 'data-mv2': 'xcard', 'data-explore-id': m.id,
      'data-selected': props.selected ? '' : undefined,
      onClick: () => props.onOpen && props.onOpen(m.id, m.type),
    },
      h('span', { 'data-mv2': 'xcard-img' },
        cover ? h('img', { src: cover, alt: '' }) : (Icon ? h(Icon, { name: (cat && cat.icon) || 'MapPin', size: 28 }) : null),
        m.isLive ? h('span', { 'data-mv2': 'xcard-live' }, h('i', { 'aria-hidden': 'true' }), 'Live') : null),
      h('span', { 'data-mv2': 'xcard-body' },
        (cat && cat.name) || (group && words[group]) ? h('span', { 'data-mv2': 'xcard-chip' }, h('i', { 'data-cat': group || undefined, 'aria-hidden': 'true' }), h('span', { 'data-mv2': 'card-chip-label' }, (cat && cat.name) || words[group])) : null,
        h('b', null, m.title || ''),
        dist ? h('small', { 'data-mv2': 'row-meta' }, dist) : null,
        when ? h('small', null, when) : null));
  }

  /**
   * The home Explore sheet. Closed, its top edge sits on the crown's centre line.
   * Open, it scrolls carousels and the crown is the sticky nav. A tile becomes tabs.
   * props: markers, ideas, sources, apiRef, selectedId, reveal, hidden, onOpen, onSeeAll, onHeight, onTile, onOpenChange, onGo.
   */
  function Explore(props) {
    const api = props.apiRef;
    const [open, setOpen] = useState(false);
    const [tile, setTile] = useState('');
    const [view, setView] = useState(() => (api && api.current ? api.current.view() : { centre: null, user: null }));
    const root = useRef(null);
    const tabsRef = useRef(null);
    const scrollRef = useRef(null);
    const drag = useRef(null);
    const str = S();
    const P = str.panel || {};
    const Icon = window.Icon;

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

    useEffect(() => { if (props.onTile) props.onTile(tile || null); }, [tile]);
    useEffect(() => { if (props.onOpenChange) props.onOpenChange(open); }, [open]);
    useEffect(() => {
      if (!open || props.hidden) return undefined;
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, [open, props.hidden]);
    useEffect(() => {
      if (!props.onHeight) return undefined;
      props.onHeight(68);
      return () => props.onHeight(0);
    }, []);

    useEffect(() => {
      const row = tabsRef.current;
      if (!row || !tile) return undefined;
      const el = row.querySelector('[data-tile="' + cssId(tile) + '"]');
      if (!el || typeof row.scrollTo !== 'function') return undefined;
      const left = Math.max(0, el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2);
      row.scrollTo({ left: left, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
      return undefined;
    }, [tile]);

    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);
    const origin = view.user || view.centre;
    const markers = Array.isArray(props.markers) ? props.markers : [];
    const ideas = Array.isArray(props.ideas) ? props.ideas : [];
    const pool = markers.concat(ideas.filter((m) => m && markers.every((x) => x.id !== m.id)));
    const distWords = view.user ? str : (str.centre || {});
    const current = tileOf(tile);

    const ranked = (list, cap) => rank(origin, list, props.selectedId, cap || 12);
    const tileItems = current ? ranked(pool.filter((m) => tileMatches(current.id, m)), 12) : [];
    const now = Date.now();
    const soon = (m) => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= now && t - now <= 6 * HOUR; };
    const around = ranked(pool.filter((m) => (m.type === 'event' && (m.isLive || soon(m))) || m.type === 'place'), 12);
    const weekend = weekendBounds(now);
    const weekendItems = ranked(pool.filter((m) => m.type === 'event' && (() => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= weekend.start && t <= weekend.end; })()), 12);
    const onlineItems = ranked(pool.filter((m) => looksOnline(m, byKey.get(m.type + ':' + m.id))), 12);
    const freshItems = ranked(pool.filter((m) => { const t = Date.parse(m.createdAt || ''); return !isNaN(t) && now - t >= 0 && now - t <= NEW_WINDOW; }), 12)
      .sort((a, b) => Date.parse(b.m.createdAt || '') - Date.parse(a.m.createdAt || ''));
    const more = ranked(pool.filter((m) => m.type !== 'idea'), 16);

    const pendingFocus = useRef('');
    useEffect(() => {
      const r = props.reveal;
      if (!r || r.id !== props.selectedId || !r.focus) return undefined;
      const m = pool.find((x) => x.id === r.id);
      const next = m ? tileFor(m) : null;
      setOpen(true);
      if (next) setTile(next.id);
      pendingFocus.current = r.id;
      return undefined;
    }, [props.reveal]);
    useEffect(() => {
      const id = pendingFocus.current;
      if (!id || !open || !root.current) return undefined;
      const host = root.current.parentNode;
      const sel = '[data-explore-id="' + cssId(id) + '"]';
      const card = host && (host.querySelector('[data-row="tile"] ' + sel) || host.querySelector('[data-row="more"] ' + sel) || host.querySelector(sel));
      if (card && card.focus) { card.focus({ preventScroll: true }); pendingFocus.current = ''; }
      return undefined;
    }, [open, tile, props.reveal]);

    const choose = (id) => setTile((cur) => (cur === id ? '' : id));
    const onGrabDown = (e) => { drag.current = { y: e.clientY }; };
    const onGrabUp = (e) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const dy = e.clientY - d.y;
      if (dy <= -24) setOpen(true);
      else if (dy >= 24) setOpen(false);
      else setOpen((v) => !v);
    };
    const cards = (id, list) => h('div', { 'data-mv2': 'xrow', 'data-row': id }, list.map((r) => h(XCard, {
      key: id + ':' + r.m.id, m: r.m, meters: r.meters, rec: byKey.get(r.m.type + ':' + r.m.id),
      groupWords: str.groups, distWords: distWords,
      selected: props.selectedId === r.m.id && (id === 'more' || id === 'tile'),
      onOpen: props.onOpen,
    })));
    const section = (id, title, hint, list) => (list && list.length ? h('section', { key: id, 'data-mv2': 'xsec', 'aria-label': title },
      h('div', { 'data-mv2': 'xsec-h' }, h('h3', null, title), hint ? h('small', null, hint) : null),
      cards(id, list)) : null);
    const kindPlural = (current && P.kind && P.kind[pool.find((m) => tileMatches(current.id, m)) ? (pool.find((m) => tileMatches(current.id, m)).type) : '']) || 'listings';
    const kindWord = tileItems.length === 1 ? ({ events: 'event', places: 'place', contributors: 'contributor', ideas: 'idea', listings: 'listing' })[kindPlural] || kindPlural : kindPlural;

    return h('div', {
      'data-mv2': 'explore-host', 'data-open': open ? '' : undefined, hidden: props.hidden || undefined,
    },
      h('div', { 'data-mv2': 'explore-scrim', onClick: () => setOpen(false) }),
      h('section', {
        ref: root, 'data-mv2': 'explore', 'data-open': open ? '' : undefined, 'data-tabbed': tile ? '' : undefined,
        'aria-label': 'Explore',
      },
        h('div', {
          'data-mv2': 'explore-grab', role: 'button', tabIndex: 0, 'aria-expanded': open ? 'true' : 'false',
          'aria-label': open ? (P.close || 'Lower Explore') : (str.title || 'Explore'),
          onPointerDown: onGrabDown, onPointerUp: onGrabUp,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } },
        },
          h('span', { 'data-mv2': 'explore-peek' },
            h('span', null, h('b', null, str.title || 'Explore'), h('small', null, P.peek || 'Where to…')),
            h('span', null, h('small', null, P.nearCount ? P.nearCount(pool.length) : ''))),
          h('span', { 'data-mv2': 'explore-handle', 'aria-hidden': 'true' })),
        h('div', { 'data-mv2': 'explore-scroll', ref: scrollRef },
          h('div', { 'data-mv2': 'explore-head' },
            h('div', null,
              h('span', { 'data-mv2': 'explore-kicker' }, view.user ? (P.kickerNear || 'Near you') : (P.kickerMap || 'Near the map')),
              h('h2', null, P.where || 'Where to…')),
            tile ? h('button', { type: 'button', 'data-mv2': 'explore-reset', onClick: () => setTile('') }, P.allTypes || 'All types') : null),
          h('div', {
            ref: tabsRef, 'data-mv2': 'explore-tiles', 'data-tabs': tile ? '' : undefined,
            role: tile ? 'tablist' : 'list', 'aria-label': P.where || 'Where to…',
          }, TILES.map((t) => h('button', {
            key: t.id, type: 'button', 'data-mv2': 'explore-tile', 'data-tile': t.id,
            role: tile ? 'tab' : undefined, 'aria-selected': tile ? (tile === t.id ? 'true' : 'false') : undefined,
            onClick: () => choose(t.id),
          }, Icon ? h(Icon, { name: t.icon, size: tile ? 16 : 24 }) : null, h('span', null, t.word)))),
          current ? (tileItems.length
            ? h('div', { 'data-mv2': 'xsec' },
              h('div', { 'data-mv2': 'xsec-h' },
                h('h3', null, current.word),
                h('small', null, P.matches ? P.matches(tileItems.length, kindWord) : '')),
              cards('tile', tileItems))
            : h('p', { 'data-mv2': 'explore-empty' }, P.emptyTile ? P.emptyTile(current.word) : '')) : null,
          section('around', P.around || 'Around you now…', P.aroundHint, around),
          section('weekend', P.weekend || 'This weekend', P.weekendHint, weekendItems),
          section('online', P.online || 'Online', P.onlineHint, onlineItems),
          section('fresh', P.fresh || 'New on Connect', P.freshHint, freshItems),
          section('more', P.more || 'More near you', P.moreHint, more),
          h('button', {
            type: 'button', 'data-mv2': 'explore-seeall', 'aria-label': P.seeAll || 'See all of Explore',
            onClick: () => { if (props.onSeeAll) props.onSeeAll(); },
          },
            h('span', null, h('b', null, P.seeAll || 'See all of Explore'), h('small', null, P.seeAllHint || '')),
            h('span', { 'aria-hidden': 'true' }, '→')))),
      h('div', { 'data-mv2': 'explore-dock' },
        h('button', {
          type: 'button', 'data-mv2': 'explore-crown', 'aria-label': P.open || 'Open Explore',
          tabIndex: open ? -1 : 0, onClick: () => setOpen(true),
        }, window.CrownMark ? h(window.CrownMark, { size: 32 }) : (Icon ? h(Icon, { name: 'Crown', size: 28 }) : null)),
        h('div', { 'data-mv2': 'explore-items', role: 'navigation', 'aria-label': P.dock || 'Connect', 'aria-hidden': open ? undefined : 'true' },
          DOCK.map((item) => h('button', {
            key: item.id, type: 'button', 'data-mv2': 'explore-nav', 'data-nav': item.id,
            tabIndex: open ? 0 : -1,
            'aria-current': open && item.id === 'explore' ? 'page' : undefined,
            onClick: () => {
              if (item.close) { setOpen(false); if (scrollRef.current) scrollRef.current.scrollTop = 0; return; }
              if (item.page && props.onGo) props.onGo(item.page, item.params || {});
            },
          },
            item.letter ? h('span', { 'data-mv2': 'explore-letter', 'aria-hidden': 'true' }, item.letter) : (Icon ? h(Icon, { name: item.icon, size: 20 }) : null),
            h('small', null, (P.nav && P.nav[item.id]) || item.id))))));
  }

  // An id inside an attribute selector: listing ids are uuids or slugs, but never trust that.
  function cssId(id) {
    const s = String(id);
    return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  /** True on a phone-width screen, where the folding nav sits at the foot (the home screen clears room for it). */
  const useNarrow = () => useMedia(NARROW_MQ);

  window.MapV2Explore = {
    ROW_CAP, SETTLE_MS, GROUPS, GROUP_OF, PILLS, INTENTS, TILES, PIN_HEX, groupOf, pillMatches, intentOf, intentMatches, matchesFilter, tileOf, tileMatches, tileFor, pinHex, rank, useNarrow, indexSources, cardFor, Pills, Categories, Intents, Explore,
    lastView: () => lastView,
  };
})();
