// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Discover (map home) + event preview panel
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useRef } = React;
  const { cx, Avatar, SmartImage, Button, CategoryBadge } = window.UI;
  const Icon = window.Icon;

  // ── Preview panel (on pin click) ──
  function PreviewPanel({ id, type, onClose }) {
    const app = window.useApp();
    const { events, places, ideas, connected, considering, followedPlaces, toggleConnect, toggleConsider, togglePlaceFollow, toggleIdeaVote, go, startConversationWith, contributors, toast } = app;
    let item, cat, isEvent = type === 'event', isIdea = type === 'idea';
    if (isEvent) item = events.find((e) => e.id === id);
    else if (type === 'place') item = places.find((p) => p.id === id);
    else item = ideas.find((i) => i.id === id);
    if (!item) return null;
    cat = window.DATA.getCategory(item.category);

    if (isIdea) {
      const pct = Math.min(100, Math.round((item.votes / item.threshold) * 100));
      return Wrapper(onClose,
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

    const isConnected = connected.has(id), isConsidered = considering.has(id), isFollowingPlace = followedPlaces.has(id);
    // ── category-adaptive palette ──
    const hex = cat ? cat.hex : '#C9A84C';
    const mix = (a, p, b) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
    const grad = `linear-gradient(135deg, ${mix(hex, 68, '#ffffff')}, ${hex} 52%, ${mix(hex, 72, '#000000')})`;
    const hexInk = mix(hex, 72, '#1a1206');   // readable icon / text accent
    const soft = mix(hex, 13, 'transparent'); // tinted fill
    const softInk = mix(hex, 70, '#000000');  // text on soft fill
    const org = contributors.find((c) => c.id === item.organizerId) || {};
    const pair = (icon, text, key) => React.createElement('span', { key, className: 'flex items-center gap-1.5' },
      React.createElement(Icon, { name: icon, size: 14, style: { color: hexInk }, className: 'shrink-0' }),
      React.createElement('span', { className: 'whitespace-nowrap' }, text));
    const circle = (icon, onClick, key) => React.createElement('button', {
      key, onClick, className: 'w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors hover:bg-black/[0.03]',
      style: { border: `1px solid ${mix(hex, 26, 'transparent')}` },
    }, React.createElement(Icon, { name: icon, size: 16, style: { color: hexInk } }));

    return Wrapper(onClose, React.createElement(React.Fragment, null,
      // ── cover ──
      React.createElement('div', { className: 'relative h-40 shrink-0' },
        React.createElement(SmartImage, { src: item.coverPhoto, cat, label: isEvent ? 'Event' : 'Place', alt: item.title || item.name, className: 'w-full h-full' }),
        React.createElement('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25' }),
        // category badge (top-left)
        cat && React.createElement('span', { className: 'absolute top-3 left-3 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-lg', style: { background: hex } },
          React.createElement(Icon, { name: cat.icon, size: 11 }), cat.name),
        // live + close (top-right)
        React.createElement('div', { className: 'absolute top-3 right-3 flex items-center gap-2' },
          item.isLive && React.createElement('span', { className: 'flex items-center gap-1.5 bg-red-500 pl-2 pr-2.5 py-1 rounded-full shadow-lg' },
            React.createElement('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }),
            React.createElement('span', { className: 'text-[10px] font-bold text-white tracking-wide' }, 'LIVE')),
          React.createElement('button', { onClick: onClose, className: 'w-8 h-8 rounded-full bg-black/45 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 transition-colors' }, React.createElement(Icon, { name: 'X', size: 15 }))),
        // title
        React.createElement('p', { className: 'absolute bottom-3 left-4 right-4 text-white font-bold text-xl leading-tight drop-shadow-lg font-display' }, item.title || item.name)),
      // category divider glow
      React.createElement('div', { className: 'h-[3px] shrink-0', style: { background: `linear-gradient(90deg, transparent, ${hex}, transparent)`, opacity: 0.7 } }),

      // ── body ──
      React.createElement('div', { className: 'p-4 overflow-y-auto flex flex-col gap-3' },
        // meta
        React.createElement('div', { className: 'flex flex-col gap-2 text-[13px] text-foreground/85' },
          isEvent
            ? React.createElement('div', { className: 'flex items-center gap-4' }, pair('Calendar', fmtLong(item.date), 'd'), pair('Clock', item.time, 't'))
            : item.openHours && React.createElement('div', { className: 'flex items-center gap-4' }, pair('Clock', item.openHours, 'h')),
          React.createElement('div', { className: 'flex items-center gap-2.5 min-w-0' },
            React.createElement(Icon, { name: 'MapPin', size: 14, style: { color: hexInk }, className: 'shrink-0' }),
            React.createElement('span', { className: 'truncate' }, item.address || item.location)),
          isEvent
            ? React.createElement('div', { className: 'flex items-center gap-2.5' },
                React.createElement(Icon, { name: 'Users', size: 14, style: { color: hexInk }, className: 'shrink-0' }),
                React.createElement('span', null, React.createElement('b', { className: 'text-foreground' }, item.connectCount.toLocaleString()), ' connected · ', React.createElement('b', { className: 'text-foreground' }, item.considerCount), ' considering'))
            : React.createElement('div', { className: 'flex items-center gap-2.5' },
                React.createElement(Icon, { name: 'Heart', size: 14, style: { color: hexInk }, className: 'shrink-0' }),
                React.createElement('span', null, React.createElement('b', { className: 'text-foreground' }, (item.followerCount || 0).toLocaleString()), ' followers'))),

        // organizer row — crash-safe for real data:
        //  • real directory contributor → tappable row to its profile (+ verified tick)
        //  • only a name (community-posted, no directory match) → name-only, not tappable
        //  • no organiser at all → omit the row entirely (never an empty/broken nav)
        (() => {
          const orgResolved = !!(org && org.id);
          const orgName = item.organizerName || (orgResolved ? org.name : '');
          if (!orgResolved && !orgName) return null;
          const inner = [
            React.createElement(Avatar, { key: 'a', src: org.profilePhoto, size: 30, rounded: 'full' }),
            React.createElement('span', { key: 'n', className: 'flex-1 min-w-0 flex items-center gap-1.5' },
              React.createElement('span', { className: 'text-[13px] font-bold text-foreground truncate' }, orgName),
              orgResolved && React.createElement(Icon, { name: 'BadgeCheck', size: 13, style: { color: hexInk }, className: 'shrink-0' })),
            orgResolved && React.createElement(Icon, { key: 'c', name: 'ChevronRight', size: 17, className: 'text-muted-foreground shrink-0' }),
          ];
          return orgResolved
            ? React.createElement('button', { onClick: () => go('profile', { id: org.id }), className: 'w-full flex items-center gap-2.5 py-2.5 border-t border-black/[0.06] text-left' }, inner)
            : React.createElement('div', { className: 'w-full flex items-center gap-2.5 py-2.5 border-t border-black/[0.06]' }, inner);
        })(),

        // primary actions
        isEvent
          ? React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
              React.createElement('button', { onClick: () => toggleConnect(id), className: 'flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-white transition-transform active:scale-[0.98]', style: { background: grad, boxShadow: `0 6px 16px ${mix(hex, 38, 'transparent')}` } },
                React.createElement(Icon, { name: isConnected ? 'Check' : 'CalendarCheck', size: 15, strokeWidth: 2.6 }), isConnected ? 'Connected' : 'Connect'),
              React.createElement('button', { onClick: () => toggleConsider(id), className: 'flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-colors', style: isConsidered ? { background: soft, color: softInk } : { border: `1px solid ${mix(hex, 30, 'transparent')}`, color: hexInk } },
                React.createElement(Icon, { name: 'Bookmark', size: 15, strokeWidth: 2.4, fill: isConsidered ? 'currentColor' : 'none' }), 'Consider'))
          : React.createElement('button', { onClick: () => togglePlaceFollow(id, item.name), className: 'w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-transform active:scale-[0.98]' + (isFollowingPlace ? '' : ' text-white'), style: isFollowingPlace ? { background: soft, color: softInk } : { background: grad, boxShadow: `0 6px 16px ${mix(hex, 38, 'transparent')}` } },
              React.createElement(Icon, { name: 'Heart', size: 15, strokeWidth: 2.4, fill: isFollowingPlace ? 'currentColor' : 'none' }), isFollowingPlace ? 'Following' : 'Follow'),

        // view profile + circle actions
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('button', { onClick: () => go(type, { id }), className: 'flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-opacity hover:opacity-90', style: { background: soft, color: softInk } }, 'View Full Profile'),
          circle('Globe', () => toast('Opening ' + (item.website || 'website'), 'gold'), 'w'),
          circle('Share2', () => toast('Share link copied', 'gold'), 's'),
          circle('MessageCircle', () => startConversationWith(item.organizerName, org.profilePhoto, true, org.id || item.organizerId), 'm')))));

    function Wrapper(close, children) {
      return React.createElement('div', { className: 'fixed z-[120] left-0 right-0 bottom-16 md:bottom-4 md:left-[280px] md:right-auto md:w-[370px]' },
        React.createElement('div', { className: 'bg-white border border-gold/20 shadow-2xl rounded-t-3xl md:rounded-3xl overflow-hidden md:max-h-none max-h-[78vh] flex flex-col' }, children));
    }
  }
  const Row = ({ icon, text }) => React.createElement('div', { className: 'flex items-center gap-2 text-xs text-foreground/80' },
    React.createElement(Icon, { name: icon, size: 13, className: 'text-gold shrink-0' }), React.createElement('span', { className: 'truncate' }, text));
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtLong = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });

  // ── Category panel (full grid popup) ──
  function CategoryPanel({ selected, onSelect, onClose }) {
    const eventBtn = (c) => React.createElement('button', {
      key: c.id, onClick: () => { onSelect(selected === c.id ? null : c.id); onClose(); },
      className: cx('flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left', selected === c.id ? 'border-transparent text-white' : 'border-border bg-white/60 hover:bg-white'),
      style: selected === c.id ? { background: c.hex } : { color: c.hex },
    },
      React.createElement('span', { className: 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style: selected === c.id ? { background: 'rgba(255,255,255,0.25)' } : { background: c.hex + '1c' } },
        React.createElement(Icon, { name: c.icon, size: 14 })),
      React.createElement('span', { className: cx('text-xs font-semibold truncate', selected === c.id ? 'text-white' : 'text-foreground') }, c.name));
    const placeItem = (c) => React.createElement('div', {
      key: c.id, className: 'flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-white/60', style: { color: c.hex },
    },
      React.createElement('span', { className: 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style: { background: c.hex + '1c' } }, React.createElement(Icon, { name: c.icon, size: 14 })),
      React.createElement('span', { className: 'text-xs font-semibold text-foreground truncate' }, c.name));
    return React.createElement(window.UI.Overlay, { variant: 'sheet', onClose, title: 'Browse Categories' },
      React.createElement('div', { className: 'p-4 overflow-y-auto' },
        React.createElement('p', { className: 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2' }, 'Events'),
        React.createElement('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5' }, window.DATA.EVENT_CATEGORIES.map(eventBtn)),
        React.createElement('p', { className: 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2' }, 'Places'),
        React.createElement('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-2' }, window.DATA.PLACE_CATEGORIES.map(placeItem))));
  }

  // ── Home / Discover ──
  function HomePage() {
    const app = window.useApp();
    const { events, places, ideas, user, role, dismissBubble } = app;
    const [selected, setSelected] = useState(null);
    const [selType, setSelType] = useState('event');
    const [filter, setFilter] = useState(null);
    const [showCats, setShowCats] = useState(false);
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const pillsRef = useRef(null);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q) || (t.organizerName || '').toLowerCase().includes(q);
    const markers = [
      ...events.filter(matches).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast })),
      ...places.filter(matches).map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY })) : []),
    ];
    const scroll = (dir) => pillsRef.current && pillsRef.current.scrollBy({ left: dir === 'l' ? -200 : 200, behavior: 'smooth' });

    return React.createElement('div', { className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover' },
      React.createElement('div', { className: 'absolute inset-0', onClick: () => setSelected(null) },
        React.createElement(window.StylizedMap, { markers, filterCategory: filter, selectedId: selected, onSelect: (id, t) => { setSelected((p) => (p === id ? null : id)); setSelType(t); }, onDismissBubble: dismissBubble })),

      // broadcast bubbles + selected label — sibling overlay (paints over the map's heavy subtree)
      React.createElement(window.MapFloatersLayer, { markers, filterCategory: filter, selectedId: selected }),

      // top overlay
      React.createElement('div', { className: 'absolute top-0 left-0 right-0 z-30 p-3 flex flex-col gap-3 pointer-events-none' },
        React.createElement('div', { className: 'flex gap-2 items-center pointer-events-auto' },
          React.createElement('div', { className: cx('flex-1 glass rounded-2xl shadow-xl border transition-all', focus ? 'border-gold/50' : 'border-white/60') },
            React.createElement('div', { className: 'flex items-center gap-2 px-4 py-3' },
              React.createElement(Icon, { name: 'Search', size: 15, className: 'text-gold shrink-0' }),
              React.createElement('input', { value: query, onChange: (e) => setQuery(e.target.value), onFocus: () => setFocus(true), onBlur: () => setFocus(false), placeholder: 'Search events, places, people…', className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground' }),
              query && React.createElement('button', { onClick: () => setQuery('') }, React.createElement(Icon, { name: 'X', size: 14, className: 'text-muted-foreground' })))),
          React.createElement('button', { onClick: () => setShowCats(true), className: cx('w-12 h-12 glass rounded-2xl shadow-xl border flex items-center justify-center shrink-0', filter ? 'border-gold/60 bg-gold/10' : 'border-white/60') },
            React.createElement(Icon, { name: 'SlidersHorizontal', size: 16, className: filter ? 'text-gold' : 'text-foreground/60' })),
          React.createElement('div', { className: 'relative shrink-0' },
            React.createElement('button', { onClick: () => setShowProfile((s) => !s), className: 'w-12 h-12 glass rounded-2xl shadow-xl border border-white/60 overflow-hidden relative' },
              React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size: 48, rounded: 'xl' }),
              role !== 'citizen' && React.createElement('span', { className: 'absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-gold border-2 border-white flex items-center justify-center' }, React.createElement(Icon, { name: 'Crown', size: 7, className: 'text-white' }))),
            showProfile && React.createElement(window.ProfilePanel, { onClose: () => setShowProfile(false), anchor: 'top' }))),

        // pills
        React.createElement('div', { className: 'flex items-center gap-1.5 pointer-events-auto', style: { transform: 'translateZ(0)' } },
          React.createElement('button', { onClick: () => scroll('l'), className: 'glass w-7 h-7 rounded-full border border-white/60 flex items-center justify-center shadow-md shrink-0' }, React.createElement(Icon, { name: 'ChevronLeft', size: 13, className: 'text-foreground/60' })),
          React.createElement('div', { ref: pillsRef, className: 'flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none' },
            React.createElement('button', { onClick: () => setFilter(null), className: cx('px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all', !filter ? 'bg-foreground text-background' : 'glass text-foreground/60 border border-white/60') }, 'All'),
            window.DATA.EVENT_CATEGORIES.map((c) => React.createElement(CategoryBadge, { key: c.id, cat: c, active: filter === c.id, onClick: () => setFilter(filter === c.id ? null : c.id) })),
            React.createElement('button', { onClick: () => setShowIdeas((s) => !s), className: cx('flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all', showIdeas ? 'bg-gold text-white' : 'glass text-gold border border-gold/40') },
              React.createElement(Icon, { name: 'Lightbulb', size: 11, strokeWidth: 2.5 }), 'Ideas')),
          React.createElement('button', { onClick: () => scroll('r'), className: 'glass w-7 h-7 rounded-full border border-white/60 flex items-center justify-center shadow-md shrink-0' }, React.createElement(Icon, { name: 'ChevronRight', size: 13, className: 'text-foreground/60' })))),

      // legend
      React.createElement('div', { className: 'absolute bottom-20 md:bottom-5 left-3 z-20' },
        React.createElement('div', { className: 'glass rounded-xl p-2.5 border border-white/60 shadow-lg space-y-1.5' },
          React.createElement('p', { className: 'text-[8px] font-bold text-muted-foreground uppercase tracking-widest' }, 'Map Key'),
          React.createElement(LegendRow, { color: '#ef4444', label: 'Live', pulse: true }),
          React.createElement(LegendRow, { label: 'Place', square: true }),
          React.createElement(LegendRow, { color: '#C9A84C', label: 'Idea', square: true }))),

      selected && React.createElement(PreviewPanel, { id: selected, type: selType, onClose: () => setSelected(null) }),
      showCats && React.createElement(CategoryPanel, { selected: filter, onSelect: setFilter, onClose: () => setShowCats(false) }));
  }

  const LegendRow = ({ color, label, pulse, square }) => React.createElement('div', { className: 'flex items-center gap-1.5' },
    pulse
      ? React.createElement('span', { className: 'w-3 h-3 rounded-full relative flex items-center justify-center', style: { background: color } }, React.createElement('span', { className: 'absolute inset-0 rounded-full pin-pulse', style: { background: color } }))
      : React.createElement('span', { className: cx('w-3 h-3', square ? 'rounded' : 'rounded-full'), style: { background: color || 'rgba(255,255,255,0.7)', border: color ? `1px solid ${color}99` : '1px solid rgba(10,9,8,0.3)' } }),
    React.createElement('span', { className: 'text-[10px] text-foreground/70' }, label));

  window.HomePage = HomePage;
})();
