// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 bottom sheet (tracker P1-06 to P1-11)
//  ------------------------------------------------------------------
//  ONE sheet for a Contributor, a Place and an Event (founder D9). All three have the same header and the same row
//  of action pills; a Contributor then has Events | News | Gallery, and a Place or an Event has its description and a
//  plain list of facts (ListingBody; founder 2026-10-30: no white box, no second Follow button).
//
//  Three snap states, all `transform: translateY` on a box that is always the
//  full height, so a drag animates nothing but transform:
//    peek  a header strip (avatar, name, category · open state, chevron, close); nothing below it is drawn
//    half  40 % of the viewport (dvh, founder 2026-10-30: a little lower, more map): header, ONE row of actions
//          (it scrolls sideways) and then the tab bar or the facts, at the same height for every listing
//    full  90 % minus the top safe area: the content scrolls, and only here
//  Opens at HALF (the reference's behaviour), drag is 1:1 with the pointer, and on
//  release snaps by velocity (>= 0.5 px/ms) else to the nearest state; a flick down
//  from peek, or a release past it, closes. A wide screen with a fine pointer
//  (>= 768 px and a mouse or trackpad) gets a 380 px side panel (no snap points);
//  a touch screen of ANY width keeps the swipe sheet (founder decision D16, R7).
//
//  SWIPES (R7, real touch): Chrome takes a swipe over for scrolling, and then ends the
//  pointer stream with pointercancel, unless touch-action says the page keeps it. The
//  rule is one CSS variable on the scroller and everything in it (assets/map-v2.css):
//    peek, half   none     the sheet owns every swipe, wherever it starts
//    full, content scrolled   pan-y    the content scrolls, the sheet never moves
//    full, content at the top pan-down an upward swipe (finger up) scrolls the content;
//                                      a downward swipe reaches us as pointer events and
//                                      moves the sheet (the scroll hand-off)
//  touch-action is read when a touch starts, so the scroller carries data-top while its
//  scrollTop is 0 and a scroll listener keeps that current.
//
//  EXPANDED (#210, `expanded`): opened from an Explore card, the sheet opens at FULL and has no half or peek: a
//  swipe down (a flick, or released past a quarter of its height) or X closes it back to the row, where the card
//  is still outlined and gets focus back. The header sits at the top of the content, so it scrolls with the items:
//  a 16:9 cover (a neutral tile with the category icon when there is none), the name, the category chip in its
//  GROUP colour and the distance (`view`, where the map was looking when the card was tapped, with the row's own
//  words, so the sheet says what the card said). A pin on the clean map still opens the half sheet described above.
//
//  TABS: Events, News, Gallery (founder's order, #210), then Today while a Moment is live; only tabs with content.
//  A sideways swipe on the tab block (touch or pen) moves one tab; a swipe that STARTS on a sideways row (News)
//  is the row's, wherever it goes, so the row scrolls. Taps and the arrow keys switch as before.
//
//  BACK (founder D6): one useBackGuard entry, registered by this component's
//  mount (right after the tap or key press that opened it). Back, Escape and the
//  close button all close it at once; moving between snap states never touches
//  history. Navigate first, then close (`go(...); onClose()`) so the guard's
//  entry is replaced instead of left behind (RESUME_HERE §3, Back and history).
//
//  Header facts (name, category, open state) come from data already in memory:
//  no request before the header shows. The Contributor's photos arrive from ONE
//  GET /api/v1/contributors/<slug> (cached for the session) behind a skeleton.
//  Styles: assets/map-v2.css (tokens only). Text: MapV2Strings.sheet.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const useBackGuard = window.useBackGuard || function () {};

    const FLICK = 0.5;          // px/ms: a release faster than this moves one state in its direction
  const DRAG_START_PX = 6;    // travel before a press becomes a drag (so taps and clicks are untouched)
  const DISMISS_PX = 40;      // released this far below the peek position = close
  // The side panel is for a wide screen with a fine pointer; any touch screen keeps the swipe sheet (D16).
  const WIDE_MQ = '(min-width: 768px) and (pointer: fine)';
  const RECENT_MAX = 10;      // past events listed under Recent
  const TOP_PX = 1;           // the content counts as "at the top" below this scrollTop (fractional offsets on dense screens)
  const COLLAPSE_AT = 0.25;   // expanded: released lower than this share of its height = back to the Explore row
  const SWIPE_PX = 48;        // a sideways swipe this long on the tab block moves one tab...
  const SWIPE_RATIO = 1.5;    // ...when it is this much more sideways than vertical
  const ROW_SEL = "[data-mv2='hrow'] [data-layout='row']";   // a sideways row: a swipe that starts on it is the row's

  const S = () => window.MapV2Strings.sheet;
  const T = () => window.MapV2Time;
  const navTarget = (type) => (type === 'contributor' ? 'profile' : type);
  const DETAIL = new Map();   // slug -> { gallery, covers, past, moments, followers }: the per-slug fetch, once per session

  // ── helpers ──────────────────────────────────────────────────────
  // Any CSS length (dvh, calc(), env(), var()) in px, resolved by the browser itself with a throwaway probe.
  function cssLen(expr) {
    const p = document.createElement('div');
    p.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:' + expr;
    document.body.appendChild(p);
    const v = p.offsetHeight;
    p.remove();
    return v;
  }
  function useWide() {
    const get = () => !!(window.matchMedia && window.matchMedia(WIDE_MQ).matches);
    const [wide, setWide] = useState(get);
    useEffect(() => {
      if (!window.matchMedia) return undefined;
      const mq = window.matchMedia(WIDE_MQ);
      const on = () => setWide(mq.matches);
      mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    }, []);
    return wide;
  }
  const directionsUrl = (it) => (typeof it.lat === 'number' && typeof it.lng === 'number')
    ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(it.lat + ',' + it.lng) : '';
  // A public contact address only becomes a mailto: link when it is one plain address (no spaces, no header tricks).
  const mailUrl = (addr) => (/^[^\s@<>"',;?&=]+@[^\s@<>"',;?&=]+\.[^\s@<>"',;?&=]+$/.test(String(addr || '')) ? 'mailto:' + encodeURI(addr) : '');
  const telUrl = (phone) => {
    const t = String(phone || '').replace(/[^\d+]/g, '');
    return t.replace(/\D/g, '').length >= 6 ? 'tel:' + t : '';
  };
  const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();

  // The Contributor's own photos beyond what the directory list carries.
  function useDetail(slug, enabled) {
    const [st, setSt] = useState(() => (enabled && slug && DETAIL.has(slug) ? { status: 'ok', data: DETAIL.get(slug) } : { status: enabled && slug ? 'loading' : 'idle' }));
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (!enabled || !slug) { setSt({ status: 'idle' }); return undefined; }
      if (DETAIL.has(slug)) { setSt({ status: 'ok', data: DETAIL.get(slug) }); return undefined; }
      let live = true;
      setSt((prev) => (prev.status === 'loading' ? prev : { status: 'loading' }));
      const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
      fetch(base + '/api/v1/contributors/' + encodeURIComponent(slug))
        .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then((j) => {
          const p = (j && j.data && j.data.profile) || {};
          const counts = (j && j.data && j.data.counts) || {};
          const data = {
            gallery: Array.isArray(p.gallery_urls) ? p.gallery_urls : [],
            covers: Array.isArray(p.cover_photo_urls) ? p.cover_photo_urls : [],
            past: Array.isArray(j.data.past_events) ? j.data.past_events : [],     // newest first, as the API sorts them
            moments: Array.isArray(j.data.moments) ? j.data.moments : [],          // P2-05: notes still live when the page was served
            followers: counts.followers == null || !Number.isFinite(Number(counts.followers)) ? null : Number(counts.followers),
          };
          DETAIL.set(slug, data);
          if (live) setSt({ status: 'ok', data });
        })
        .catch(() => { if (live) setSt({ status: 'error' }); });
      return () => { live = false; };
    }, [slug, enabled, attempt]);
    return [st, useCallback(() => setAttempt((a) => a + 1), [])];
  }

  // ── small pieces ─────────────────────────────────────────────────
  function Avatar({ src, name, hex, glyph, size }) {
    const [bad, setBad] = useState(false);
    useEffect(() => setBad(false), [src]);
    const P = window.MapV2Pins;
    const style = { '--pin-cat': hex, '--pin-glyph': P ? P.glyphColor(hex) : undefined };
    return h('span', { 'data-mv2': 'avatar', 'data-size': size, style, 'aria-hidden': 'true' },
      src && !bad
        ? h('img', { src, alt: '', decoding: 'async', onError: () => setBad(true), 'data-mv2': 'avatar-img' })
        : (initialsOf(name) || glyph));
  }

  // #210: the expanded sheet's 16:9 cover, in the card's own media box; a neutral tile with the category icon when
  // there is no picture or it fails to load (so every expanded sheet starts with the same shape).
  function Cover({ src, icon }) {
    const [bad, setBad] = useState(false);
    useEffect(() => setBad(false), [src]);
    const url = window.UI.safeUrl(src);
    const Icon = window.Icon;
    return url && !bad
      ? h('span', { 'data-mv2': 'card-media', 'data-cover': '' },
        h('img', { src: url, alt: '', decoding: 'async', onError: () => setBad(true), 'data-mv2': 'card-photo' }))
      : h('span', { 'data-mv2': 'card-media', 'data-cover': '', 'data-tile': '', 'aria-hidden': 'true' }, h(Icon, { name: icon, size: 40 }));
  }

  function Action({ icon, label, href, onClick, external, primary, on }) {
    const Icon = window.Icon;
    const kids = [h(Icon, { key: 'i', name: icon, size: 16, fill: on ? 'currentColor' : 'none' }), h('span', { key: 't' }, label)];
    const common = { 'data-mv2': 'action', 'data-primary': primary ? '' : undefined, 'data-on': on ? '' : undefined };
    return href
      ? h('a', Object.assign({ href, target: external ? '_blank' : undefined, rel: external ? 'noopener noreferrer' : undefined }, common), kids)
      : h('button', Object.assign({ type: 'button', onClick }, common), kids);
  }

  function Tabs({ tabs, active, onPick, loadingMore, label }) {
    const refs = useRef({});
    const onKey = (e) => {
      const i = tabs.findIndex((t) => t.id === active);
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      onPick(tabs[n].id);
      const el = refs.current[tabs[n].id];
      if (el) el.focus();
    };
    return h('div', { 'data-mv2': 'tabs', role: 'tablist', 'aria-label': label, onKeyDown: onKey },
      tabs.map((t) => h('button', {
        key: t.id, type: 'button', role: 'tab', id: 'mv2-tab-' + t.id, 'aria-selected': t.id === active, 'aria-controls': 'mv2-panel',
        tabIndex: t.id === active ? 0 : -1, 'data-mv2': 'tab', ref: (el) => { refs.current[t.id] = el; }, onClick: () => onPick(t.id),
      }, t.label)),
      // the photos may still be on their way: a placeholder chip, so the row never grows taller when they land
      loadingMore && h('span', { 'data-mv2': 'tab', 'data-skeleton': '', 'aria-hidden': 'true' }, ' '));
  }

  // ── a Place's or an Event's body ─────────────────────────────────
  //  (#210, founder 2026-10-30) A Place and an Event follow the Contributor's rules. Their description reads as a bio does
  //  (three lines, and not at half), their facts are a plain list, and what a person DOES with the listing (Follow, Connect,
  //  Save, Share ...) is the one action row above, in the same pills. No white box, no second Follow button. The organiser
  //  and the co-hosts are links to their own profiles; the socials, the counts and, for an upcoming event, the Convince
  //  note follow. `data-card` and `data-entity-card` keep the hooks the card had.
  function ListingBody({ item, type, org, go, onClose }) {
    const { realUser, myProfileMeta, user, toast, contributors } = window.useApp();
    const Str = S();
    const Icon = window.Icon;
    const U = window.EntityCardUtils || {};
    const isEvent = type === 'event';
    const facts = [];
    const where = isEvent ? item.location : item.address;
    if (where) facts.push({ key: 'loc', icon: 'MapPin', text: where });
    if (isEvent && item.date && U.fmtDate) facts.push({ key: 'date', icon: 'Calendar', text: U.fmtDate(item.date) + (item.time ? ' · ' + item.time : '') });
    if (!isEvent && item.openHours) facts.push({ key: 'hours', icon: 'Clock', text: item.openHours });
    if (isEvent) facts.push({ key: 'counts', icon: 'Users', text: Str.counts((item.connectCount || 0).toLocaleString(), (item.considerCount || 0).toLocaleString()) });
    const bucket = !isEvent && window.UI.followerBucket ? window.UI.followerBucket(item.followerCount) : '';
    if (bucket) facts.push({ key: 'fol', icon: 'Heart', text: Str.followers(bucket) });

    const orgName = (org && org.name) || item.organizerName || '';
    // to the organiser's own page: navigate first, then close, so the sheet's history entry is replaced (see BACK, above)
    const toProfile = (pid) => () => { go('profile', { id: pid }); onClose(); };
    const organiser = orgName
      ? h('li', { key: 'org', 'data-mv2': 'fact' },
        org
          ? h('button', { type: 'button', 'data-mv2': 'fact-link', onClick: toProfile(org.id) },
            h('span', null, Str.by + ' ', h('b', null, orgName)), h(Icon, { name: 'BadgeCheck', size: 16 }), h(Icon, { name: 'ChevronRight', size: 18 }))
          : h('span', { 'data-mv2': 'fact-line' }, h('span', null, Str.by + ' ', h('b', null, orgName))))
      : null;
    // P2-09: an event two Contributors run together names the others who ACCEPTED the invitation, each a link
    const coHosts = isEvent && Array.isArray(item.coHostIds) ? item.coHostIds.map((cid) => contributors.find((c) => c.id === cid)).filter(Boolean) : [];
    const coHostLine = coHosts.length
      ? h('li', { key: 'co', 'data-mv2': 'fact' },
        h('span', { 'data-cohosts': '', 'data-mv2': 'fact-line' }, Str.with + ' ',
          coHosts.map((c, i) => h(React.Fragment, { key: c.id },
            i > 0 ? ', ' : null,
            h('button', { type: 'button', 'data-cohost': c.id, 'data-mv2': 'fact-inline', onClick: toProfile(c.id) }, c.name)))))
      : null;
    // Convince (FEAT-04): the note under Consider and, when a mutual friend is considering, the Friends considering row.
    // Both need a signed-in person and a real, upcoming event.
    // (their text is drawn for a light surface, so they keep one under them in either look)
    const convince = isEvent && realUser && window.CCConvince && window.CCConvince.eligibleEvent(item)
      ? h('div', { 'data-mv2': 'convince' },
        h(window.ConsiderNote, { shared: !(myProfileMeta && myProfileMeta.notificationPrefs && myProfileMeta.notificationPrefs.share_considering === false), onOpenSettings: () => go('settings') }),
        h(window.FriendsConsidering, { sb: window.CC_SUPABASE, eventId: item.id, eventTitle: item.title, me: realUser.id, myName: realUser.nameIsFallback ? '' : (user && user.name) || '', authedFetch: window.authedFetch, toast }))
      : null;
    const socials = item.socials ? h('div', { 'data-mv2': 'socials' }, h(window.UI.SocialLinks, { socials: item.socials, variant: 'compact' })) : null;
    const rows = facts.map((f) => h('li', { key: f.key, 'data-mv2': 'fact' }, h(Icon, { name: f.icon, size: 16 }), h('span', { 'data-mv2': 'fact-line' }, f.text)));
    return h('div', { 'data-mv2': 'card', 'data-entity-card': type },
      item.description ? h('p', { 'data-mv2': 'bio' }, item.description) : null,
      (rows.length || organiser || coHostLine) ? h('ul', { 'data-mv2': 'facts', role: 'list' }, rows, organiser, coHostLine) : null,
      socials,
      convince);
  }

  // ── the sheet ────────────────────────────────────────────────────
  function MapV2Sheet({ id, type, onClose, onOccupy, nearby, onPick, expanded, view }) {
    const app = window.useApp();
    const { go, shareLink, contributors, events, places, newsPosts, followedOrgs, toggleFollow, savedContributors, savedPlaces, toggleSave, realUser } = app;
    // Place and Event actions (#210, founder 2026-10-30): the same pills as a Contributor's, so the sheet speaks one way
    const { followedPlaces, togglePlaceFollow, connected, toggleConnect, considering, toggleConsider, startConversationWith } = app;
    const Str = S();
    const wide = useWide();
    const root = useRef(null);
    const scroller = useRef(null);
    const tabbed = useRef(null);
    const title = useRef(null);
    const opensAt = expanded ? 'full' : 'half';
    const [snap, setSnap] = useState(opensAt);
    const [tab, setTab] = useState(null);
    const [enter, setEnter] = useState(null);       // 'next' | 'prev': the side a newly chosen tab's panel slides in from
    const [viewer, setViewer] = useState(null);     // { index, from }
    const [evSort, setEvSort] = useState(null);     // 'upcoming' | 'recent' | null (null = Upcoming when there is any, else Recent)
    const [qr, setQr] = useState(null);             // { from }: the QR code dialog (Contributor only)
    const [reading, setReading] = useState(null);   // { id, from }: the news reader (one post, one dialog)
    const [announce, setAnnounce] = useState(Str.snapMessage[opensAt]);
    const dragState = useRef(null);
    const swipeState = useRef(null);
    const justDragged = useRef(false);
    const lastPadding = useRef(null);
    const snapRef = useRef(snap);
    snapRef.current = snap;

    // ONE history entry for the whole life of the sheet, registered by this mount.
    useBackGuard(true, onClose);

    const isContributor = type === 'contributor';
    const item = type === 'event' ? events.find((e) => e.id === id)
      : type === 'place' ? places.find((p) => p.id === id)
      : contributors.find((c) => c.id === id);
    const now = Date.now();
    // Contributor content: events and news from memory, photos from the directory + one detail fetch.
    // (Hooks stay above the early return below, so their order never changes between renders.)
    const [detail, retry] = useDetail(isContributor && item ? item.slug : null, isContributor);
    // P2-09: an event this Contributor organised OR co-hosts (an accepted invitation) is on their page; "With X" names the others.
    const isHost = (e, id) => (window.CCCohosts ? window.CCCohosts.isHostOf(e, id) : e.organizerId === id);
    const hostLine = (e) => {
      const names = [e.organizerId].concat(e.coHostIds || []).filter((x, i, all) => x && x !== item.id && all.indexOf(x) === i)
        .map((cid) => { const c = contributors.find((y) => y.id === cid); return c ? c.name : ''; }).filter(Boolean);
      return names.length ? S().withHosts(names.join(', ')) : '';
    };
    const orgEvents = useMemo(() => (isContributor && item
      ? events.filter((e) => isHost(e, item.id) && !window.DATA.isPastEvent(e, now)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      : []), [events, item, isContributor]);
    // P2-07 Recent: what already happened, newest first. The ones the app has loaded are links; the API's own list
    // (the per-slug fetch that is already made for the photos) adds the rest as plain rows.
    const recentEvents = useMemo(() => {
      if (!isContributor || !item) return [];
      const byId = new Map();
      events.forEach((e) => { if (isHost(e, item.id) && window.DATA.isPastEvent(e, now)) byId.set(e.id, { id: e.id, title: e.title, when: e.startsAt, location: e.location, category: e.category, known: true, host: hostLine(e) }); });
      ((detail.data && detail.data.past) || []).forEach((r) => {
        if (r && r.id && r.title && !byId.has(r.id)) byId.set(r.id, { id: r.id, title: r.title, when: r.date, location: r.location, known: events.some((e) => e.id === r.id) });
      });
      return [...byId.values()].filter((e) => Number.isFinite(Date.parse(e.when))).sort((a, b) => Date.parse(b.when) - Date.parse(a.when)).slice(0, RECENT_MAX);
    }, [events, item, isContributor, detail.data, contributors]);
    const posts = useMemo(() => (isContributor && item
      ? newsPosts.filter((n) => n.contributorId === item.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))
      : []), [newsPosts, item, isContributor]);
    // The owner deleted the post while it was open (Dashboard writes straight into newsPosts).
    useEffect(() => {
      if (reading && !posts.some((p) => p.id === reading.id)) setReading(null);
    }, [reading, posts]);
    // P2-01 Nearby: the closest listings the map is drawing, nearest first. What is already on this sheet is left out:
    // the listing itself, a Contributor's own upcoming events (its Events tab), and an Event's organiser (its header).
    const near = useMemo(() => {
      const N = window.MapV2Nearby;
      if (!N || !item || !Array.isArray(nearby)) return [];
      const own = isContributor ? new Set(orgEvents.map((e) => e.id)) : null;
      return N.rank(item, nearby, {
        skip: (m) => (m.id === id && m.type === type)
          || (own && m.type === 'event' && own.has(m.id))
          || (type === 'event' && m.type === 'contributor' && m.id === item.organizerId),
      });
    }, [item, nearby, id, type, isContributor, orgEvents]);
    // P2-05 Moments: the short notes that are still live (a cached page can be a few minutes old, so the end time is
    // checked again here). Shown under "Today", with "Posted 3 h ago" and nothing else about time: no countdown, no ring.
    const moments = useMemo(
      () => (isContributor && detail.data && window.CCMoments ? window.CCMoments.live(detail.data.moments, Date.now()) : []),
      [detail.data, isContributor],
    );
    const images = useMemo(() => {
      if (!isContributor || !item) return [];
      const seen = new Set();
      const out = [];
      const add = (u, caption) => {
        const url = window.UI.safeUrl(typeof u === 'string' ? u : u && u.url);
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push({ url, caption: (typeof u === 'object' && u && u.caption) || caption || '' });
      };
      (item.coverPhotos || []).forEach((p) => add(p));
      if (detail.data) { detail.data.covers.forEach((p) => add(p)); detail.data.gallery.forEach((u) => add(u)); }
      (item.gallery || []).forEach((u) => add(u));
      return out;
    }, [item, detail.data, isContributor]);

    // #210: how far the listing is, from where the map was looking when its card was tapped, in the Explore row's words
    const distance = useMemo(() => {
      const N = window.MapV2Nearby;
      const from = view && (view.user || view.centre);
      if (!expanded || !N || !from || !item || typeof item.lat !== 'number' || typeof item.lng !== 'number') return '';
      const meters = N.metersBetween(from, item);
      const words = window.MapV2Strings.explore;
      return Number.isFinite(meters) ? N.distanceText(meters, view.user ? words : words.centre) : '';
    }, [expanded, view, item]);

    // A different pin: start again where this sheet opened, on the first tab, scrolled to the top (not on the first
    // mount: nothing to reset, and every state update here is another render on the way to the header).
    const lastId = useRef(id);
    useEffect(() => {
      if (lastId.current === id) return;
      lastId.current = id;
      setSnap(opensAt); setTab(null); setEnter(null); setViewer(null); setEvSort(null); setQr(null); setReading(null);
      if (scroller.current) scroller.current.scrollTop = 0;
    }, [id]);

    // The scroll hand-off (see the header): data-top is on the scroller while its content is at the top, so the
    // stylesheet can let a downward swipe through to us. Set by hand, not through React: a scroll event must not re-render.
    useEffect(() => {
      const sc = scroller.current;
      if (!sc) return undefined;
      const sync = () => { if (sc.scrollTop < TOP_PX) sc.setAttribute('data-top', ''); else sc.removeAttribute('data-top'); };
      sync();
      sc.addEventListener('scroll', sync, { passive: true });
      return () => sc.removeEventListener('scroll', sync);
    }, [item ? 1 : 0]);
    // Leaving full: the content cannot scroll any more, so show it from the top again.
    useEffect(() => {
      if (snap !== 'full' && scroller.current && scroller.current.scrollTop) scroller.current.scrollTop = 0;
    }, [snap]);

    // Focus moves into the sheet; it goes back to the pin, or the Explore card (#210), that opened it on close (keyboard users).
    const opener = useRef(null);
    useEffect(() => {
      const a = document.activeElement;
      if (a && a.getAttribute && (a.getAttribute('data-cc-id') || (a.closest && a.closest('[data-explore-id]')))) opener.current = a;
      return () => {
        const o = opener.current;
        if (o && o.isConnected) o.focus({ preventScroll: true });
      };
    }, []);
    useEffect(() => { if (title.current) title.current.focus({ preventScroll: true }); }, [id]);

    // A press that is still going when the sheet unmounts must not leave listeners on the document.
    useEffect(() => () => {
      const d = dragState.current; if (d && d.end) d.end();
      const s = swipeState.current; if (s && s.end) s.end();
    }, []);

    // Escape closes at once (an open photo viewer or news reader takes the key first: it listens in the capture phase).
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Tell the map how much of it the sheet covers, so the selected pin clears it (tracker E5). Not the expanded sheet
    // (#210): it covers the whole map, and the person's map and Explore panel must be exactly as they left them on close.
    useEffect(() => {
      if (!onOccupy || expanded) return undefined;
      let pad;
      if (wide) pad = { top: 0, right: 0, bottom: 0, left: cssLen('calc(var(--sheet-panel-w) + 2 * var(--space-3))') };
      else if (snap === 'peek') pad = { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-peek-h)') };
      else if (snap === 'half') pad = { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-half-h)') };
      else pad = lastPadding.current || { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-half-h)') }; // full covers the map: no re-centre
      lastPadding.current = pad;
      onOccupy(pad);
    }, [snap, wide, id]);
    useEffect(() => () => { if (onOccupy) onOccupy(null); }, []);

    const lastSnap = useRef(opensAt);
    useEffect(() => {
      if (lastSnap.current === snap) return;
      lastSnap.current = snap;
      setAnnounce(Str.snapMessage[snap]);
    }, [snap]);

    // ── drag ────────────────────────────────────────────────────────
    const metrics = () => {
      const fullH = root.current.offsetHeight;
      return { fullH, y: { full: 0, half: fullH - cssLen('var(--sheet-half-h)'), peek: fullH - cssLen('var(--sheet-peek-h)') } };
    };
    const currentY = () => {
      const m = new DOMMatrix(getComputedStyle(root.current).transform);
      return m.m42;
    };
    const finishDrag = (e) => {
      const d = dragState.current;
      dragState.current = null;
      if (!d) return;
      const el = root.current;
      if (!d.active) return;
      try { el.releasePointerCapture(d.id); } catch { /* already released */ }
      const m = d.m;
      const y = Math.max(0, Math.min(m.fullH, d.baseY + (e.clientY - d.startY)));
      // velocity over the last ~120 ms of movement (the release itself is the last sample)
      const last = { t: e.timeStamp, y: e.clientY };
      const first = d.samples.find((s) => last.t - s.t <= 120) || d.samples[0];
      const v = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const order = ['full', 'half', 'peek'];     // top to bottom
      const at = order.indexOf(d.from);
      let target;
      // expanded (#210): full is the only state, so down means back to the Explore row
      if (expanded) target = v >= FLICK || (v > -FLICK && y > m.fullH * COLLAPSE_AT) ? 'close' : 'full';
      else if (Math.abs(v) >= FLICK) {
        const next = at + (v > 0 ? 1 : -1);
        if (next > 2) target = 'close';
        else target = order[Math.max(0, next)];
      } else if (y > m.y.peek + DISMISS_PX) target = 'close';
      else target = order.reduce((best, s) => (Math.abs(m.y[s] - y) < Math.abs(m.y[best] - y) ? s : best), 'half');
      el.style.transition = '';
      el.style.transform = '';
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      if (target === 'close') onClose();
      else setSnap(target);
    };
    const onPointerDown = (e) => {
      if (wide || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const t = e.target;
      const inScroller = scroller.current && scroller.current.contains(t);
      // Inside the content at full the content owns the swipe, except for a finger on content that is at its top:
      // a downward move there is the hand-off that collapses the sheet (an upward one scrolls the content, and
      // the stylesheet keeps only that one for the browser). A mouse never hands off: its drag selects text.
      const handoff = !!inScroller && snapRef.current === 'full';
      if (handoff && (e.pointerType === 'mouse' || scroller.current.scrollTop >= TOP_PX)) return;
      // samples are the pointer's own y with its time, from the press on: a fast flick may reach us as one coalesced
      // move, and a speed needs two points in time
      // sideways: a press on the tab block (not on a sideways row) may become a tab swipe; it stops being a drag
      // the moment it moves further sideways than down
      const sideways = !!tabbed.current && tabbed.current.contains(t) && !(t.closest && t.closest(ROW_SEL));
      dragState.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, baseY: 0, active: false, handoff, sideways, from: snapRef.current, samples: [{ t: e.timeStamp, y: e.clientY }], m: null };
      // The pointer leaves the sheet the moment it moves up past its top edge, so the move / up / cancel
      // events are followed on the document for as long as this press lasts (not on the sheet itself, and
      // not with a pointer capture taken at press time: that would swallow the click on the buttons inside).
      const end = () => {
        document.removeEventListener('pointermove', onPointerMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onCancel, true);
      };
      const onUp = (ev) => { end(); finishDrag(ev); };
      const onCancel = () => { end(); onPointerCancel(); };
      dragState.current.end = end;
      document.addEventListener('pointermove', onPointerMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onCancel, true);
    };
    const onPointerMove = (e) => {
      const d = dragState.current;
      if (!d || d.id !== e.pointerId) return;
      if (!d.active) {
        const dy = e.clientY - d.startY;
        // an upward move on content at its top belongs to the content (the browser scrolls it): let this press go
        if (d.handoff && dy <= -DRAG_START_PX) { if (d.end) d.end(); dragState.current = null; return; }
        // a sideways move on the tab block belongs to the tab swipe (below)
        const dx = e.clientX - d.startX;
        if (d.sideways && Math.abs(dx) >= DRAG_START_PX && Math.abs(dx) > Math.abs(dy)) { if (d.end) d.end(); dragState.current = null; return; }
        if (Math.abs(dy) < DRAG_START_PX) return;
        d.active = true;
        d.m = metrics();
        d.baseY = currentY();
        // startY stays where the press began: the sheet follows the pointer 1:1 from the very first pixel
        const el = root.current;
        el.style.transition = 'none';
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      const y = Math.max(0, Math.min(d.m.fullH, d.baseY + (e.clientY - d.startY)));
      root.current.style.transform = 'translateY(' + y + 'px)';
      d.samples.push({ t: e.timeStamp, y: e.clientY });
      if (d.samples.length > 12) d.samples.shift();
    };
    const onPointerCancel = () => {
      const d = dragState.current;
      dragState.current = null;
      if (d && d.active && root.current) { root.current.style.transition = ''; root.current.style.transform = ''; }
    };
    const cycle = () => { if (justDragged.current) return; setSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'half')); };

    if (!item) return null;

    // ── what to show ────────────────────────────────────────────────
    const org = !isContributor && item.organizerId ? contributors.find((c) => c.id === item.organizerId) : null;
    const name = item.title || item.name || '';
    const cat = window.DATA.getItemCategory(Object.assign({}, item, { type }));
    const hex = cat ? cat.hex : '#C9A84C';
    const catLabel = cat ? cat.name : ((isContributor && window.MapV2Strings.pin.kind[item.kind]) || window.MapV2Strings.pin.type[type]);
    const avatarSrc = isContributor ? item.profilePhoto : org && org.profilePhoto;
    const avatarName = isContributor ? name : org && org.name;
    let state = null;     // { status, text } or null
    if (type === 'place') { const o = T().openState(item.openHours, now); state = o.status === 'unknown' ? null : o; }
    if (type === 'event') { const t = T().eventStartsIn(item.startsAt, now, item.endsAt); state = t ? { status: 'info', text: t } : null; }

    const dir = directionsUrl(item);
    const site = window.UI.safeUrl(item.website);
    const tel = type === 'place' ? telUrl(item.phone) : '';
    const email = isContributor ? mailUrl(item.contactEmail) : '';

    // #210: Events, News, Gallery in the founder's order; Today (a live Moment, which is rare and short-lived) follows
    // them, so it never moves the three named tabs
    const tabs = [];
    if (orgEvents.length || recentEvents.length) tabs.push({ id: 'events', label: Str.tabs.events });
    if (posts.length) tabs.push({ id: 'news', label: Str.tabs.news });
    if (images.length) tabs.push({ id: 'gallery', label: Str.tabs.gallery });
    if (moments.length) tabs.push({ id: 'today', label: Str.tabs.today });
    const loadingMore = isContributor && detail.status === 'loading';
    const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0] && tabs[0].id);
    const tabAt = (tid) => tabs.findIndex((t) => t.id === tid);
    // A different tab, while the bar is stuck: pull the block back to the top of the scroller before the new
    // panel renders (instant, so a shorter panel cannot leave you looking at what follows). The same tab leaves the scroll.
    const pickTab = (next) => {
      if (next === active) return;
      if (tabbed.current && scroller.current) {
        const d = tabbed.current.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top;
        if (d < 0) scroller.current.scrollTop += d;
      }
      setEnter(tabAt(next) > tabAt(active) ? 'next' : 'prev');
      setTab(next);
    };
    // A sideways swipe on the tab block moves one tab (no wrap). Touch and pen only: a mouse drag selects text.
    // Followed on the document, like the drag, so a finger that leaves the block still counts.
    const onSwipeDown = (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || tabs.length < 2) return;
      if (e.target.closest && e.target.closest(ROW_SEL)) return;
      const prev = swipeState.current;
      if (prev && prev.end) prev.end();
      const s = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const end = () => {
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', end, true);
        if (swipeState.current === s) swipeState.current = null;
      };
      const onUp = (ev) => {
        if (ev.pointerId !== s.id) return;
        end();
        const dx = ev.clientX - s.x;
        const dy = ev.clientY - s.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return;
        const next = tabs[tabAt(active) + (dx < 0 ? 1 : -1)];
        if (next) pickTab(next.id);
      };
      s.end = end;
      swipeState.current = s;
      document.addEventListener('pointerup', onUp, true);
      // a vertical swipe the browser takes over for scrolling ends here: never a tab change
      document.addEventListener('pointercancel', end, true);
    };

    // ── actions ─────────────────────────────────────────────────────
    // One row of the same pills for a Contributor, a Place and an Event (founder, 2026-10-30): Directions first, then the
    // one thing a person does with the listing (Follow, or Connect for an event), then Save (Consider for an event), Share,
    // and the listing's own links. The card's own gradient Follow button and its white box are gone.
    const actions = [];
    if (dir) actions.push(h(Action, { key: 'dir', icon: 'Navigation', label: Str.directions, href: dir, external: true, primary: true }));
    // P2-04: Follow, for a Contributor that is not you
    const following = isContributor && followedOrgs.has(item.id);
    if (isContributor && !(realUser && realUser.id === item.id)) {
      actions.push(h(Action, { key: 'follow', icon: 'Heart', label: following ? Str.following : Str.follow, on: following, onClick: () => toggleFollow(item.id, name) }));
    }
    // a Place is followed the way it always was (the card's Follow), an Event is Connected to
    if (type === 'place') {
      const on = followedPlaces.has(item.id);
      actions.push(h(Action, { key: 'follow', icon: 'Heart', label: on ? Str.following : Str.follow, on, onClick: () => togglePlaceFollow(item.id, name) }));
    }
    if (type === 'event') {
      const on = connected.has(item.id);
      actions.push(h(Action, { key: 'connect', icon: on ? 'Check' : 'CalendarCheck', label: on ? Str.connected : Str.connect, on, onClick: () => toggleConnect(item.id) }));
    }
    // P2-04: Save, a PRIVATE bookmark for a Contributor (not you) or a Place; an Event keeps its Consider bookmark. Never counted,
    // never shown to the listing: the only trace is the person's own list in Settings.
    const saveKind = isContributor ? 'contributor' : type === 'place' ? 'place' : null;
    if (saveKind && !(isContributor && realUser && realUser.id === item.id)) {
      const saved = (saveKind === 'place' ? savedPlaces : savedContributors).has(item.id);
      actions.push(h(Action, { key: 'save', icon: 'Bookmark', label: saved ? Str.saved : Str.save, on: saved, onClick: () => toggleSave(saveKind, item.id, name) }));
    }
    if (type === 'event') {
      const on = considering.has(item.id);
      actions.push(h(Action, { key: 'consider', icon: 'Bookmark', label: on ? Str.considering : Str.consider, on, onClick: () => toggleConsider(item.id) }));
    }
    actions.push(h(Action, { key: 'share', icon: 'Share2', label: Str.share, onClick: () => shareLink({ page: navTarget(type), params: { id } }) }));
    if (site) actions.push(h(Action, { key: 'web', icon: 'Globe', label: Str.website, href: site, external: true }));
    if (tel) actions.push(h(Action, { key: 'tel', icon: 'Phone', label: Str.call, href: tel }));
    if (email && !site) actions.push(h(Action, { key: 'mail', icon: 'Mail', label: Str.email, href: email }));
    // a Place or an Event can be written to through its organiser, when the organiser is a Contributor in the directory
    if (!isContributor && org) {
      actions.push(h(Action, { key: 'msg', icon: 'MessageCircle', label: Str.message, onClick: () => startConversationWith(org.name, org.profilePhoto, true, org.id) }));
    }
    // P2-06: the QR code is a tool for printing, not a first-glance action: it sits at the bottom of the content, so the
    // action row stays at the height it had and half still shows the header, the actions and the first tab
    // (only for a slug the router itself would resolve: nothing odd from the data ever reaches a printed code)
    const qrOk = isContributor && window.MapV2QR && window.CC_ROUTES && window.CC_ROUTES.isSlug(item.slug);
    const qrAction = qrOk
      ? h('div', { 'data-mv2': 'actions-end' }, h(Action, { icon: 'QrCode', label: Str.qr.action, onClick: (e) => setQr({ from: e.currentTarget }) }))
      : null;
    const reportOwner = isContributor ? item.id : item.organizerId;
    const reportType = isContributor ? 'user' : type;
    const reportAction = window.CCReport
      ? h(window.CCReport.Action, {
        key: id, variant: 'sheet', targetType: reportType, targetId: id, ownerId: reportOwner,
        strings: window.MapV2Strings.report,
      })
      : null;
    const openProfile = () => { go(navTarget(type), { id }); onClose(); };

    // ── body ────────────────────────────────────────────────────────
    let body;
    if (!isContributor) {
      body = h(ListingBody, { item, type, org, go, onClose });
    } else {
      const bio = item.bio ? h('p', { 'data-mv2': 'bio' }, item.bio) : null;
      let panel = null;
      if (active === 'events') {
        const mode = evSort || (orgEvents.length ? 'upcoming' : 'recent');
        const sortBar = h('div', { key: 'sort', 'data-mv2': 'sort', role: 'group', 'aria-label': Str.eventsSort.label },
          ['upcoming', 'recent'].map((m) => h('button', { key: m, type: 'button', 'data-mv2': 'sort-btn', 'aria-pressed': mode === m, onClick: () => setEvSort(m) }, Str.eventsSort[m])));
        const eventCard = (e, past) => {
          const when = e.startsAt || e.when;
          const timeLabel = past ? T().postedAgo(when, now) : T().eventStartsIn(e.startsAt, now, e.endsAt);
          const host = past ? e.host : hostLine(e);
          const meta = [];
          if (timeLabel) meta.push(timeLabel);
          if (e.location) meta.push(e.location);
          if (host) meta.push({ text: host, host: true });
          const known = !past || e.known === true;
          return h(window.MapV2Card, {
            variant: 'event',
            item: { type: 'event', category: e.category },
            kind: window.MapV2Strings.pin.type.event,
            title: e.title,
            meta: meta,
            date: T().dateParts(when),
            idPrefix: 'mv2-ev-' + e.id,
            onClick: known ? () => { go('event', { id: e.id }); onClose(); } : undefined,
          });
        };
        const list = mode === 'upcoming'
          ? (orgEvents.length ? h('ul', { key: 'list', 'data-mv2': 'list', role: 'list' }, orgEvents.map((e) => h('li', { key: e.id }, eventCard(e, false))))
            : h('p', { key: 'none', 'data-mv2': 'sort-none' }, Str.eventsSort.noneUpcoming))
          : (recentEvents.length ? h('ul', { key: 'list', 'data-mv2': 'list', role: 'list' }, recentEvents.map((e) => h('li', { key: e.id }, eventCard(e, true))))
            : h('p', { key: 'none', 'data-mv2': 'sort-none' }, Str.eventsSort.noneRecent));
        panel = [sortBar, list];
      } else if (active === 'news') {
        // The newest posts in one sideways row; "See all" opens the whole list in place (map-v2-row.jsx). Keyed by listing,
        // so a different Contributor starts again at the first card, collapsed.
        panel = h(window.MapV2Row.Row, {
          key: 'news:' + id,
          items: posts,
          idPrefix: 'mv2-news',
          strings: Str.news.row,
          keyOf: (p) => p.id,
          render: (p) => {
            const ago = T().postedAgo(p.createdAt || p.date, now);
            const img = p.image && window.UI.safeUrl(p.image);
            return h(window.MapV2Card, {
              variant: img ? 'image' : 'text',
              title: p.title,
              excerpt: p.body,
              meta: ago ? [ago] : [],
              media: img ? { src: img } : null,
              moreLabel: Str.news.readMore,
              idPrefix: 'mv2-post-' + p.id,
              onClick: (e) => setReading({ id: p.id, from: e.currentTarget }),
              'data-news': '',
              'aria-haspopup': 'dialog',
            });
          },
        });
      } else if (active === 'today') {
        panel = h('ul', { 'data-mv2': 'list', role: 'list' }, moments.map((m) => {
          const ago = T().postedAgo(m.created_at, now);
          const Rep = window.CCReport;
          return h('li', { key: m.id, 'data-mv2': 'post', 'data-moment': '' },
            m.image_url && window.UI.safeUrl(m.image_url) && h('img', { src: m.image_url, alt: '', loading: 'lazy', decoding: 'async', 'data-mv2': 'post-img' }),
            h('span', { 'data-mv2': 'post-body' }, m.body),
            h('div', { 'data-mv2': 'moment-foot' },
              ago && h('span', { 'data-mv2': 'row-meta' }, ago),
              Rep && h(Rep.Action, {
                variant: 'moment', targetType: 'moment', targetId: m.id, ownerId: item.id,
                strings: window.MapV2Strings.report,
              })));
        }));
      } else if (active === 'gallery') {
        panel = h(window.MapV2Gallery.Grid, { images, strings: Str.gallery, onOpen: (i, from) => setViewer({ index: i, from }) });
      }
      const noContent = !tabs.length && !loadingMore;
      // The bar and the panel are one block. The bar sticks inside it; the hairline is the block's end.
      // Bio stays above. A notice or the empty state stays outside, so a listing with no tabs has no hairline.
      const tabBlock = (tabs.length > 0 || loadingMore) && h('div', { 'data-mv2': 'tabbed', ref: tabbed, onPointerDown: onSwipeDown },
        h(Tabs, { tabs, active, onPick: pickTab, loadingMore, label: Str.tabsLabel }),
        // keyed by tab, so a newly chosen panel slides in from the side it was swiped or tapped from (--dur-*: none under reduced motion)
        tabs.length > 0 && h('div', {
          key: active, id: 'mv2-panel', role: 'tabpanel', 'aria-labelledby': 'mv2-tab-' + active, tabIndex: 0, 'data-mv2': 'panel',
          'data-enter': enter || undefined,
        }, panel),
        loadingMore && !tabs.length && h(window.MapV2Gallery.GridSkeleton, { label: Str.gallery.loading }));
      body = h('div', null,
        bio,
        tabBlock,
        detail.status === 'error' && !images.length && h('div', { 'data-mv2': 'notice', role: 'alert' },
          h('p', null, Str.gallery.error),
          h('button', { type: 'button', 'data-mv2': 'action', onClick: retry }, Str.retry)),
        noContent && detail.status !== 'error' && h('div', { 'data-mv2': 'empty' },
          h('p', { 'data-mv2': 'empty-title' }, Str.empty.title(name)),
          h('p', { 'data-mv2': 'empty-hint' }, Str.empty.hint),
          h('div', { 'data-mv2': 'actions' }, dir ? actions.filter((a) => a.key === 'dir') : (site ? actions.filter((a) => a.key === 'web') : (email ? actions.filter((a) => a.key === 'mail') : null)))));
    }

    // P2-01: each nearby listing described the way its own sheet header would be (name, category, how far)
    const N = window.MapV2Nearby;
    const nearRows = N && near.length ? near.map(({ marker: m, meters }) => {
      const mc = window.DATA.getItemCategory(m);
      const kind = (m.type === 'contributor' && window.MapV2Strings.pin.kind[m.kind]) || window.MapV2Strings.pin.type[m.type];
      const label = mc ? mc.name : kind;
      const what = m.type === 'contributor' ? label : window.MapV2Strings.pin.type[m.type] + ' · ' + label;
      let openState = null;
      if (m.type === 'place') {
        const pl = places.find((p) => p.id === m.id);
        const o = pl && T().openState(pl.openHours, now);
        if (o && o.status !== 'unknown') openState = { status: o.status, text: o.text };
      }
      return {
        id: m.id, type: m.type, name: m.title || '',
        meta: what + ' · ' + N.distanceText(meters, Str.nearby),
        photo: m.type === 'contributor' ? m.profilePhoto : undefined,
        item: { type: m.type, category: m.category },
        kind: kind,
        openState: openState,
      };
    }) : [];
    const peek = snap === 'peek' && !wide;
    // P2-08: the follower count, only from 100 up and rounded down ("100+"); nothing at all below that, nothing at peek
    const followers = isContributor && !peek && detail.data && detail.data.followers != null ? window.MapV2.countBucket(detail.data.followers) : '';
    const Icon = window.Icon;
    const closeBtn = h('button', { type: 'button', 'data-mv2': 'icon-btn', 'aria-label': Str.close, onClick: onClose }, h(Icon, { name: 'X', size: 20 }));
    const sub = [
      state && h('span', { key: 'state', 'data-mv2': 'state', 'data-status': state.status }, ' · ' + state.text),
      followers && h('span', { key: 'fol', 'data-mv2': 'followers' }, ' · ' + Str.followers(followers)),
    ];
    // #210 expanded: a fixed bar (the grab bar to the eye, X to a thumb), then the header at the top of the content
    const group = expanded && window.MapV2Explore ? window.MapV2Explore.groupOf(item) : '';
    const grab = expanded
      ? h('div', { 'data-mv2': 'grab' },
        h('div', { 'data-mv2': 'xbar' }, !wide && h('span', { 'data-mv2': 'handle-bar', 'aria-hidden': 'true' }), closeBtn))
      : h('div', { 'data-mv2': 'grab' },
        !wide && h('button', {
          type: 'button', 'data-mv2': 'handle', 'aria-label': snap === 'full' ? Str.collapse : Str.expand, onClick: cycle,
        }, h('span', { 'data-mv2': 'handle-bar', 'aria-hidden': 'true' })),
        h('div', { 'data-mv2': 'head', 'data-map-sheet-header': '' },
          h(Avatar, { src: avatarSrc, name: avatarName, hex, size: peek ? 'peek' : 'half', glyph: h(Icon, { name: (cat && cat.icon) || 'MapPin', size: peek ? 18 : 24 }) }),
          h('div', { 'data-mv2': 'titles' },
            h('h2', { 'data-mv2': 'name', tabIndex: -1, ref: title }, name),
            h('p', { 'data-mv2': 'sub' }, catLabel, sub)),
          peek && h('button', { type: 'button', 'data-mv2': 'icon-btn', 'aria-label': Str.expand, onClick: cycle }, h(Icon, { name: 'ChevronUp', size: 20 })),
          closeBtn));
    // the chip is the Explore card's own (map-v2-card.jsx): the group's dot and outline, the category's words.
    // Then the facts: how far, open or starting, followers.
    const facts = [];
    if (expanded) {
      if (distance) facts.push(h('span', { key: 'd', 'data-mv2': 'distance' }, distance));
      if (state) facts.push(h('span', { key: 's', 'data-mv2': 'state', 'data-status': state.status }, state.text));
      if (followers) facts.push(h('span', { key: 'f', 'data-mv2': 'followers' }, Str.followers(followers)));
    }
    const xhead = expanded && h('header', { 'data-mv2': 'xhead', 'data-map-sheet-header': '', 'data-cat': group || undefined },
      h(Cover, { src: item.coverPhoto, icon: (cat && cat.icon) || 'MapPin' }),
      h('h2', { 'data-mv2': 'name', tabIndex: -1, ref: title }, name),
      h('p', { 'data-mv2': 'xmeta' },
        h('span', { 'data-mv2': 'card-chip' },
          h('span', { 'data-mv2': 'card-dot', 'data-cat': group || undefined, 'data-fallback': group ? undefined : '', 'aria-hidden': 'true' }),
          h('span', { 'data-mv2': 'card-chip-label' }, catLabel)),
        facts.length > 0 && h('span', { 'data-mv2': 'sub' },
          facts.reduce((out, f, i) => out.concat(i ? [h('span', { key: 'sep' + i, 'aria-hidden': 'true' }, ' · '), f] : [f]), []))));
    return h('section', {
      ref: root, 'data-mv2': 'sheet', 'data-snap': wide ? 'panel' : snap, 'data-wide': wide ? '1' : undefined,
      'data-expanded': expanded ? '' : undefined,
      role: 'dialog', 'aria-label': Str.dialogLabel(name), 'aria-modal': 'false',
      onPointerDown,
    },
      grab,
      h('div', { ref: scroller, 'data-mv2': 'scroller' },
        xhead,
        h('div', { 'data-mv2': 'actions' }, actions),
        body,
        N && nearRows.length > 0 && h(N.List, { key: type + ':' + id, rows: nearRows, strings: Str.nearby, onPick: (pid, ptype) => { if (onPick) onPick(pid, ptype); } }),
        qrAction,
        reportAction,
        h('button', { type: 'button', 'data-mv2': 'view-full', onClick: openProfile }, Str.viewFull)),
      h('div', { 'data-mv2': 'sr', role: 'status', 'aria-live': 'polite' }, announce),
      // the QR code for this listing's public link (always the public site: a printed code must never point at a preview or localhost)
      qr && qrOk && ReactDOM.createPortal(h(window.MapV2QR.Dialog, {
        url: window.MapV2QR.PUBLIC_ORIGIN + '/c/' + item.slug, name, slug: item.slug, strings: Str.qr, returnFocus: qr.from, onClose: () => setQr(null),
      }), document.body),
      // rendered into <body>: a position:fixed box inside the sheet would be fixed to the sheet's own transform
      viewer && images[viewer.index] && ReactDOM.createPortal(h(window.MapV2Gallery.Viewer, {
        images, index: viewer.index, strings: Str.gallery, returnFocus: viewer.from,
        onClose: () => setViewer(null), onIndex: (i) => setViewer((v) => ({ index: i, from: v && v.from })),
      }), document.body),
      // the open news post: same centred dialog the profile page uses, over the whole viewport
      reading && window.MapV2News && posts.some((p) => p.id === reading.id) && ReactDOM.createPortal(h(window.MapV2News.Reader, {
        post: posts.find((p) => p.id === reading.id), sourceName: name, strings: Str.news,
        returnFocus: reading.from, onClose: () => setReading(null),
      }), document.body));
  }

  // The Dashboard drops the cached copy of a Contributor's page after they post or take down a note, so the map shows it at once.
  MapV2Sheet.forgetDetail = (slug) => { DETAIL.delete(slug); };
  window.MapV2Sheet = MapV2Sheet;
})();
