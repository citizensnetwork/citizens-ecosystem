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
  const { cx, safeUrl, Avatar, SmartImage, Empty } = window.UI;
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

  // Most Contributors haven't picked a category yet, but nearly all carry a
  // kind — so an uncategorised card still shows what kind of organisation
  // this is instead of an empty band.
  // Null-prototype: keyed by a database value, so an unexpected key must miss
  // rather than resolve to something off Object.prototype.
  const KINDS = Object.assign(Object.create(null), {
    ministry: { label: 'Ministry', icon: 'Church' },
    organization: { label: 'Organisation', icon: 'Building2' },
    business: { label: 'Business', icon: 'Store' },
  });
  const TYPE_ICON = Object.assign(Object.create(null),
    { event: 'CalendarDays', place: 'Landmark', contributor: 'Building2' });

  function DiscoveryCard({ item, myLoc }) {
    const {
      go, considering, followedPlaces, followedOrgs, connected, contributors,
      toggleConsider, togglePlaceFollow, toggleFollow, toggleConnect,
      startConversationWith, toast,
    } = window.useApp();
    const cat = window.DATA.getCategory(item.category);
    const hex = cat ? cat.hex : '#C9A84C';
    const isEvent = item.type === 'event';
    const isPlace = item.type === 'place';
    const isContributor = item.type === 'contributor';
    const title = item.title || item.name;
    const description = isContributor ? item.bio : item.description;
    // Events/places don't carry their own logo — show the organiser's, the
    // same identity EventProfilePage/PlaceProfilePage already resolve.
    const org = !isContributor && item.organizerId ? contributors.find((c) => c.id === item.organizerId) : null;
    const logo = isContributor ? item.profilePhoto : ((org && org.profilePhoto) || '');
    // Whose badge this is. Deliberately NOT falling back to the listing's own
    // title: initials taken from an event name would read as an organisation
    // that doesn't exist. With no resolvable organiser we show the category
    // glyph instead — "we don't know who's behind this yet" is the truth.
    const logoName = isContributor ? item.name : ((org && org.name) || item.organizerName || '');
    const locationText = isEvent ? item.location : isPlace ? item.address : (item.noFixedLocation ? 'Online' : item.location);
    const dist = (myLoc && typeof item.lat === 'number' && typeof item.lng === 'number')
      ? fmtDistance(distanceKm(myLoc, item)) : '';
    // Almost nothing in the directory carries a cover photo yet, so the media
    // band ADAPTS instead of reserving 140px for an empty placeholder on every
    // card: a real photo gets the full cover treatment, everything else gets a
    // slim category ribbon. Honest either way, and the list stays scannable.
    // A Contributor's LOGO is deliberately not promoted into the cover slot —
    // it already has its own round badge, and a square logo stretched into a
    // banner looks like a mistake.
    const photo = item.coverPhoto || '';
    const kind = isContributor ? KINDS[item.kind] : null;
    const bandIcon = (cat && cat.icon) || (kind && kind.icon) || TYPE_ICON[item.type];

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
    const website = isContributor ? safeUrl(item.website) : '';
    const isConnected = isEvent && connected.has(item.id);
    const primaryLabel = isEvent ? (isConnected ? 'Connected' : 'Connect') : 'Message';
    const primaryIcon = isEvent ? (isConnected ? 'Check' : 'CalendarCheck') : 'MessageCircle';
    const messageTarget = isContributor ? item : org;
    const openMessage = (e) => {
      e.stopPropagation();
      if (!messageTarget) return;
      startConversationWith(messageTarget.name, messageTarget.profilePhoto, true, messageTarget.id);
    };
    const onPrimary = (e) => {
      if (isEvent) { e.stopPropagation(); toggleConnect(item.id); return; }
      openMessage(e);
    };
    const open = () => go(navTarget(item.type), { id: item.id });

    const stat = (icon, value, label) => h('span', { key: label, className: 'flex items-center gap-1' },
      h(Icon, { name: icon, size: 11, style: { color: hex } }),
      h('b', { className: 'text-foreground' }, value), label);
    const statNode = isEvent
      ? h(F, null,
          stat('Users', (item.connectCount || 0).toLocaleString(), ' connected'),
          stat('Star', (item.considerCount || 0).toLocaleString(), ' considering'))
      : stat('Heart', (item.followerCount || 0).toLocaleString(), ' followers');

    const iconBtn = (icon, label, onClick, active) => h('button', {
      key: icon, type: 'button', onClick, 'aria-label': label, title: label,
      className: cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-colors',
        active ? 'border-transparent' : 'border-border bg-white/60 text-muted-foreground hover:text-foreground hover:bg-accent/60'),
      style: active ? { background: hex + '1f', color: hex, borderColor: hex + '4d' } : undefined,
    }, h(Icon, { name: icon, size: 14 }));

    const meta = [
      locationText && h('span', { key: 'loc', className: 'flex items-center gap-1 min-w-0 max-w-full' },
        h(Icon, { name: 'MapPin', size: 11, className: 'shrink-0', style: { color: hex } }),
        h('span', { className: 'truncate' }, locationText)),
      isEvent && item.date && h('span', { key: 'date', className: 'flex items-center gap-1 shrink-0' },
        h(Icon, { name: 'Calendar', size: 11, style: { color: hex } }), fmtDate(item.date)),
      dist && h('span', { key: 'dist', className: 'flex items-center gap-1 shrink-0' },
        h(Icon, { name: 'Navigation', size: 11, style: { color: hex } }), dist + ' away'),
    ].filter(Boolean);

    return h('div', {
      className: 'rounded-2xl bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md flex flex-col',
      style: { border: '1.5px solid ' + hex + '55' },
    },
      h('button', { type: 'button', onClick: open, className: 'block w-full text-left' },
        h('div', { className: cx('relative', photo ? 'h-32 sm:h-36' : 'h-14'), style: photo ? undefined : { background: 'linear-gradient(110deg, ' + hex + '2e, ' + hex + '10 62%, ' + hex + '24)' } },
          photo
            ? h(F, null,
                h(SmartImage, {
                  src: photo, cat, label: isEvent ? 'Event' : isPlace ? 'Place' : 'Contributor',
                  alt: title, className: 'w-full h-full',
                }),
                h('div', { className: 'absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent' }))
            // No cover photo: an oversized, low-contrast glyph turns the empty
            // band into a category (or kind) cue instead of dead space.
            : h(Icon, {
                name: bandIcon, size: 42,
                className: 'absolute right-2 -bottom-1.5 pointer-events-none',
                style: { color: hex, opacity: 0.18 },
              }),
          cat
            ? h('span', {
                className: 'absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow',
                style: { background: hex },
              }, h(Icon, { name: cat.icon, size: 9 }), cat.short || cat.name)
            : kind && h('span', {
                className: 'absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm bg-white/85 text-gold-dark border border-gold/30',
              }, h(Icon, { name: kind.icon, size: 9 }), kind.label),
          item.isLive && h('span', { className: 'absolute top-2 left-2 inline-flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full text-[9px] font-bold text-white' },
            h('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }), 'LIVE'),
          // The organisation behind this listing, bottom-left of the cover —
          // its logo when it has one, its own initials when it doesn't.
          h('div', { className: 'absolute bottom-2 left-2 rounded-full ring-2 ring-white shadow-md overflow-hidden bg-white' },
            (logo || logoName)
              ? h(Avatar, { src: logo, name: logoName, size: 36, rounded: 'full' })
              : h('span', {
                  className: 'w-9 h-9 flex items-center justify-center rounded-full',
                  style: { background: hex + '24', color: hex },
                  'aria-label': cat ? cat.name : (kind ? kind.label : 'Listing'),
                }, h(Icon, { name: bandIcon, size: 17 })))),
        h('div', { className: 'px-3 pt-2.5 pb-2' },
          h('p', { className: 'text-sm font-bold text-foreground leading-snug line-clamp-2' }, title),
          description && h('p', { className: 'text-xs text-muted-foreground line-clamp-2 mt-1 leading-snug' }, description),
          meta.length > 0 && h('div', { className: 'flex items-center gap-x-2.5 gap-y-1 mt-2 text-[11px] text-muted-foreground flex-wrap' }, meta),
          h('div', { className: 'flex items-center gap-3 mt-1 text-[11px] text-foreground/70' }, statNode))),
      h('div', { className: 'flex items-center gap-1.5 px-3 pb-3 pt-1 mt-auto' },
        iconBtn('Eye', 'View', (e) => { e.stopPropagation(); open(); }),
        iconBtn('Heart', isEvent ? (saved ? 'Remove from considering' : 'Consider') : (saved ? 'Unfollow' : 'Follow'), onHeart, saved),
        website && iconBtn('Globe', 'Website', (e) => { e.stopPropagation(); window.open(website, '_blank', 'noopener,noreferrer'); }),
        isEvent && messageTarget && iconBtn('MessageCircle', 'Message the organiser', openMessage),
        iconBtn('Share2', 'Share', (e) => { e.stopPropagation(); toast('Share link copied', 'gold'); }),
        h('button', {
          type: 'button', onClick: onPrimary, disabled: !isEvent && !messageTarget,
          className: cx('flex-1 min-w-0 h-8 rounded-full text-[11px] font-bold flex items-center justify-center gap-1.5 px-2 transition-colors',
            isConnected ? 'bg-accent text-gold-dark' : 'gold-gradient text-white',
            !isEvent && !messageTarget && 'opacity-40 cursor-not-allowed'),
        }, h(Icon, { name: primaryIcon, size: 12 }), h('span', { className: 'truncate' }, primaryLabel))));
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
              items.map((item) => h(DiscoveryCard, { key: item.type + '-' + item.id, item, myLoc })))
          : h(Empty, { icon: 'SearchX', title: 'Nothing here yet', sub: q ? 'Try a different search term.' : 'Nothing matches this filter yet.' })));
  }

  window.KingdomDiscoveryPage = KingdomDiscoveryPage;
})();
