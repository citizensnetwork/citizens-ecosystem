// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Kingdom Discovery (scrollable list) — v1 simple toggle
//  Companion screen to home.jsx (the map). Same underlying data
//  (events / places / contributors), same categories, same navigation
//  targets — this is a second view of one dataset, not a separate
//  feature. See V1_SCOPE.md at the repo root.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState } = React;
  const { cx, SmartImage, Empty } = window.UI;
  const Icon = window.Icon;

  const TYPES = [
    { id: 'all', label: 'All' },
    { id: 'contributor', label: 'Contributors' },
    { id: 'place', label: 'Places' },
    { id: 'event', label: 'Events' },
  ];

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // page → nav target. Contributors route to 'profile'; events/places route
  // to their own page key. Mirrors the exact mapping home.jsx's preview
  // panel already uses, so a card and a map pin open the same screen.
  function navTarget(type) {
    return type === 'contributor' ? 'profile' : type;
  }

  function DiscoveryCard({ item }) {
    const { go, considering, followedPlaces, toggleConsider, togglePlaceFollow } = window.useApp();
    const cat = window.DATA.getCategory(item.category);
    const isEvent = item.type === 'event';
    const isPlace = item.type === 'place';
    const title = item.title || item.name;
    const sub = isEvent
      ? fmtDate(item.date) + (item.location ? ' · ' + item.location : '')
      : isPlace ? (item.address || item.openHours || '')
      : (item.location || item.bio || '');
    const saved = isEvent ? considering.has(item.id) : isPlace ? followedPlaces.has(item.id) : false;
    const showSave = isEvent || isPlace; // no Contributor-level save state exists yet — v2.
    const onSave = (e) => {
      e.stopPropagation();
      if (isEvent) toggleConsider(item.id);
      else if (isPlace) togglePlaceFollow(item.id, item.name);
    };

    return h('button', {
      onClick: () => go(navTarget(item.type), { id: item.id }),
      className: 'w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-border text-left hover:border-gold/40 transition-colors',
    },
      h('div', { className: 'w-14 h-14 rounded-xl overflow-hidden shrink-0' },
        h(SmartImage, {
          src: item.coverPhoto || item.profilePhoto, cat,
          label: isEvent ? 'Event' : isPlace ? 'Place' : 'Contributor',
          alt: title, className: 'w-full h-full',
        })),
      h('div', { className: 'flex-1 min-w-0' },
        h('div', { className: 'flex items-center gap-1.5 mb-0.5' },
          cat && h('span', { className: 'w-4 h-4 rounded flex items-center justify-center shrink-0', style: { background: cat.hex } },
            h(Icon, { name: cat.icon, size: 9, className: 'text-white' })),
          h('span', { className: 'text-[9px] font-bold uppercase tracking-wide text-muted-foreground' },
            isEvent ? 'Event' : isPlace ? 'Place' : 'Contributor')),
        h('p', { className: 'text-sm font-bold text-foreground truncate' }, title),
        sub && h('p', { className: 'text-xs text-muted-foreground truncate' }, sub)),
      showSave && h('div', {
        onClick: onSave, role: 'button', 'aria-label': saved ? 'Remove bookmark' : 'Bookmark',
        className: cx('w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
          saved ? 'bg-accent text-gold-dark' : 'text-muted-foreground hover:bg-accent/60'),
      }, h(Icon, { name: 'Bookmark', size: 15, fill: saved ? 'currentColor' : 'none' })),
      h(Icon, { name: 'ChevronRight', size: 15, className: 'text-muted-foreground shrink-0' }));
  }

  function KingdomDiscoveryPage() {
    const { events, places, contributors, go } = window.useApp();
    const [type, setType] = useState('all');
    const [query, setQuery] = useState('');

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
          h('button', { onClick: () => go('home'), className: 'w-12 h-12 glass rounded-2xl shadow-xl border border-white/60 flex items-center justify-center shrink-0' },
            h(Icon, { name: 'Map', size: 16, className: 'text-foreground/60' }))),
        h('div', { className: 'flex items-center gap-1.5 overflow-x-auto scrollbar-none' },
          TYPES.map((t) => h('button', {
            key: t.id, onClick: () => setType(t.id),
            className: cx('px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all',
              type === t.id ? 'bg-foreground text-background' : 'glass text-foreground/60 border border-white/60'),
          }, t.label)))),
      h('div', { className: 'flex-1 overflow-y-auto p-3 space-y-2 pb-24 md:pb-3' },
        items.length
          ? items.map((item) => h(DiscoveryCard, { key: item.type + '-' + item.id, item }))
          : h(Empty, { icon: 'SearchX', title: 'Nothing here yet', sub: q ? 'Try a different search term.' : 'Nothing matches this filter yet.' })));
  }

  window.KingdomDiscoveryPage = KingdomDiscoveryPage;
})();
