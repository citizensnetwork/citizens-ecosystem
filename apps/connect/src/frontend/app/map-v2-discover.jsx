// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 Discover page (issue #210, part 3: "See all")
//  ------------------------------------------------------------------
//  The page the Explore row's "See all" and the folding nav's Explore open, at /explore (the old map and the
//  sidebar keep Kingdom Exploration at /discover). A full screen of the Explore row's own large cards, as
//  sideways rows: "Near you", "Popular", then one row per category group that has listings, each titled
//  with the group's name and colour. The category pills (map-v2-explore.jsx) stay at the top and filter
//  every row. A row with nothing in it is left out.
//
//  NEAR YOU: closest first from the person's position (the map's, or one quiet read when the browser has
//  already been allowed), else the map's centre, else the city centre; distances in km, worded honestly.
//
//  POPULAR, without burying the small (VISION.md, "the small are honoured"). The app holds no follower or
//  attendance counts for the public, and size must not decide who is seen. So a listing earns a point for
//  each thing it has going on, never for how much: an event in the next 30 days, news in the last 30 days,
//  an event live now. One event or forty is the same point. Only listings with a point appear, one card per
//  organiser (a busy host cannot fill the row with its own events), and equal scores take FAIR TURNS: an
//  order drawn afresh each day from the listing's id, so no name, size or age keeps the front.
//
//  A card is the Explore row's own (MapV2Explore.cardFor). Tapping it opens the FULL profile at once (founder,
//  2026-10-30: a person who came here to look at listings wants the listing, not a summary of it). Coming Back
//  restores the pill and every scroll position: they are kept on this page's own history entry
//  (history.state.mv2discover, beside the store's cc/idx/nav), written when the person stops scrolling, picks a
//  pill or opens a card.
//
//  Pure helpers (listingsOf, activityOf, fairTurn, popular, rowsFor) are unit-tested in mapV2Discover.test.tsx.
//  Styles: assets/map-v2.css section 4m (tokens only). Text: MapV2Strings.discover (and .explore).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } = React;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WINDOW_MS = 30 * DAY_MS;             // "this month": upcoming events and recent news count inside it
  const SAVE_MS = 250;                       // write the scroll positions this long after the last scroll
  const CITY = { lat: -25.7479, lng: 28.2293 }; // Church Square, Pretoria: map.jsx's own default centre
  const MEMORY = 'mv2discover';
  const X = () => window.MapV2Explore;
  const S = () => (window.MapV2Strings && window.MapV2Strings.discover) || {};
  const XS = () => (window.MapV2Strings && window.MapV2Strings.explore) || {};
  const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? NaN : t; };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * Every listing with a position, in the map's marker shape plus what Popular reads. Finished events are history,
   * not a place to turn up (the map leaves them out too). Ideas are not listings.
   */
  function listingsOf(src, now) {
    const s = src || {};
    const past = (e) => !!(window.DATA && window.DATA.isPastEvent && window.DATA.isPastEvent(e, now));
    const out = [];
    (s.events || []).forEach((e) => {
      if (!e || past(e) || !isNum(e.lat) || !isNum(e.lng)) return;
      out.push({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng,
        organizerId: e.organizerId || null, startsAt: e.startsAt || '', isLive: !!e.isLive });
    });
    (s.places || []).forEach((p) => {
      if (!p || !isNum(p.lat) || !isNum(p.lng)) return;
      out.push({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, organizerId: p.organizerId || null });
    });
    (s.contributors || []).forEach((c) => {
      if (!c || !isNum(c.lat) || !isNum(c.lng)) return;
      out.push({ id: c.id, type: 'contributor', title: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng });
    });
    return out;
  }

  /**
   * Popular's points per listing ('type:id' -> 0..3): one for an event in the next 30 days (the event, and the
   * Contributor hosting it), one for news in the last 30 days (the Contributor), one for an event live now.
   * Each is a yes or no, so a host with forty events scores what a host with one does.
   */
  function activityOf(listings, newsPosts, now) {
    const flags = new Map();
    const mark = (key, flag) => { const f = flags.get(key) || {}; f[flag] = true; flags.set(key, f); };
    (Array.isArray(listings) ? listings : []).forEach((m) => {
      if (m.type !== 'event') return;
      const start = ms(m.startsAt);
      if (m.isLive) mark('event:' + m.id, 'live');
      if (isNum(start) && start - now <= WINDOW_MS) {
        mark('event:' + m.id, 'soon');
        if (m.organizerId) mark('contributor:' + m.organizerId, 'soon');
      }
    });
    (Array.isArray(newsPosts) ? newsPosts : []).forEach((n) => {
      const t = isNum(ms(n && n.createdAt)) ? ms(n.createdAt) : ms(n && n.date);
      if (n && n.contributorId && isNum(t) && t <= now && now - t <= WINDOW_MS) mark('contributor:' + n.contributorId, 'news');
    });
    const points = new Map();
    flags.forEach((f, key) => points.set(key, (f.soon ? 1 : 0) + (f.news ? 1 : 0) + (f.live ? 1 : 0)));
    return points;
  }

  /** A listing's place in today's fair turns: a 32-bit FNV-1a hash of its id and the day, so the order changes daily. */
  function fairTurn(id, day) {
    const s = String(id) + ':' + String(day);
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x;
  }

  /**
   * The Popular row from ranked listings ([{ m, meters }]): only listings with a point, most points first, equal
   * points in today's fair turns, one card per organiser, at most `cap`.
   */
  function popular(ranked, points, now, cap) {
    const day = Math.floor(now / DAY_MS);
    const host = (m) => (m.type === 'contributor' ? m.id : (m.organizerId || m.type + ':' + m.id));
    const scored = (Array.isArray(ranked) ? ranked : [])
      .map((r) => ({ r: r, p: points.get(r.m.type + ':' + r.m.id) || 0, turn: fairTurn(r.m.type + ':' + r.m.id, day) }))
      .filter((x) => x.p > 0);
    scored.sort((a, b) => (b.p - a.p) || (a.turn - b.turn) || String(a.r.m.id).localeCompare(String(b.r.m.id)));
    const seen = new Set();
    const out = [];
    for (const x of scored) {
      const key = host(x.r.m);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x.r);
      if (out.length >= cap) break;
    }
    return out;
  }

  /**
   * The page's rows, in order: Near you, Popular, then one per group (MapV2Explore.GROUPS order). The pill filters
   * all of them: a group pill keeps only that group's row after the first two, Events keeps events everywhere.
   * Empty rows are left out. Returns [{ id, group?, items: [{ m, meters }] }].
   */
  function rowsFor(listings, points, pill, origin, now) {
    const lib = X();
    const cap = lib.ROW_CAP;
    const pass = (Array.isArray(listings) ? listings : []).filter((m) => lib.pillMatches(pill, m));
    const ranked = lib.rank(origin, pass, null, Math.max(1, pass.length));
    const rows = [
      { id: 'near', items: ranked.slice(0, cap) },
      { id: 'popular', items: popular(ranked, points, now, cap) },
    ];
    lib.GROUPS.forEach((g) => {
      if (pill && pill !== 'all' && pill !== 'events' && pill !== g) return;
      rows.push({ id: g, group: g, items: ranked.filter((r) => lib.groupOf(r.m) === g) });
    });
    return rows.filter((r) => r.items.length > 0);
  }

  // ── this page's own history entry ─────────────────────────────────
  // Only ever the entry that IS this page (never an overlay's guard entry, never another screen's).
  function ownEntry() {
    try {
      const st = window.history && window.history.state;
      return st && st.cc && !st.guard && st.nav && st.nav.page === 'explore' ? st : null;
    } catch { return null; }
  }
  function readMemory() {
    const st = ownEntry();
    const m = st && st[MEMORY];
    return m && typeof m === 'object' ? m : null;
  }
  function writeMemory(mem) {
    const st = ownEntry();
    if (!st) return;
    try { window.history.replaceState(Object.assign({}, st, { [MEMORY]: mem }), ''); } catch { /* rate-limited: the page still works */ }
  }

  // The person's position, read once and only when the browser has already been allowed: this page never asks.
  function useQuietPosition(skip) {
    const [pos, setPos] = useState(null);
    useEffect(() => {
      if (skip || !navigator.permissions || !navigator.geolocation) return undefined;
      let live = true;
      navigator.permissions.query({ name: 'geolocation' }).then((p) => {
        if (!live || !p || p.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (r) => { if (live) setPos({ lat: r.coords.latitude, lng: r.coords.longitude }); },
          () => { /* unavailable: the map centre or the city centre stands */ },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
        );
      }).catch(() => { /* no permissions API answer: same */ });
      return () => { live = false; };
    }, [skip]);
    return pos;
  }

  function Discover() {
    const app = window.useApp();
    const { events, places, contributors, newsPosts } = app;
    const lib = X();
    const str = S();
    const xs = XS();
    const Row = window.MapV2Row && window.MapV2Row.Row;
    const memory = useRef(undefined);
    if (memory.current === undefined) memory.current = readMemory();   // read once, on the first render
    const [pill, setPill] = useState(() => (memory.current && typeof memory.current.pill === 'string' ? memory.current.pill : 'all'));
    const scroller = useRef(null);
    const timer = useRef(null);
    const narrow = lib.useNarrow();
    const [now] = useState(() => Date.now());

    const seen = lib.lastView();
    const quiet = useQuietPosition(!!seen.user);
    const origin = seen.user || quiet || seen.centre || CITY;
    const words = seen.user || quiet ? xs : seen.centre ? (xs.centre || {}) : (str.city || {});

    const listings = useMemo(() => listingsOf({ events, places, contributors }, now), [events, places, contributors, now]);
    const points = useMemo(() => activityOf(listings, newsPosts, now), [listings, newsPosts, now]);
    const rows = useMemo(() => rowsFor(listings, points, pill, origin, now), [listings, points, pill, origin, now]);
    const byKey = useMemo(() => lib.indexSources({ events, places, contributors }), [lib, events, places, contributors]);

    // Where everything is: the page's scroll, and each row's (by row id).
    const snapshot = useCallback(() => {
      const el = scroller.current;
      const out = { pill: pill, top: el ? el.scrollTop : 0, rows: {} };
      if (el) {
        el.querySelectorAll("[data-mv2='discover-row']").forEach((sec) => {
          const list = sec.querySelector("[data-mv2='list']");
          if (list && list.scrollLeft) out.rows[sec.getAttribute('data-row')] = list.scrollLeft;
        });
      }
      return out;
    }, [pill]);
    const save = useCallback(() => { clearTimeout(timer.current); writeMemory(snapshot()); }, [snapshot]);

    // One listener (capture: scroll does not bubble) hears the page and every row; it writes once the scrolling stops.
    useEffect(() => {
      const el = scroller.current;
      if (!el) return undefined;
      const onScroll = () => { clearTimeout(timer.current); timer.current = setTimeout(save, SAVE_MS); };
      el.addEventListener('scroll', onScroll, { capture: true, passive: true });
      return () => { el.removeEventListener('scroll', onScroll, { capture: true }); clearTimeout(timer.current); };
    }, [save]);

    // Back onto this page: put every scroll back, once. The page's own before the first paint; the rows' after their
    // own mount effect (a row starts itself at its first card), which runs before this parent's.
    useLayoutEffect(() => {
      const m = memory.current;
      if (m && scroller.current && Number(m.top) > 0) scroller.current.scrollTop = Number(m.top);
    }, []);
    useEffect(() => {
      const m = memory.current;
      const el = scroller.current;
      memory.current = null;
      if (!m || !el || !m.rows || typeof m.rows !== 'object') return;
      el.querySelectorAll("[data-mv2='discover-row']").forEach((sec) => {
        const left = Number(m.rows[sec.getAttribute('data-row')]);
        const list = sec.querySelector("[data-mv2='list']");
        if (list && left > 0) list.scrollLeft = left;
      });
    }, []);

    const pick = (id) => {
      setPill(id);
      if (scroller.current) scroller.current.scrollTop = 0;
      writeMemory({ pill: id, top: 0, rows: {} });
    };
    // A card opens the listing's own page (the event page counts its own impression). The scroll positions are written
    // first, so Back finds this page exactly as it was left.
    const open = (id, type) => {
      save();
      app.go(type === 'contributor' ? 'profile' : type, { id: id });
    };

    const groupWords = xs.groups || {};
    const titleOf = (row) => (row.id === 'near' ? str.near : row.id === 'popular' ? str.popular : groupWords[row.id]);
    const section = (row) => {
      const titleId = 'mv2-discover-' + row.id;
      const title = titleOf(row);
      const rowWords = row.group
        ? Object.assign({ label: str.groupLabel ? str.groupLabel(title) : title }, str.row)
        : { label: row.id === 'near' ? str.nearLabel : str.popularLabel };
      return h('section', {
        // a new pill starts every row again at its first card
        key: row.id + ':' + pill, 'data-mv2': 'discover-row', 'data-row': row.id, 'data-cat': row.group || undefined,
        'aria-labelledby': titleId,
      },
        h('h2', { id: titleId, 'data-mv2': 'discover-row-title' },
          row.group ? h('span', { 'data-mv2': 'pill-dot', 'aria-hidden': 'true' }) : null,
          h('span', null, title)),
        row.id === 'popular' ? h('p', { 'data-mv2': 'discover-hint' }, str.popularHint) : null,
        h(Row, {
          items: row.items, keyOf: (r) => r.m.type + ':' + r.m.id, idPrefix: 'mv2-d-' + row.id, max: lib.ROW_CAP, strings: rowWords,
          render: (r) => lib.cardFor({
            m: r.m, meters: r.meters, rec: byKey.get(r.m.type + ':' + r.m.id), idPrefix: 'mv2-d-' + row.id + '-' + r.m.id,
            words: words, onOpen: open,
          }),
        }));
    };

    return h('div', { 'data-screen': 'explore', 'data-mv2': 'discover', 'data-narrow': narrow ? '' : undefined },
      h('div', { ref: scroller, 'data-mv2': 'discover-scroll' },
        h('div', { 'data-mv2': 'discover-top' },
          h('div', { 'data-mv2': 'discover-bar' },
            h('h1', { 'data-mv2': 'discover-title' }, str.title),
            window.AccountButton ? h(window.AccountButton, { variant: 'round' }) : null),
          h(lib.Pills, { value: pill, onChange: pick, label: str.pillsLabel })),
        rows.length && Row
          ? rows.map(section)
          : h('p', { 'data-mv2': 'discover-empty' }, str.empty)));
  }

  window.MapV2Discover = { WINDOW_MS, CITY, listingsOf, activityOf, fairTurn, popular, rowsFor, Discover };
})();
