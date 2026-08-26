// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Kingdom Discovery (scrollable list) — v1 simple toggle
//  Companion screen to home.jsx (the map). Same underlying data
//  (events / places / contributors), same categories, same navigation
//  targets — this is a second view of one dataset, not a separate
//  feature. See V1_SCOPE.md at the repo root.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
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

  // Haversine great-circle distance in km — good enough for "how far is this
  // from me" at city scale. Never shown unless BOTH the viewer's location and
  // the item's coordinates are real (no fabricated distances).
  function distanceKm(a, b) {
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function fmtDistance(km) {
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km';
  }

  // page → nav target. Contributors route to 'profile'; events/places route
  // to their own page key. Mirrors the exact mapping home.jsx's preview
  // panel already uses, so a card and a map pin open the same screen.
  function navTarget(type) {
    return type === 'contributor' ? 'profile' : type;
  }

  function DiscoveryCard({ item, myLoc }) {
    const {
      go, considering, followedPlaces, followedOrgs, connected, contributors,
      toggleConsider, togglePlaceFollow, toggleFollow, toggleConnect,
      startConversationWith, toast,
    } = window.useApp();
    const cat = window.DATA.getCategory(item.category);
    const isEvent = item.type === 'event';
    const isPlace = item.type === 'place';
    const isContributor = item.type === 'contributor';
    const title = item.title || item.name;
    const description = isContributor ? item.bio : item.description;
    // Events/places don't carry their own logo — show the organiser's, the
    // same identity EventProfilePage/PlaceProfilePage already resolve.
    const org = !isContributor && item.organizerId ? contributors.find((c) => c.id === item.organizerId) : null;
    const logo = isContributor ? item.profilePhoto : ((org && org.profilePhoto) || '');
    const locationText = isEvent ? item.location : isPlace ? item.address : (item.noFixedLocation ? 'Online' : item.location);
    const dist = (myLoc && typeof item.lat === 'number' && typeof item.lng === 'number')
      ? fmtDistance(distanceKm(myLoc, item)) : '';

    const saved = isEvent ? considering.has(item.id) : isPlace ? followedPlaces.has(item.id) : followedOrgs.has(item.id);
    const onHeart = (e) => {
      e.stopPropagation();
      if (isEvent) toggleConsider(item.id);
      else if (isPlace) togglePlaceFollow(item.id, item.name);
      else toggleFollow(item.id, item.name);
    };

    // No website field exists yet for events/places (create.jsx collects
    // none) — the button honestly never appears for them rather than
    // opening a dead link. Contributors do carry one.
    const website = isContributor ? item.website : '';
    const isConnected = isEvent && connected.has(item.id);
    const primaryLabel = isEvent ? (isConnected ? 'Connected' : 'Connect') : 'Message';
    const primaryIcon = isEvent ? (isConnected ? 'Check' : 'CalendarCheck') : 'MessageCircle';
    const onPrimary = (e) => {
      e.stopPropagation();
      if (isEvent) { toggleConnect(item.id); return; }
      const name = isContributor ? item.name : ((org && org.name) || title);
      const photo = isContributor ? item.profilePhoto : (org ? org.profilePhoto : '');
      const id = isContributor ? item.id : ((org && org.id) || item.organizerId);
      startConversationWith(name, photo, true, id);
    };
    const open = () => go(navTarget(item.type), { id: item.id });

    const statNode = isEvent
      ? h(F, null,
          h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Users', size: 11, className: 'text-gold' }), item.connectCount || 0, ' connected'),
          h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Star', size: 11, className: 'text-gold' }), item.considerCount || 0, ' considering'))
      : h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Heart', size: 11, className: 'text-gold' }), (item.followerCount || 0).toLocaleString(), ' followers');

    const iconBtn = (icon, label, onClick, extraClass) => h('button', {
      type: 'button', onClick, 'aria-label': label, title: label,
      className: cx('w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-muted text-muted-foreground hover:bg-accent/70 hover:text-foreground', extraClass),
    }, h(Icon, { name: icon, size: 15 }));

    return h('div', {
      className: 'rounded-2xl bg-card overflow-hidden transition-shadow hover:shadow-md',
      style: { border: '1.5px solid ' + (cat ? cat.hex : '#C9A84C') + '50' },
    },
      h('button', { type: 'button', onClick: open, className: 'block w-full text-left' },
        h('div', { className: 'relative h-36 sm:h-40' },
          h(SmartImage, {
            src: item.coverPhoto || item.profilePhoto, cat,
            label: isEvent ? 'Event' : isPlace ? 'Place' : 'Contributor', alt: title, className: 'w-full h-full',
          }),
          h('div', { className: 'absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/45 to-transparent' }),
          cat && h('span', {
            className: 'absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow',
            style: { background: cat.hex },
          }, h(Icon, { name: cat.icon, size: 9 }), cat.short || cat.name),
          item.isLive && h('span', { className: 'absolute top-2 left-2 inline-flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full text-[9px] font-bold text-white' },
            h('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }), 'LIVE'),
          logo && h('div', { className: 'absolute bottom-2 left-2 w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md bg-white' },
            h('img', { src: logo, alt: '', className: 'w-full h-full object-cover' }))),
        h('div', { className: 'px-3 pt-2.5 pb-1' },
          h('p', { className: 'text-sm font-bold text-foreground truncate' }, title),
          description && h('p', { className: 'text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed' }, description),
          (locationText || (isEvent && item.date) || dist) && h('div', { className: 'flex items-center gap-2.5 mt-2 text-[11px] text-muted-foreground flex-wrap' },
            locationText && h('span', { className: 'flex items-center gap-1 min-w-0 max-w-full' },
              h(Icon, { name: 'MapPin', size: 11, className: 'text-gold shrink-0' }), h('span', { className: 'truncate' }, locationText)),
            isEvent && item.date && h('span', { className: 'flex items-center gap-1 shrink-0' }, h(Icon, { name: 'Calendar', size: 11, className: 'text-gold' }), fmtDate(item.date)),
            dist && h('span', { className: 'flex items-center gap-1 shrink-0' }, h(Icon, { name: 'Navigation', size: 11, className: 'text-gold' }), dist + ' away')),
          h('div', { className: 'flex items-center gap-3 mt-1.5 text-[11px] font-semibold text-foreground/70' }, statNode))),
      h('div', { className: 'flex items-center gap-2 px-3 pb-3 pt-2' },
        iconBtn('Heart', saved ? 'Remove' : 'Save', onHeart, saved && 'bg-accent text-gold-dark hover:bg-accent'),
        website && iconBtn('Globe', 'Website', (e) => { e.stopPropagation(); window.open(website, '_blank', 'noopener,noreferrer'); }),
        iconBtn('Share2', 'Share', (e) => { e.stopPropagation(); toast('Share link copied', 'gold'); }),
        h('button', {
          type: 'button', onClick: onPrimary,
          className: cx('flex-1 h-9 rounded-full text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors',
            isConnected ? 'bg-accent text-gold-dark' : 'gold-gradient text-white'),
        }, h(Icon, { name: primaryIcon, size: 12 }), primaryLabel)));
  }

  function KingdomDiscoveryPage() {
    const { events, places, contributors, go } = window.useApp();
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
          h('button', { onClick: () => go('home'), className: 'w-12 h-12 glass rounded-2xl shadow-xl border border-white/60 flex items-center justify-center shrink-0' },
            h(Icon, { name: 'Map', size: 16, className: 'text-foreground/60' }))),
        h('div', { className: 'flex items-center gap-1.5 overflow-x-auto scrollbar-none' },
          TYPES.map((t) => h('button', {
            key: t.id, onClick: () => setType(t.id),
            className: cx('px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm shrink-0 transition-all',
              type === t.id ? 'bg-foreground text-background' : 'glass text-foreground/60 border border-white/60'),
          }, t.label)))),
      h('div', { className: 'flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 content-start pb-24 md:pb-3' },
        items.length
          ? items.map((item) => h(DiscoveryCard, { key: item.type + '-' + item.id, item, myLoc }))
          : h('div', { className: 'col-span-full' }, h(Empty, { icon: 'SearchX', title: 'Nothing here yet', sub: q ? 'Try a different search term.' : 'Nothing matches this filter yet.' }))));
  }

  window.KingdomDiscoveryPage = KingdomDiscoveryPage;
})();
