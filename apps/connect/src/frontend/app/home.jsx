// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Discover (map home) + Impact Idea preview panel
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useRef, useMemo, useCallback, useEffect } = React;
  const { CategoryBadge, Button } = window.UI;
  const Icon = window.Icon;
  const useBackGuard = window.useBackGuard || function () {};

  // ── Impact Idea preview (on pin click) ──
  //  A Contributor, a Place and an Event open the Map v2 bottom sheet (map-v2-sheet.jsx). Impact Ideas
  //  are not listings — they have no organiser, no category profile page and no socials — so they keep
  //  this small panel.
  function IdeaPanel({ id, onClose }) {
    const app = window.useApp();
    // A Back press dismisses the pin preview before it leaves the map —
    // the same expectation a native map app sets.
    useBackGuard(true, onClose);
    const { ideas, toggleIdeaVote } = app;
    const item = ideas.find((i) => i.id === id);
    if (!item) return null;

    const cat = window.DATA.getCategory(item.category);
    const pct = Math.min(100, Math.round((item.votes / item.threshold) * 100));

    return Wrapper(
      React.createElement('div', { className: 'p-4' },
        React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
          React.createElement('span', { className: 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-gold-dark flex items-center gap-1' }, React.createElement(Icon, { name: 'Lightbulb', size: 10 }), 'Impact Idea'),
          cat && React.createElement(CategoryBadge, { cat })),
        React.createElement('h3', { className: 'text-lg text-foreground leading-tight mb-1' }, item.title),
        React.createElement('p', { className: 'text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3' }, item.description),
        React.createElement('div', { className: 'flex items-center justify-between mb-1' },
          React.createElement('span', { className: 'text-xs font-bold text-foreground' }, item.votes.toLocaleString() + ' votes'),
          React.createElement('span', { className: 'text-[10px] text-muted-foreground' }, 'Goal ' + item.threshold.toLocaleString())),
        React.createElement('div', { className: 'h-2 rounded-full bg-muted overflow-hidden mb-3' },
          React.createElement('div', { className: 'h-full gold-gradient rounded-full', style: { width: pct + '%' } })),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement(Button, { variant: item.votedByMe ? 'success' : 'gold', className: 'flex-1', icon: item.votedByMe ? 'Check' : 'Heart', onClick: () => toggleIdeaVote(item.id) }, item.votedByMe ? 'Voted — tap to undo' : 'Collaborate'),
          React.createElement(Button, { variant: 'outline', icon: 'X', onClick: onClose }, 'Dismiss'))));

    function Wrapper(children) {
      return React.createElement('div', {
        className: 'fixed z-[120] left-0 right-0 bottom-16 md:bottom-4 md:left-[280px] md:right-auto md:w-[370px]',
      },
        React.createElement('div', {
          className: 'shadow-2xl rounded-t-3xl md:rounded-3xl overflow-hidden md:max-h-none max-h-[78vh] overflow-y-auto bg-white',
        }, children));
    }
  }

  function decorateForV2(markers, events, newsPosts, now) {
    const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? undefined : t; };
    const byOrg = Object.create(null);
    const byEvent = Object.create(null);
    const bump = (id, key, t, pick) => { if (t === undefined || !id) return; const o = byOrg[id] || (byOrg[id] = {}); o[key] = o[key] === undefined ? t : pick(o[key], t); };
    events.forEach((e) => {
      const start = ms(e.startsAt);
      byEvent[e.id] = { next: start, last: ms(e.createdAt) };
      if (!window.DATA.isPastEvent(e, now)) bump(e.organizerId, 'next', start, Math.min);
      bump(e.organizerId, 'last', ms(e.createdAt), Math.max);
    });
    newsPosts.forEach((n) => bump(n.contributorId, 'last', ms(n.createdAt) || ms(n.date), Math.max));
    markers.forEach((m) => {
      if (m.type === 'contributor' && byOrg[m.id]) { m.nextEventAt = byOrg[m.id].next; m.lastActivityAt = byOrg[m.id].last; }
      else if (m.type === 'event' && byEvent[m.id]) { m.nextEventAt = byEvent[m.id].next; m.lastActivityAt = byEvent[m.id].last; }
    });
  }

  const CARD_ZOOM = 14;     // a card never lands on a map zoomed out further than this: the pin has to be seen
  // A Where to… tile or a row in focus shows its town, not its province (founder, 2026-11-17): every pin is drawn from 9.5.
  const TOWN_ZOOM = 11;
  // The crown's reset lands on the person's own place at the zoom the map first opens on.
  const HOME_ZOOM = 12;

  // ── Home / Discover ──
  function HomePage() {
    const app = window.useApp();
    const { events, places, contributors, ideas, newsPosts, dismissBubble, trackImpression } = app;
    const [selected, setSelected] = useState(null);
    // The sheet reports how much of the map it covers; the map keeps the selected pin clear of it
    const mapApi = useRef(null);
    const [selType, setSelType] = useState('event');
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [group, setGroup] = useState('');
    const [litId, setLitId] = useState(null);
    // Which entity types the current zoom is showing ('all' | 'places' |
    // 'none' — see map.jsx zoomBandFor). The map owns the
    // thresholds and only reports when the band actually changes, so this is
    // one state update per crossing, not one per zoom frame.
    const [zoomBand, setZoomBand] = useState('all');
    // Map v2 (#210): the pill (a group, Events or All: chosen inside the Explore panel), the listing whose full sheet is
    // open (a chosen card was tapped AGAIN; the first tap only chooses it and moves the map), whether the panel is
    // lowered to its title strip, and which pin was just tapped (so the panel brings that card into view; a card tap
    // never does, the panel stays exactly where it is).
    const X = window.MapV2Explore;
    // What the Explore panel has in focus (founder, 2026-11-17): { kind: 'tile', id } for a Where to… tile, { kind: 'sec', id }
    // for one of its rows (Near and Now…, New on Connect…), or null. It filters the pins, and the chip at the top clears it.
    // Ideas ride their own tile.
    const [focus, setFocus] = useState(null);
    const [secIds, setSecIds] = useState([]);
    const [sheet, setSheet] = useState(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [reveal, setReveal] = useState(null);   // { id, focus, n }: n counts pin taps, so a keyboard pin brings its card into the sheet
    const rootRef = useRef(null);
    const skipFrame = useRef(false);
    const chosen = useRef({ id: null, type: null });
    const narrow = X.useNarrow();
    const clean = !!(app.nav && app.nav.params && app.nav.params.view === 'map');
    const XS = window.MapV2Strings.explore;
    const tile = focus && focus.kind === 'tile' ? focus.id : null;
    const tileRec = tile && X.tileOf ? X.tileOf(tile) : null;
    const secKey = focus && focus.kind === 'sec' ? secIds.join('|') : '';
    const focusTest = useMemo(() => {
      if (tileRec && !tileRec.ideas && X.tileMatches) return (m) => X.tileMatches(tile, m);
      if (secKey) { const set = new Set(secKey.split('|')); return (m) => set.has(m.id); }
      return null;
    }, [X, tile, tileRec, secKey]);
    const pinFilter = useMemo(() => {
      if (!focusTest && !group) return null;
      return (m) => (focusTest ? focusTest(m) : true) && (!group || (X.groupOf && X.groupOf(m) === group));
    }, [focusTest, group, X]);
    // A new focus brings its town into view, 25% above the middle. One anchor per focus: switching tabs inside it keeps the
    // map still (re-measuring "the middle" after each move would creep the map upward, tab after tab).
    const focusKey = focus ? focus.kind + ':' + focus.id : '';
    const anchor = useRef(null);
    useEffect(() => {
      setShowIdeas(!!(tileRec && tileRec.ideas));
      if (!focusKey) { anchor.current = null; return; }
      const api = mapApi.current;
      if (!api || !api.survey) return;
      if (!anchor.current) {
        const v = api.view ? api.view() : null;
        anchor.current = v && (v.user || v.centre);
      }
      const c = anchor.current;
      if (c) api.survey(c.lat, c.lng, TOWN_ZOOM);
    }, [focusKey]);
    // How much room the panel takes is the stylesheet's job (--explore-h follows the panel's look, map-v2.css Pack 08), so it is
    // right even when the CSS arrives after the first render. This only frames the data again as the panel takes room, but
    // never because the person lowered or raised it (the map would jump).
    const onExploreHeight = useCallback((px) => {
      if (!rootRef.current || !(px > 0)) return;
      if (skipFrame.current) { skipFrame.current = false; return; }
      if (mapApi.current && mapApi.current.reframe) mapApi.current.reframe();
    }, []);
    // Lower or raise the panel (the handle, or a pin tap that needs its card). Only a real change skips the next framing.
    const onPanel = useCallback((isOpen) => {
      setPanelOpen(!!isOpen);
    }, []);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q) || (t.organizerName || '').toLowerCase().includes(q);
    // Owner display name from the contributors already loaded. No new request. Blank when the owner isn't in that list.
    const ownerName = (id, fallback) => {
      const row = id && contributors.find((c) => c.id === id);
      return (row && row.name) || fallback || '';
    };
    const now = Date.now();
    const markers = [
      // A finished event is history, not a place to turn up: it leaves the map
      // (it stays on its organiser's profile and dashboard, under "Past events").
      ...events.filter((e) => !window.DATA.isPastEvent(e, now)).filter(matches).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast, coverPhoto: e.coverPhoto, startsAt: e.startsAt, endsAt: e.endsAt, createdAt: e.createdAt, location: e.location, address: e.address, ownerName: ownerName(e.organizerId, e.organizerName) })),
      ...places.filter(matches).map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast, coverPhoto: p.coverPhoto, openHours: p.openHours, createdAt: p.createdAt, location: p.location, address: p.address, ownerName: ownerName(p.organizerId, p.organizerName) })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY, createdAt: i.createdAt })) : []),
    ];
    // What decides which pin keeps its name label when two collide, and who heads a "+N" group:
    // an upcoming event first (soonest), then the most recent activity, then the name. Never popularity.
    decorateForV2(markers, events, newsPosts || [], now);

    // #210: where the map is looking as the sheet opens, so its distance says what the card said (the map moves under the sheet)
    const openSheet = (id, t, from) => {
      const view = from || (mapApi.current && mapApi.current.view ? mapApi.current.view() : null);
      // A Contributor (reached by a place's or an event's owner line) has no pin and no card: the listing that led there
      // stays the chosen one, so closing the sheet comes back to that card, still outlined.
      if (t !== 'contributor') { setSelected(id); setSelType(t); }
      setSheet({ id, type: t, view }); if (t === 'event') trackImpression(id);
    };
    const closeSheet = () => setSheet(null);
    // The first tap on a card CHOOSES it: it keeps its place in the panel (outlined, "Tap again to open"), and the map
    // eases to its pin, clear of the search bar above and the panel below. The second tap on the chosen card opens the
    // full listing; closing that returns to this very panel and map (the map never moved for it).
    chosen.current = { id: selected, type: selType };
    // A card's first tap chooses it: its pin glows and the map brings it 25% above the middle, while the panel stays exactly
    // as it is. The second tap on the chosen card opens its preview (founder, 2026-11-17).
    const tapCard = (id, t, from) => {
      if (t === 'idea') { setSheet(null); setSelected(id); setSelType(t); return; }
      // chosen already (by its own tap, or by its pin): the card says "Tap again to open", so this tap opens it
      if (selected === id) { openSheet(id, t, from); return; }
      chosen.current = { id, type: t };
      setSelected(id); setSelType(t); setLitId(id);
      if (mapApi.current && mapApi.current.focusLifted) mapApi.current.focusLifted(CARD_ZOOM);
    };
    // The filter chip: what is on, in its colour, and a clear button. A tile takes the colour of its group.
    const chip = (() => {
      if (tileRec) {
        const g = tileRec.categories && tileRec.categories.length && X.groupOf ? X.groupOf({ category: tileRec.categories[0] }) : '';
        return { label: tileRec.word, colour: g ? 'var(--grp-' + g + ')' : 'var(--accent)' };
      }
      if (focus && focus.kind === 'sec') return { label: (XS.panel && XS.panel[focus.id]) || focus.id, colour: 'var(--accent)' };
      if (group) return { label: (XS.groups && XS.groups[group]) || group, colour: 'var(--grp-' + group + ')' };
      return null;
    })();
    const clearFilter = () => { setFocus(null); setGroup(''); setLitId(null); };
    // The crown with a filter on: everything clears, and the map goes back to the person's own place (or the first framing).
    const resetHome = () => {
      setFocus(null); setGroup(''); setQuery(''); setSearchOpen(false); setSelected(null); setLitId(null); setSheet(null);
      const api = mapApi.current;
      if (!api) return;
      const v = api.view ? api.view() : null;
      if (v && v.user && api.survey) api.survey(v.user.lat, v.user.lng, HOME_ZOOM);
      else if (api.restore) api.restore();
    };
    const searchRef = useRef(null);
    const showSearch = !narrow || searchOpen || !!query;
    const onFind = () => {
      if (narrow && searchOpen) { setSearchOpen(false); return; }
      setSearchOpen(true);
      requestAnimationFrame(() => { if (searchRef.current) searchRef.current.focus(); });
    };
    const rowMarkers = markers.filter((m) => m.type !== 'idea');
    const ideaMarkers = ideas.filter((i) => i.status === 'voting').filter(matches).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY, createdAt: i.createdAt }));
    return React.createElement('div', { ref: rootRef, className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover', 'data-mv2': 'home', 'data-clean': clean ? '' : undefined, 'data-narrow': narrow ? '' : undefined, 'data-crown': clean ? undefined : '', 'data-explore-min': (!clean && !panelOpen) ? '' : undefined },
      React.createElement('div', { className: 'absolute inset-0', onClick: () => { setSelected(null); setSheet(null); setSearchOpen(false); } },
        React.createElement(window.StylizedMap, {
          markers, filterCategory: pinFilter, selectedId: selected, litId: litId, apiRef: mapApi,
          // #210: a pin chooses its card in the Explore panel (the panel scrolls to it); the card's second tap opens the
          // full listing. The clean map (the nav's Map) has no panel, so there a pin opens the sheet as before. Ideas keep their panel.
          onSelect: (id, t) => {
            if (t === 'idea') { setSheet(null); setSelected((p) => (p === id ? null : id)); setSelType(t); return; }
            if (clean) { openSheet(id, t); return; }
            const a = document.activeElement;
            const byKey = !!(a && a.closest && a.closest('.maplibregl-marker') && a.matches && (() => { try { return a.matches(':focus-visible'); } catch { return false; } })());
            // A pin chooses itself. The keyboard follows into the sheet; a finger tap leaves the sheet where it is.
            setSheet(null); setSelected(id); setSelType(t); setLitId(null); setReveal((r) => ({ id, focus: byKey, n: (r ? r.n : 0) + 1 }));
          },
          onDismissBubble: dismissBubble,
          onZoomBandChange: setZoomBand,
        })),

      // top: the search bar, the filter chip, and a round Search button where the account button was (founder, 2026-11-17: the
      // account lives in the nav's Me now). On a phone the bar folds into that button until it is tapped (or holds words).
      React.createElement('div', { 'data-mv2': 'home-top' },
        React.createElement('div', { 'data-mv2': 'home-bar', 'data-search': showSearch ? '' : undefined },
          showSearch && React.createElement('div', { 'data-mv2': 'home-search', 'data-open': searchOpen ? '' : undefined, onClick: () => setSearchOpen(true) },
            React.createElement(Icon, { name: 'Search', size: 18 }),
            React.createElement('input', {
              ref: searchRef, value: query, onChange: (e) => setQuery(e.target.value), onFocus: () => setSearchOpen(true),
              placeholder: XS.search, 'aria-label': XS.search, 'aria-expanded': searchOpen ? 'true' : 'false',
            }),
            query && React.createElement('button', { type: 'button', 'data-mv2': 'home-clear', 'aria-label': XS.clearSearch, onClick: () => setQuery('') }, React.createElement(Icon, { name: 'X', size: 16 })),
            searchOpen && React.createElement('div', { 'data-mv2': 'home-filters', role: 'radiogroup', 'aria-label': 'Filter the map by category' },
              (X.GROUPS || []).map((id) => React.createElement('button', {
                key: id, type: 'button', role: 'radio', 'data-mv2': 'filter-row', 'aria-checked': group === id ? 'true' : 'false',
                style: { '--chip': 'var(--grp-' + id + ')' },
                onClick: (e) => { e.stopPropagation(); setGroup((cur) => (cur === id ? '' : id)); },
              }, React.createElement('span', { 'data-mv2': 'filter-dot', 'aria-hidden': 'true' }), (XS.groups && XS.groups[id]) || id)))),
          chip && !(narrow && searchOpen) && React.createElement('div', { 'data-mv2': 'filter-chip', role: 'status', style: { '--chip': chip.colour } },
            React.createElement('span', { 'data-mv2': 'filter-dot', 'aria-hidden': 'true' }),
            React.createElement('span', { 'data-mv2': 'filter-chip-label', title: XS.filterChip(chip.label) }, chip.label),
            React.createElement('button', { type: 'button', 'data-mv2': 'filter-chip-x', 'aria-label': XS.clearFilter(chip.label), onClick: clearFilter },
              React.createElement(Icon, { name: 'X', size: 14 }))),
          React.createElement('button', {
            type: 'button', 'data-mv2': 'home-find', onClick: onFind,
            'aria-label': narrow && searchOpen ? XS.closeSearch : XS.searchButton,
            'aria-expanded': searchOpen ? 'true' : 'false',
          }, React.createElement(Icon, { name: narrow && searchOpen ? 'X' : 'Search', size: 20 })))),

      // zoom-gate hint + the MapTiler logo, kept above the Explore row (MapTiler's Free plan needs the logo bottom-left)
      React.createElement('div', { 'data-mv2': 'home-corner' },
        zoomBand !== 'all' && !focus && !group && React.createElement('div', { 'data-mv2': 'zoom-hint', 'data-zoom-hint': zoomBand },
          React.createElement(Icon, { name: 'ZoomIn', size: 16 }),
          React.createElement('span', null,
            zoomBand === 'none' ? 'Zoom in to see events and places'
              : 'Zoom in to see places')),
        window.MapTilerLogo && React.createElement(window.MapTilerLogo)),

      React.createElement(window.MapV2Online.Globe, { onOpenProfile: (id) => app.go('profile', { id }) }),

      // ONE bottom area: the Explore panel, or the full listing of the card that was tapped twice, never both. The panel
      // stays mounted (hidden) under the listing, so it keeps its place and the card that opened it gets focus back.
      !clean && React.createElement(X.Explore, {
        hidden: !!sheet,
        markers: rowMarkers, ideas: ideaMarkers, sources: { events, places, contributors }, apiRef: mapApi, selectedId: selected, reveal,
        focus, filtered: !!group || !!q,
        onFocus: (next) => { setFocus(next); setLitId(null); },
        onSectionIds: setSecIds,
        onReset: resetHome,
        onOpenChange: onPanel,
        onOpen: tapCard, onSeeAll: () => app.go('explore'), onHeight: onExploreHeight,
        onGo: (page, params) => app.go(page, params),
      }),
      // a chosen card tapped again opens the expanded sheet (#210: full, its cover and distance, swipe down back to the
      // panel; it never moves the map); the clean map's pin opens today's half sheet
      sheet && React.createElement(window.MapV2Sheet, {
        id: sheet.id, type: sheet.type, expanded: !clean, view: sheet.view,
        onClose: closeSheet, onOccupy: (pad) => { if (mapApi.current) mapApi.current.focusSelected(pad); },
        nearby: markers,
        // a Nearby pick keeps the place the distances were measured from (the map has moved under the sheet since)
        onPick: (id, t) => openSheet(id, t, sheet.view),
      }),
      selected && selType === 'idea' && React.createElement(IdeaPanel, { id: selected, onClose: () => setSelected(null) }));
  
  }

  window.HomePage = HomePage;
})();
