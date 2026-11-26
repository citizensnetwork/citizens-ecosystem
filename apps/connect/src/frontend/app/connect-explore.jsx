// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Explore, pulled in over the map (founder's design, 2026-11-26)
//  ------------------------------------------------------------------
//  ONE Explore. It replaces the pack-07 Explore page and the old Kingdom Exploration list (/discover). The live map
//  stays mounted underneath (shell.jsx MapStage); here it is blurred a little and covered by a veil that tapers from
//  almost nothing at the left edge to most of the way at the right, the side Explore is pulled in from.
//
//  The page: "Explore." (Manrope, the heading face, with the gold full stop), three views (This week, Things to do,
//  Categories), a search field and Refine that stick to the top once scrolled, and the category pills. Any search,
//  pill, Things-to-do choice, "See all" or refinement turns the page into one list of results with a sort.
//
//  Every listing is the app's own (ConnectPreviews.listingsFrom, plus the Kingdom Projects that are open for votes).
//  Nothing is invented: the facts in a preview are fields we already store. The city scope is the QA plan's (35 km
//  around the chosen city, else the city the map last looked at; a listing with no pin is never hidden, it sits in its
//  own "Online" group). The week's feature card goes to the SOONEST event, never the most popular, and the companion
//  cards take fair turns (an order drawn afresh each day from the listing's id), so no size or age keeps the front
//  (VISION.md: the small are honoured).
//
//  A card opens the PREVIEW: a bottom sheet on a phone, a centred panel on a wide screen. One top bar names where you
//  are, one × closes it. One gold main action per kind, at most three quiet ones, and "Full profile ›" as a link.
//
//  EdgeHandle is the Map's right-edge pill: a swipe left from it (or a tap, or Enter) pulls Explore in.
//  Pure helpers are unit-tested in exploreSurface.test.ts. Styles: assets/map-v2.css section 4p (tokens only).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useMemo, useEffect, useRef } = React;

  const W = {
    title: 'Explore',
    intro: {
      week: (city) => 'Find something to join, discover what’s new, and see where you can help' + (city ? ' around ' + city : '') + '.',
      things: 'Start with what you’d like to do. Find people, places and ways to get involved.',
      categories: 'Find the kind of thing you’re looking for, from gatherings and churches to schools, shops and ways to serve.',
    },
    views: [['week', 'This week', 'CalendarDays'], ['things', 'Things to do', 'Route'], ['categories', 'Categories', 'Shapes']],
    viewsLabel: 'Explore views',
    search: 'Search Explore',
    refine: 'Refine',
    pillsLabel: 'Filter by kind',
    all: 'All', events: 'Events', ideas: 'Kingdom Projects',
    seeAll: 'See all',
    feature: 'Around the Kingdom this week',
    weekend: (city) => 'This weekend' + (city ? ' in ' + city : ''),
    weekendEmpty: 'Nothing on this weekend yet. Gather people for something good.',
    startLets: 'Start a Let’s gathering',
    todo: 'What would you like to do?',
    comingUp: 'Coming up',
    near: 'Near you',
    online: 'Online and serving across South Africa',
    takePart: 'Ways to take part',
    visit: 'Places to visit',
    browse: 'Browse by category',
    across: 'From across the Kingdom',
    scope: (city, n, km) => 'Showing ' + city + ': ' + n + (n === 1 ? ' listing' : ' listings') + ' within ' + km + ' km. ',
    scopeWide: 'Showing all of South Africa. ',
    widen: 'Widen to all South Africa',
    back: (city) => 'Back to ' + city,
    results: 'Results', searchResults: 'Search results',
    count: (n, q) => n + (n === 1 ? ' result' : ' results') + (q ? ' for “' + q + '”' : ''),
    sortLabel: 'Sort results',
    sorts: [['recommended', 'Recommended'], ['soon', 'Soonest first'], ['near', 'Nearest first']],
    clear: 'Clear filters',
    emptyTitle: 'No matches here',
    emptyQuery: (q, city) => 'Nothing for “' + q + '”' + (city ? ' in ' + city : '') + ' yet.',
    emptyFilter: (city) => 'Nothing matches these filters' + (city ? ' in ' + city : '') + ' yet.',
    clearSearch: 'Clear the search',
    addListing: 'Add a listing',
    scopes: { upcoming: 'Coming up', near: 'Near you', weekend: 'This weekend', part: 'Ways to take part', visit: 'Places to visit' },
    refineTitle: 'Refine Explore',
    refineLead: 'Choose when, where, and the kinds of events or places you want to find.',
    when: 'When', whenOptions: [['', 'Any date'], ['today', 'Today'], ['weekend', 'This weekend'], ['week', 'Next 7 days']],
    where: 'Where',
    eventCats: 'Event categories', placeCats: 'Place categories',
    showResults: 'Show results', clearRefine: 'Clear refinements',
    filters: 'Filters',
    preview: 'Preview', close: 'Close', fullProfile: 'Full profile',
    edge: 'Open Explore', edgeHint: 'Swipe left or tap to open Explore',
    edgeMe: 'Open Me', edgeMeHint: 'Swipe right or tap to open Me',
    kind: { event: 'Event', place: 'Place', contributor: 'Contributor', idea: 'Kingdom Project' },
    // an uncategorised Contributor still says what kind of organisation it is (entity-card.jsx KINDS)
    orgKind: { ministry: 'Ministry', organization: 'Organisation', business: 'Business', individual: 'Individual' },
    fact: {
      when: 'When', where: 'Where', host: 'Hosted by', going: 'Going', hours: 'Hours', address: 'Address', collab: 'Collaboration',
      kind: 'Kind', based: 'Based in', followers: 'Followers', support: 'Support so far', by: 'Suggested by', online: 'Online',
      openCollab: 'Open to collaborate',
    },
    act: {
      connect: 'Connect', connected: 'Connected', consider: 'Consider', considering: 'Considering', directions: 'Directions',
      follow: 'Follow', following: 'Following', save: 'Save', saved: 'Saved', share: 'Share', website: 'Website',
      project: 'See the project',
    },
    groupHint: {
      worship: 'Churches, worship and prayer', serve: 'Outreach, care and upliftment', culture: 'Markets, sport, arts and social',
      learn: 'Schools, training and equipping', audiences: 'Kids, youth, men, women and families', business: 'Christian businesses and shops',
      events: 'Gatherings with a date', ideas: 'Needs and ways to help',
    },
    groupIcon: { worship: 'Church', serve: 'HandHeart', culture: 'Palette', learn: 'BookOpen', audiences: 'Users', business: 'Store', events: 'CalendarDays', ideas: 'Lightbulb' },
    things: (n) => n + (n === 1 ? ' nearby' : ' nearby'),
  };

  // ── pure helpers (unit-tested) ──────────────────────────────────────
  // QA 2026-11-25 (CCQA-0002/0003): every word must match, in the title, kind, category, description, where or who;
  // case and accents are ignored.
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function categoryName(item) {
    const D = window.DATA;
    const c = D && D.getItemCategory ? D.getItemCategory(item) : null;
    return (c && c.name) || '';
  }
  function matchesQuery(item, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const blob = fold([item.title, item.groupLabel, item.group, item.category, categoryName(item), item.detail, item.location, item.host, item.kind].join(' '));
    return words.every((w) => blob.indexOf(w) !== -1);
  }
  /** The area out of an address: the part before the city ("1 Main Road, Hatfield, Pretoria" -> "Hatfield"). */
  function areaOf(location) {
    const parts = String(location || '').split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  }
  function kindLabel(item) {
    const cat = categoryName(item);
    if (item.type === 'event') return W.kind.event + (cat ? ' · ' + cat : '');
    if (item.type === 'place') return W.kind.place + (cat ? ' · ' + cat : '');
    if (item.type === 'idea') return W.kind.idea + (item.stage ? ' · ' + item.stage : '');
    return cat || (Object.prototype.hasOwnProperty.call(W.orgKind, item.kind) ? W.orgKind[item.kind] : W.kind.contributor);
  }
  function votesLine(item) {
    const v = Number(item.votes) || 0;
    return item.threshold ? v + ' of ' + item.threshold + ' votes' : v + (v === 1 ? ' vote' : ' votes');
  }
  /** The one line under a card's title: when and where for an event, where and who for a place. */
  function metaLine(item, T) {
    const area = areaOf(item.location);
    const date = item.startsAt && T && T.dateLine ? T.dateLine(item.startsAt) : item.when;
    if (item.type === 'event') return [date, item.online ? W.fact.online : area].filter(Boolean).join(' · ');
    if (item.type === 'place') return [area, item.host && item.host !== item.title ? item.host : ''].filter(Boolean).join(' · ');
    if (item.type === 'idea') return [votesLine(item), area].filter(Boolean).join(' · ');
    return [area, item.verified ? 'Verified' : ''].filter(Boolean).join(' · ');
  }
  /** The facts a preview lists: only fields the listing really has. */
  function factsOf(item, T) {
    const F = W.fact;
    const out = [];
    const add = (k, v) => { if (v !== undefined && v !== null && String(v).trim()) out.push([k, String(v)]); };
    if (item.type === 'event') {
      add(F.when, item.startsAt && T && T.dateLine ? T.dateLine(item.startsAt) : item.when);
      add(F.where, item.online ? F.online : item.location);
      if (item.host && item.host !== item.title) add(F.host, item.host);
      if (item.connectCount > 0) add(F.going, item.connectCount + ' connected');
    } else if (item.type === 'place') {
      add(F.hours, item.hours);
      add(F.address, item.location);
      if (item.host && item.host !== item.title) add(F.host, item.host);
      if (item.openToCollaborate) add(F.collab, F.openCollab);
    } else if (item.type === 'idea') {
      add(F.support, votesLine(item));
      add(F.by, item.host);
      add(F.where, item.location);
    } else {
      add(F.kind, categoryName(item) || item.kind);
      add(F.based, item.location);
      if (item.followers > 0) add(F.followers, item.followers);
      if (item.openToCollaborate) add(F.collab, F.openCollab);
    }
    return out;
  }
  /** One gold main action per kind, then at most three quiet ones (founder, 2026-11-26). */
  function actionsOf(item) {
    const hasPlace = !item.online && (item.lat != null || !!item.location);
    if (item.type === 'event') return { primary: 'connect', quiet: [hasPlace ? 'directions' : null, 'consider', 'share'].filter(Boolean) };
    if (item.type === 'place') return { primary: hasPlace ? 'directions' : 'follow', quiet: [hasPlace ? 'follow' : null, 'save', 'share'].filter(Boolean) };
    if (item.type === 'idea') return { primary: 'project', quiet: [] };
    return { primary: 'follow', quiet: ['save', 'share', item.website ? 'website' : null].filter(Boolean) };
  }
  /** A fair, daily order: the same listing never keeps the front because of its name, size or age. */
  function fairTurn(id, day) {
    let x = (2166136261 ^ (Number(day) | 0)) >>> 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x;
  }
  const dayOf = (now) => Math.floor(now / 86400000);
  const startMs = (i) => { const t = Date.parse(i.startsAt || ''); return Number.isFinite(t) ? t : Infinity; };
  /** Events that start (or are still on) inside [from, to], soonest first. */
  function upcoming(list, from, to) {
    return list.filter((i) => i.type === 'event' && startMs(i) <= to && (Date.parse(i.endsAt || '') || startMs(i)) >= from)
      .sort((a, b) => startMs(a) - startMs(b));
  }
  function distanceKm(item, origin, L) {
    if (!origin || item.lat == null || item.lng == null || !L || !L.haversineKm) return Infinity;
    return L.haversineKm(origin, { lat: item.lat, lng: item.lng });
  }
  function sortItems(list, sort, ctx) {
    const out = list.slice();
    if (sort === 'near') return out.sort((a, b) => distanceKm(a, ctx.origin, ctx.L) - distanceKm(b, ctx.origin, ctx.L));
    if (sort === 'soon') return out.sort((a, b) => startMs(a) - startMs(b) || fairTurn(a.id, ctx.day) - fairTurn(b.id, ctx.day));
    // recommended: dated things soonest first, then everything else in today's fair order
    return out.sort((a, b) => {
      const ea = a.type === 'event' ? 0 : 1;
      const eb = b.type === 'event' ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (!ea) return startMs(a) - startMs(b);
      return fairTurn(a.id, ctx.day) - fairTurn(b.id, ctx.day);
    });
  }
  function pillMatches(pill, item) {
    if (!pill || pill === 'all') return true;
    if (pill === 'events') return item.type === 'event';
    if (pill === 'ideas') return item.type === 'idea';
    return item.group === pill;
  }
  function ideasFrom(app) {
    return (app.ideas || []).filter((i) => i && i.status === 'voting').map((i) => ({
      id: i.id, type: 'idea', title: i.title || '', category: i.category || '', detail: i.description || i.detail || '',
      location: i.location || '', lat: i.lat, lng: i.lng, votes: i.votes || 0, threshold: i.threshold || 0,
      stage: i.tierLabel || '', host: i.authorName || '', image: i.image || '', group: 'serve', groupLabel: W.ideas,
    }));
  }

  // ── small pieces ────────────────────────────────────────────────────
  function I(name, size) {
    const Icon = window.Icon;
    return Icon ? h(Icon, { name, size: size || 18, 'aria-hidden': 'true' }) : null;
  }
  function Glyph({ slug }) {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current;
      const chrome = window.ConnectChrome;
      if (el && chrome && chrome.glyphNode) el.replaceChildren(chrome.glyphNode(slug));
    }, [slug]);
    return h('span', { 'data-mv2': 'xs-glyph', ref, 'aria-hidden': 'true' });
  }
  function Art({ item, role }) {
    const [broken, setBroken] = useState(false);
    const src = !broken && window.UI && window.UI.safeUrl ? window.UI.safeUrl(item.image) : '';
    return h('span', { 'data-mv2': 'xs-art', 'data-role': role || 'row', 'data-empty': src ? undefined : '', 'aria-hidden': 'true' },
      src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async', onError: () => setBroken(true) })
        : (item.type === 'idea' ? I('Lightbulb', 22) : h(Glyph, { slug: item.category })));
  }
  function Kind({ item }) {
    return h('span', { 'data-mv2': 'xs-kind' }, kindLabel(item));
  }
  function Card({ item, mode, onOpen, T }) {
    return h('button', {
      type: 'button', 'data-mv2': 'xs-card', 'data-mode': mode || 'row', 'data-group': item.group || undefined,
      'data-noimg': mode === 'feature' && !item.image ? '' : undefined,
      'data-item': item.id, onClick: (e) => onOpen(item, e.currentTarget),
    },
      h(Art, { item, role: mode }),
      h('span', { 'data-mv2': 'xs-copy' },
        h(Kind, { item }),
        h('span', { 'data-mv2': 'xs-title' }, item.title),
        h('span', { 'data-mv2': 'xs-meta' }, metaLine(item, T))),
      h('span', { 'data-mv2': 'xs-chev' }, I('ChevronRight', 16)));
  }
  function Section({ title, onAll, children, cc, note }) {
    if (!children) return null;
    return h('section', { 'data-mv2': 'xs-section', 'data-cc': cc || undefined },
      h('div', { 'data-mv2': 'xs-section-head' },
        h('div', null, h('h2', null, title), note ? h('p', null, note) : null),
        onAll ? h('button', { type: 'button', 'data-mv2': 'xs-link', onClick: onAll, 'aria-label': W.seeAll + ': ' + title }, W.seeAll, I('ChevronRight', 14)) : null),
      children);
  }
  const rows = (list, onOpen, T) => (list.length ? h('div', { 'data-mv2': 'xs-rows' }, list.map((i) => h(Card, { key: i.type + i.id, item: i, onOpen, T }))) : null);

  // ── the preview ─────────────────────────────────────────────────────
  function Preview({ item, onClose, T }) {
    const app = window.useApp();
    const ref = useRef(null);
    useEffect(() => {
      const d = ref.current;
      if (d && d.showModal && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
      const close = d && d.querySelector("[data-mv2='xs-close']");
      if (close) close.focus();
    }, []);
    const A = W.act;
    const name = item.title;
    const dir = window.CCLocation && window.CCLocation.directionsFor ? window.CCLocation.directionsFor(item) : { url: '' };
    const site = window.UI && window.UI.safeUrl ? window.UI.safeUrl(item.website) : '';
    const has = (set) => !!(set && set.has && set.has(item.id));
    const btn = (id, primary) => {
      const p = { key: id, 'data-mv2': 'xs-act', 'data-primary': primary ? '' : undefined };
      if (id === 'directions') return dir && dir.url ? h('a', Object.assign(p, { href: dir.url, target: '_blank', rel: 'noopener noreferrer' }), I('Navigation', 16), A.directions) : null;
      if (id === 'website') return site ? h('a', Object.assign(p, { href: site, target: '_blank', rel: 'noopener noreferrer' }), I('Globe', 16), A.website) : null;
      const on = id === 'connect' ? has(app.connected) : id === 'consider' ? has(app.considering)
        : id === 'follow' ? (item.type === 'place' ? has(app.followedPlaces) : has(app.followedOrgs))
          : id === 'save' ? (item.type === 'place' ? has(app.savedPlaces) : has(app.savedContributors)) : false;
      const label = { connect: on ? A.connected : A.connect, consider: on ? A.considering : A.consider, follow: on ? A.following : A.follow, save: on ? A.saved : A.save, share: A.share, project: A.project }[id];
      const icon = { connect: on ? 'Check' : 'CalendarCheck', consider: 'Bookmark', follow: 'Heart', save: 'Bookmark', share: 'Share2', project: 'Lightbulb' }[id];
      const run = () => {
        if (id === 'connect') app.toggleConnect(item.id);
        else if (id === 'consider') app.toggleConsider(item.id);
        else if (id === 'follow') (item.type === 'place' ? app.togglePlaceFollow(item.id, name) : app.toggleFollow(item.id, name));
        else if (id === 'save') app.toggleSave(item.type === 'place' ? 'place' : 'contributor', item.id, name);
        else if (id === 'share') app.shareLink({ page: item.type === 'contributor' ? 'profile' : item.type, params: { id: item.id } });
        else if (id === 'project') { onClose(); app.go('community'); }
      };
      return h('button', Object.assign(p, { type: 'button', 'aria-pressed': id === 'share' || id === 'project' ? undefined : (on ? 'true' : 'false'), onClick: run }), I(icon, 16), label);
    };
    const acts = actionsOf(item);
    const facts = factsOf(item, T);
    const openFull = () => {
      onClose();
      if (item.type === 'idea') app.go('community');
      else app.go(item.type === 'contributor' ? 'profile' : item.type, { id: item.id });
    };
    return h('dialog', {
      ref, 'data-mv2': 'xs-preview', 'data-group': item.group || undefined, 'aria-labelledby': 'xs-preview-title',
      onCancel: (e) => { e.preventDefault(); onClose(); },
      onClick: (e) => { if (e.target === ref.current) onClose(); },
    },
      h('div', { 'data-mv2': 'xs-dialog-top' },
        h('strong', null, W.preview),
        h('button', { type: 'button', 'data-mv2': 'xs-close', 'aria-label': W.close, onClick: onClose }, I('X', 18))),
      h('div', { 'data-mv2': 'xs-dialog-body' },
        h(Art, { item, role: 'preview' }),
        h(Kind, { item }),
        h('h2', { id: 'xs-preview-title' }, name),
        h('p', { 'data-mv2': 'xs-meta' }, metaLine(item, T)),
        item.detail ? h('p', { 'data-mv2': 'xs-detail' }, item.detail) : null,
        facts.length ? h('dl', null, facts.map(([k, v]) => h(React.Fragment, { key: k }, h('dt', null, k), h('dd', null, v)))) : null,
        h('div', { 'data-mv2': 'xs-acts' },
          btn(acts.primary, true),
          acts.quiet.map((id) => btn(id, false)),
          h('button', { type: 'button', 'data-mv2': 'xs-full', onClick: openFull }, W.fullProfile, I('ChevronRight', 14)))));
  }

  // ── Refine ──────────────────────────────────────────────────────────
  function Refine({ state, cities, onApply, onClose }) {
    const ref = useRef(null);
    const D = window.DATA || {};
    const [when, setWhen] = useState(state.whenKey);
    const [cats, setCats] = useState(state.cats);
    const [city, setCity] = useState(state.cityName);
    const [wide, setWide] = useState(state.wide);
    useEffect(() => {
      const d = ref.current;
      if (d && d.showModal && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
    }, []);
    const toggle = (id) => setCats((c) => (c.indexOf(id) === -1 ? c.concat(id) : c.filter((x) => x !== id)));
    const box = (c) => h('label', { key: c.id, 'data-mv2': 'xs-check' },
      h('input', { type: 'checkbox', checked: cats.indexOf(c.id) !== -1, onChange: () => toggle(c.id) }), c.name);
    return h('dialog', {
      ref, 'data-mv2': 'xs-refine', 'aria-labelledby': 'xs-refine-title',
      onCancel: (e) => { e.preventDefault(); onClose(); },
      onClick: (e) => { if (e.target === ref.current) onClose(); },
    },
      h('div', { 'data-mv2': 'xs-dialog-top' },
        h('strong', null, W.filters),
        h('button', { type: 'button', 'data-mv2': 'xs-close', 'aria-label': W.close, onClick: onClose }, I('X', 18))),
      h('div', { 'data-mv2': 'xs-dialog-body' },
        h('h2', { id: 'xs-refine-title' }, W.refineTitle),
        h('p', { 'data-mv2': 'xs-detail' }, W.refineLead),
        h('fieldset', { 'data-mv2': 'xs-field', 'data-cc': 'explore-when' },
          h('legend', null, W.when),
          h('div', { 'data-mv2': 'xs-chips' }, W.whenOptions.map(([k, word]) => h('button', {
            key: k || 'any', type: 'button', 'data-mv2': 'xs-pill', 'aria-pressed': when === k ? 'true' : 'false', onClick: () => setWhen(k),
          }, word)))),
        h('fieldset', { 'data-mv2': 'xs-field' },
          h('legend', null, W.where),
          h('select', { 'aria-label': W.where, 'data-mv2': 'xs-select', value: city, onChange: (e) => setCity(e.target.value) },
            !cities.some((c) => c.name === city) ? h('option', { value: '' }, city || 'Nearby') : null,
            cities.map((c) => h('option', { key: c.name, value: c.name }, c.name))),
          h('label', { 'data-mv2': 'xs-check' }, h('input', { type: 'checkbox', checked: wide, onChange: () => setWide(!wide) }), W.widen)),
        h('fieldset', { 'data-mv2': 'xs-field' }, h('legend', null, W.eventCats), (D.EVENT_CATEGORIES || []).map(box)),
        h('fieldset', { 'data-mv2': 'xs-field' }, h('legend', null, W.placeCats), (D.PLACE_CATEGORIES || []).map(box)),
        h('div', { 'data-mv2': 'xs-acts' },
          h('button', { type: 'button', 'data-mv2': 'xs-act', 'data-primary': '', onClick: () => onApply({ whenKey: when, cats, cityName: city, wide }) }, W.showResults),
          h('button', { type: 'button', 'data-mv2': 'xs-act', onClick: () => { setWhen(''); setCats([]); setWide(false); } }, W.clearRefine))));
  }

  // ── the page ────────────────────────────────────────────────────────
  const VIEW_KEY = 'cc_xs_view';
  function readView() {
    try { const v = window.sessionStorage.getItem(VIEW_KEY); return v === 'things' || v === 'categories' ? v : 'week'; } catch (e) { return 'week'; }
  }

  function Page() {
    const app = window.useApp();
    const chrome = window.ConnectChrome || {};
    const T = window.MapV2Time;
    const L = window.CCLocation;
    const X = window.MapV2Explore || {};
    const useBackGuard = window.useBackGuard || function () {};
    const [view, setViewState] = useState(readView);
    const [query, setQuery] = useState('');
    const [pill, setPill] = useState('all');
    const [intent, setIntent] = useState('');
    const [scope, setScope] = useState('');
    const [cats, setCats] = useState([]);
    const [whenKey, setWhenKey] = useState('');
    const [picked, setPicked] = useState('');
    const [wide, setWide] = useState(false);
    const [sort, setSort] = useState('recommended');
    const [preview, setPreview] = useState(null);
    const [refining, setRefining] = useState(false);
    const [stuck, setStuck] = useState(false);
    const trigger = useRef(null);
    const scroller = useRef(null);
    const sentinel = useRef(null);
    const resultsHead = useRef(null);

    const area = chrome.useArea ? chrome.useArea() : '';
    const wideScreen = chrome.useWide ? chrome.useWide() : false;
    const cities = chrome.CITIES || [];
    const groups = chrome.GROUPS || [];
    const cityName = picked || area;
    const city = cities.find((c) => c.name === cityName) || null;
    const radius = (L && L.CITY_RADIUS_KM) || 35;
    const now = Date.now();
    const day = dayOf(now);

    const all = useMemo(() => {
      const base = window.ConnectPreviews ? window.ConnectPreviews.listingsFrom(app, 'all', '') : [];
      return base.concat(ideasFrom(app));
    }, [app.events, app.places, app.contributors, app.ideas, app.connected]);
    const scopeOf = (i) => (L && L.cityScope ? L.cityScope(i, city, radius) : 'in');
    const inCity = all.filter((i) => scopeOf(i) !== 'nopin' && (wide || !city || scopeOf(i) === 'in'));
    const unpinned = all.filter((i) => scopeOf(i) === 'nopin');
    const everything = inCity.concat(unpinned);
    const origin = city ? { lat: city.lat, lng: city.lng } : null;
    const ctx = { origin, L, day };

    const ranges = T && T.weekendRange ? { today: T.todayRange(now), weekend: T.weekendRange(now), week: T.nextDaysRange(now, 7) } : {};
    const whenOk = (i) => !whenKey || (i.type === 'event' && !!ranges[whenKey] && T.overlaps(i.startsAt, i.endsAt, ranges[whenKey]));
    const catOk = (i) => !cats.length || cats.indexOf(i.category) !== -1;
    const intentOk = (i) => !intent || (X.tileMatches ? X.tileMatches(intent, i) : true);
    const weekRange = ranges.week || { start: now, end: now + 7 * 86400000 };
    const scopeOk = (i) => {
      if (!scope) return true;
      if (scope === 'upcoming') return i.type === 'event' && T.overlaps(i.startsAt, i.endsAt, weekRange);
      if (scope === 'weekend') return i.type === 'event' && !!ranges.weekend && T.overlaps(i.startsAt, i.endsAt, ranges.weekend);
      if (scope === 'near') return i.type === 'place' || i.type === 'contributor';
      if (scope === 'part') return i.type === 'event' || i.type === 'idea' || i.group === 'serve';
      if (scope === 'visit') return i.type === 'place';
      return true;
    };
    const filtered = !!query.trim() || pill !== 'all' || !!intent || !!scope || !!cats.length || !!whenKey;

    const setView = (v) => {
      setViewState(v);
      try { window.sessionStorage.setItem(VIEW_KEY, v); } catch (e) { /* private mode */ }
    };
    const clearAll = () => { setQuery(''); setPill('all'); setIntent(''); setScope(''); setCats([]); setWhenKey(''); setSort('recommended'); };
    const open = (item, el) => { trigger.current = el || null; setPreview({ id: item.id, type: item.type }); };
    // focus goes back to what opened it once the dialog has left the page (removing a modal dialog moves focus itself)
    const refocus = () => window.requestAnimationFrame(() => {
      const el = trigger.current;
      if (el && el.isConnected) el.focus({ preventScroll: true });
    });
    const closePreview = () => { setPreview(null); refocus(); };
    useBackGuard(!!preview, closePreview);
    useBackGuard(refining, () => setRefining(false));
    useBackGuard(filtered && !preview && !refining, clearAll);
    const toResults = () => {
      window.requestAnimationFrame(() => {
        const head = resultsHead.current;
        const sc = scroller.current;
        const anchor = sentinel.current;
        if (head) head.focus({ preventScroll: true });
        if (sc && anchor && sc.scrollTop > anchor.offsetTop) sc.scrollTop = anchor.offsetTop;
      });
    };

    // the search and the pills stick to the top once the intro scrolls away
    useEffect(() => {
      const el = sentinel.current;
      const sc = scroller.current;
      if (!el || !sc || typeof IntersectionObserver !== 'function') return undefined;
      const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < e.rootBounds.top + 1), { root: sc, threshold: 0 });
      io.observe(el);
      return () => io.disconnect();
    }, []);

    const previewItem = preview ? all.find((i) => i.id === preview.id && i.type === preview.type) : null;
    const pills = [{ id: 'all', label: W.all }, { id: 'events', label: W.events }]
      .concat(groups.map((g) => ({ id: g.id, label: g.name })))
      .concat(all.some((i) => i.type === 'idea') ? [{ id: 'ideas', label: W.ideas }] : []);
    const tiles = (X.TILES || []).map((t) => ({ t, n: everything.filter((i) => X.tileMatches(t.id, i)).length })).filter((x) => x.n > 0);
    const chooseIntent = (id) => { clearAll(); setIntent(id); toResults(); };
    const chooseScope = (id) => { clearAll(); setScope(id); toResults(); };

    // ── This week ──
    const weekView = () => {
      const soon = upcoming(everything, now, weekRange.end);
      const feature = soon[0] || null;
      const companions = everything.filter((i) => i.type !== 'event').sort((a, b) => fairTurn(a.id, day) - fairTurn(b.id, day)).slice(0, 3);
      const weekend = ranges.weekend ? upcoming(everything, ranges.weekend.start, ranges.weekend.end).filter((i) => T.overlaps(i.startsAt, i.endsAt, ranges.weekend)) : [];
      const near = sortItems(inCity.filter((i) => i.type !== 'event' && i.type !== 'idea'), 'near', ctx).slice(0, 4);
      const later = soon.filter((i) => i !== feature && weekend.indexOf(i) === -1).slice(0, 4);
      return h(React.Fragment, null,
        h(Section, { title: W.feature },
          feature || companions.length ? h('div', { 'data-mv2': 'xs-feature-grid' },
            feature ? h(Card, { item: feature, mode: 'feature', onOpen: open, T }) : null,
            companions.length ? h('div', { 'data-mv2': 'xs-side' }, companions.map((i) => h(Card, { key: i.type + i.id, item: i, onOpen: open, T }))) : null) : null),
        h(Section, { title: W.weekend(city && !wide ? city.name : ''), cc: 'explore-weekend', onAll: weekend.length > 3 ? () => chooseScope('weekend') : null },
          weekend.length ? rows(weekend.slice(0, 3), open, T)
            : h('div', { 'data-mv2': 'xs-empty' },
              h('p', null, W.weekendEmpty),
              h('button', { type: 'button', 'data-mv2': 'xs-act', onClick: () => app.go('lets') }, W.startLets))),
        h(Section, { title: W.todo },
          tiles.length ? h('div', { 'data-mv2': 'xs-todo' }, tiles.slice(0, 6).map(({ t, n }) => h('button', {
            key: t.id, type: 'button', 'data-mv2': 'xs-question', onClick: () => chooseIntent(t.id),
          }, h('span', { 'data-mv2': 'xs-q-glyph' }, I(t.icon, 18)),
          h('span', { 'data-mv2': 'xs-copy' }, h('span', { 'data-mv2': 'xs-title' }, t.word), h('span', { 'data-mv2': 'xs-meta' }, W.things(n))),
          h('span', { 'data-mv2': 'xs-chev' }, I('ChevronRight', 16))))) : null),
        h(Section, { title: W.comingUp, onAll: () => chooseScope('upcoming') }, rows(later, open, T)),
        h(Section, { title: W.near, onAll: () => chooseScope('near') }, rows(near, open, T)));
    };
    // ── Things to do ──
    const thingsView = () => {
      const part = sortItems(everything.filter((i) => i.type === 'event' || i.type === 'idea' || i.group === 'serve'), 'recommended', ctx).slice(0, 4);
      const visit = sortItems(inCity.filter((i) => i.type === 'place'), 'near', ctx).slice(0, 4);
      return h(React.Fragment, null,
        h(Section, { title: W.todo },
          tiles.length ? h('div', { 'data-mv2': 'xs-todo', 'data-big': '' }, tiles.map(({ t, n }) => h('button', {
            key: t.id, type: 'button', 'data-mv2': 'xs-question', onClick: () => chooseIntent(t.id),
          }, h('span', { 'data-mv2': 'xs-q-glyph' }, I(t.icon, 20)),
          h('span', { 'data-mv2': 'xs-copy' }, h('span', { 'data-mv2': 'xs-title' }, t.word), h('span', { 'data-mv2': 'xs-meta' }, W.things(n))),
          h('span', { 'data-mv2': 'xs-chev' }, I('ChevronRight', 16))))) : null),
        h('div', { 'data-mv2': 'xs-lanes' },
          h(Section, { title: W.takePart, onAll: () => chooseScope('part') }, rows(part, open, T)),
          h(Section, { title: W.visit, onAll: () => chooseScope('visit') }, rows(visit, open, T))));
    };
    // ── Categories ──
    const categoriesView = () => {
      const kinds = [{ id: 'events', label: W.events }].concat(groups.map((g) => ({ id: g.id, label: g.name })))
        .concat(all.some((i) => i.type === 'idea') ? [{ id: 'ideas', label: W.ideas }] : []);
      const soon = upcoming(everything, now, weekRange.end).slice(0, 4);
      const rest = sortItems(everything.filter((i) => i.type !== 'event'), 'recommended', ctx).slice(0, 8);
      return h('div', { 'data-mv2': 'xs-directory' },
        h('nav', { 'data-mv2': 'xs-dir-nav', 'aria-label': W.browse },
          h('h2', null, W.browse),
          kinds.map((k) => {
            const n = everything.filter((i) => pillMatches(k.id, i)).length;
            if (!n) return null;
            return h('button', {
              key: k.id, type: 'button', 'data-mv2': 'xs-dir-btn', 'data-group': k.id,
              onClick: () => { clearAll(); setPill(k.id); toResults(); },
            }, h('span', { 'data-mv2': 'xs-q-glyph' }, I(W.groupIcon[k.id] || 'Shapes', 17)),
            h('span', { 'data-mv2': 'xs-copy' }, h('span', { 'data-mv2': 'xs-title' }, k.label), h('span', { 'data-mv2': 'xs-meta' }, W.groupHint[k.id] || '')),
            h('span', { 'data-mv2': 'xs-count', 'aria-label': n + ' listings' }, n));
          })),
        h('div', { 'data-mv2': 'xs-dir-rows' },
          h(Section, { title: W.comingUp, onAll: () => chooseScope('upcoming') }, rows(soon, open, T)),
          h(Section, { title: W.across }, rows(rest, open, T))));
    };
    // ── Results ──
    const resultsView = () => {
      const base = inCity.filter((i) => pillMatches(pill, i) && catOk(i) && whenOk(i) && intentOk(i) && scopeOk(i) && matchesQuery(i, query));
      const online = unpinned.filter((i) => pillMatches(pill, i) && catOk(i) && whenOk(i) && intentOk(i) && scopeOk(i) && matchesQuery(i, query));
      const list = sortItems(base, sort, ctx);
      const q = query.trim();
      const tile = intent && X.tileOf ? X.tileOf(intent) : null;
      const title = q ? W.searchResults : tile ? tile.word : scope ? W.scopes[scope] : W.results;
      const active = [tile ? tile.word : '', scope ? W.scopes[scope] : '', pill !== 'all' ? (pills.find((p) => p.id === pill) || {}).label : '',
        whenKey ? (W.whenOptions.find((o) => o[0] === whenKey) || [])[1] : '']
        .concat(cats.map((id) => { const c = window.DATA && window.DATA.getCategory ? window.DATA.getCategory(id) : null; return c ? c.name : id; }))
        .filter(Boolean);
      const total = list.length + online.length;
      return h('div', { 'data-mv2': 'xs-results' },
        h('div', { 'data-mv2': 'xs-results-head' },
          h('div', null,
            h('h2', { ref: resultsHead, tabIndex: -1 }, title),
            h('p', { role: 'status', 'aria-live': 'polite' }, W.count(total, q))),
          list.length > 1 ? h('label', { 'data-mv2': 'xs-sort' },
            h('span', { 'data-mv2': 'xs-sr' }, W.sortLabel),
            h('select', { 'data-mv2': 'xs-select', value: sort, onChange: (e) => setSort(e.target.value) },
              W.sorts.filter(([k]) => k !== 'near' || origin).map(([k, word]) => h('option', { key: k, value: k }, word))),
            I('ChevronDown', 14)) : null),
        active.length ? h('p', { 'data-mv2': 'xs-active' }, active.join(' · ')) : null,
        active.length && total ? h('button', { type: 'button', 'data-mv2': 'xs-link', onClick: clearAll }, W.clear) : null,
        total ? rows(list, open, T) : h('div', { 'data-mv2': 'xs-empty', role: 'status', 'aria-live': 'polite', 'data-cc': 'explore-empty' },
          h('h3', null, W.emptyTitle),
          h('p', null, q ? W.emptyQuery(q, city && !wide ? city.name : '') : W.emptyFilter(city && !wide ? city.name : '')),
          h('div', { 'data-mv2': 'xs-acts' },
            h('button', { type: 'button', 'data-mv2': 'xs-act', onClick: clearAll }, W.clearSearch),
            city && !wide ? h('button', { type: 'button', 'data-mv2': 'xs-act', onClick: () => setWide(true) }, W.widen) : null,
            h('button', { type: 'button', 'data-mv2': 'xs-act', onClick: () => app.go('apply') }, W.addListing))),
        online.length ? h(Section, { title: W.online, cc: 'explore-online' }, rows(sortItems(online, sort, ctx), open, T)) : null);
    };

    const onlineShelf = !filtered && unpinned.length
      ? h(Section, { title: W.online, cc: 'explore-online' }, rows(sortItems(unpinned, 'recommended', ctx).slice(0, 6), open, T)) : null;
    const refinements = cats.length + (whenKey ? 1 : 0) + (wide ? 1 : 0);

    // A swipe (or flick) to the right puts Explore away and shows the map again (founder, 2026-11-26).
    const rootRef = useRef(null);
    const press = useRef(null);
    const swipes = swipeHandlers(press, (dir) => {
      if (dir !== 'right' || preview || refining) return;
      slideAway(rootRef.current, 'right', () => app.go('home', {}));
    }, SWIPE_IGNORE);
    return h('div', Object.assign({ ref: rootRef, 'data-screen': 'explore', 'data-mv2': 'xs', 'data-wide': wideScreen ? '' : undefined }, swipes),
      h('div', { 'data-mv2': 'xs-veil', 'aria-hidden': 'true' }),
      h('div', { 'data-mv2': 'xs-scroll', ref: scroller },
        h('div', { 'data-mv2': 'xs-wrap' },
          h('header', { 'data-mv2': 'xs-intro' },
            h('h1', null, W.title, h('span', { 'aria-hidden': 'true' }, '.')),
            h('p', null, view === 'week' ? W.intro.week(city ? city.name : '') : W.intro[view]),
            h('div', { 'data-mv2': 'xs-views', role: 'group', 'aria-label': W.viewsLabel },
              W.views.map(([id, word, icon]) => h('button', {
                key: id, type: 'button', 'data-mv2': 'xs-view', 'aria-pressed': view === id ? 'true' : 'false',
                onClick: () => { setView(id); clearAll(); if (scroller.current) scroller.current.scrollTop = 0; },
              }, I(icon, 15), word))))),
        h('div', { 'data-mv2': 'xs-sentinel', ref: sentinel, 'aria-hidden': 'true' }),
        h('div', { 'data-mv2': 'xs-controls', 'data-stuck': stuck ? '' : undefined },
          h('div', { 'data-mv2': 'xs-wrap' },
            h('div', { 'data-mv2': 'xs-search-line' },
              h('label', { 'data-mv2': 'xs-search' },
                I('Search', 18),
                h('span', { 'data-mv2': 'xs-sr' }, W.search),
                h('input', {
                  type: 'search', placeholder: W.search, value: query, autoComplete: 'off', spellCheck: false,
                  onChange: (e) => { setQuery(e.target.value); setIntent(''); setScope(''); },
                  onKeyDown: (e) => { if (e.key === 'Enter') toResults(); },
                })),
              h('button', {
                type: 'button', 'data-mv2': 'xs-refine-btn', 'aria-haspopup': 'dialog', 'data-active': refinements ? '' : undefined,
                onClick: (e) => { trigger.current = e.currentTarget; setRefining(true); },
              }, I('SlidersHorizontal', 16), h('span', null, W.refine + (refinements ? ' (' + refinements + ')' : '')))),
            h('div', { 'data-mv2': 'xs-pills', role: 'group', 'aria-label': W.pillsLabel },
              pills.map((p) => h('button', {
                key: p.id, type: 'button', 'data-mv2': 'xs-pill', 'data-group': p.id, 'aria-pressed': pill === p.id ? 'true' : 'false',
                onClick: () => { setPill(p.id === pill ? 'all' : p.id); if (p.id !== 'all') toResults(); },
              }, p.label))))),
        h('main', { 'data-mv2': 'xs-wrap', 'data-content': '' },
          filtered ? resultsView() : view === 'things' ? thingsView() : view === 'categories' ? categoriesView() : weekView(),
          onlineShelf,
          city ? h('p', { 'data-mv2': 'xs-scope', 'data-cc': 'explore-scope' },
            wide ? W.scopeWide : W.scope(city.name, inCity.length, radius),
            h('button', { type: 'button', 'data-mv2': 'xs-link', onClick: () => setWide(!wide) }, wide ? W.back(city.name) : W.widen)) : null)),
      previewItem ? h(Preview, { key: previewItem.type + previewItem.id, item: previewItem, onClose: closePreview, T }) : null,
      refining ? h(Refine, {
        state: { whenKey, cats, cityName: city ? city.name : cityName, wide }, cities,
        onClose: () => { setRefining(false); refocus(); },
        onApply: (r) => {
          setRefining(false);
          setWhenKey(r.whenKey); setCats(r.cats); setWide(r.wide);
          if (r.cityName && r.cityName !== cityName) {
            const next = cities.find((c) => c.name === r.cityName);
            setPicked(r.cityName);
            if (next) {
              try {
                window.sessionStorage.setItem('cc_area_pick', JSON.stringify(next));
                window.sessionStorage.setItem('cc_area_pending', JSON.stringify(next));
              } catch (err) { /* private mode */ }
              window.dispatchEvent(new CustomEvent('cc-set-area', { detail: next }));
            }
          }
          toResults();
        },
      }) : null);
  }

  // ── swipes between the map and the screens beside it (founder, 2026-11-26) ─────────────────────
  //  Explore sits to the map's right, Me to its left. A swipe or a quick flick moves between them: a long enough drag
  //  (--xs-swipe, 52 px), or a shorter one that is fast (a flick). It must be mostly sideways, so a scroll never counts.
  const FLICK_PX = 24;          // the least a flick travels
  const FLICK_SPEED = 0.3;      // px per ms: faster than this, a short drag is a flick (the usual swipe-library value)
  function swipePx() {
    const v = window.getComputedStyle ? parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--xs-swipe')) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 52;
  }
  /** Which way a press-and-release travelled: 'left', 'right' or '' (too short, too slow or not sideways enough). */
  function swipeOf(start, end, distance) {
    if (!start || !end) return '';
    const dx = end.x - start.x;
    const dy = Math.abs(end.y - start.y);
    const ms = Math.max(1, (end.t || 0) - (start.t || 0));
    const ax = Math.abs(dx);
    if (ax <= dy * 1.3) return '';
    const far = ax >= (distance || 52);
    const flick = ax >= FLICK_PX && ax / ms >= FLICK_SPEED;
    if (!far && !flick) return '';
    return dx < 0 ? 'left' : 'right';
  }
  /**
   * Pointer handlers that call onSwipe(direction) for a swipe that starts outside `ignore` (a sideways row, a field).
   * `store` is a ref that keeps the press across re-renders.
   */
  function swipeHandlers(store, onSwipe, ignore) {
    return {
      onPointerDown: (e) => {
        store.current = null;
        if (!e.isPrimary || e.button !== 0) return;
        if (ignore && e.target && e.target.closest && e.target.closest(ignore)) return;
        store.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
      },
      onPointerUp: (e) => {
        const s = store.current;
        store.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dir = swipeOf(s, { x: e.clientX, y: e.clientY, t: e.timeStamp }, swipePx());
        if (dir) onSwipe(dir);
      },
      onPointerCancel: () => { store.current = null; },
    };
  }
  /** Slide a screen off toward `dir`, then run `done` (at once under reduced motion). */
  function slideAway(el, dir, done) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || !el.animate || reduce) { done(); return; }
    const anim = el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (dir === 'left' ? '-100%' : '100%') + ')' }],
      { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    anim.onfinish = done;
    anim.oncancel = done;
  }
  // Sideways rows, fields and dialogs keep their own sideways drags.
  const SWIPE_IGNORE = "[data-mv2='xs-pills'], [data-mv2='xs-views'], input, textarea, select, dialog, [data-hscroll], .photo-carousel, [data-mv2='hrow']";

  // ── an edge of the map: a pill that pulls the screen on that side in ─────────────────────
  //  side 'right' pulls Explore in with a swipe left; side 'left' pulls Me in with a swipe right. A tap, Enter or Space
  //  opens it too; a drag the other way does nothing.
  function EdgeHandle({ onOpen, side }) {
    const left = side === 'left';
    const dragged = useRef(false);
    const start = useRef(null);
    return h('button', {
      type: 'button', 'data-mv2': 'xs-edge', 'data-side': left ? 'left' : 'right',
      'aria-label': left ? W.edgeMe : W.edge, title: left ? W.edgeMeHint : W.edgeHint,
      onPointerDown: (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        dragged.current = false;
        start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      },
      onPointerUp: (e) => {
        const s = start.current;
        start.current = null;
        if (!s || s.id !== e.pointerId) return;
        dragged.current = Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10;
        if (swipeOf(s, { x: e.clientX, y: e.clientY, t: e.timeStamp }, swipePx()) === (left ? 'right' : 'left')) onOpen();
      },
      onPointerCancel: () => { start.current = null; },
      onClick: (e) => { if (e.detail === 0 || !dragged.current) onOpen(); dragged.current = false; },
    }, h('span', null, I(left ? 'ChevronRight' : 'ChevronLeft', 16)));
  }

  // ── the map behind Explore and Me: one small snapshot, stretched (the cheap blur) ─────────────────────
  //  A live CSS blur re-renders on every frame something moves behind it, which a phone feels. Instead the map is drawn
  //  ONCE into a canvas a tenth of its size and shown stretched to the screen: the browser's smooth scaling blurs it for
  //  free, and the live map (hidden behind it) stops drawing. The copy is taken inside MapLibre's own render, while its
  //  picture is still in the buffer. With no map yet it waits for the map to settle; if a copy fails nothing is shown.
  const SNAP_SCALE = 0.1;
  function snapshotOf(canvas, scale) {
    try {
      const w = Math.max(1, Math.round(canvas.width * scale));
      const hh = Math.max(1, Math.round(canvas.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = hh;
      const ctx = c.getContext('2d');
      if (!ctx) return '';
      // a map with no background layer leaves transparent pixels, which a JPEG would turn black: paint the map's own
      // base colour under it first
      const base = window.getComputedStyle ? window.getComputedStyle(document.documentElement).getPropertyValue('--map-base').trim() : '';
      ctx.fillStyle = base || '#f9f9f6';
      ctx.fillRect(0, 0, w, hh);
      ctx.drawImage(canvas, 0, 0, w, hh);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return '';
    }
  }
  function MapSnapshot() {
    const [src, setSrc] = useState('');
    useEffect(() => {
      let live = true;
      let map = null;
      let waitAt = null;
      const take = () => {
        const m = window.__ccMap;
        if (!m || !m.getCanvas) return;
        m.once('render', () => {
          const url = snapshotOf(m.getCanvas(), SNAP_SCALE);
          if (live && url) setSrc(url);
        });
        m.triggerRepaint();
      };
      const begin = () => {
        map = window.__ccMap;
        if (!map) { waitAt = window.setTimeout(begin, 300); return; }
        if (map.loaded && map.loaded()) take();
        else map.once('idle', take);
      };
      begin();
      return () => { live = false; if (waitAt) window.clearTimeout(waitAt); };
    }, []);
    return src ? h('img', { 'data-mv2': 'map-snap', src, alt: '', 'aria-hidden': 'true', decoding: 'async' }) : null;
  }

  window.ConnectExplore = {
    Page, EdgeHandle, MapSnapshot, swipeOf, swipeHandlers, slideAway, SWIPE_IGNORE, matchesQuery, areaOf, kindLabel, metaLine, factsOf, actionsOf, fairTurn, upcoming, sortItems, pillMatches, ideasFrom,
  };
})();
