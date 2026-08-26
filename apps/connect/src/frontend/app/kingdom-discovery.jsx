// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Kingdom Exploration (scrollable list) — v1
//  Companion screen to home.jsx (the map). Same underlying data
//  (events / places / contributors), same categories, same navigation
//  targets, and — since the EntityCard extraction — literally the same
//  card component the map's pin preview renders. This is a second view
//  of one dataset, not a separate feature. See V1_SCOPE.md at the repo root.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect } = React;
  const { cx, Empty } = window.UI;
  const Icon = window.Icon;

  const TYPES = [
    { id: 'all', label: 'All' },
    { id: 'contributor', label: 'Contributors' },
    { id: 'place', label: 'Places' },
    { id: 'event', label: 'Events' },
  ];

  function KingdomDiscoveryPage() {
    const { events, places, contributors } = window.useApp();
    const [type, setType] = useState('all');
    const [query, setQuery] = useState('');
    // One-shot, best-effort — same browser-native permission prompt the map
    // screen already triggers on mount. Silently absent on denial/timeout;
    // distance is simply omitted per-card rather than faked.
    const [myLoc, setMyLoc] = useState(null);
    useEffect(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
      );
    }, []);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q);

    const items = [
      ...events.filter(matches).map((e) => ({ ...e, type: 'event' })),
      ...places.filter(matches).map((p) => ({ ...p, type: 'place' })),
      ...contributors.filter(matches).map((c) => ({ ...c, type: 'contributor' })),
    ].filter((i) => type === 'all' || i.type === type);

    // Soonest event first; everything else keeps arrival order. No other
    // ranking — v1 deliberately has no prominence/relevance model.
    items.sort((a, b) => {
      if (a.type === 'event' && b.type === 'event') return new Date(a.date) - new Date(b.date);
      if (a.type === 'event') return -1;
      if (b.type === 'event') return 1;
      return 0;
    });

    return h('div', { className: 'flex-1 flex flex-col h-full bg-background', 'data-screen': 'kingdom-discovery' },
      h('div', { className: 'shrink-0 p-3 flex flex-col gap-3 border-b border-border', style: { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } },
        h('div', { className: 'flex items-center gap-2' },
          h('div', { className: 'flex-1 glass rounded-2xl shadow-xl border border-white/60 flex items-center gap-2 px-4 py-3' },
            h(Icon, { name: 'Search', size: 15, className: 'text-gold shrink-0' }),
            h('input', {
              value: query, onChange: (e) => setQuery(e.target.value),
              placeholder: 'Search events, places, contributors…',
              className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground',
            }),
            query && h('button', { onClick: () => setQuery('') }, h(Icon, { name: 'X', size: 14, className: 'text-muted-foreground' }))),
          // ONE account entry point, top-right, on every screen — the same
          // control the map carries. Switching between map and list no longer
          // moves it (or duplicates it into the bottom bar, where the panel
          // used to open off the bottom of the screen).
          h(window.AccountButton, null)),
        h('div', { className: 'flex items-center gap-1.5 overflow-x-auto scrollbar-none' },
          TYPES.map((t) => h('button', {
            key: t.id, onClick: () => setType(t.id),
            className: cx('px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all',
              type === t.id ? 'bg-foreground text-background' : 'glass text-foreground/60 border border-white/60'),
          }, t.label)))),
      // The scroll container and the grid MUST stay separate elements.
      // Chromium sizes a grid container's implicit `auto` rows against its own
      // box when that container is itself a scroll container with a definite
      // height — every row collapsed to ~2px and each card was clipped by its
      // own `overflow-hidden` down to the 1.5px category border, so the list
      // rendered as coloured hairlines. Wrapping the grid in the scroller
      // gives the grid an indefinite height again and the rows size to content.
      h('div', { className: 'flex-1 overflow-y-auto p-3 pb-24 md:pb-3' },
        items.length
          ? h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 content-start' },
              items.map((item) => h(window.EntityCard, { key: item.type + '-' + item.id, item, layout: 'grid', myLoc })))
          : h(Empty, { icon: 'SearchX', title: 'Nothing here yet', sub: q ? 'Try a different search term.' : 'Nothing matches this filter yet.' })));
  }

  window.KingdomDiscoveryPage = KingdomDiscoveryPage;
})();
