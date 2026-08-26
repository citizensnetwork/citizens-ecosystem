// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Discover (map home) + pin preview panel
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useRef } = React;
  const { cx, CategoryBadge, Button } = window.UI;
  const Icon = window.Icon;
  const useBackGuard = window.useBackGuard || function () {};

  // ── Preview panel (on pin click) ──
  //  The card body is window.EntityCard — the SAME component Kingdom
  //  Exploration renders, at its 'panel' density. Founder call: a Place or an
  //  Event must not look like two different things depending on whether you
  //  found it on the map or in the list.
  function PreviewPanel({ id, type, onClose }) {
    const app = window.useApp();
    // A Back press dismisses the pin preview before it leaves the map —
    // the same expectation a native map app sets.
    useBackGuard(true, onClose);
    const { events, places, ideas, toggleIdeaVote } = app;
    const isIdea = type === 'idea';
    let item;
    if (type === 'event') item = events.find((e) => e.id === id);
    else if (type === 'place') item = places.find((p) => p.id === id);
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

  // ── Home / Discover ──
  function HomePage() {
    const app = window.useApp();
    const { events, places, contributors, ideas, dismissBubble, trackImpression, go } = app;
    const [selected, setSelected] = useState(null);
    const [selType, setSelType] = useState('event');
    const [filter, setFilter] = useState(null);
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useState(false);
    // Which entity types the current zoom is showing. The map owns the
    // thresholds and only reports when the band actually changes, so this is
    // one state update per crossing, not one per zoom frame.
    const [zoomBand, setZoomBand] = useState('all');
    const pillsRef = useRef(null);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q) || (t.organizerName || '').toLowerCase().includes(q);
    const markers = [
      ...events.filter(matches).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast })),
      ...places.filter(matches).map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast })),
      // Contributors: same marker shape, minus the event-only isLive/isBusy/
      // broadcast fields (a Contributor pin is just a plain coloured pin —
      // see V1_SCOPE.md, "leave live-pulse/broadcast as-is" was scoped to
      // events only, contributors never had those states to begin with).
      ...contributors.filter(matches).filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, type: 'contributor', title: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng, profilePhoto: c.profilePhoto })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY })) : []),
    ];
    const scroll = (dir) => pillsRef.current && pillsRef.current.scrollBy({ left: dir === 'l' ? -200 : 200, behavior: 'smooth' });

    // ONE category control. There used to be two — a scrollable pill row AND a
    // "Browse Categories" sheet behind a slider button — showing the same
    // thing. The sheet is gone; the pill row is now the whole set (events AND
    // places, which is what the sheet uniquely offered) behind a leading "All".
    const CATEGORY_PILLS = window.DATA.EVENT_CATEGORIES.concat(window.DATA.PLACE_CATEGORIES);

    return React.createElement('div', { className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover' },
      React.createElement('div', { className: 'absolute inset-0', onClick: () => setSelected(null) },
        React.createElement(window.StylizedMap, {
          markers, filterCategory: filter, selectedId: selected,
          // Contributor pins have no preview-panel treatment (PreviewPanel
          // only knows event/place/idea) — go straight to their profile,
          // the same target the Kingdom Exploration cards already use.
          onSelect: (id, t) => {
            if (t === 'contributor') { go('profile', { id }); return; }
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

      // legend + zoom-gate hint
      React.createElement('div', { className: 'absolute bottom-20 md:bottom-5 left-3 z-20 flex flex-col gap-1.5 items-start' },
        zoomBand !== 'all' && React.createElement('div', {
          className: 'glass rounded-xl px-2.5 py-1.5 border border-gold/40 shadow-lg flex items-center gap-1.5 max-w-[190px]',
          'data-zoom-hint': zoomBand,
        },
          React.createElement(Icon, { name: 'ZoomIn', size: 12, className: 'text-gold-dark shrink-0' }),
          React.createElement('span', { className: 'text-[10px] font-semibold text-foreground/75 leading-tight' },
            zoomBand === 'contributors' ? 'Zoom in to see events and places' : 'Zoom in to see places')),
        React.createElement('div', { className: 'glass rounded-xl p-2.5 border border-white/60 shadow-lg space-y-1.5' },
          React.createElement('p', { className: 'text-[8px] font-bold text-muted-foreground uppercase tracking-widest' }, 'Map Key'),
          React.createElement(LegendRow, { color: '#ef4444', label: 'Live', pulse: true }),
          React.createElement(LegendRow, { label: 'Place', square: true }),
          React.createElement(LegendRow, { color: '#C9A84C', label: 'Idea', square: true }))),

      selected && React.createElement(PreviewPanel, { id: selected, type: selType, onClose: () => setSelected(null) }));
  }

  const LegendRow = ({ color, label, pulse, square }) => React.createElement('div', { className: 'flex items-center gap-1.5' },
    pulse
      ? React.createElement('span', { className: 'w-3 h-3 rounded-full relative flex items-center justify-center', style: { background: color } }, React.createElement('span', { className: 'absolute inset-0 rounded-full pin-pulse', style: { background: color } }))
      : React.createElement('span', { className: cx('w-3 h-3', square ? 'rounded' : 'rounded-full'), style: { background: color || 'rgba(255,255,255,0.7)', border: color ? `1px solid ${color}99` : '1px solid rgba(10,9,8,0.3)' } }),
    React.createElement('span', { className: 'text-[10px] text-foreground/70' }, label));

  window.HomePage = HomePage;
})();
