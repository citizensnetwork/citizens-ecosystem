// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Discover (map home) + pin preview panel
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useRef, useMemo, useCallback } = React;
  const { cx, CategoryBadge, Button } = window.UI;
  const Icon = window.Icon;
  const useBackGuard = window.useBackGuard || function () {};

  // ── Preview panel (on pin click) ──
  //  The card body is window.EntityCard — the SAME component Kingdom
  //  Exploration renders, at its 'panel' density. Founder call: an Event, a
  //  Place and a Contributor must not look like different things depending on
  //  whether you found them on the map or in the list — and every pin opens
  //  the same small card (its "View Full Profile" button is the way in to the
  //  full page), so no kind of listing feels more or less important than any
  //  other.
  function PreviewPanel({ id, type, onClose }) {
    const app = window.useApp();
    // A Back press dismisses the pin preview before it leaves the map —
    // the same expectation a native map app sets.
    useBackGuard(true, onClose);
    const { events, places, contributors, ideas, toggleIdeaVote } = app;
    const isIdea = type === 'idea';
    let item;
    if (type === 'event') item = events.find((e) => e.id === id);
    else if (type === 'place') item = places.find((p) => p.id === id);
    else if (type === 'contributor') item = contributors.find((c) => c.id === id);
    else item = ideas.find((i) => i.id === id);
    if (!item) return null;

    // Impact Ideas are not listings — they have no organiser, no category
    // profile page and no socials, so they keep their own small panel.
    if (isIdea) {
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
    }

    return Wrapper(React.createElement(window.EntityCard, {
      item: Object.assign({}, item, { type }), layout: 'panel', onClose,
    }));

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

  // #210: a card tapped on the home screen moves the map so its pin sits in the OPEN part of the map: below the search
  // bar, above the Explore panel (measured, as the map's own first framing is), with OPEN_GAP of clear map around it.
  const OPEN_GAP = 28;
  const CARD_ZOOM = 14;     // a card never lands on a map zoomed out further than this: the pin has to be seen
  function openMapPad(root) {
    if (!root) return null;
    const box = root.getBoundingClientRect();
    const rect = (sel) => { const el = root.querySelector(sel); return el && !el.hidden ? el.getBoundingClientRect() : null; };
    const top = rect("[data-mv2='home-top']");
    const row = rect("[data-mv2='explore']");
    return {
      top: (top ? Math.max(0, top.bottom - box.top) : 0) + OPEN_GAP,
      bottom: (row ? Math.max(0, box.bottom - row.top) : 0) + OPEN_GAP,
      left: 0, right: 0,
    };
  }

  // ── Home / Discover ──
  function HomePage() {
    const app = window.useApp();
    const { events, places, contributors, ideas, newsPosts, dismissBubble, trackImpression } = app;
    const [selected, setSelected] = useState(null);
    // Map v2: the sheet reports how much of the map it covers; the map keeps the selected pin clear of it
    const mapApi = useRef(null);
    const [selType, setSelType] = useState('event');
    const [filter, setFilter] = useState(null);
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useState(false);
    // Which entity types the current zoom is showing ('all' | 'places' |
    // 'contributors' | 'none' — see map.jsx zoomBandFor). The map owns the
    // thresholds and only reports when the band actually changes, so this is
    // one state update per crossing, not one per zoom frame.
    const [zoomBand, setZoomBand] = useState('all');
    const pillsRef = useRef(null);
    // Map v2 (#210): the pill (a group, Events or All: chosen inside the Explore panel), the listing whose full sheet is
    // open (a chosen card was tapped AGAIN; the first tap only chooses it and moves the map), whether the panel is
    // lowered to its title strip, and which pin was just tapped (so the panel brings that card into view; a card tap
    // never does, the panel stays exactly where it is).
    const v2 = !!(window.isMapV2 && window.isMapV2());
    const X = window.MapV2Explore;
    const [pill, setPill] = useState('all');
    const [sheet, setSheet] = useState(null);
    const [min, setMin] = useState(false);
    const [reveal, setReveal] = useState(null);   // { id, focus, n }: n counts pin taps, so a second tap on a pin scrolls to its card again
    const rootRef = useRef(null);
    const skipFrame = useRef(false);
    const minRef = useRef(false);
    const narrow = X ? X.useNarrow() : false;
    const clean = v2 && !!(app.nav && app.nav.params && app.nav.params.view === 'map');
    const pillTest = useMemo(() => (X && pill !== 'all' ? (m) => X.pillMatches(pill, m) : null), [X, pill]);
    // The panel's height goes straight onto the screen as a CSS variable (the map's controls and credit sit above it): no re-render.
    // The data is framed again as the panel grows, but never because the person lowered or raised it (the map would jump).
    const onExploreHeight = useCallback((px) => {
      if (!rootRef.current) return;
      rootRef.current.style.setProperty('--explore-h', px + 'px');
      if (px <= 0) return;
      if (skipFrame.current) { skipFrame.current = false; return; }
      if (mapApi.current && mapApi.current.reframe) mapApi.current.reframe();
    }, []);
    // Lower or raise the panel (the handle, or a pin tap that needs its card). Only a real change skips the next framing.
    const lower = useCallback((down) => {
      if (minRef.current === down) return;
      minRef.current = down;
      skipFrame.current = true;
      setMin(down);
    }, []);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q) || (t.organizerName || '').toLowerCase().includes(q);
    const now = Date.now();
    const markers = [
      // A finished event is history, not a place to turn up: it leaves the map
      // (it stays on its organiser's profile and dashboard, under "Past events").
      ...events.filter((e) => !window.DATA.isPastEvent(e, now)).filter(matches).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast })),
      ...places.filter(matches).map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast })),
      // Contributors: same marker shape, minus the event-only isLive/isBusy/
      // broadcast fields (a Contributor pin is just a plain coloured pin —
      // see V1_SCOPE.md, "leave live-pulse/broadcast as-is" was scoped to
      // events only, contributors never had those states to begin with).
      ...contributors.filter(matches).filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, type: 'contributor', title: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng, profilePhoto: c.profilePhoto })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY })) : []),
    ];
    // Map v2: what decides which pin keeps its name label when two collide, and who heads a "+N" group:
    // an upcoming event first (soonest), then the most recent activity, then the name. Never popularity.
    if (window.isMapV2 && window.isMapV2()) decorateForV2(markers, events, newsPosts || [], now);
    const scroll = (dir) => pillsRef.current && pillsRef.current.scrollBy({ left: dir === 'l' ? -200 : 200, behavior: 'smooth' });

    // ONE category control. There used to be two — a scrollable pill row AND a
    // "Browse Categories" sheet behind a slider button — showing the same
    // thing. The sheet is gone; the pill row is now the whole set (events AND
    // places, which is what the sheet uniquely offered) behind a leading "All",
    // plus the Contributor types no event/place category already covers.
    const CATEGORY_PILLS = window.DATA.FILTER_CATEGORIES;

    if (v2 && X) {
      // #210: where the map is looking as the sheet opens, so its distance says what the card said (the map moves under the sheet)
      const openSheet = (id, t, from) => {
        const view = from || (mapApi.current && mapApi.current.view ? mapApi.current.view() : null);
        setSelected(id); setSelType(t); setSheet({ id, type: t, view }); if (t === 'event') trackImpression(id);
      };
      const closeSheet = () => setSheet(null);
      // The first tap on a card CHOOSES it: it keeps its place in the panel (outlined, "Tap again to open"), and the map
      // eases to its pin, clear of the search bar above and the panel below. The second tap on the chosen card opens the
      // full listing; closing that returns to this very panel and map (the map never moved for it).
      const tapCard = (id, t) => {
        if (selected === id && selType === t) { openSheet(id, t); return; }
        setSheet(null); setSelected(id); setSelType(t);
        if (mapApi.current) mapApi.current.focusSelected(openMapPad(rootRef.current), CARD_ZOOM);
      };
      const rowMarkers = pillTest ? markers.filter((m) => m.type !== 'idea' && pillTest(m)) : markers.filter((m) => m.type !== 'idea');
      const showSheet = sheet && window.MapV2Sheet;
      const XS = window.MapV2Strings.explore;
      return React.createElement('div', { ref: rootRef, className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover', 'data-mv2': 'home', 'data-clean': clean ? '' : undefined, 'data-narrow': narrow ? '' : undefined, 'data-explore-min': min ? '' : undefined },
        React.createElement('div', { className: 'absolute inset-0', onClick: () => { setSelected(null); setSheet(null); } },
          React.createElement(window.StylizedMap, {
            markers, filterCategory: pillTest, selectedId: selected, apiRef: mapApi,
            // #210: a pin chooses its card in the Explore panel (the panel scrolls to it); the card's second tap opens the
            // full listing. The clean map (the nav's Map) has no panel, so there a pin opens the sheet as before. Ideas keep their panel.
            onSelect: (id, t) => {
              if (t === 'idea') { setSheet(null); setSelected((p) => (p === id ? null : id)); setSelType(t); return; }
              if (clean) { openSheet(id, t); return; }
              const a = document.activeElement;
              const byKey = !!(a && a.closest && a.closest('.maplibregl-marker') && a.matches && (() => { try { return a.matches(':focus-visible'); } catch { return false; } })());
              // A second tap on the same pin keeps it chosen (and brings its card back into view); a tap on the map clears it.
              // A pin tap raises a lowered panel: its card has to be there to be chosen.
              setSheet(null); setSelected(id); setSelType(t); setReveal((r) => ({ id, focus: byKey, n: (r ? r.n : 0) + 1 })); lower(false);
            },
            onDismissBubble: dismissBubble,
            onZoomBandChange: setZoomBand,
          })),

        // top: search and the account button, round and glassy (#210). The category choice is inside the Explore panel now.
        React.createElement('div', { 'data-mv2': 'home-top' },
          React.createElement('div', { 'data-mv2': 'home-bar' },
            React.createElement('label', { 'data-mv2': 'home-search' },
              React.createElement(Icon, { name: 'Search', size: 18 }),
              React.createElement('input', { value: query, onChange: (e) => setQuery(e.target.value), placeholder: XS.search, 'aria-label': XS.search }),
              query && React.createElement('button', { type: 'button', 'data-mv2': 'home-clear', 'aria-label': XS.clearSearch, onClick: () => setQuery('') }, React.createElement(Icon, { name: 'X', size: 16 }))),
            React.createElement(window.AccountButton, { variant: 'round' }))),

        // zoom-gate hint + the MapTiler logo, kept above the Explore row (MapTiler's Free plan needs the logo bottom-left)
        React.createElement('div', { 'data-mv2': 'home-corner' },
          zoomBand !== 'all' && React.createElement('div', { 'data-mv2': 'zoom-hint', 'data-zoom-hint': zoomBand },
            React.createElement(Icon, { name: 'ZoomIn', size: 16 }),
            React.createElement('span', null,
              zoomBand === 'none' ? 'Zoom in to see contributors, events and places'
                : zoomBand === 'contributors' ? 'Zoom in to see events and places'
                : 'Zoom in to see places')),
          window.MapTilerLogo && React.createElement(window.MapTilerLogo)),

        window.MapV2Online && React.createElement(window.MapV2Online.Globe, { onOpenProfile: (id) => app.go('profile', { id }) }),

        // ONE bottom area: the Explore panel, or the full listing of the card that was tapped twice, never both. The panel
        // stays mounted (hidden) under the listing, so it keeps its place and the card that opened it gets focus back.
        !clean && React.createElement(X.Explore, {
          hidden: !!showSheet,
          markers: rowMarkers, sources: { events, places, contributors }, apiRef: mapApi, selectedId: selected, reveal,
          pill, onPill: setPill, ideas: showIdeas, onIdeas: () => setShowIdeas((v) => !v), min, onMin: lower,
          onOpen: tapCard, onSeeAll: () => app.go('explore'), onHeight: onExploreHeight,
        }),
        // a chosen card tapped again opens the expanded sheet (#210: full, its cover and distance, swipe down back to the
        // panel; it never moves the map); the clean map's pin opens today's half sheet
        showSheet && React.createElement(window.MapV2Sheet, {
          id: sheet.id, type: sheet.type, expanded: !clean, view: sheet.view,
          onClose: closeSheet, onOccupy: (pad) => { if (mapApi.current) mapApi.current.focusSelected(pad); },
          nearby: markers,
          // a Nearby pick keeps the place the distances were measured from (the map has moved under the sheet since)
          onPick: (id, t) => openSheet(id, t, sheet.view),
        }),
        selected && selType === 'idea' && React.createElement(PreviewPanel, { id: selected, type: selType, onClose: () => setSelected(null) }));
    }

    return React.createElement('div', { className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover' },
      React.createElement('div', { className: 'absolute inset-0', onClick: () => setSelected(null) },
        React.createElement(window.StylizedMap, {
          markers, filterCategory: filter, selectedId: selected, apiRef: mapApi,
          // Every pin type — Contributor included — opens the same small
          // preview card; the full profile is one tap further, on the card.
          onSelect: (id, t) => {
            setSelected((p) => (p === id ? null : id)); setSelType(t); if (t === 'event') trackImpression(id);
          },
          onDismissBubble: dismissBubble,
          onZoomBandChange: setZoomBand,
        })),

      // top overlay — search + ONE account entry point. The category button
      // (duplicate of the pill row) and the list button (now a bottom-nav
      // destination) both came out of here; the founder asked for the top-right
      // to stop feeling cluttered.
      React.createElement('div', { className: 'absolute top-0 left-0 right-0 z-30 p-3 flex flex-col gap-3 pointer-events-none', style: { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } },
        React.createElement('div', { className: 'flex gap-2 items-center pointer-events-auto' },
          React.createElement('div', { className: cx('flex-1 glass rounded-2xl shadow-xl border transition-all', focus ? 'border-gold/50' : 'border-white/60') },
            React.createElement('div', { className: 'flex items-center gap-2 px-4 py-3' },
              React.createElement(Icon, { name: 'Search', size: 15, className: 'text-gold shrink-0' }),
              React.createElement('input', { value: query, onChange: (e) => setQuery(e.target.value), onFocus: () => setFocus(true), onBlur: () => setFocus(false), placeholder: 'Search events, places, people…', className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground' }),
              query && React.createElement('button', { onClick: () => setQuery('') }, React.createElement(Icon, { name: 'X', size: 14, className: 'text-muted-foreground' })))),
          React.createElement(window.AccountButton, null)),

        // pills — the single category control
        React.createElement('div', { className: 'flex items-center gap-1.5 pointer-events-auto', style: { transform: 'translateZ(0)' } },
          React.createElement('button', { onClick: () => scroll('l'), 'aria-label': 'Scroll categories left', className: 'glass w-7 h-7 rounded-full border border-white/60 flex items-center justify-center shadow-md shrink-0' }, React.createElement(Icon, { name: 'ChevronLeft', size: 13, className: 'text-foreground/60' })),
          React.createElement('div', { ref: pillsRef, className: 'flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none' },
            React.createElement('button', { onClick: () => setFilter(null), 'aria-label': 'All categories', className: cx('px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all', !filter ? 'bg-foreground text-background' : 'glass text-foreground/60 border border-white/60') }, 'All'),
            CATEGORY_PILLS.map((c) => React.createElement(CategoryBadge, { key: c.id, cat: c, active: filter === c.id, onClick: () => setFilter(filter === c.id ? null : c.id) })),
            React.createElement('button', { onClick: () => setShowIdeas((s) => !s), className: cx('flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all', showIdeas ? 'bg-gold text-white' : 'glass text-gold border border-gold/40') },
              React.createElement(Icon, { name: 'Lightbulb', size: 11, strokeWidth: 2.5 }), 'Ideas')),
          React.createElement('button', { onClick: () => scroll('r'), 'aria-label': 'Scroll categories right', className: 'glass w-7 h-7 rounded-full border border-white/60 flex items-center justify-center shadow-md shrink-0' }, React.createElement(Icon, { name: 'ChevronRight', size: 13, className: 'text-foreground/60' })))),

      // zoom-gate hint + the MapTiler logo (the Map Key was removed at the founder's request, 2026-10-12)
      React.createElement('div', { className: 'absolute bottom-20 md:bottom-5 left-3 z-20 flex flex-col gap-1.5 items-start' },
        zoomBand !== 'all' && React.createElement('div', {
          className: 'glass rounded-xl px-2.5 py-1.5 border border-gold/40 shadow-lg flex items-center gap-1.5 max-w-[190px]',
          'data-zoom-hint': zoomBand,
        },
          React.createElement(Icon, { name: 'ZoomIn', size: 12, className: 'text-gold-dark shrink-0' }),
          React.createElement('span', { className: 'text-[10px] font-semibold text-foreground/75 leading-tight' },
            zoomBand === 'none' ? 'Zoom in to see contributors, events and places'
              : zoomBand === 'contributors' ? 'Zoom in to see events and places'
              : 'Zoom in to see places')),
        // MapTiler's Free plan requires its logo bottom-left on the map (map.jsx, MapTilerLogo).
        window.MapTilerLogo && React.createElement(window.MapTilerLogo)),

      // Issue #259: the "Online in this area" globe and its list (Map v2 only; it draws nothing, and asks for nothing, unless
      // Contributors with no fixed place serve the area in view). A tap on a row opens that profile.
      window.isMapV2 && window.isMapV2() && window.MapV2Online && React.createElement(window.MapV2Online.Globe, { onOpenProfile: (id) => app.go('profile', { id }) }),

      // Map v2: ONE bottom sheet for a Contributor, a Place and an Event; Impact Ideas keep their small panel.
      selected && (window.isMapV2 && window.isMapV2() && window.MapV2Sheet && selType !== 'idea'
        ? React.createElement(window.MapV2Sheet, {
          id: selected, type: selType, onClose: () => setSelected(null), onOccupy: (pad) => { if (mapApi.current) mapApi.current.focusSelected(pad); },
          // P2-01: the same markers the map draws; a pick in the Nearby list moves the selection (the sheet stays open, one history entry)
          nearby: markers,
          onPick: (id, t) => { setSelected(id); setSelType(t); if (t === 'event') trackImpression(id); },
        })
        : React.createElement(PreviewPanel, { id: selected, type: selType, onClose: () => setSelected(null) })));
  }

  window.HomePage = HomePage;
})();
