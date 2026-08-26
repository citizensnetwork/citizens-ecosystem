// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — EntityCard: ONE card for a listing, everywhere
//  ------------------------------------------------------------------
//  A Place or an Event used to look like two different things depending on
//  where you found it: the map's pin preview was one design, the Kingdom
//  Exploration list was another, and the two carried DIFFERENT information —
//  the list had distance-from-me but no organiser name and no website; the
//  preview had an organiser row but no distance; NEITHER showed a single
//  social handle. Founder call: "I don't think different cards should be
//  viewed when accessed either from the map, or the Kingdom Exploration area."
//
//  So there is now one component with one anatomy, rendered at two densities:
//
//    band → title → description → meta → stats → organiser → socials → actions
//
//    layout='grid'   compact tile        (Kingdom Exploration list)
//    layout='panel'  full-width sheet    (map pin preview)
//
//  Everything else — the data shown, the order it appears in, the action set,
//  the category-accent palette — is identical by construction. Adding a field
//  here adds it to both surfaces at once; that is the entire point of the file.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { cx, safeUrl, Avatar, SmartImage, SocialLinks } = window.UI;
  const Icon = window.Icon;

  // Most Contributors haven't picked a category yet, but nearly all carry a
  // kind — so an uncategorised listing still says what kind of organisation
  // this is instead of showing an empty band.
  // Null-prototype: keyed by a database value, so an unexpected key must miss
  // rather than resolve to something off Object.prototype.
  const KINDS = Object.assign(Object.create(null), {
    ministry: { label: 'Ministry', icon: 'Church' },
    organization: { label: 'Organisation', icon: 'Building2' },
    business: { label: 'Business', icon: 'Store' },
  });
  const TYPE_ICON = Object.assign(Object.create(null),
    { event: 'CalendarDays', place: 'Landmark', contributor: 'Building2' });

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

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
  const fmtDistance = (km) => (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km');

  // page → nav target. Contributors route to 'profile'; events/places route to
  // their own page key. One mapping, so a card and a map pin can never open
  // different screens for the same listing.
  const navTarget = (type) => (type === 'contributor' ? 'profile' : type);

  function EntityCard({ item, layout = 'grid', myLoc, onClose }) {
    const app = window.useApp();
    const {
      go, contributors, connected, considering, followedPlaces, followedOrgs,
      toggleConnect, toggleConsider, togglePlaceFollow, toggleFollow,
      startConversationWith, toast,
    } = app;

    const isPanel = layout === 'panel';
    const isEvent = item.type === 'event';
    const isPlace = item.type === 'place';
    const isContributor = item.type === 'contributor';

    const cat = window.DATA.getCategory(item.category);
    const hex = cat ? cat.hex : '#C9A84C';
    // Category-adaptive palette. `color-mix` keeps every derived tone in the
    // listing's own colour instead of hard-coding a second palette per state.
    const mix = (a, p, b) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
    const grad = `linear-gradient(135deg, ${mix(hex, 68, '#ffffff')}, ${hex} 52%, ${mix(hex, 72, '#000000')})`;
    const ink = mix(hex, 72, '#1a1206');    // readable icon / text accent
    const soft = mix(hex, 13, 'transparent');
    const softInk = mix(hex, 70, '#000000');

    const title = item.title || item.name || '';
    const description = isContributor ? item.bio : item.description;
    // Events/places don't carry their own logo — show the organiser's, the
    // same identity the full profile pages already resolve.
    const org = !isContributor && item.organizerId
      ? contributors.find((c) => c.id === item.organizerId) || null
      : null;
    const orgName = isContributor ? item.name : ((org && org.name) || item.organizerName || '');
    // Whose badge this is. Deliberately NOT falling back to the listing's own
    // title: initials taken from an event name would read as an organisation
    // that doesn't exist.
    const logo = isContributor ? item.profilePhoto : ((org && org.profilePhoto) || '');
    const locationText = isEvent ? item.location : isPlace ? item.address
      : (item.noFixedLocation ? 'Online — no fixed location' : item.location);
    const dist = (myLoc && typeof item.lat === 'number' && typeof item.lng === 'number')
      ? fmtDistance(distanceKm(myLoc, item)) : '';
    const photo = item.coverPhoto || '';
    const kind = isContributor ? KINDS[item.kind] : null;
    const bandIcon = (cat && cat.icon) || (kind && kind.icon) || TYPE_ICON[item.type] || 'MapPin';
    // Every entity type now carries socials (migration 172 gave Places the
    // columns they never had) — so this row is unconditional, not a
    // Contributor-only extra.
    const socials = item.socials || null;
    const website = safeUrl(item.website);

    const saved = isEvent ? considering.has(item.id) : isPlace ? followedPlaces.has(item.id) : followedOrgs.has(item.id);
    const isConnected = isEvent && connected.has(item.id);
    const messageTarget = isContributor ? item : org;

    const open = () => go(navTarget(item.type), { id: item.id });
    const stop = (fn) => (e) => { if (e && e.stopPropagation) e.stopPropagation(); fn(); };
    const onSave = stop(() => {
      if (isEvent) toggleConsider(item.id);
      else if (isPlace) togglePlaceFollow(item.id, item.name);
      else toggleFollow(item.id, item.name);
    });
    const onMessage = stop(() => {
      if (!messageTarget) return;
      startConversationWith(messageTarget.name, messageTarget.profilePhoto, true, messageTarget.id);
    });

    // ── band ──────────────────────────────────────────────────────────
    // Almost nothing in the directory carries a cover photo yet, so the media
    // band ADAPTS instead of reserving space for an empty placeholder: a real
    // photo gets the full cover treatment, everything else a slim category
    // ribbon carrying a large low-contrast category glyph. A Contributor's
    // LOGO is deliberately not promoted into the cover slot — it already has
    // its own round badge, and a square logo stretched into a banner looks
    // like a mistake.
    const bandH = photo ? (isPanel ? 'h-40' : 'h-32 sm:h-36') : (isPanel ? 'h-20' : 'h-14');
    const band = h('div', {
      className: cx('relative shrink-0', bandH),
      style: photo ? undefined : { background: `linear-gradient(110deg, ${hex}2e, ${hex}10 62%, ${hex}24)` },
    },
      photo
        ? h(F, null,
            h(SmartImage, {
              src: photo, cat, label: isEvent ? 'Event' : isPlace ? 'Place' : 'Contributor',
              alt: title, className: 'w-full h-full',
            }),
            h('div', { className: 'absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent' }))
        : h(Icon, {
            name: bandIcon, size: isPanel ? 58 : 42,
            className: 'absolute right-2 -bottom-2 pointer-events-none',
            style: { color: hex, opacity: 0.18 },
          }),
      // category (or, for an uncategorised Contributor, its kind)
      cat
        ? h('span', {
            className: 'absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow',
            style: { background: hex },
          }, h(Icon, { name: cat.icon, size: 9 }), cat.short || cat.name)
        : kind && h('span', {
            className: 'absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm bg-white/85 text-gold-dark border border-gold/30',
          }, h(Icon, { name: kind.icon, size: 9 }), kind.label),
      h('div', { className: 'absolute top-2 right-2 flex items-center gap-1.5' },
        item.isLive && h('span', { className: 'inline-flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow' },
          h('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }), 'LIVE'),
        onClose && h('button', {
          onClick: stop(onClose), 'aria-label': 'Close',
          className: 'w-7 h-7 rounded-full bg-black/45 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 transition-colors',
        }, h(Icon, { name: 'X', size: 14 }))),
      // The organisation behind this listing — its logo when it has one, its
      // own initials when it doesn't, the category glyph when we don't know.
      h('div', { className: 'absolute -bottom-4 left-3 rounded-full ring-2 ring-white shadow-md overflow-hidden bg-white' },
        (logo || orgName)
          ? h(Avatar, { src: logo, name: orgName, size: isPanel ? 42 : 36, rounded: 'full' })
          : h('span', {
              className: 'flex items-center justify-center rounded-full',
              style: { width: isPanel ? 42 : 36, height: isPanel ? 42 : 36, background: hex + '24', color: hex },
              'aria-label': cat ? cat.name : (kind ? kind.label : 'Listing'),
            }, h(Icon, { name: bandIcon, size: isPanel ? 19 : 17 }))));

    // ── meta ──────────────────────────────────────────────────────────
    const metaItem = (key, icon, text) => h('span', { key, className: 'flex items-center gap-1 min-w-0 max-w-full' },
      h(Icon, { name: icon, size: 11, className: 'shrink-0', style: { color: ink } }),
      h('span', { className: 'truncate' }, text));
    const meta = [
      locationText && metaItem('loc', item.noFixedLocation ? 'Globe' : 'MapPin', locationText),
      isEvent && item.date && metaItem('date', 'Calendar', fmtDate(item.date) + (item.time ? ' · ' + item.time : '')),
      !isEvent && item.openHours && metaItem('hours', 'Clock', item.openHours),
      dist && metaItem('dist', 'Navigation', dist + ' away'),
    ].filter(Boolean);

    const stat = (icon, value, label) => h('span', { key: label, className: 'flex items-center gap-1' },
      h(Icon, { name: icon, size: 11, style: { color: hex } }),
      h('b', { className: 'text-foreground' }, value), label);
    const stats = isEvent
      ? [stat('Users', (item.connectCount || 0).toLocaleString(), ' connected'),
         stat('Star', (item.considerCount || 0).toLocaleString(), ' considering')]
      : [stat('Heart', (item.followerCount || 0).toLocaleString(), ' followers')];

    // ── organiser line ────────────────────────────────────────────────
    //  Tappable when the organiser is a real directory profile; a plain
    //  identity line when we only have a name; omitted entirely when the
    //  listing carries no organiser at all — never a broken nav.
    const organiser = (!isContributor && orgName) ? (() => {
      const inner = [
        h('span', { key: 'l', className: 'text-muted-foreground' }, 'by '),
        h('span', { key: 'n', className: 'font-bold text-foreground truncate' }, orgName),
        org && h(Icon, { key: 'v', name: 'BadgeCheck', size: 12, style: { color: ink }, className: 'shrink-0' }),
        org && h(Icon, { key: 'c', name: 'ChevronRight', size: 13, className: 'text-muted-foreground shrink-0 ml-auto' }),
      ].filter(Boolean);
      return org
        ? h('button', {
            type: 'button', onClick: stop(() => go('profile', { id: org.id })),
            className: 'w-full flex items-center gap-1 text-[11px] min-w-0 text-left hover:opacity-80 transition-opacity',
          }, inner)
        : h('div', { className: 'flex items-center gap-1 text-[11px] min-w-0' }, inner);
    })() : null;

    // ── actions ───────────────────────────────────────────────────────
    //  The SAME set, in the same order, on both layouts — only the sizing
    //  differs. A Place whose organiser isn't in the directory has nobody to
    //  message, so that control is absent rather than permanently disabled
    //  (the majority shape of the real directory).
    const primaryLabel = isEvent ? (isConnected ? 'Connected' : 'Connect')
      : saved ? 'Following' : 'Follow';
    const primaryIcon = isEvent ? (isConnected ? 'Check' : 'CalendarCheck') : 'Heart';
    const onPrimary = stop(() => { if (isEvent) toggleConnect(item.id); else onSave({}); });
    const saveLabel = isEvent
      ? (saved ? 'Remove from considering' : 'Consider')
      : (saved ? 'Unfollow' : 'Follow');

    const iconBtn = (icon, label, onClick, active) => h('button', {
      key: icon, type: 'button', onClick, 'aria-label': label, title: label,
      className: cx('rounded-full flex items-center justify-center shrink-0 border transition-colors',
        isPanel ? 'w-10 h-10' : 'w-8 h-8',
        active ? 'border-transparent' : 'border-border bg-white/60 text-muted-foreground hover:text-foreground hover:bg-accent/60'),
      style: active ? { background: hex + '1f', color: hex, borderColor: hex + '4d' } : undefined,
    }, h(Icon, { name: icon, size: isPanel ? 16 : 14 }));

    const secondaryBtns = [
      // Events get a distinct Consider (bookmark) alongside Connect; places and
      // contributors fold saving into the primary Follow button above.
      isEvent && iconBtn('Bookmark', saveLabel, onSave, saved),
      website && iconBtn('Globe', 'Website', stop(() => window.open(website, '_blank', 'noopener,noreferrer'))),
      messageTarget && iconBtn('MessageCircle', 'Message the organiser', onMessage),
      iconBtn('Share2', 'Share', stop(() => toast('Share link copied', 'gold'))),
    ].filter(Boolean);

    const actions = h('div', { className: cx('flex items-center gap-2', isPanel ? 'flex-wrap' : '') },
      h('button', {
        type: 'button', onClick: onPrimary,
        className: cx('flex-1 min-w-0 rounded-full font-bold flex items-center justify-center gap-1.5 px-3 transition-transform active:scale-[0.98]',
          isPanel ? 'h-11 text-[13px]' : 'h-8 text-[11px]',
          (isConnected || (!isEvent && saved)) ? 'bg-accent text-gold-dark' : 'text-white'),
        style: (isConnected || (!isEvent && saved)) ? undefined : { background: grad, boxShadow: `0 6px 16px ${mix(hex, 38, 'transparent')}` },
      }, h(Icon, { name: primaryIcon, size: isPanel ? 15 : 12, fill: (!isEvent && saved) ? 'currentColor' : 'none' }),
         h('span', { className: 'truncate' }, primaryLabel)),
      secondaryBtns);

    const viewBtn = h('button', {
      type: 'button', onClick: stop(open),
      className: cx('w-full rounded-full font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90',
        isPanel ? 'h-11 text-[13px]' : 'h-8 text-[11px]'),
      style: { background: soft, color: softInk },
    }, h(Icon, { name: 'Eye', size: isPanel ? 15 : 12 }), 'View Full Profile');

    // ── assembly ──────────────────────────────────────────────────────
    //  Band + title are one tap target on the grid tile (tapping a card opens
    //  it, as it always has). On the panel they stay a plain block: the cover
    //  there carries a close button, and a <button> inside a <button> is
    //  invalid markup that screen readers and keyboards both stumble over.
    const titleBlock = h('div', { className: cx('min-w-0', isPanel ? 'px-4 pt-6' : 'px-3 pt-6') },
      h('p', {
        className: cx('font-bold text-foreground leading-snug', isPanel ? 'text-lg line-clamp-2 font-display' : 'text-sm line-clamp-2'),
      }, title),
      description && h('p', {
        className: 'text-xs text-muted-foreground leading-snug mt-1 ' + (isPanel ? 'line-clamp-3' : 'line-clamp-2'),
      }, description));
    const head = isPanel
      ? h('div', null, band, titleBlock)
      : h('button', { type: 'button', onClick: stop(open), className: 'block w-full text-left' }, band, titleBlock);

    const body = h('div', { className: cx('flex flex-col mt-2', isPanel ? 'px-4 pb-4 gap-3' : 'px-3 pb-3 gap-2') },
      meta.length > 0 && h('div', { className: 'flex items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground flex-wrap' }, meta),
      h('div', { className: 'flex items-center gap-3 text-[11px] text-foreground/70' }, stats),
      organiser,
      socials && h(SocialLinks, { socials, variant: 'compact', accent: ink }),
      h('div', { className: cx('flex flex-col mt-auto', isPanel ? 'gap-2 pt-1' : 'gap-1.5 pt-0.5') }, actions, viewBtn));

    return h('div', {
      className: cx('bg-card overflow-hidden flex flex-col',
        isPanel ? 'rounded-t-3xl md:rounded-3xl' : 'rounded-2xl shadow-sm transition-shadow hover:shadow-md'),
      style: { border: '1.5px solid ' + hex + '55' },
      'data-entity-card': item.type,
    }, head, body);
  }

  window.EntityCard = EntityCard;
  window.EntityCardUtils = { distanceKm, fmtDistance, fmtDate, navTarget, KINDS, TYPE_ICON };
})();
