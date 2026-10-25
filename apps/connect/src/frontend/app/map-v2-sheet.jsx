// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 bottom sheet (tracker P1-06 to P1-11)
//  ------------------------------------------------------------------
//  ONE sheet for a Contributor, a Place and an Event (founder D9). A Contributor
//  gets the full treatment (header, actions, Events | News | Gallery); a Place or
//  an Event shows its existing EntityCard body inside the same container.
//
//  Three snap states, all `transform: translateY` on a box that is always the
//  full height, so a drag animates nothing but transform:
//    peek  a header strip (avatar, name, category · open state, chevron, close)
//    half  46 % of the viewport (dvh): header and the action row
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

  // ── the sheet ────────────────────────────────────────────────────
  function MapV2Sheet({ id, type, onClose, onOccupy, nearby, onPick }) {
    const app = window.useApp();
    const { go, shareLink, contributors, events, places, newsPosts, followedOrgs, toggleFollow, savedContributors, savedPlaces, toggleSave, realUser } = app;
    const Str = S();
    const wide = useWide();
    const root = useRef(null);
    const scroller = useRef(null);
    const tabbed = useRef(null);
    const title = useRef(null);
    const [snap, setSnap] = useState('half');
    const [tab, setTab] = useState(null);
    const [viewer, setViewer] = useState(null);     // { index, from }
    const [evSort, setEvSort] = useState(null);     // 'upcoming' | 'recent' | null (null = Upcoming when there is any, else Recent)
    const [qr, setQr] = useState(null);             // { from }: the QR code dialog (Contributor only)
    const [reading, setReading] = useState(null);   // { id, from }: the news reader (one post, one dialog)
    const [announce, setAnnounce] = useState(Str.snapMessage.half);
    const dragState = useRef(null);
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

    // A different pin: start again at half, on the first tab, scrolled to the top (not on the first mount:
    // nothing to reset, and every state update here is another render on the way to the header).
    const lastId = useRef(id);
    useEffect(() => {
      if (lastId.current === id) return;
      lastId.current = id;
      setSnap('half'); setTab(null); setViewer(null); setEvSort(null); setQr(null); setReading(null);
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

    // Focus moves into the sheet; it goes back to the pin on close (keyboard users).
    const opener = useRef(null);
    useEffect(() => {
      const a = document.activeElement;
      if (a && a.getAttribute && a.getAttribute('data-cc-id')) opener.current = a;
      return () => {
        const o = opener.current;
        if (o && o.isConnected) o.focus({ preventScroll: true });
      };
    }, []);
    useEffect(() => { if (title.current) title.current.focus({ preventScroll: true }); }, [id]);

    // A press that is still going when the sheet unmounts must not leave listeners on the document.
    useEffect(() => () => { const d = dragState.current; if (d && d.end) d.end(); }, []);

    // Escape closes at once (an open photo viewer or news reader takes the key first: it listens in the capture phase).
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Tell the map how much of it the sheet covers, so the selected pin clears it (tracker E5).
    useEffect(() => {
      if (!onOccupy) return undefined;
      let pad;
      if (wide) pad = { top: 0, right: 0, bottom: 0, left: cssLen('calc(var(--sheet-panel-w) + 2 * var(--space-3))') };
      else if (snap === 'peek') pad = { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-peek-h)') };
      else if (snap === 'half') pad = { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-half-h)') };
      else pad = lastPadding.current || { top: 0, right: 0, left: 0, bottom: cssLen('var(--sheet-half-h)') }; // full covers the map: no re-centre
      lastPadding.current = pad;
      onOccupy(pad);
    }, [snap, wide, id]);
    useEffect(() => () => { if (onOccupy) onOccupy(null); }, []);

    const lastSnap = useRef('half');
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
      if (Math.abs(v) >= FLICK) {
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
      dragState.current = { id: e.pointerId, startY: e.clientY, baseY: 0, active: false, handoff, from: snapRef.current, samples: [{ t: e.timeStamp, y: e.clientY }], m: null };
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

    const tabs = [];
    if (orgEvents.length || recentEvents.length) tabs.push({ id: 'events', label: Str.tabs.events });
    if (posts.length) tabs.push({ id: 'news', label: Str.tabs.news });
    if (moments.length) tabs.push({ id: 'today', label: Str.tabs.today });
    if (images.length) tabs.push({ id: 'gallery', label: Str.tabs.gallery });
    const loadingMore = isContributor && detail.status === 'loading';
    const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0] && tabs[0].id);
    // A different tab, while the bar is stuck: pull the block back to the top of the scroller before the new
    // panel renders (instant, so a shorter panel cannot leave you looking at what follows). The same tab leaves the scroll.
    const pickTab = (next) => {
      if (next !== active && tabbed.current && scroller.current) {
        const d = tabbed.current.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top;
        if (d < 0) scroller.current.scrollTop += d;
      }
      setTab(next);
    };

    // ── actions ─────────────────────────────────────────────────────
    const actions = [];
    if (dir) actions.push(h(Action, { key: 'dir', icon: 'Navigation', label: Str.directions, href: dir, external: true, primary: true }));
    // P2-04: Follow, for a Contributor that is not you (a Place and an Event show their card's own Follow / Consider)
    const following = isContributor && followedOrgs.has(item.id);
    if (isContributor && !(realUser && realUser.id === item.id)) {
      actions.push(h(Action, { key: 'follow', icon: 'Heart', label: following ? Str.following : Str.follow, on: following, onClick: () => toggleFollow(item.id, name) }));
    }
    // P2-04: Save, a PRIVATE bookmark for a Contributor (not you) or a Place; an Event keeps its Consider bookmark. Never counted,
    // never shown to the listing: the only trace is the person's own list in Settings.
    const saveKind = isContributor ? 'contributor' : type === 'place' ? 'place' : null;
    if (saveKind && !(isContributor && realUser && realUser.id === item.id)) {
      const saved = (saveKind === 'place' ? savedPlaces : savedContributors).has(item.id);
      actions.push(h(Action, { key: 'save', icon: 'Bookmark', label: saved ? Str.saved : Str.save, on: saved, onClick: () => toggleSave(saveKind, item.id, name) }));
    }
    actions.push(h(Action, { key: 'share', icon: 'Share2', label: Str.share, onClick: () => shareLink({ page: navTarget(type), params: { id } }) }));
    if (site) actions.push(h(Action, { key: 'web', icon: 'Globe', label: Str.website, href: site, external: true }));
    if (tel) actions.push(h(Action, { key: 'tel', icon: 'Phone', label: Str.call, href: tel }));
    if (email && !site) actions.push(h(Action, { key: 'mail', icon: 'Mail', label: Str.email, href: email }));
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
      body = h('div', { 'data-mv2': 'card' }, h(window.EntityCard, { item: Object.assign({}, item, { type }), layout: 'sheet' }));
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
        panel = h('ul', { 'data-mv2': 'list', role: 'list' }, posts.map((p) => {
          const ago = T().postedAgo(p.createdAt || p.date, now);
          const img = p.image && window.UI.safeUrl(p.image);
          return h('li', { key: p.id },
            h(window.MapV2Card, {
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
            }));
        }));
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
      const tabBlock = (tabs.length > 0 || loadingMore) && h('div', { 'data-mv2': 'tabbed', ref: tabbed },
        h(Tabs, { tabs, active, onPick: pickTab, loadingMore, label: Str.tabsLabel }),
        tabs.length > 0 && h('div', {
          id: 'mv2-panel', role: 'tabpanel', 'aria-labelledby': 'mv2-tab-' + active, tabIndex: 0, 'data-mv2': 'panel',
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
    return h('section', {
      ref: root, 'data-mv2': 'sheet', 'data-snap': wide ? 'panel' : snap, 'data-wide': wide ? '1' : undefined,
      role: 'dialog', 'aria-label': Str.dialogLabel(name), 'aria-modal': 'false',
      onPointerDown,
    },
      h('div', { 'data-mv2': 'grab' },
        !wide && h('button', {
          type: 'button', 'data-mv2': 'handle', 'aria-label': snap === 'full' ? Str.collapse : Str.expand, onClick: cycle,
        }, h('span', { 'data-mv2': 'handle-bar', 'aria-hidden': 'true' })),
        h('div', { 'data-mv2': 'head', 'data-map-sheet-header': '' },
          h(Avatar, { src: avatarSrc, name: avatarName, hex, size: peek ? 'peek' : 'half', glyph: h(Icon, { name: (cat && cat.icon) || 'MapPin', size: peek ? 18 : 24 }) }),
          h('div', { 'data-mv2': 'titles' },
            h('h2', { 'data-mv2': 'name', tabIndex: -1, ref: title }, name),
            h('p', { 'data-mv2': 'sub' }, catLabel,
              state && h('span', { 'data-mv2': 'state', 'data-status': state.status }, ' · ' + state.text),
              followers && h('span', { 'data-mv2': 'followers' }, ' · ' + Str.followers(followers)))),
          peek && h('button', { type: 'button', 'data-mv2': 'icon-btn', 'aria-label': Str.expand, onClick: cycle }, h(Icon, { name: 'ChevronUp', size: 20 })),
          h('button', { type: 'button', 'data-mv2': 'icon-btn', 'aria-label': Str.close, onClick: onClose }, h(Icon, { name: 'X', size: 20 })))),
      h('div', { ref: scroller, 'data-mv2': 'scroller' },
        h('div', { 'data-mv2': 'actions' }, actions),
        body,
        N && nearRows.length > 0 && h(N.List, { rows: nearRows, strings: Str.nearby, onPick: (pid, ptype) => { if (onPick) onPick(pid, ptype); } }),
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
