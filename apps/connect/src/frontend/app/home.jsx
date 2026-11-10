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
    const { events, places, contributors, ideas, newsPosts, dismissBubble, trackImpression, connected, followedOrgs, toggleConnect, shareLink, toggleFollow, startConversationWith } = app;
    const [selected, setSelected] = useState(null);
    // The sheet reports how much of the map it covers; the map keeps the selected pin clear of it
    const mapApi = useRef(null);
    const [selType, setSelType] = useState('event');
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    // Which entity types the current zoom is showing ('all' | 'places' |
    // 'contributors' | 'none' — see map.jsx zoomBandFor). The map owns the
    // thresholds and only reports when the band actually changes, so this is
    // one state update per crossing, not one per zoom frame.
    const [zoomBand, setZoomBand] = useState('all');
    // Map v2 (#210): the pill (a group, Events or All: chosen inside the Explore panel), the listing whose full sheet is
    // open (a chosen card was tapped AGAIN; the first tap only chooses it and moves the map), whether the panel is
    // lowered to its title strip, and which pin was just tapped (so the panel brings that card into view; a card tap
    // never does, the panel stays exactly where it is).
    const X = window.MapV2Explore;
    const [pill, setPill] = useState('all');
    // "Where to…" (C40): a saved set of categories. It replaces the pill while it is on.
    const [intent, setIntent] = useState(null);
    const [sheet, setSheet] = useState(null);
    const [min, setMin] = useState(false);
    const [reveal, setReveal] = useState(null);   // { id, focus, n }: n counts pin taps, so a second tap on a pin scrolls to its card again
    const rootRef = useRef(null);
    const skipFrame = useRef(false);
    const minRef = useRef(false);
    const chosen = useRef({ id: null, type: null });   // the latest choice, so a second tap never reads a render's old one
    const narrow = X.useNarrow();
    const clean = !!(app.nav && app.nav.params && app.nav.params.view === 'map');
    const q = query.trim().toLowerCase();
    const passesChrome = useCallback((m) => {
      const qok = !q || (m.title || m.name || '').toLowerCase().includes(q) || (m.organizerName || '').toLowerCase().includes(q);
      const gok = group === 'all' || (X.groupOf && X.groupOf(m) === group);
      return qok && gok;
    }, [q, group, X]);
    const pillTest = useMemo(() => (q || group !== 'all' ? passesChrome : null), [q, group, passesChrome]);
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

    const now = Date.now();
    const markers = [
      // A finished event is history, not a place to turn up: it leaves the map
      // (it stays on its organiser's profile and dashboard, under "Past events").
      ...events.filter((e) => !window.DATA.isPastEvent(e, now)).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, organizerName: e.organizerName, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast, coverPhoto: e.coverPhoto, linked: !!(connected && connected.has && connected.has(e.id)) })),
      ...places.map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast })),
      ...contributors.filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, type: 'contributor', title: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng, profilePhoto: c.profilePhoto, linked: !!(followedOrgs && followedOrgs.has && followedOrgs.has(c.id)) })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY })) : []),
    ];
    // What decides which pin keeps its name label when two collide, and who heads a "+N" group:
    // an upcoming event first (soonest), then the most recent activity, then the name. Never popularity.
    decorateForV2(markers, events, newsPosts || [], now);

    // #210: where the map is looking as the sheet opens, so its distance says what the card said (the map moves under the sheet)
    const openSheet = (id, t, from) => {
      const view = from || (mapApi.current && mapApi.current.view ? mapApi.current.view() : null);
      setSelected(id); setSelType(t); setSheet({ id, type: t, view }); if (t === 'event') trackImpression(id);
    };
    const closeSheet = () => setSheet(null);
    // The first tap on a card CHOOSES it: it keeps its place in the panel (outlined, "Tap again to open"), and the map
    // eases to its pin, clear of the search bar above and the panel below. The second tap on the chosen card opens the
    // full listing; closing that returns to this very panel and map (the map never moved for it).
    chosen.current = { id: selected, type: selType };
    const tapCard = (id, t) => {
      if (chosen.current.id === id && chosen.current.type === t) { openSheet(id, t); return; }
      chosen.current = { id, type: t };
      setSheet(null); setSelected(id); setSelType(t);
      if (mapApi.current) mapApi.current.focusSelected(openMapPad(rootRef.current), CARD_ZOOM);
    };
    useEffect(() => {
      window.ConnectActions = { toggleConnect, shareLink, toggleFollow, startConversationWith, connected, followed: followedOrgs };
    });
    useEffect(() => {
      const C = window.ConnectChrome;
      if (C) C.patchShell({ panels: !!(selected || sheet) });
    }, [selected, sheet]);
    useEffect(() => {
      const clear = () => { setSelected(null); setSheet(null); };
      window.addEventListener('cc-map-clear', clear);
      return () => window.removeEventListener('cc-map-clear', clear);
    }, []);
    const rowMarkers = markers.filter((m) => m.type !== 'idea');
    return React.createElement('div', { ref: rootRef, className: 'connect-map flex-1 relative overflow-hidden' + (query ? ' typing' : ''), style: { height: '100%' }, 'data-screen': 'discover', 'data-mv2': 'home', 'data-clean': clean ? '' : undefined, 'data-narrow': narrow ? '' : undefined },
      React.createElement('div', { className: 'map-touch absolute inset-0', onClick: () => { setSelected(null); setSheet(null); } },
        React.createElement(window.StylizedMap, {
          markers, filterCategory: pillTest, selectedId: selected, apiRef: mapApi,
          // #210: a pin chooses its card in the Explore panel (the panel scrolls to it); the card's second tap opens the
          // full listing. The clean map (the nav's Map) has no panel, so there a pin opens the sheet as before. Ideas keep their panel.
          onSelect: (id, t) => {
            if (t === 'idea') { setSheet(null); setSelected((p) => (p === id ? null : id)); setSelType(t); return; }
            try { window.dispatchEvent(new Event('cc-map-select')); } catch (e) { /* old webview */ }
            // The nav's Map (view=map) has no card row, so one tap opens the half sheet, as it always did.
            if (clean) { openSheet(id, t); return; }
            if (chosen.current.id === id && chosen.current.type === t) { openSheet(id, t); return; }
            chosen.current = { id, type: t };
            setSheet(null); setSelected(id); setSelType(t);
          },
          onDismissBubble: dismissBubble,
          onZoomBandChange: setZoomBand,
        })),

      window.ConnectChrome && React.createElement(window.ConnectChrome.MapChrome, {
        query, onQuery: setQuery, group, onGroup: setGroup,
      }),

      React.createElement('div', { className: 'map-overlay-stack' },
        React.createElement(window.MapV2Online.Globe, { onOpenProfile: (id) => app.go('profile', { id }) })),

      React.createElement('div', { 'data-mv2': 'home-corner' },
        zoomBand !== 'all' && React.createElement('div', { 'data-mv2': 'zoom-hint', 'data-zoom-hint': zoomBand },
          React.createElement(Icon, { name: 'ZoomIn', size: 16 }),
          React.createElement('span', null,
            zoomBand === 'none' ? 'Zoom in to see contributors, events and places'
              : zoomBand === 'contributors' ? 'Zoom in to see events and places'
              : 'Zoom in to see places')),
        window.MapTilerLogo && React.createElement(window.MapTilerLogo)),
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
