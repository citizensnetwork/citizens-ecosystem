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
  const { useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

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
  // The map home's nav. Do and Central are hidden until they are built out (founder, 2026-11-17); with them gone the
  // sticky nav keeps Map in the middle (Explore, Map, Me). Me opens the account menu (the top-right person button is a
  // Search button now), so everything that button held is one tap from the nav.
  const DOCK = [
    { id: 'me', icon: 'User', page: 'profile' },
    { id: 'explore', icon: 'Compass', page: 'explore' },
    { id: 'map', icon: 'Map', close: true, emphasis: true },
    { id: 'do', icon: 'LayoutGrid', door: true },
  ];
  const RAIL = [
    { id: 'map', icon: 'Map', act: 'map', emphasis: true },
    { id: 'explore', icon: 'Compass', act: 'open' },
    { id: 'me', icon: 'User', me: true },
  ];
  // The account menu's extra rows on the map home: Let's\u2026 is a Do page, so it is hidden with Do.
  const ME_EXTRAS = ['messages', 'notifications'];

  // The panel's rows. Each one can take the panel over as a "focus" (founder, 2026-11-17): the panel settles at ONE
  // height with that row's cards, and stays there while the person taps through cards and tabs.
  const SECTIONS = ['around', 'weekend', 'online', 'fresh', 'more'];
  const FINE_MQ = '(min-width: 1024px) and (pointer: fine)';
  const DESK_MQ = '(min-width: 64rem)';    // the desktop nav beside the search bar takes over from the crown
  // A phone (founder, 2026-11-25): the app shell has no rail there, and the full nav stands where the crown stood.
  const PHONE_MQ = '(max-width: 767px)';
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
  /** Street-like address fragment (number or road word). Used to prefer building → street → suburb. */
  function looksStreet(part) {
    return /^\d/.test(part) || /\b(rd|road|st\.?|street|ave\.?|avenue|dr\.?|drive|ln\.?|lane|way|blvd|boulevard|cres(?:cent)?|close|straat)\b/i.test(part);
  }

  /**
   * Short place line for a preview card: building name if the address has one, else the street,
   * else the suburb (founder, 2026-11-22). City/town is never shown here.
   */
  function placeWhereLine(address, location) {
    const raw = String(address || location || '').trim();
    if (!raw) return '';
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    const local = parts.slice(0, -1);
    // Building only when it leads the address (before any street); else street, else suburb.
    if (local[0] && !looksStreet(local[0])) return local[0];
    const street = local.find(looksStreet);
    if (street) return street;
    return local[local.length - 1] || parts[0];
  }

  /** Event date only on preview cards (no weekday · time). */
  function eventDateLine(m, rec) {
    if (!m) return '';
    const t = Date.parse(m.startsAt || (rec && rec.startsAt) || m.date || (rec && rec.date) || '');
    if (isNaN(t)) return '';
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Meta under the category: gold pin + where (place) or gold calendar + date (event). */
  function cardMetaLine(m, rec) {
    if (!m) return { icon: '', text: '' };
    if (m.type === 'place') {
      return { icon: 'MapPin', text: placeWhereLine((rec && rec.address) || m.address, (rec && rec.location) || m.location) };
    }
    if (m.type === 'event') return { icon: 'Calendar', text: eventDateLine(m, rec) };
    return { icon: '', text: '' };
  }
  function looksOnline(m, rec) {
    const bits = [m && m.location, m && m.address, rec && rec.location, rec && rec.address, rec && rec.website];
    const socials = rec && rec.socials;
    if (socials && typeof socials === 'object') Object.keys(socials).forEach((k) => { if (typeof socials[k] === 'string') bits.push(socials[k]); });
    return /online|zoom|livestream|live stream|meet\.google|teams\.microsoft/i.test(bits.filter(Boolean).join(' '));
  }

  /** Light NE-arrow over the photo: a second tap opens details (founder, 2026-11-22). */
  function DetailsCue() {
    const Icon = window.Icon;
    return h('span', { 'data-mv2': 'xcard-cue', 'aria-hidden': 'true' },
      Icon ? h(Icon, { name: 'ArrowUpRight', size: 16 }) : null);
  }

  /**
   * Shared preview card (Explore rows + pin carousel). Title, then category, then a gold pin/calendar with
   * building·street·suburb or the event date (no "Place"/"Event" wording). Foot: organiser left, distance right.
   */
  function XCard(props) {
    const m = props.m;
    const rec = props.rec || {};
    const group = groupOf(m);
    const words = props.groupWords || {};
    const peek = !!props.peek;
    const kind = m.type === 'event' || m.type === 'place' || m.type === 'contributor' ? m.type : '';
    const kindIcon = kind === 'event' ? 'Calendar' : (kind === 'place' ? 'MapPin' : (kind === 'contributor' ? 'User' : ''));
    const raw = rec.coverPhoto || m.coverPhoto || (m.type === 'contributor' ? m.profilePhoto : '') || '';
    const cover = window.UI && window.UI.safeUrl ? (window.UI.safeUrl(raw) || '') : (/^https?:\/\//i.test(raw) ? raw : '');
    const Icon = window.Icon;
    const cat = window.DATA && window.DATA.getItemCategory ? window.DATA.getItemCategory(m) : null;
    const tile = tileFor(m);
    const glyph = (tile && tile.icon) || (cat && cat.icon) || kindIcon || 'MapPin';
    const near = window.MapV2Nearby;
    const dist = Number.isFinite(props.meters) && near ? near.distanceText(props.meters, props.distWords || {}) : '';
    const meta = cardMetaLine(m, rec);
    // Every place / event has a contributor owner; "by …" sits indented under the tile body (founder, 2026-11-22).
    const byWord = (window.MapV2Strings && window.MapV2Strings.sheet && window.MapV2Strings.sheet.by) || 'by';
    const ownerRaw = (m.ownerName || rec.organizerName || rec.organizer || '').trim();
    const ownerLine = (kind === 'place' || kind === 'event') && ownerRaw
      ? (byWord + ' ' + ownerRaw)
      : '';
    const catLabel = (cat && cat.name) || (group && words[group]) || '';
    return h('button', {
      type: 'button', 'data-mv2': 'xcard', 'data-explore-id': m.id,
      'data-peek': peek ? '' : undefined,
      'data-kind': kind || undefined,
      'data-cat': group || undefined,
      'data-selected': props.selected ? '' : undefined,
      'aria-current': props.selected ? 'true' : undefined,
      // the card's pin colour (map.jsx fills the pin with the same category hex; ideas are gold), for the chosen look
      style: cat && cat.hex ? { '--card-pin': cat.hex } : undefined,
      onClick: () => props.onOpen && props.onOpen(m.id, m.type),
    },
      h('span', { 'data-mv2': 'xcard-img' },
        cover ? h('img', { src: cover, alt: '' }) : (Icon ? h(Icon, { name: glyph, size: 22 }) : null),
        m.isLive ? h('span', { 'data-mv2': 'xcard-live' }, h('i', { 'aria-hidden': 'true' }), 'Live') : null,
        props.selected && props.detailsCue ? h(DetailsCue) : null,
        props.selected && props.badge ? h('span', { 'data-mv2': 'xcard-badge' }, props.badge) : null,
        props.selected && props.detailsCue && props.cueLabel
          ? h('span', { 'data-mv2': 'sr' }, props.cueLabel) : null),
      h('span', { 'data-mv2': 'xcard-body' },
        h('span', { 'data-mv2': 'xcard-top' },
          h('b', null, m.title || ''),
          catLabel ? h('span', { 'data-mv2': 'xcard-chip' },
            h('span', { 'data-mv2': 'card-chip-label' }, catLabel)) : null,
          meta.text ? h('span', { 'data-mv2': 'xcard-meta' },
            Icon && meta.icon ? h(Icon, { name: meta.icon, size: 12 }) : null,
            h('span', null, meta.text)) : null),
        h('span', { 'data-mv2': 'xcard-foot' },
          ownerLine ? h('small', { 'data-mv2': 'xcard-by' }, ownerLine) : h('span'),
          dist ? h('small', { 'data-mv2': 'xcard-dist' }, dist) : null)));
  }

  function XRow(props) {
    const scroller = useRef(null);
    const [edges, setEdges] = useState({ l: false, r: false });
    const measure = () => {
      const el = scroller.current;
      if (!el) return;
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((p) => (p.l === l && p.r === r ? p : { l: l, r: r }));
    };
    useEffect(() => {
      measure();
      const t = setTimeout(measure, 80);
      return () => clearTimeout(t);
    }, [props.children && props.children.length]);
    // The chosen card comes to the middle of its row, whether a pin or a card chose it (founder, 2026-11-25).
    useEffect(() => {
      const el = scroller.current;
      const id = props.selectedId;
      if (!el || !id || typeof el.scrollTo !== 'function') return;
      const card = el.querySelector('[data-explore-id="' + cssId(id) + '"]');
      if (!card) return;
      const row = el.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const left = Math.max(0, el.scrollLeft + (box.left - row.left) - (el.clientWidth - box.width) / 2);
      el.scrollTo({ left: left, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
    }, [props.selectedId, (props.list || []).map((r) => r.m.id).join('|')]);
    const nudge = (dir) => {
      const el = scroller.current;
      if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
    };
    const Icon = window.Icon;
    const P = S().panel || {};
    // Always float arrows when the row overflows (phones included) — founder, 2026-11-22 Explore filters.
    const showArrows = props.arrows !== false;
    return h('div', { 'data-mv2': 'xrow-wrap' },
      showArrows && edges.l ? h('button', { type: 'button', 'data-mv2': 'xarrow', 'data-dir': 'prev', 'aria-label': P.scrollLeft, onClick: () => nudge(-1) }, Icon ? h(Icon, { name: 'ChevronLeft', size: 16 }) : null) : null,
      h('div', {
        'data-mv2': 'xrow', 'data-row': props.id, ref: scroller, onScroll: measure,
      }, props.children),
      showArrows && edges.r ? h('button', { type: 'button', 'data-mv2': 'xarrow', 'data-dir': 'next', 'aria-label': P.scrollRight, onClick: () => nudge(1) }, Icon ? h(Icon, { name: 'ChevronRight', size: 16 }) : null) : null);
  }

  /**
   * The home Explore panel (founder, 2026-11-17). Four looks, one element:
   *   rest   the crown alone at the foot (a phone's default: the map gets the whole screen)
   *   strip  the handle and the Where to… tiles (the crown's tap; a wide screen's default)
   *   focus  ONE row taken over: a Where to… tile, or Near and Now… / This weekend / Online / New on Connect / More near
   *          you. Tabs, a line, and that row's cards, at one fixed height that never changes while the person taps
   *          through tabs and cards. The map shows the row's pins, glowing.
   *   open   every row, scrolled (dragged up from any of the others); the crown is the sticky nav.
   * The panel moves by transform only (never its height), and the crown and the nav swap without a morph, so a phone
   * does no layout work while it moves. The focus itself (`props.focus`, { kind: 'tile' | 'sec', id }) belongs to the
   * map screen, which filters the pins with it and owns the filter chip that clears it.
   * props: markers, ideas, sources, apiRef, selectedId, reveal, hidden, focus, filtered, onFocus(next), onReset(),
   *        onSectionIds(ids), onOpen(id, type), onSeeAll, onHeight(px), onOpenChange(open), onGo(page, params).
   */
  function Explore(props) {
    const api = props.apiRef;
    const desk = useMedia(DESK_MQ);
    const fine = useMedia(FINE_MQ);
    const phone = useMedia(PHONE_MQ);
    const [stage, setStage] = useState(() => (matches(DESK_MQ) ? 'strip' : 'rest'));
    const [rail, setRail] = useState(true);
    const [me, setMe] = useState('');          // '' | 'rail' | 'dock': where the account menu is open
    const [door, setDoor] = useState(false);
    const [view, setView] = useState(() => (api && api.current ? api.current.view() : { centre: null, user: null }));
    const host = useRef(null);
    const root = useRef(null);
    const tabsRef = useRef(null);
    const scrollRef = useRef(null);
    const str = S();
    const P = str.panel || {};
    const Icon = window.Icon;
    const focus = props.focus || null;
    const tile = focus && focus.kind === 'tile' ? focus.id : '';
    const sec = focus && focus.kind === 'sec' ? focus.id : '';
    // A wide screen has no crown-only rest (its crown heads the nav beside the search bar).
    // While the pin carousel is up (`peek`, founder 2026-11-18) the panel rests: the carousel has the foot of the map, and the
    // crown rides on its top edge. The panel's own look comes back exactly as it was when the carousel closes.
    const base = props.peek ? 'rest' : (stage === 'rest' && desk ? 'strip' : stage);
    // Rest wins over focus so the handle can minimize the panel while the filter stays on (founder, 2026-11-22).
    const mode = props.peek ? 'rest'
      : (base === 'open' ? 'open'
        : (base === 'rest' ? 'rest'
          : (focus ? 'focus' : base)));
    const open = mode === 'open';
    const setFocus = (next) => { if (props.onFocus) props.onFocus(next); };

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

    useEffect(() => { if (props.onOpenChange) props.onOpenChange(open); }, [open]);
    useEffect(() => { if (props.onMode) props.onMode(mode); }, [mode]);
    useEffect(() => {
      if (!open || props.hidden) return undefined;
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setStage('strip'); } };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, [open, props.hidden]);
    // Leaving the full panel puts its rows back at the top, so the strip and the focus always show their own head.
    useEffect(() => { if (!open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
    // How much of the map the panel covers, for the map's corner and controls: read from the CSS (one source of truth).
    useEffect(() => {
      if (!props.onHeight) return undefined;
      const el = host.current;
      const px = el && !open && window.getComputedStyle ? parseFloat(window.getComputedStyle(el).getPropertyValue('--xp-vis')) : 0;
      // before the stylesheet has arrived the token reads empty: the strip and the focus still take room
      props.onHeight(Number.isFinite(px) ? px : (mode === 'strip' || mode === 'focus' ? 1 : 0));
      return undefined;
    }, [mode, desk]);
    useEffect(() => () => { if (props.onHeight) props.onHeight(0); }, []);
    // Off screen, the panel's buttons leave the tab order and the screen reader (React 18 has no `inert` prop).
    useEffect(() => {
      const el = root.current;
      if (!el) return;
      if (mode === 'rest') el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    }, [mode]);
    useEffect(() => { if (open || props.hidden) setMe(''); }, [open, props.hidden]);
    // A tap on empty map (founder, 2026-11-18): back to the crown alone. A focus stays (it is a filter, and its chip says so);
    // the Where to… strip and the menu fold away. A wide screen's rest is its strip.
    const restSignal = props.restSignal || 0;
    useEffect(() => { if (restSignal) { setStage('rest'); setMe(''); } }, [restSignal]);
    // Close-search (and similar): reopen the Where-to strip under the crown (founder, 2026-11-22).
    const stripSignal = props.stripSignal || 0;
    useEffect(() => { if (stripSignal) { setStage('strip'); setMe(''); } }, [stripSignal]);
    // The app rail's Map returns the Where to… panel to its minimum.
    useEffect(() => {
      const min = () => { setFocus(null); setMe(''); setStage(desk ? 'strip' : 'rest'); };
      window.addEventListener('cc-rail-map', min);
      // The phone's top-left crown: home, with every panel folded (the map screen clears the filters itself).
      window.addEventListener('cc-crown-home', min);
      return () => {
        window.removeEventListener('cc-rail-map', min);
        window.removeEventListener('cc-crown-home', min);
      };
    }, [desk]);
    // The Do menu folds whenever the panel changes its look.
    useEffect(() => { setDoor(false); }, [mode]);

    // the chosen tab in view, in the middle of its row
    const tabKey = tile || sec;
    useEffect(() => {
      const row = tabsRef.current;
      if (!row || !tabKey) return undefined;
      const el = row.querySelector('[data-tab="' + cssId(tabKey) + '"]');
      if (!el || typeof row.scrollTo !== 'function') return undefined;
      const left = Math.max(0, el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2);
      row.scrollTo({ left: left, behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
      return undefined;
    }, [tabKey, mode]);

    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);
    // The rows rank from where the map looks, but a focus holds its first origin until it ends: the map moves for the
    // focus itself (to the town, to a chosen card), and re-ranking then would reorder the cards under the person's finger.
    // Where-to tiles and Explore section filters rank from the current town view (centre), not GPS — founder 2026-11-22.
    const liveTown = view.centre || view.user;
    const liveElse = view.user || view.centre;
    const live = (focus && (focus.kind === 'tile' || focus.kind === 'sec')) ? liveTown : liveElse;
    const held = useRef(null);
    if (!focus) held.current = null;
    else if (!held.current && live) held.current = live;
    const origin = (focus && held.current) || live;
    // where the cards measured from, handed to the sheet a card opens, so its distance says what the card said
    const measuredFrom = view.user ? view : { centre: origin, user: null };
    const markers = (Array.isArray(props.markers) ? props.markers : []).filter((m) => m && m.type !== 'contributor');
    const ideas = Array.isArray(props.ideas) ? props.ideas : [];
    const pool = markers.concat(ideas.filter((m) => m && markers.every((x) => x.id !== m.id)));
    const distWords = view.user ? str : (str.centre || {});
    const current = tileOf(tile);

    const ranked = (list, cap) => rank(origin, list, props.selectedId, cap || 12);
    const tileItems = current ? ranked(pool.filter((m) => tileMatches(current.id, m)), 12) : [];
    const now = Date.now();
    const soon = (m) => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= now && t - now <= 6 * HOUR; };
    const weekend = weekendBounds(now);
    const rows = {
      around: ranked(pool.filter((m) => (m.type === 'event' && (m.isLive || soon(m))) || m.type === 'place'), 12),
      weekend: ranked(pool.filter((m) => m.type === 'event' && (() => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= weekend.start && t <= weekend.end; })()), 12),
      online: ranked(pool.filter((m) => looksOnline(m, byKey.get(m.type + ':' + m.id))), 12),
      fresh: ranked(pool.filter((m) => { const t = Date.parse(m.createdAt || ''); return !isNaN(t) && now - t >= 0 && now - t <= NEW_WINDOW; }), 12)
        .sort((a, b) => Date.parse(b.m.createdAt || '') - Date.parse(a.m.createdAt || '')),
      more: ranked(pool.filter((m) => m.type !== 'idea'), 16),
    };
    const rowTitle = (id) => P[id] || id;
    const rowHint = (id) => P[id + 'Hint'] || '';

    // A row in focus tells the map which pins it holds (the map keeps them on screen and makes them glow).
    const secIds = sec && rows[sec] ? rows[sec].map((r) => r.m.id).join('|') : '';
    useEffect(() => { if (props.onSectionIds) props.onSectionIds(secIds ? secIds.split('|') : []); }, [secIds]);

    const pendingFocus = useRef('');
    useEffect(() => {
      const r = props.reveal;
      if (!r || r.id !== props.selectedId || !r.focus) return undefined;
      const m = pool.find((x) => x.id === r.id);
      const next = m ? tileFor(m) : null;
      if (next) setFocus({ kind: 'tile', id: next.id });
      setStage((s) => (s === 'rest' ? 'strip' : s));
      pendingFocus.current = r.id;
      return undefined;
    }, [props.reveal]);
    useEffect(() => {
      const id = pendingFocus.current;
      if (!id || mode === 'rest' || !root.current) return undefined;
      const card = root.current.querySelector('[data-explore-id="' + cssId(id) + '"]');
      if (card && card.focus) { card.focus({ preventScroll: true }); pendingFocus.current = ''; }
      return undefined;
    }, [mode, tile, props.reveal]);

    // A tile or a row taken over: the panel settles at its focus height (from the full panel too).
    const chooseTile = (id) => { setFocus(tile === id ? null : { kind: 'tile', id: id }); setStage('strip'); };
    const chooseRow = (id) => { setFocus(sec === id ? null : { kind: 'sec', id: id }); setStage('strip'); };
    const raise = () => setStage('open');
    const lower = () => {
      if (open) { setStage('strip'); return; }
      // Focus (Where-to or Explore filter): minimize completely, keep the filter (founder, 2026-11-22).
      if (focus || mode === 'focus') { setStage('rest'); return; }
      if (!desk) setStage('rest');
    };
    // Drag follows the finger, then snaps on release (founder, 2026-11-23). Grab and panel share one pull.
    // Open: only a FRESH downward swipe that starts at scroll-top can lower (lift after scrolling to top first).
    const dragged = useRef(false);
    const panelPull = useRef(null);
    const xpVis = (kind) => {
      const el = host.current;
      if (!el || !window.getComputedStyle) return kind === 'open' ? 600 : (kind === 'focus' ? 340 : 152);
      const cs = window.getComputedStyle(el);
      if (kind === 'open') return (root.current && root.current.offsetHeight) || 600;
      if (kind === 'focus') {
        const v = parseFloat(cs.getPropertyValue('--xp-focus'));
        return Number.isFinite(v) ? v : 340;
      }
      const v = parseFloat(cs.getPropertyValue('--xp-strip'));
      return Number.isFinite(v) ? v : 152;
    };
    // data-narrow is set as '' when narrow — check attribute presence.
    const panelX = () => {
      const home = host.current && host.current.closest && host.current.closest("[data-mv2='home']");
      return (home && !home.hasAttribute('data-narrow')) ? 'translateX(-50%) ' : '';
    };
    const clearPanelDrag = () => {
      const el = root.current;
      if (!el) return;
      el.style.transition = '';
      el.style.transform = '';
    };
    const startPanelPull = (e, opts) => {
      const o = opts || {};
      const el = root.current;
      if (!el) return;
      const H = el.offsetHeight;
      let vis = 0;
      if (mode === 'open') vis = H;
      else if (mode === 'focus') vis = xpVis('focus');
      else if (mode === 'strip') vis = xpVis('strip');
      // rest: panel fully off-screen (vis 0) — grab can still pull it up.
      panelPull.current = {
        x: e.clientX, y: e.clientY, id: e.pointerId, captured: false,
        open: mode === 'open', onlyDown: !!o.onlyDown, fromGrab: !!o.fromGrab,
        fromRest: mode === 'rest',
        baseY: Math.max(0, H - vis), H: H, lastY: Math.max(0, H - vis),
      };
    };
    const onGrabDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragged.current = false;
      startPanelPull(e, { fromGrab: true });
      // Capture now: otherwise a drag that leaves the thin grab never gets pointermove (e2e + phones).
      if (e.currentTarget && e.currentTarget.setPointerCapture) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ }
      }
    };
    const onGrabClick = () => {
      if (dragged.current) { dragged.current = false; return; }
      if (mode === 'focus' || (focus && mode === 'open')) { setStage('rest'); return; }
      if (open) lower();
      else if (focus && mode === 'rest') { setStage('strip'); }
      else raise();
    };
    const onPanelDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (mode === 'rest') return;
      // A finger on the panel is the touch pull's (below): the browser's own scrolling would cancel this one.
      if (e.pointerType === 'touch') return;
      if (e.target.closest && e.target.closest("[data-mv2='explore-grab']")) return;
      // Where-to tiles own horizontal pan-x; only start a panel pull once the move is clearly vertical.
      if (mode === 'open') {
        const sc = scrollRef.current;
        // Fresh gesture only: must already be at top when the finger goes down (founder, 2026-11-23).
        if (sc && sc.scrollTop >= 6) return;
        startPanelPull(e, { onlyDown: true });
        return;
      }
      startPanelPull(e, {});
    };
    const onPanelMove = (e) => {
      const p = panelPull.current;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.captured) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (p.onlyDown && dy < 0) { panelPull.current = null; return; }
        if (Math.abs(dy) <= Math.abs(dx)) { panelPull.current = null; return; }
        p.captured = true;
        dragged.current = true;
        if (e.currentTarget && e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ }
        }
      }
      if (e.cancelable && (p.onlyDown || p.fromGrab)) e.preventDefault();
      const el = root.current;
      if (!el) return;
      const y = Math.max(0, Math.min(p.H, p.baseY + dy));
      p.lastY = y;
      el.style.transition = 'none';
      el.style.transform = panelX() + 'translateY(' + y + 'px)';
    };
    const finishPanelPull = (e) => {
      const p = panelPull.current;
      panelPull.current = null;
      clearPanelDrag();
      if (!p || (e && p.id !== e.pointerId)) return;
      if (!p.captured) return;
      const dy = (e ? e.clientY : p.y) - p.y;
      const y = p.lastY;
      // Snap by how far the panel travelled (and a short flick).
      if (Math.abs(dy) < 24 && Math.abs(y - p.baseY) < 24) return;
      if (p.open || p.onlyDown) { if (dy > 0 || y > p.baseY + 40) lower(); return; }
      if (p.fromRest) { if (dy < 0 || y < p.baseY - 40) raise(); return; }
      if (dy < 0 || y < p.baseY - 40) raise();
      else lower();
    };
    const onPanelUp = (e) => { finishPanelPull(e); };
    // A finger on the panel (founder, 2026-11-25). Its rows scroll natively, and a native scroll cancels pointer drags, so a
    // finger is read from touch events, with the first clear move deciding: sideways belongs to the card rows; up or down
    // drags the panel with the finger. On the strip and a focus row both ways work (up raises, down lowers); on the open
    // panel only down, and only with its rows at their top. A flick moves it at once (speed from the last 100 ms), and
    // on the open panel a long pull takes it all the way down. The grab keeps its own pointer pull.
    const pull = useRef({});
    pull.current = { panelX: panelX, xpVis: xpVis, clear: clearPanelDrag, raise: raise, lower: lower, desk: desk, setStage: setStage };
    const modeRef = useRef(mode);
    modeRef.current = mode;
    useEffect(() => {
      const el = root.current;
      const sc = scrollRef.current;
      if (!el) return undefined;
      let t = null;
      const start = (e) => {
        t = null;
        const m = modeRef.current;
        if (m === 'rest' || e.touches.length !== 1) return;
        if (e.target.closest && e.target.closest("[data-mv2='explore-grab']")) return;
        if (m === 'open' && sc && sc.scrollTop > 0) return;
        const p0 = e.touches[0];
        const H = el.offsetHeight;
        const vis = m === 'open' ? H : pull.current.xpVis(m === 'focus' ? 'focus' : 'strip');
        t = { m: m, x: p0.clientX, y: p0.clientY, H: H, base: Math.max(0, H - vis), decided: false, pulling: false, dy: 0, trail: [[e.timeStamp || Date.now(), 0]] };
      };
      const move = (e) => {
        if (!t) return;
        const p0 = e.touches[0];
        const dx = p0.clientX - t.x;
        const dy = p0.clientY - t.y;
        if (!t.decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          t.decided = true;
          if (Math.abs(dx) > Math.abs(dy)) { t = null; return; }
          if (t.m === 'open' && (dy <= 0 || (sc && sc.scrollTop > 0))) { t = null; return; }
          t.pulling = true;
          panelPull.current = null;
        }
        if (!t.pulling) return;
        if (e.cancelable) e.preventDefault();
        t.dy = t.m === 'open' ? Math.max(0, dy) : dy;
        t.trail.push([e.timeStamp || Date.now(), t.dy]);
        if (t.trail.length > 6) t.trail.shift();
        const y = Math.max(0, Math.min(t.H, t.base + t.dy));
        el.style.transition = 'none';
        el.style.transform = pull.current.panelX() + 'translateY(' + y + 'px)';
      };
      const end = (e) => {
        const g = t;
        t = null;
        if (!g || !g.pulling) return;
        const api = pull.current;
        api.clear();
        // only the last 100 ms count: a finger that stopped before lifting is not a flick
        const last = (e && e.timeStamp) || Date.now();
        const recent = g.trail.filter((p) => last - p[0] <= 100);
        const a = recent[0];
        const b = recent[recent.length - 1];
        // px per ms, down is positive; a flick can land its moves in the same millisecond, which is as fast as it gets
        const speed = a && b && b !== a ? (b[1] - a[1]) / Math.max(1, b[0] - a[0]) : 0;
        if (g.m === 'open') {
          if (g.H > 0 && g.dy > g.H * 0.55 && !api.desk) api.setStage('rest');
          else if (speed > 0.45 || g.dy > 80) api.lower();
          return;
        }
        if (speed < -0.45 || g.dy < -60) api.raise();
        else if (speed > 0.45 || g.dy > 60) api.lower();
      };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchmove', move, { passive: false });
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
      return () => {
        el.removeEventListener('touchstart', start);
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', end);
        el.removeEventListener('touchcancel', end);
      };
    }, []);
    const onGrabUp = (e) => { finishPanelPull(e); };
    const onPanelCancel = () => { panelPull.current = null; clearPanelDrag(); };
    // The crown: with any filter on, it clears them all and goes home (the map screen snaps to the person's place);
    // otherwise it shows or hides the Where to… strip.
    const filtered = !!focus || !!props.filtered;
    // Above the map's rest (search open, or the pin carousel: `level`, founder 2026-11-18) it goes straight back to the crown
    // alone, closing every level at once.
    const onCrown = () => {
      setMe('');
      // Minimized-with-filter: first tap reopens the focus panel; second tap (or chip) clears (founder, 2026-11-22).
      if (filtered) {
        if (mode === 'rest') { setStage('strip'); return; }
        if (props.onReset) props.onReset();
        setStage('rest');
        return;
      }
      if (props.level) { if (props.onLevelReset) props.onLevelReset(); setStage('rest'); return; }
      setStage((s) => (s === 'rest' ? 'strip' : 'rest'));
    };
    const crownLabel = filtered ? (P.reset) : props.level ? P.home : (base === 'rest' ? (P.open) : (P.close));
    // Crown drag (phone): same snap stages as the pill — pull down lowers / closes; a short tap keeps onCrown.
    const crownPull = useRef(null);
    const crownDragged = useRef(false);
    const onCrownDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      crownPull.current = { y: e.clientY, id: e.pointerId };
      crownDragged.current = false;
    };
    const onCrownUp = (e) => {
      const p = crownPull.current;
      crownPull.current = null;
      if (!p || p.id !== e.pointerId) return;
      const dy = e.clientY - p.y;
      if (Math.abs(dy) < 24) return;
      crownDragged.current = true;
      if (dy > 0) {
        if (props.level && props.onLevelReset) props.onLevelReset();
        else lower();
      } else if (!props.level) {
        raise();
      }
    };
    const onCrownClick = () => {
      if (crownDragged.current) { crownDragged.current = false; return; }
      onCrown();
    };
    // The phone's nav and the nudge under it (founder, 2026-11-25): a stroke up steps the panel up (rest, Where to…,
    // every row), a stroke down steps it back; a tap is still a tap. The end of the stroke is read from the document, so
    // a finger that leaves the nav still counts, and the click a stroke would make is swallowed.
    const navSwiped = useRef(false);
    const stepPanel = (dir) => {
      setMe('');
      setDoor(false);
      if (dir < 0) {
        if (props.level && props.onLevelReset) { props.onLevelReset(); return; }
        lower();
        return;
      }
      if (props.peek) return;
      if (mode === 'rest') setStage('strip');
      else raise();
    };
    const onStrokeDown = (e) => {
      if (!phone || open || (e.pointerType === 'mouse' && e.button !== 0)) return;
      navSwiped.current = false;
      const s = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const up = (ev) => {
        if (ev.pointerId !== s.id) return;
        document.removeEventListener('pointerup', up, true);
        document.removeEventListener('pointercancel', up, true);
        if (ev.type !== 'pointerup') return;
        const dy = ev.clientY - s.y;
        if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(ev.clientX - s.x)) return;
        navSwiped.current = true;
        stepPanel(dy < 0 ? 1 : -1);
      };
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', up, true);
    };
    const onStrokeClick = (e) => {
      if (!navSwiped.current) return;
      navSwiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onNudgeClick = () => {
      setMe('');
      setStage('strip');
    };

    // A card in the full panel takes its row over first; the map screen then chooses it (a second tap opens it).
    const openCard = (row) => (id, type) => {
      if (open) {
        if (row === 'tile') setStage('strip');
        // (a card never turns its row's focus off, even when that row is the focus already: only its tab toggles)
        else if (SECTIONS.indexOf(row) !== -1) { setFocus({ kind: 'sec', id: row }); setStage('strip'); }
      }
      if (props.onOpen) props.onOpen(id, type, measuredFrom);
    };
    const cardDist = (str.peek && str.peek.dist) || distWords;
    const cards = (id, list) => h(XRow, { id: id, list: list, selectedId: props.selectedId }, list.map((r) => h(XCard, {
      key: id + ':' + r.m.id, m: r.m, meters: r.meters, rec: byKey.get(r.m.type + ':' + r.m.id),
      groupWords: str.groups, distWords: cardDist,
      selected: props.selectedId === r.m.id, badge: str.selectedBadge,
      onOpen: openCard(id),
    })));
    const kindOf = current ? pool.find((m) => tileMatches(current.id, m)) : null;
    const kindPlural = (kindOf && P.kind && P.kind[kindOf.type]) || 'listings';
    const kindWord = tileItems.length === 1 ? ({ events: 'event', places: 'place', contributors: 'contributor', ideas: 'idea', listings: 'listing' })[kindPlural] || kindPlural : kindPlural;

    const tab = (id, word, icon, on, onClick, extra) => h('button', Object.assign({
      key: id, type: 'button', 'data-mv2': 'explore-tile', 'data-tab': id,
      role: 'tab', 'aria-selected': on ? 'true' : 'false', onClick: onClick,
    }, extra), icon && Icon ? h(Icon, { name: icon, size: 16 }) : null, h('span', null, word));
    // Where to… strip: sideways scroll with edge arrows (same language as card rows).
    const [tileEdges, setTileEdges] = useState({ l: false, r: false });
    const measureTiles = () => {
      const el = tabsRef.current;
      if (!el) return;
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setTileEdges((p) => (p.l === l && p.r === r ? p : { l: l, r: r }));
    };
    useEffect(() => { measureTiles(); }, [mode, tile, sec, open]);
    const nudgeTiles = (dir) => {
      const el = tabsRef.current;
      if (!el) return;
      el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: matches(REDUCED_MQ) ? 'auto' : 'smooth' });
    };
    const tilesShell = (inner) => h('div', { 'data-mv2': 'tiles-wrap' },
      fine && tileEdges.l ? h('button', {
        type: 'button', 'data-mv2': 'xarrow', 'data-dir': 'prev', 'aria-label': P.scrollLeft,
        onClick: () => nudgeTiles(-1),
      }, Icon ? h(Icon, { name: 'ChevronLeft', size: 16 }) : null) : null,
      inner,
      fine && tileEdges.r ? h('button', {
        type: 'button', 'data-mv2': 'xarrow', 'data-dir': 'next', 'aria-label': P.scrollRight,
        onClick: () => nudgeTiles(1),
      }, Icon ? h(Icon, { name: 'ChevronRight', size: 16 }) : null) : null);
    const tilesBig = () => h('div', { 'data-mv2': 'where-block' },
      h('h3', { 'data-mv2': 'where-lead' }, P.whereLead || P.where),
      tilesShell(h('div', {
        ref: tabsRef, 'data-mv2': 'explore-tiles', role: 'list', 'aria-label': P.where, onScroll: measureTiles,
      }, TILES.map((t) => h('button', {
        key: t.id, type: 'button', 'data-mv2': 'explore-tile', 'data-tile': t.id, 'data-tab': t.id,
        onClick: () => chooseTile(t.id),
      }, Icon ? h(Icon, { name: t.icon, size: 24 }) : null, h('span', null, t.word))))));
    const tileTabs = () => tilesShell(h('div', {
      ref: tabsRef, 'data-mv2': 'explore-tiles', 'data-tabs': '', role: 'tablist', 'aria-label': P.where, onScroll: measureTiles,
    }, TILES.map((t) => tab(t.id, t.word, t.icon, tile === t.id, () => chooseTile(t.id), { 'data-tile': t.id }))));
    const rowTabs = () => tilesShell(h('div', {
      ref: tabsRef, 'data-mv2': 'explore-tiles', 'data-tabs': '', role: 'tablist', 'aria-label': P.rows, onScroll: measureTiles,
    }, SECTIONS.filter((id) => rows[id].length || id === sec).map((id) => tab(id, rowTitle(id), null, sec === id, () => chooseRow(id), { 'data-sec': id }))));
    // The focus: Back + Close on the corners (subtle), tabs, and the row's cards — same drawer chrome language
    // as pinpeek (founder, 2026-11-22: no "Live and nearby" / "Close" labels).
    const focusView = () => {
      const list = tile ? tileItems : (rows[sec] || []);
      return h('div', { 'data-mv2': 'xfocus', 'data-focus': tile ? 'tile' : 'sec' },
        h('div', { 'data-mv2': 'xfocus-chrome' },
          h('button', {
            type: 'button', 'data-mv2': 'xfocus-back', 'aria-label': P.closeRow || P.allTypes,
            onClick: () => setFocus(null),
          }, Icon ? h(Icon, { name: 'ChevronLeft', size: 18 }) : null),
          h('button', {
            type: 'button', 'data-mv2': 'xfocus-close', 'aria-label': P.lower,
            onClick: () => { setFocus(null); setStage(desk ? 'strip' : 'rest'); },
          }, Icon ? h(Icon, { name: 'X', size: 18 }) : null)),
        tile ? tileTabs() : rowTabs(),
        list.length ? cards(tile ? 'tile' : sec, list)
          : h('p', { 'data-mv2': 'explore-empty' }, tile ? (P.emptyTile ? P.emptyTile(current ? current.word : '') : '') : (P.emptyRow || '')));
    };
    const section = (id) => (rows[id].length ? h('section', { key: id, 'data-mv2': 'xsec', 'data-sec': id, 'aria-label': rowTitle(id) },
      h('div', { 'data-mv2': 'xsec-h' },
        h('h3', null, h('button', { type: 'button', 'data-mv2': 'xsec-go', onClick: () => chooseRow(id) }, rowTitle(id))),
        rowHint(id) ? h('small', null, rowHint(id)) : null),
      cards(id, rows[id])) : null);
    const openView = () => [
      h('div', { key: 'tiles' }, tile ? tileTabs() : tilesBig()),
      current ? h('div', { key: 'tile', 'data-mv2': 'xsec' },
        h('div', { 'data-mv2': 'xsec-h' },
          h('h3', null, current.word),
          h('small', null, P.matches ? P.matches(tileItems.length, kindWord) : '')),
        tileItems.length ? cards('tile', tileItems) : h('p', { 'data-mv2': 'explore-empty' }, P.emptyTile ? P.emptyTile(current.word) : '')) : null,
    ].concat(SECTIONS.map(section), [h('button', {
      key: 'more-link', type: 'button', 'data-mv2': 'explore-more', 'aria-label': P.seeAll,
      onClick: () => { if (props.onSeeAll) props.onSeeAll(); },
    },
      h('span', { 'data-mv2': 'explore-more-ring' }, Icon ? h(Icon, { name: 'Compass', size: 22 }) : null),
      h('small', null, P.seeAll))]);

    // Me: the account menu, beside the desktop nav or above the sticky nav.
    const meItem = (where, item, attrs, lead) => h('div', { key: item.id, 'data-mv2': 'me-wrap' },
      h('button', Object.assign({
        type: 'button', 'data-nav': item.id, 'aria-expanded': me === where ? 'true' : 'false', 'aria-haspopup': 'true',
        onClick: () => setMe((v) => (v === where ? '' : where)),
      }, attrs), lead, h('small', null, (P.nav && P.nav[item.id]) || item.id)),
      me === where && window.ProfilePanel ? h(window.ProfilePanel, { anchor: where, extras: ME_EXTRAS, onClose: () => setMe('') }) : null);
    const navIcon = (item) => {
      const chrome = window.ConnectChrome;
      const kind = item.id === 'me' ? 'Me' : item.id === 'explore' ? 'Explore' : item.id === 'map' ? 'Map' : item.id === 'do' ? 'Do' : '';
      if (chrome && kind) return h('span', { className: 'inline-icon' }, h(chrome.Icon, { kind: kind }));
      return Icon ? h(Icon, { name: item.icon, size: 20 }) : null;
    };
    const railGo = (item) => {
      setMe('');
      if (item.act === 'map') { setStage('strip'); return; }
      if (item.act === 'open') raise();
    };

    return h('div', {
      ref: host, 'data-mv2': 'explore-host', 'data-mode': mode, 'data-open': open ? '' : undefined, 'data-tabbed': tile ? '' : undefined,
      hidden: props.hidden || undefined,
    },
      !open && h('div', { 'data-mv2': 'desktop-nav' },
        h('button', {
          type: 'button', 'data-mv2': 'desktop-crown', 'aria-expanded': rail ? 'true' : 'false',
          'aria-label': props.level ? P.home : (rail ? P.hideNav : P.showNav),
          onClick: () => {
            setMe('');
            // the desktop crown is the crown too: above the map's rest it goes back to it, and only then folds the nav
            if (props.level && props.onLevelReset) { props.onLevelReset(); return; }
            setRail((v) => !v);
          },
        }, window.CrownMark ? h(window.CrownMark, { size: 26 }) : (Icon ? h(Icon, { name: 'Crown', size: 22 }) : null)),
        rail && h('nav', { 'data-mv2': 'desktop-items', 'aria-label': P.dock }, RAIL.map((item) => (item.me
          ? meItem('rail', item, { 'data-mv2': 'desktop-item' }, navIcon(item))
          : h('button', {
            key: item.id, type: 'button', 'data-mv2': 'desktop-item', 'data-nav': item.id,
            'data-emphasis': item.emphasis ? '' : undefined,
            'aria-current': item.act === 'map' ? 'page' : undefined,
            onClick: () => railGo(item),
          }, navIcon(item), h('small', null, (P.nav && P.nav[item.id]) || item.id)))))),
      h('div', { 'data-mv2': 'explore-scrim', onClick: () => setStage('strip') }),
      h('section', {
        ref: root, 'data-mv2': 'explore', 'data-mode': mode, 'data-open': open ? '' : undefined, 'data-tabbed': tile ? '' : undefined,
        'aria-label': str.title,
        onPointerDown: onPanelDown, onPointerMove: onPanelMove, onPointerUp: onPanelUp,
        onPointerCancel: onPanelCancel,
      },
        h('div', {
          'data-mv2': 'explore-grab', role: 'button', tabIndex: 0, 'aria-expanded': open ? 'true' : 'false',
          'aria-label': open ? (P.lower) : (P.raise),
          onPointerDown: onGrabDown, onPointerMove: onPanelMove, onPointerUp: onGrabUp,
          onPointerCancel: onPanelCancel, onClick: onGrabClick,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) lower(); else raise(); } },
        },
          // a bare bar: the gold nudge under the nav says there is more (founder, 2026-11-25: the chevron is gone)
          h('span', { 'data-mv2': 'explore-handle', 'aria-hidden': 'true' },
            h('span', { 'data-mv2': 'handle-bar' })),
          h('span', { 'data-mv2': 'drawer-mark', 'aria-hidden': 'true' }, P.brandMark || '')),
        h('div', { 'data-mv2': 'explore-scroll', ref: scrollRef },
          mode === 'focus' ? focusView() : mode === 'open' ? openView() : tilesBig())),
      // The crown and the sticky nav swap outright (founder, 2026-11-17: the morph was slow on a phone).
      !open && !phone ? h('button', {
        type: 'button', 'data-mv2': 'explore-crown', 'aria-label': crownLabel,
        'data-filtered': filtered ? '' : undefined,
        onPointerDown: onCrownDown, onPointerUp: onCrownUp, onClick: onCrownClick,
        onPointerCancel: () => { crownPull.current = null; },
      }, window.CrownMark ? h(window.CrownMark, { size: 32 }) : (Icon ? h(Icon, { name: 'Crown', size: 28 }) : null)) : null,
      // A phone keeps the nav up in every look: riding where the crown rode (`data-ride`), and at rest lifted over the
      // nudge. Opened, it moves down to the foot as the sticky nav. One element, so it glides (transform only).
      phone && mode === 'rest' && !props.peek ? h('button', {
        type: 'button', 'data-mv2': 'explore-nudge', 'aria-label': P.nudge,
        onPointerDown: onStrokeDown, onClickCapture: onStrokeClick, onClick: onNudgeClick,
      }, Icon ? h(Icon, { name: 'ChevronUp', size: 18 }) : null) : null,
      open || phone ? h('nav', {
        'data-mv2': 'explore-dock', 'aria-label': P.dock,
        'data-ride': phone && !open ? '' : undefined, 'data-rest': phone && mode === 'rest' ? '' : undefined,
        onPointerDown: onStrokeDown, onClickCapture: onStrokeClick,
      },
        door && h('div', { 'data-mv2': 'dock-door', className: 'cn-glass', role: 'menu', 'aria-label': P.door.label },
          h('button', { type: 'button', role: 'menuitem', onClick: () => { setDoor(false); if (props.onGo) props.onGo('lets', {}); } }, P.door.lets),
          h('button', { type: 'button', role: 'menuitem', onClick: () => { setDoor(false); if (props.onGo) props.onGo('community', {}); } }, P.door.community)),
        DOCK.map((item) => {
          const lead = navIcon(item);
          if (item.me) return meItem('dock', item, { 'data-mv2': 'explore-nav' }, lead);
          return h('button', {
            key: item.id, type: 'button', 'data-mv2': 'explore-nav', 'data-nav': item.id,
            'data-emphasis': item.emphasis ? '' : undefined,
            'aria-current': item.id === 'map' ? 'page' : undefined,
            'aria-expanded': item.door ? (door ? 'true' : 'false') : undefined,
            onClick: () => {
              setMe('');
              if (item.door) { setDoor((v) => !v); return; }
              setDoor(false);
              if (item.close) {
                if (props.level && props.onLevelReset) props.onLevelReset();
                setStage(desk ? 'strip' : 'rest');
                return;
              }
              if (item.page && props.onGo) props.onGo(item.page, {});
            },
          }, lead, h('small', null, (P.nav && P.nav[item.id]) || item.id));
        })) : null);
  }

  // ── The pin carousel (founder, 2026-11-18; polish 2026-11-22) ─────────
  // A pin tapped on the map home opens a row of cards at the foot of the map: that pin centred among its province
  // neighbours (nearest alternating left/right), with wrap so either swipe direction always has a card. The same cards
  // as the Explore row (XCard). Swiping, the arrows or a tap on a neighbour choose a card, and its pin lights on the
  // map. A second tap on the chosen card raises the panel, with that card's details (the listing sheet, inline) below
  // the cards. The levels and their history entries belong to the map screen (home.jsx); this component only draws
  // them and reports what was asked.

  /**
   * The carousel's order for the province pool: the tapped pin in the middle, then its nearest neighbours alternating
   * right then left (so a swipe either way has a card), at most `cap` cards in all. `visible` (ids; null = every one
   * in `markers`) still scopes the pool when given. Ideas never appear. Returns markers.
   */
  function peekOrder(target, markers, visible, cap) {
    if (!target) return [];
    const max = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : ROW_CAP;
    const vis = Array.isArray(visible) ? new Set(visible) : null;
    const pool = (Array.isArray(markers) ? markers : [])
      .filter((m) => m && m.id !== target.id && m.type !== 'idea' && (!vis || vis.has(m.id)));
    const others = rank(target, pool, null, Math.max(0, max - 1)).slice(0, Math.max(0, max - 1)).map((r) => r.m);
    // nearest alternate onto the right, then the left, so the target sits with neighbours either side
    const out = [target];
    for (let i = 0; i < others.length; i++) {
      if (i % 2 === 0) out.push(others[i]);
      else out.unshift(others[i]);
    }
    return out;
  }

  /** Which card's middle is closest to `mid` (the row's middle, in the row's scroll coordinates)? -1 for no cards. */
  function nearestIndex(centres, mid) {
    let best = -1;
    let gap = Infinity;
    (centres || []).forEach((c, i) => { const d = Math.abs(c - mid); if (d < gap) { gap = d; best = i; } });
    return best;
  }

  const SWIPE_SETTLE_MS = 140;   // a swipe has ended once the row has been still this long (snap and momentum included)
  const PULL_PX = 36;            // a vertical pull this long on the panel raises it or steps back
  /**
   * props: items (markers, in order), index, raised, origin + distWords (the cards' distance), sources (indexSources()),
   *        hidden, focusCard (a counter: move focus to the chosen card, for a pin chosen from the keyboard), onIndex(i),
   *        onRaise(), onBack(), onClose(), details(m) (the node under the cards when raised), returnFocus(id) (it closed
   *        with focus inside: `id` is the card that was chosen last).
   */
  function PinCarousel(props) {
    const items = Array.isArray(props.items) ? props.items : [];
    const n = items.length;
    const index = Math.max(0, Math.min(n - 1, props.index || 0));
    const raised = !!props.raised;
    const root = useRef(null);
    const body = useRef(null);         // raised: the only vertical scroller (bar stays put)
    const row = useRef(null);
    const indexRef = useRef(index);
    indexRef.current = index;
    const touched = useRef(false);     // the person's own finger, wheel or trackpad moved the row
    const settle = useRef(null);
    const fromSwipe = useRef(false);
    const mounted = useRef(false);
    const pull = useRef(null);
    const swipeStart = useRef(null);
    const swallow = useRef(false);
    const back = useRef(props.onBack);
    back.current = props.onBack;
    const giveBack = useRef(props.returnFocus);
    giveBack.current = props.returnFocus;
    const lastId = useRef('');
    const str = S();
    const P = str.peek || {};
    const Icon = window.Icon;
    const near = window.MapV2Nearby;
    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);
    const current = items[index] || null;
    lastId.current = current ? current.id : '';

    // the chosen card in the middle of the row, unless the person's own swipe chose it (the row is already there)
    const centreCard = (i, smooth) => {
      const el = row.current;
      const card = el && el.children[i];
      if (!card || typeof el.scrollTo !== 'function') return;
      const left = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
      el.scrollTo({ left: left, behavior: smooth && !matches(REDUCED_MQ) ? 'smooth' : 'auto' });
    };
    const order = items.map((m) => m.id).join('|');
    useEffect(() => {
      if (fromSwipe.current) { fromSwipe.current = false; return; }
      centreCard(index, mounted.current);
      mounted.current = true;
    }, [index, order]);
    useEffect(() => {
      if (!props.focusCard || !row.current) return;
      const card = row.current.children[indexRef.current];
      if (card && card.focus) card.focus({ preventScroll: true });
    }, [props.focusCard]);
    useEffect(() => () => clearTimeout(settle.current), []);
    // Raised: reset the body scroller when the panel rises or the chosen card changes.
    useEffect(() => {
      if (raised && body.current) body.current.scrollTop = 0;
    }, [raised, index, order]);
    // A layout effect: its clean-up runs while the carousel is still in the page, so focus can still be found inside it
    // (by the time a plain effect's clean-up runs, the removed cards have already dropped focus to the page).
    useLayoutEffect(() => {
      const el = root.current;
      return () => { if (el && el.contains(document.activeElement) && giveBack.current) giveBack.current(lastId.current); };
    }, []);
    // Escape steps back one level, like Back (not while a full sheet is open over the carousel: that one takes it)
    useEffect(() => {
      if (props.hidden) return undefined;
      const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); if (back.current) back.current(); } };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [props.hidden]);

    const onRowScroll = () => {
      if (!touched.current) return;
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        touched.current = false;
        const el = row.current;
        if (!el) return;
        const centres = Array.prototype.map.call(el.children, (c) => c.offsetLeft + c.offsetWidth / 2);
        const i = nearestIndex(centres, el.scrollLeft + el.clientWidth / 2);
        if (i !== -1 && i !== indexRef.current) { fromSwipe.current = true; props.onIndex(i); }
      }, SWIPE_SETTLE_MS);
    };
    const touch = () => { touched.current = true; };

    // Follow-finger vertical drag, snap on release (founder, 2026-11-23).
    // Whole preview (bar + body/cards): swipe down closes / steps back — not handle-only.
    // Raised body: only a FRESH downward swipe that starts at scroll-top can lower
    // (finger must lift after scrolling to the top, then swipe down again).
    const peekX = () => {
      const home = root.current && root.current.closest && root.current.closest("[data-mv2='home']");
      return (home && !home.hasAttribute('data-narrow')) ? 'translateX(-50%) ' : '';
    };
    const peekPx = () => {
      const el = root.current;
      if (!el) return 320;
      // --pp-peek is a calc() token (parseFloat → NaN). Prefer the on-screen lowered height.
      if (!raised && typeof window !== 'undefined') {
        const box = el.getBoundingClientRect();
        const vis = Math.max(0, (window.innerHeight || 0) - box.top);
        if (vis > 80) return vis;
      }
      if (window.getComputedStyle) {
        const v = parseFloat(window.getComputedStyle(el).getPropertyValue('--pp-peek'));
        if (Number.isFinite(v) && v > 0) return v;
      }
      return Math.round((el.offsetHeight || 600) * 0.45) || 320;
    };
    const clearPeekDrag = () => {
      const el = root.current;
      if (!el) return;
      el.style.transition = '';
      el.style.transform = '';
    };
    const onPullDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Back / Close / arrows / social chips / focus chrome own their clicks.
      if (e.target.closest && e.target.closest(
        "[data-mv2='pinpeek-back'], [data-mv2='pinpeek-close'], [data-mv2='xarrow'], [data-mv2='handle-chip'], [data-mv2='xfocus-back'], [data-mv2='xfocus-close']",
      )) return;
      const onBar = !!(e.target.closest && (
        e.target.closest("[data-mv2='pinpeek-bar']") ||
        e.target.closest("[data-mv2='handle']") ||
        e.target.closest("[data-mv2='handle-bar']")
      ));
      const inBody = !!(e.target.closest && e.target.closest("[data-mv2='pinpeek-body']"));
      // A finger off the bar is the touch pull's (below): the body's native scrolling would cancel this one.
      if (e.pointerType === 'touch' && !onBar) return;
      const el = root.current;
      if (!el) return;
      const H = el.offsetHeight;
      const baseY = raised ? 0 : Math.max(0, H - peekPx());
      if (raised && inBody) {
        const sc = body.current;
        // Fresh gesture only: must already be at top when the finger goes down.
        if (sc && sc.scrollTop >= 6) return;
        pull.current = {
          x: e.clientX, y: e.clientY, id: e.pointerId, captured: false,
          fromHandle: false, onlyDown: true, baseY: baseY, H: H, lastY: baseY,
        };
        return;
      }
      if (raised && !onBar) return;
      // Lowered: bar or the preview body/cards — vertical down closes (sideways stays with the row).
      pull.current = {
        x: e.clientX, y: e.clientY, id: e.pointerId, captured: false,
        fromHandle: onBar, onlyDown: false, baseY: baseY, H: H, lastY: baseY,
      };
      // Handle/bar: capture immediately so a drag off the bar still gets moves (founder follow-finger).
      // Cards wait for a clear vertical before capture (sideways swipe keeps the row).
      if (onBar && e.currentTarget && e.currentTarget.setPointerCapture) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ }
      }
    };
    const onPullMove = (e) => {
      const p = pull.current;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.captured) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Raised body at top: upward belongs to the scroller; only a clear downward pull lowers.
        if (p.onlyDown && dy < 0) { pull.current = null; return; }
        // Sideways: drop the panel pull so the card row keeps its pan-x scroll.
        if (Math.abs(dy) <= Math.abs(dx)) { pull.current = null; return; }
        p.captured = true;
        if (e.currentTarget && e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
        }
      }
      // Keep the finger glued while dragging the sheet (body or bar).
      if (e.cancelable) e.preventDefault();
      const el = root.current;
      if (!el) return;
      const y = Math.max(0, Math.min(p.H, p.baseY + dy));
      p.lastY = y;
      el.style.transition = 'none';
      el.style.transform = peekX() + 'translateY(' + y + 'px)';
    };
    const finishPeekPull = (e) => {
      const p = pull.current;
      pull.current = null;
      clearPeekDrag();
      if (!p || (e && p.id !== e.pointerId)) return;
      const dx = e ? e.clientX - p.x : 0;
      const dy = e ? e.clientY - p.y : 0;
      // Short press on the handle / sticky bar = tap → step down (founder, 2026-11-22). Cards keep their tap.
      if (!p.captured && Math.hypot(dx, dy) < 24) {
        if (!p.fromHandle) return;
        swallow.current = true;
        setTimeout(() => { swallow.current = false; }, 50);
        if (props.onBack) props.onBack();
        return;
      }
      if (!p.captured) return;
      const y = p.lastY;
      const midPeek = Math.max(0, p.H - peekPx());
      const traveled = Math.abs(y - p.baseY);
      if (traveled < PULL_PX && Math.abs(dy) < PULL_PX) return;
      swallow.current = true;
      setTimeout(() => { swallow.current = false; }, 0);
      if (raised) {
        // Dragged past halfway toward the lowered peek (or a clear flick down) → step back.
        if (y > midPeek / 2 || dy > PULL_PX) { if (props.onBack) props.onBack(); }
        return;
      }
      // Lowered: up past mid → raise; down past a bit → close.
      if (y < midPeek / 2 || dy < -PULL_PX) { if (props.onRaise) props.onRaise(); }
      else if (y > midPeek + 48 || dy > PULL_PX) { if (props.onBack) props.onBack(); }
    };
    const onPullUp = (e) => { finishPeekPull(e); };
    const onPullCancel = () => { pull.current = null; clearPeekDrag(); };
    // A finger on the cards or the raised details (founder, 2026-11-25), read from touch events like the Explore panel:
    // the first clear move decides. Sideways stays with the card row. Lowered, up raises and down closes; raised, a pull
    // down from the top of the details follows the finger, and a flick or a long pull steps back to the cards. The bar
    // keeps its pointer pull, and the buttons keep their taps.
    const touchApi = useRef({});
    touchApi.current = { raised: raised, peekPx: peekPx, peekX: peekX, clear: clearPeekDrag, onBack: props.onBack, onRaise: props.onRaise };
    useEffect(() => {
      const el = root.current;
      if (!el) return undefined;
      const SKIP = "[data-mv2='pinpeek-bar'], [data-mv2='handle'], [data-mv2='pinpeek-back'], [data-mv2='pinpeek-close'], [data-mv2='xarrow'], [data-mv2='handle-chip']";
      let t = null;
      const start = (e) => {
        t = null;
        if (e.touches.length !== 1 || (e.target.closest && e.target.closest(SKIP))) return;
        const api = touchApi.current;
        const sc = body.current;
        if (api.raised && sc && sc.scrollTop > 0) return;
        const p0 = e.touches[0];
        const H = el.offsetHeight;
        t = {
          raised: api.raised, x: p0.clientX, y: p0.clientY, H: H, mid: Math.max(0, H - api.peekPx()),
          base: api.raised ? 0 : Math.max(0, H - api.peekPx()), decided: false, pulling: false, dy: 0,
          trail: [[e.timeStamp || Date.now(), 0]],
        };
      };
      const move = (e) => {
        if (!t) return;
        const p0 = e.touches[0];
        const dx = p0.clientX - t.x;
        const dy = p0.clientY - t.y;
        if (!t.decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          t.decided = true;
          const sc = body.current;
          if (Math.abs(dx) > Math.abs(dy) || (t.raised && (dy <= 0 || (sc && sc.scrollTop > 0)))) { t = null; return; }
          t.pulling = true;
          pull.current = null;
        }
        if (!t.pulling) return;
        if (e.cancelable) e.preventDefault();
        t.dy = t.raised ? Math.max(0, dy) : dy;
        t.trail.push([e.timeStamp || Date.now(), t.dy]);
        if (t.trail.length > 6) t.trail.shift();
        el.style.transition = 'none';
        el.style.transform = touchApi.current.peekX() + 'translateY(' + Math.max(0, Math.min(t.H, t.base + t.dy)) + 'px)';
      };
      const end = (e) => {
        const g = t;
        t = null;
        if (!g || !g.pulling) return;
        const api = touchApi.current;
        api.clear();
        swallow.current = true;
        setTimeout(() => { swallow.current = false; }, 0);
        // only the last 100 ms count: a finger that stopped before lifting is not a flick
        const last = (e && e.timeStamp) || Date.now();
        const recent = g.trail.filter((p) => last - p[0] <= 100);
        const a = recent[0];
        const b = recent[recent.length - 1];
        const speed = a && b && b !== a ? (b[1] - a[1]) / Math.max(1, b[0] - a[0]) : 0;   // px per ms, down positive
        if (g.raised) {
          if (speed > 0.45 || g.dy > 80 || (g.mid > 0 && g.dy > g.mid / 2)) { if (api.onBack) api.onBack(); }
          return;
        }
        if (speed < -0.45 || g.dy < -60) { if (api.onRaise) api.onRaise(); }
        else if (speed > 0.45 || g.dy > 60) { if (api.onBack) api.onBack(); }
      };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchmove', move, { passive: false });
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
      return () => {
        el.removeEventListener('touchstart', start);
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', end);
        el.removeEventListener('touchcancel', end);
      };
    }, []);

    const tap = (id) => {
      if (swallow.current) return;
      const i = items.findIndex((m) => m.id === id);
      if (i === -1) return;
      if (i !== index) { props.onIndex(i); return; }
      // Tap 1 (neighbour) / tap 2 raises / tap 3 closes preview + centres pin on screen (no zoom).
      if (!raised) { props.onRaise(); return; }
      if (props.onDive) props.onDive(id);
    };
    // wrap: province items loop, so either direction always has a neighbour when there is more than one
    const step = (d) => { if (n > 1) props.onIndex((index + d + n) % n); };
    const meters = (m) => (props.origin && near ? near.metersBetween(props.origin, m) : NaN);
    const iconBtn = (attrs, icon, word) => h('button', Object.assign({ type: 'button' }, attrs),
      Icon ? h(Icon, { name: icon, size: 18 }) : null, word ? h('span', null, word) : null);

    return h('section', {
      ref: root, 'data-mv2': 'pinpeek', 'data-raised': raised ? '' : undefined, hidden: props.hidden || undefined,
      'aria-label': P.label,
      onPointerDown: onPullDown, onPointerMove: onPullMove, onPointerUp: onPullUp,
      onPointerCancel: onPullCancel,
    },
      h('div', { 'data-mv2': 'pinpeek-bar' },
        raised ? iconBtn({
          'data-mv2': 'pinpeek-back',
          // Back = one level (raised → cards → closed via onBack).
          onClick: (e) => {
            e.stopPropagation();
            if (swallow.current) { swallow.current = false; return; }
            if (props.onBack) props.onBack();
          },
        }, 'ChevronLeft', P.back) : null,
        h('span', { 'data-mv2': 'pinpeek-status', role: 'status', 'aria-live': 'polite' },
          current ? h('span', { 'data-mv2': 'sr' }, current.title || '') : null),
        h('button', {
          type: 'button', 'data-mv2': 'handle',
          'aria-label': P.lower || P.back || '',
          // A bare bar in every look (founder, 2026-11-25: the chevron is gone; the gold nudge carries the hint).
          // Handle = minimize / step down (same as Back). Tap is handled in onPullUp; click is the keyboard fallback.
          onClick: (e) => {
            if (swallow.current) { swallow.current = false; return; }
            e.stopPropagation();
            if (props.onBack) props.onBack();
          },
        },
          h('span', { 'data-mv2': 'handle-bar', 'aria-hidden': 'true' })),
        h('span', { 'data-mv2': 'drawer-mark', 'aria-hidden': 'true' },
          (window.MapV2Strings && window.MapV2Strings.explore && window.MapV2Strings.explore.panel
            && window.MapV2Strings.explore.panel.brandMark) || ''),
        iconBtn({
          // X = close the whole carousel / go home.
          'data-mv2': 'pinpeek-close', 'aria-label': P.close,
          onClick: (e) => {
            e.stopPropagation();
            if (swallow.current) { swallow.current = false; return; }
            if (props.onClose) props.onClose();
          },
        }, 'X')),
      // Body owns vertical scroll when raised (bar stays fixed). Lowered: no independent scroll.
      h('div', { ref: body, 'data-mv2': 'pinpeek-body' },
        h('div', { 'data-mv2': 'xrow-wrap', 'data-peek': '' },
          n > 1 ? iconBtn({ 'data-mv2': 'xarrow', 'data-dir': 'prev', 'aria-label': P.prev, onClick: () => step(-1) }, 'ChevronLeft') : null,
          h('div', {
            ref: row, 'data-mv2': 'xrow', 'data-row': 'peek', onScroll: onRowScroll,
            onPointerDownCapture: touch, onTouchStart: (e) => {
              touch();
              if (e.touches && e.touches[0]) swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, index: indexRef.current };
            }, onTouchEnd: (e) => {
              const start = swipeStart.current;
              swipeStart.current = null;
              if (!start || !e.changedTouches || !e.changedTouches.length || n < 2) return;
              const dx = e.changedTouches[0].clientX - start.x;
              const dy = e.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) <= Math.abs(dy)) return;
              if (start.index === 0 && dx > 40) { touched.current = false; props.onIndex(n - 1); }
              else if (start.index === n - 1 && dx < -40) { touched.current = false; props.onIndex(0); }
            }, onWheel: touch,
          }, items.map((m, i) => h(XCard, {
            key: 'peek:' + m.id, m: m, meters: meters(m), rec: byKey.get(m.type + ':' + m.id),
            groupWords: str.groups, distWords: props.distWords || {},
            peek: true, selected: i === index,
            detailsCue: !raised, cueLabel: P.detailsCue || P.detailsBadge || '',
            onOpen: tap,
          }))),
          n > 1 ? iconBtn({ 'data-mv2': 'xarrow', 'data-dir': 'next', 'aria-label': P.next, onClick: () => step(1) }, 'ChevronRight') : null),
        raised && current && props.details ? h('div', {
          'data-mv2': 'pinpeek-details', role: 'region', 'aria-label': P.details ? P.details(current.title || '') : '',
        }, props.details(current)) : null));
  }

  // An id inside an attribute selector: listing ids are uuids or slugs, but never trust that.
  function cssId(id) {
    const s = String(id);
    return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  /**
   * Nested Explore inside the raised pin peek (founder, 2026-11-22): the same Where to… tiles, Near & now /
   * New / Nearby rows and Explore button as the default pull-up, below the profile. Choosing a tile or row
   * focuses that block in this panel (and filters the map); clearing focus returns to the browse layout.
   * props: markers, sources, origin, focus, distWords, selectedId, onFocus, onOpen(id, type), onSeeAll().
   */
  function PeekExplore(props) {
    const str = S();
    const P = str.panel || {};
    const Icon = window.Icon;
    const focus = props.focus || null;
    const tile = focus && focus.kind === 'tile' ? focus.id : '';
    const sec = focus && focus.kind === 'sec' ? focus.id : '';
    const byKey = useMemo(() => indexSources(props.sources), [props.sources]);
    const origin = props.origin || null;
    const markers = (Array.isArray(props.markers) ? props.markers : []).filter((m) => m && m.type !== 'idea' && m.type !== 'contributor');
    const pool = markers;
    const ranked = (list, cap) => rank(origin, list, props.selectedId, cap || 12);
    const current = tileOf(tile);
    const tileItems = current ? ranked(pool.filter((m) => tileMatches(current.id, m)), 12) : [];
    const now = Date.now();
    const soon = (m) => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= now && t - now <= 6 * HOUR; };
    const weekend = weekendBounds(now);
    const rows = {
      around: ranked(pool.filter((m) => (m.type === 'event' && (m.isLive || soon(m))) || m.type === 'place'), 12),
      weekend: ranked(pool.filter((m) => m.type === 'event' && (() => { const t = Date.parse(m.startsAt || ''); return !isNaN(t) && t >= weekend.start && t <= weekend.end; })()), 12),
      online: ranked(pool.filter((m) => looksOnline(m, byKey.get(m.type + ':' + m.id))), 12),
      fresh: ranked(pool.filter((m) => { const t = Date.parse(m.createdAt || ''); return !isNaN(t) && now - t >= 0 && now - t <= NEW_WINDOW; }), 12)
        .sort((a, b) => Date.parse(b.m.createdAt || '') - Date.parse(a.m.createdAt || '')),
      more: ranked(pool.filter((m) => m.type !== 'idea'), 16),
    };
    const setFocus = (next) => { if (props.onFocus) props.onFocus(next); };
    const chooseTile = (id) => setFocus(tile === id ? null : { kind: 'tile', id: id });
    const chooseRow = (id) => setFocus(sec === id ? null : { kind: 'sec', id: id });
    const rowTitle = (id) => P[id] || id;
    const rowHint = (id) => P[id + 'Hint'] || '';
    const distWords = props.distWords || str;
    const cards = (id, list) => h(XRow, { id: id, fine: true, list: list }, list.map((r) => h(XCard, {
      key: 'nest:' + id + ':' + r.m.id, m: r.m, meters: r.meters, rec: byKey.get(r.m.type + ':' + r.m.id),
      groupWords: str.groups, distWords: distWords,
      selected: props.selectedId === r.m.id,
      onOpen: (cid, ctype) => props.onOpen && props.onOpen(cid, ctype),
    })));
    const tab = (id, word, icon, on, onClick, extra) => h('button', Object.assign({
      key: id, type: 'button', 'data-mv2': 'explore-tile', 'data-tab': id,
      role: 'tab', 'aria-selected': on ? 'true' : 'false', onClick: onClick,
    }, extra), icon && Icon ? h(Icon, { name: icon, size: 16 }) : null, h('span', null, word));

    if (tile || sec) {
      const list = tile ? tileItems : (rows[sec] || []);
      return h('div', { 'data-mv2': 'peek-explore', 'data-focus': tile ? 'tile' : 'sec' },
        h('div', { 'data-mv2': 'xfocus', 'data-focus': tile ? 'tile' : 'sec' },
          h('div', { 'data-mv2': 'xfocus-chrome' },
            h('button', {
              type: 'button', 'data-mv2': 'xfocus-back', 'aria-label': P.closeRow || P.allTypes,
              onClick: () => setFocus(null),
            }, Icon ? h(Icon, { name: 'ChevronLeft', size: 18 }) : null),
            h('button', {
              type: 'button', 'data-mv2': 'xfocus-close', 'aria-label': P.lower,
              onClick: () => setFocus(null),
            }, Icon ? h(Icon, { name: 'X', size: 18 }) : null)),
          tile
            ? h('div', { 'data-mv2': 'explore-tiles', 'data-tabs': '', role: 'tablist', 'aria-label': P.where },
              TILES.map((t) => tab(t.id, t.word, t.icon, tile === t.id, () => chooseTile(t.id), { 'data-tile': t.id })))
            : h('div', { 'data-mv2': 'explore-tiles', 'data-tabs': '', role: 'tablist', 'aria-label': P.rows },
              SECTIONS.filter((id) => rows[id].length || id === sec).map((id) => tab(id, rowTitle(id), null, sec === id, () => chooseRow(id), { 'data-sec': id }))),
          list.length ? cards(tile ? 'tile' : sec, list)
            : h('p', { 'data-mv2': 'explore-empty' }, tile ? (P.emptyTile ? P.emptyTile(current ? current.word : '') : '') : (P.emptyRow || ''))));
    }

    return h('div', { 'data-mv2': 'peek-explore' },
      h('div', { 'data-mv2': 'where-block' },
        h('h3', { 'data-mv2': 'where-lead' }, P.whereLead || P.where),
        h('div', { 'data-mv2': 'explore-tiles', role: 'list', 'aria-label': P.where },
          TILES.map((t) => h('button', {
            key: t.id, type: 'button', 'data-mv2': 'explore-tile', 'data-tile': t.id, 'data-tab': t.id,
            onClick: () => chooseTile(t.id),
          }, Icon ? h(Icon, { name: t.icon, size: 24 }) : null, h('span', null, t.word))))),
      SECTIONS.map((id) => (rows[id].length ? h('section', { key: id, 'data-mv2': 'xsec', 'data-sec': id, 'aria-label': rowTitle(id) },
        h('div', { 'data-mv2': 'xsec-h' },
          h('h3', null, h('button', { type: 'button', 'data-mv2': 'xsec-go', onClick: () => chooseRow(id) }, rowTitle(id))),
          rowHint(id) ? h('small', null, rowHint(id)) : null),
        cards(id, rows[id])) : null)),
      h('button', {
        type: 'button', 'data-mv2': 'explore-more', 'aria-label': P.seeAll,
        onClick: () => { if (props.onSeeAll) props.onSeeAll(); },
      },
        h('span', { 'data-mv2': 'explore-more-ring' }, Icon ? h(Icon, { name: 'Compass', size: 22 }) : null),
        h('small', null, P.seeAll)));
  }

  /** True on a phone-width screen, where the folding nav sits at the foot (the home screen clears room for it). */
  const useNarrow = () => useMedia(NARROW_MQ);

  window.MapV2Explore = {
    ROW_CAP, SETTLE_MS, GROUPS, GROUP_OF, PILLS, INTENTS, TILES, groupOf, pillMatches, intentOf, intentMatches, matchesFilter, tileOf, tileMatches, tileFor, rank, useNarrow, indexSources, cardFor, Pills, Categories, Intents, Explore, SECTIONS,
    peekOrder, nearestIndex, PinCarousel, PeekExplore,
    placeWhereLine, eventDateLine, cardMetaLine, looksStreet,
    lastView: () => lastView,
  };
})();
