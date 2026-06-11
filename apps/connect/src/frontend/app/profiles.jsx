// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Event / Place / Contributor profiles
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
  const { cx, Avatar, SmartImage, Button, Empty } = window.UI;
  const catOf = (x) => window.DATA.getCategory(x && x.category);
  const Icon = window.Icon;
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ── Anonymous broadcast reactions (🙏❤️🎉🙌🔥) ──
  //  Counts are aggregate-only (no identity stored — migration 128). Reads the
  //  event's latest broadcast (public) + its reaction counts; taps write
  //  through the rate-limited react API for signed-in users.
  const REACT_EMOJI = ['🙏', '❤️', '🎉', '🙌', '🔥'];
  function BroadcastReactions({ eventId }) {
    const { realUser, toast } = window.useApp();
    const [bc, setBc] = useState(null);
    const [counts, setCounts] = useState({});
    const [tapped, setTapped] = useState({});
    useEffect(() => {
      let active = true;
      (async () => {
        try {
          const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
          const res = await fetch(base + '/api/contributor/x/broadcasts?entity_type=event&entity_id=' + eventId);
          if (!res.ok) return;
          const json = await res.json();
          const b = (json.broadcasts || [])[0];
          if (!active || !b) return;
          setBc(b);
          const sb = window.CC_SUPABASE;
          if (sb) {
            const { data } = await sb.from('broadcast_reactions').select('emoji, count').eq('broadcast_id', b.id);
            if (active && Array.isArray(data)) setCounts(Object.fromEntries(data.map((r) => [r.emoji, r.count])));
          }
        } catch (e) { /* reactions are optional */ }
      })();
      return () => { active = false; };
    }, [eventId]);
    if (!bc) return null;
    const react = (emoji) => {
      if (!realUser) { toast('Sign in with Google to react.', 'gold'); return; }
      if (tapped[emoji]) return; // one optimistic tap per emoji per visit
      setTapped((t) => ({ ...t, [emoji]: true }));
      setCounts((c) => ({ ...c, [emoji]: (c[emoji] || 0) + 1 }));
      (async () => {
        try {
          const res = await window.authedFetch('/api/broadcasts/' + bc.id + '/react', { method: 'POST', body: JSON.stringify({ emoji }) });
          if (!res.ok) throw new Error('react');
        } catch (e) {
          setCounts((c) => ({ ...c, [emoji]: Math.max(0, (c[emoji] || 1) - 1) }));
          setTapped((t) => ({ ...t, [emoji]: false }));
        }
      })();
    };
    return h('div', { className: 'mx-4 mt-2 flex items-center gap-1.5 flex-wrap' },
      REACT_EMOJI.map((e) => h('button', {
        key: e, onClick: () => react(e),
        className: cx('flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all',
          tapped[e] ? 'border-gold/60 bg-accent/70 text-gold-dark' : 'border-border bg-card hover:border-gold/40 text-foreground'),
      }, e, (counts[e] || 0) > 0 && h('span', null, counts[e]))));
  }

  function Scroll({ children }) {
    return h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-10 bg-background' }, children);
  }
  function BackBar({ label, onBack, floating }) {
    return floating
      ? h('button', { onClick: onBack, className: 'absolute top-3 left-3 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center' }, h(Icon, { name: 'ArrowLeft', size: 18 }))
      : h('div', { className: 'px-4 py-3 border-b border-border glass-strong flex items-center gap-3 sticky top-0 z-20' },
          h('button', { onClick: onBack, className: 'w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center' }, h(Icon, { name: 'ArrowLeft', size: 17 })),
          h('p', { className: 'text-sm font-bold text-foreground' }, label));
  }
  const InfoRow = ({ icon, label, value }) => h('div', { className: 'flex items-start gap-3 py-2' },
    h('div', { className: 'w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0' }, h(Icon, { name: icon, size: 14, className: 'text-gold-dark' })),
    h('div', { className: 'min-w-0' }, h('p', { className: 'text-[10px] font-bold uppercase tracking-wide text-muted-foreground' }, label), h('p', { className: 'text-sm text-foreground' }, value)));
  const Gallery = ({ imgs }) => imgs && imgs.length ? h('div', null,
    h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Gallery'),
    h('div', { className: 'grid grid-cols-3 gap-2' }, imgs.map((g, i) => h('div', { key: i, className: 'aspect-square rounded-xl overflow-hidden' }, h('img', { src: g, className: 'w-full h-full object-cover' }))))) : null;

  // ── Event ──
  function EventProfilePage({ id }) {
    const app = window.useApp();
    const { events, contributors, connected, considering, toggleConnect, toggleConsider, go, startConversationWith, toast } = app;
    const ev = events.find((e) => e.id === id);
    if (!ev) return h(Empty, { icon: 'CalendarX', title: 'Event not found' });
    const cat = window.DATA.getCategory(ev.category);
    // Organiser may not be an approved Contributor in the directory (real events
    // created by citizens/community). Resolve to the directory row when present,
    // else fall back to the event's own organiser name — never crash, never
    // misrepresent by linking to the wrong org.
    const org = contributors.find((c) => c.id === ev.organizerId) || null;
    const orgName = (org && org.name) || ev.organizerName || '';
    const isC = connected.has(id), isCo = considering.has(id);
    return h('div', { className: 'flex-1 flex flex-col min-h-0', 'data-screen': 'event' },
      h(Scroll, null,
        h('div', { className: 'relative h-56 sm:h-64' },
          h(SmartImage, { src: ev.coverPhoto, cat, label: 'Event', alt: ev.title, className: 'w-full h-full' }),
          h('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/20' }),
          h(BackBar, { onBack: () => go('home'), floating: true }),
          h('div', { className: 'absolute bottom-4 left-4 right-4' },
            h('div', { className: 'flex items-center gap-2 mb-2' },
              cat && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white', style: { background: cat.hex } }, h(Icon, { name: cat.icon, size: 10 }), cat.name),
              ev.isLive && h('span', { className: 'inline-flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full text-[10px] font-bold text-white' }, h('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }), 'LIVE'),
              ev.isMobile && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white', style: { background: cat.hex } }, h(Icon, { name: 'Route', size: 10 }), 'ROUTE')),
            h('h1', { className: 'text-white text-2xl leading-tight font-display drop-shadow' }, ev.title))),
        ev.broadcast && h('div', { className: 'mx-4 mt-4 p-3 rounded-2xl glass-strong border border-gold/30 flex items-start gap-2.5' },
          h('div', { className: 'w-8 h-8 rounded-xl gold-gradient flex items-center justify-center shrink-0' }, h(Icon, { name: 'Radio', size: 14, className: 'text-white' })),
          h('div', null, h('p', { className: 'text-[10px] font-bold uppercase tracking-wide text-gold-dark' }, 'Latest broadcast'), h('p', { className: 'text-sm text-foreground' }, ev.broadcast.message))),
        UUID_RE.test(id) && h(BroadcastReactions, { eventId: id }),
        h('div', { className: 'p-4 max-w-2xl mx-auto space-y-4' },
          // Organiser row: clickable when the org is a real directory profile;
          // a non-clickable identity row when we only have a name; omitted entirely
          // when the event carries no organiser at all.
          org ? h('button', { onClick: () => go('profile', { id: org.id }), className: 'w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:border-gold/40 transition-all' },
            h(Avatar, { src: org.profilePhoto, name: org.name, size: 40, rounded: 'xl' }),
            h('div', { className: 'flex-1 text-left min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground flex items-center gap-1' }, org.name, h(Icon, { name: 'BadgeCheck', size: 13, className: 'text-gold' })), h('p', { className: 'text-xs text-muted-foreground' }, (org.followerCount || 0).toLocaleString() + ' followers')),
            h(Icon, { name: 'ChevronRight', size: 16, className: 'text-muted-foreground' }))
            : orgName ? h('div', { className: 'w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border' },
              h('div', { className: 'w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0' }, h(Icon, { name: 'Users', size: 18, className: 'text-gold-dark' })),
              h('div', { className: 'flex-1 text-left min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground truncate' }, orgName), h('p', { className: 'text-xs text-muted-foreground' }, 'Organiser')))
            : null,
          h('div', { className: 'grid grid-cols-2 gap-2' },
            h(Button, { variant: isC ? 'success' : 'gold', icon: isC ? 'Check' : 'CalendarCheck', onClick: () => toggleConnect(id) }, isC ? 'Connected' : 'Connect'),
            h(Button, { variant: isCo ? 'soft' : 'outline', icon: 'Star', onClick: () => toggleConsider(id) }, isCo ? 'Considering' : 'Consider')),
          h('div', { className: 'flex items-center gap-4 text-xs text-muted-foreground' },
            h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Users', size: 12, className: 'text-gold' }), h('b', { className: 'text-foreground' }, ev.connectCount), 'connected'),
            h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Star', size: 12, className: 'text-gold' }), h('b', { className: 'text-foreground' }, ev.considerCount), 'considering')),
          h('div', { className: 'bg-card rounded-2xl border border-border p-4 divide-y divide-border/60' },
            h(InfoRow, { icon: 'Calendar', label: 'Date & time', value: fmt(ev.date) + ' · ' + ev.time + ' – ' + ev.endTime }),
            h(InfoRow, { icon: ev.isMobile ? 'Route' : 'MapPin', label: ev.isMobile ? 'Route' : 'Location', value: ev.location }),
            h(InfoRow, { icon: 'Navigation', label: 'Address', value: ev.address })),
          h('div', null, h('p', { className: 'text-sm font-bold text-foreground mb-1.5' }, 'About this event'), h('p', { className: 'text-sm text-muted-foreground leading-relaxed' }, ev.description)),
          ev.volunteeringEnabled && h('div', { className: 'p-4 rounded-2xl bg-gradient-to-br from-[#DCFCE7] to-[#bbf7d0]/40 border border-[#16A34A]/20' },
            h('div', { className: 'flex items-center gap-2 mb-1' }, h(Icon, { name: 'HandHeart', size: 16, className: 'text-[#16A34A]' }), h('p', { className: 'text-sm font-bold text-[#15803d]' }, 'Volunteers needed')),
            h('p', { className: 'text-xs text-[#15803d]/80 mb-3' }, 'This event is looking for people to serve. Put your hand up!'),
            h(Button, { variant: 'success', size: 'sm', icon: 'HandHeart', onClick: () => app.applyToVolunteer('event', id, org && org.slug) }, 'Apply to Volunteer')),
          h(Gallery, { imgs: ev.gallery }),
          ev.upcomingDates && ev.upcomingDates.length > 0 && h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Upcoming dates'),
            h('div', { className: 'flex flex-wrap gap-2' }, ev.upcomingDates.map((d, i) => h('span', { key: i, className: 'px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-semibold text-foreground' }, new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))))),
          h('div', { className: 'grid grid-cols-3 gap-2' },
            h(Button, { variant: 'outline', size: 'sm', icon: 'MessageCircle', onClick: () => startConversationWith(orgName || 'Organiser', org ? org.profilePhoto : '', true, (org && org.id) || ev.organizerId) }, 'Message'),
            h(Button, { variant: 'outline', size: 'sm', icon: 'Globe', onClick: () => toast('Opening ' + ev.website) }, 'Website'),
            h(Button, { variant: 'outline', size: 'sm', icon: 'Share2', onClick: () => toast('Share link copied', 'gold') }, 'Share')))));
  }

  // ── Place ──
  function PlaceProfilePage({ id }) {
    const app = window.useApp();
    const { places, events, contributors, followedPlaces, togglePlaceFollow, go, startConversationWith, toast } = app;
    const pl = places.find((p) => p.id === id);
    if (!pl) return h(Empty, { icon: 'MapPinOff', title: 'Place not found' });
    const isFollowingPlace = followedPlaces.has(id);
    const cat = window.DATA.getCategory(pl.category);
    const org = contributors.find((c) => c.id === pl.organizerId) || null;
    const orgName = (org && org.name) || pl.organizerName || '';
    const assoc = events.filter((e) => (pl.associatedEventIds || []).includes(e.id));
    return h('div', { className: 'flex-1 flex flex-col min-h-0', 'data-screen': 'place' },
      h(Scroll, null,
        h('div', { className: 'relative h-52 sm:h-60' },
          h(SmartImage, { src: pl.coverPhoto, cat, label: 'Place', alt: pl.name, className: 'w-full h-full' }),
          h('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/75 to-black/10' }),
          h(BackBar, { onBack: () => go('home'), floating: true }),
          h('div', { className: 'absolute bottom-4 left-4 right-4' },
            cat && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white mb-2', style: { background: cat.hex } }, h(Icon, { name: cat.icon, size: 10 }), cat.name),
            h('h1', { className: 'text-white text-2xl font-display drop-shadow' }, pl.name))),
        h('div', { className: 'p-4 max-w-2xl mx-auto space-y-4' },
          h('div', { className: 'flex gap-2' },
            h(Button, { variant: isFollowingPlace ? 'soft' : 'gold', className: 'flex-1', icon: 'Heart', onClick: () => togglePlaceFollow(id, pl.name) }, isFollowingPlace ? 'Following' : 'Follow'),
            h(Button, { variant: 'outline', icon: 'MessageCircle', onClick: () => startConversationWith(orgName || 'Organiser', org ? org.profilePhoto : '', true, (org && org.id) || pl.organizerId) }, 'Message'),
            h(Button, { variant: 'outline', icon: 'Share2', onClick: () => toast('Share link copied', 'gold') })),
          h('p', { className: 'text-xs text-muted-foreground' }, (pl.followerCount || 0).toLocaleString() + ' followers' + (orgName ? ' · by ' + orgName : '')),
          h('div', { className: 'bg-card rounded-2xl border border-border p-4 divide-y divide-border/60' },
            h(InfoRow, { icon: 'MapPin', label: 'Address', value: pl.address }),
            h(InfoRow, { icon: 'Clock', label: 'Opening hours', value: pl.openHours || 'Not specified' })),
          h('div', null, h('p', { className: 'text-sm font-bold text-foreground mb-1.5' }, 'About'), h('p', { className: 'text-sm text-muted-foreground leading-relaxed' }, pl.description)),
          pl.volunteeringEnabled && h(Button, { variant: 'success', className: 'w-full', icon: 'HandHeart', onClick: () => app.applyToVolunteer('place', id, org && org.slug) }, 'Apply to Volunteer Here'),
          assoc.length > 0 && h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Events here'),
            h('div', { className: 'space-y-2' }, assoc.map((e) => h('button', { key: e.id, onClick: () => go('event', { id: e.id }), className: 'w-full flex items-center gap-3 p-2.5 bg-card rounded-2xl border border-border hover:border-gold/40 text-left' },
              h(Avatar, { src: e.coverPhoto, name: e.title, size: 48, rounded: 'xl' }),
              h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground truncate' }, e.title), h('p', { className: 'text-xs text-muted-foreground' }, new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + e.time)),
              h(Icon, { name: 'ChevronRight', size: 15, className: 'text-muted-foreground' }))))),
          h(Gallery, { imgs: pl.gallery }))));
  }

  // ── Citizen (own profile) ──
  function CitizenProfilePage() {
    const app = window.useApp();
    const { user, events, connected, considering, go } = app;
    const connectedEvents = events.filter((e) => connected.has(e.id)).slice(0, 6);
    const consideringEvents = events.filter((e) => considering.has(e.id)).slice(0, 4);
    return h('div', { className: 'flex-1 flex flex-col min-h-0', 'data-screen': 'profile' },
      h(Scroll, null,
        h('div', { className: 'relative h-44 sm:h-52' },
          h(SmartImage, { src: user.coverPhoto, alt: '', className: 'w-full h-full' }),
          h('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/60 to-transparent' }),
          h(BackBar, { onBack: () => go('home'), floating: true })),
        h('div', { className: 'px-4 max-w-2xl mx-auto -mt-12 relative space-y-4' },
          h(Avatar, { src: user.profilePhoto, name: user.name, size: 84, rounded: 'xl', ring: '#F7F4EE' }),
          h('div', null,
            h('h1', { className: 'text-xl text-foreground font-display' }, user.name),
            h('span', { className: 'text-xs font-semibold text-muted-foreground' }, 'Citizen')),
          user.bio && h('p', { className: 'text-sm text-muted-foreground leading-relaxed' }, user.bio),
          connectedEvents.length > 0 && h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Attending (' + connectedEvents.length + ')'),
            h('div', { className: 'grid grid-cols-2 gap-2' }, connectedEvents.map((e) =>
              h('button', { key: e.id, onClick: () => go('event', { id: e.id }), className: 'rounded-2xl overflow-hidden border border-border bg-card text-left' },
                h('div', { className: 'relative h-20' },
                  h(SmartImage, { src: e.coverPhoto, cat: catOf(e), alt: e.title, className: 'w-full h-full' }),
                  e.isLive && h('span', { className: 'absolute top-1.5 left-1.5 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full' }, 'LIVE')),
                h('div', { className: 'p-2' },
                  h('p', { className: 'text-xs font-bold text-foreground truncate' }, e.title),
                  h('p', { className: 'text-[10px] text-muted-foreground' }, e.date ? new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')))))),
          consideringEvents.length > 0 && h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Considering (' + consideringEvents.length + ')'),
            h('div', { className: 'space-y-2' }, consideringEvents.map((e) =>
              h('button', { key: e.id, onClick: () => go('event', { id: e.id }), className: 'w-full flex items-center gap-3 p-2.5 bg-card rounded-2xl border border-border text-left' },
                h(Avatar, { src: e.coverPhoto, name: e.title, size: 40, rounded: 'xl' }),
                h('div', { className: 'flex-1 min-w-0' },
                  h('p', { className: 'text-sm font-bold text-foreground truncate' }, e.title),
                  h('p', { className: 'text-xs text-muted-foreground' }, e.date ? new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')),
                h(Icon, { name: 'ChevronRight', size: 15, className: 'text-muted-foreground' }))))))));
  }

  // ── Contributor ──
  function ContributorProfilePage({ id }) {
    const app = window.useApp();
    const { contributors, events, places, followedOrgs, toggleFollow, go, startConversationWith, toast, user } = app;
    // Honest not-found rather than silently showing the first (wrong) org —
    // misrepresenting identity would violate the vision's integrity.
    const c = contributors.find((x) => x.id === id);
    if (!c) return h(Empty, { icon: 'UserX', title: 'Contributor not found' });
    const isFollowing = followedOrgs.has(id);
    const cat = window.DATA.getCategory(c.category);
    const cEvents = events.filter((e) => e.organizerId === c.id);
    const cPlaces = places.filter((p) => p.organizerId === c.id);
    const collabs = (c.collaborators || []).map((cid) => contributors.find((x) => x.id === cid)).filter(Boolean);
    const TIER_PCT = { Shepherd: 33, Beacon: 66, Pillar: 100 }[c.involvementLevel] || 33;
    return h('div', { className: 'flex-1 flex flex-col min-h-0', 'data-screen': 'profile' },
      h(Scroll, null,
        h('div', { className: 'relative h-44 sm:h-52' },
          h(SmartImage, { src: c.coverPhoto, cat, alt: c.name, className: 'w-full h-full' }),
          h('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/60 to-transparent' }),
          h(BackBar, { onBack: () => go('home'), floating: true })),
        h('div', { className: 'px-4 max-w-2xl mx-auto -mt-12 relative' },
          h(Avatar, { src: c.profilePhoto, name: c.name, size: 84, rounded: 'xl', ring: '#F7F4EE' }),
          h('div', { className: 'mt-3 mb-4' },
            h('div', { className: 'flex items-center gap-2 flex-wrap' },
              h('h1', { className: 'text-xl text-foreground font-display' }, c.name), h(Icon, { name: 'BadgeCheck', size: 16, className: 'text-gold' })),
            h('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
              cat && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap', style: { background: cat.hex + '1c', color: cat.hex } }, h(Icon, { name: cat.icon, size: 9 }), cat.name),
              h('span', { className: 'text-xs text-muted-foreground whitespace-nowrap' }, c.followerCount.toLocaleString() + ' followers'))),
          h('div', { className: 'flex gap-2 mb-4' },
            h(Button, { variant: isFollowing ? 'soft' : 'gold', className: 'flex-1', icon: 'Heart', onClick: () => toggleFollow(id, c.name) }, isFollowing ? 'Following' : 'Follow'),
            h(Button, { variant: 'outline', className: 'flex-1', icon: 'MessageCircle', onClick: () => startConversationWith(c.name, c.profilePhoto, true, c.id) }, 'Message'),
            h(Button, { variant: 'outline', icon: 'Share2', onClick: () => toast('Profile link copied', 'gold') })),
          h('div', { className: 'space-y-4' },
            h('p', { className: 'text-sm text-muted-foreground leading-relaxed' }, c.bio),
            // involvement tier
            h('div', { className: 'bg-card rounded-2xl border border-border p-4' },
              h('div', { className: 'flex items-center justify-between mb-2' },
                h('div', { className: 'flex items-center gap-2' }, h(Icon, { name: 'Crown', size: 15, className: 'text-gold' }), h('p', { className: 'text-sm font-bold text-foreground' }, 'Involvement: ' + c.involvementLevel)),
                h('span', { className: 'text-xs text-muted-foreground' }, c.dominantNiche)),
              h('div', { className: 'h-2 rounded-full bg-muted overflow-hidden mb-1.5' }, h('div', { className: 'h-full gold-gradient rounded-full', style: { width: TIER_PCT + '%' } })),
              h('div', { className: 'flex justify-between text-[10px] font-semibold text-muted-foreground' }, ['Shepherd', 'Beacon', 'Pillar'].map((t) => h('span', { key: t, className: t === c.involvementLevel ? 'text-gold-dark' : '' }, t)))),
            h('div', { className: 'bg-card rounded-2xl border border-border p-4 divide-y divide-border/60' },
              c.website && h(InfoRow, { icon: 'Globe', label: 'Website', value: c.website }),
              c.contactEmail && h(InfoRow, { icon: 'Mail', label: 'Email', value: c.contactEmail }),
              c.location && h(InfoRow, { icon: 'MapPin', label: 'Location', value: c.location })),
            c.socials && Object.keys(c.socials).length > 0 && h('div', { className: 'flex gap-2' },
              Object.entries(c.socials).map(([k, v]) => h('span', { key: k, className: 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-semibold text-foreground' },
                h(Icon, { name: k === 'instagram' ? 'Instagram' : k === 'youtube' ? 'Youtube' : k === 'facebook' ? 'Facebook' : 'Music2', size: 13, className: 'text-gold-dark' }), v))),
            cEvents.length > 0 && h('div', null,
              h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Events (' + cEvents.length + ')'),
              h('div', { className: 'grid grid-cols-2 gap-2' }, cEvents.map((e) => h('button', { key: e.id, onClick: () => go('event', { id: e.id }), className: 'rounded-2xl overflow-hidden border border-border bg-card text-left' },
                h('div', { className: 'relative h-20' }, h(SmartImage, { src: e.coverPhoto, cat: catOf(e), alt: e.title, className: 'w-full h-full' }), e.isLive && h('span', { className: 'absolute top-1.5 left-1.5 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full' }, 'LIVE')),
                h('div', { className: 'p-2' }, h('p', { className: 'text-xs font-bold text-foreground truncate' }, e.title), h('p', { className: 'text-[10px] text-muted-foreground' }, new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))))))),
            cPlaces.length > 0 && h('div', null,
              h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Places'),
              h('div', { className: 'space-y-2' }, cPlaces.map((p) => h('button', { key: p.id, onClick: () => go('place', { id: p.id }), className: 'w-full flex items-center gap-3 p-2.5 bg-card rounded-2xl border border-border text-left' },
                h(Avatar, { src: p.coverPhoto, name: p.name, size: 44, rounded: 'xl' }), h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground truncate' }, p.name), h('p', { className: 'text-xs text-muted-foreground truncate' }, p.address)), h(Icon, { name: 'ChevronRight', size: 15, className: 'text-muted-foreground' }))))),
            c.members && c.members.length > 0 && h('div', null,
              h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Team'),
              h('div', { className: 'flex flex-wrap gap-1.5' }, c.members.map((m, i) => h('span', { key: i, className: 'px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold text-foreground' }, m)))),
            collabs.length > 0 && h('div', null,
              h('p', { className: 'text-sm font-bold text-foreground mb-2' }, 'Collaborates with'),
              h('div', { className: 'flex gap-2' }, collabs.map((cc) => h('button', { key: cc.id, onClick: () => go('profile', { id: cc.id }), className: 'flex items-center gap-2 p-2 pr-3 bg-card rounded-full border border-border' },
                h(Avatar, { src: cc.profilePhoto, name: cc.name, size: 28, rounded: 'full' }), h('span', { className: 'text-xs font-semibold text-foreground' }, cc.name)))))))));
  }

  window.EventProfilePage = EventProfilePage;
  window.PlaceProfilePage = PlaceProfilePage;
  window.ContributorProfilePage = ContributorProfilePage;
  window.CitizenProfilePage = CitizenProfilePage;
})();
