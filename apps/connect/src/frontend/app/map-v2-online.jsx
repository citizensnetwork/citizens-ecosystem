// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 "Online in this area" (issue #259, founder's option 3: the globe)
//  ------------------------------------------------------------------
//  A Contributor with no fixed place cannot be a pin. When someone looks at an area that Contributors serve online (or
//  without a venue), ONE globe button appears among the map's own controls, with a count. Tapping it opens a list of them.
//  When nothing serves the area in view, NOTHING is drawn: no button, no empty box.
//    * "The area in view" is resolved ON THE DEVICE from the small public index (CCServing.areaInView), from the map centre
//      and zoom, so the map never sends coordinates to us. The answer is asked for once the map has been still for
//      SETTLE_MS, and only when the resolved area changed (or the last answer is older than FRESH_MS): never per frame.
//    * The list is grouped by how specific the area the Contributor chose is (suburb, city or town, province), then A to Z.
//      Under it, a quiet "Also reaching this area": a few whose distance reaches here (at most five, nearest first). Never
//      popularity. Each row carries the owner's tag, Online or No fixed place; a mobile ministry is never labelled Online.
//    * Honest (C21): the words are "Online or no fixed place", never "on the map".
//    * The sheet uses ONE useBackGuard entry (Back, Escape and Close all end it); a tap on a row navigates FIRST, then closes.
//    * One 200 ms fade when the button first appears; reduced motion makes it a jump (the token collapses to 0). Nothing loops.
//  Behind ONE constant, MapV2.onlineGlobe (ONLINE_GLOBE_ON in map-v2-lib.jsx) and the Map v2 flag: off, this file draws nothing
//  and asks for nothing, so Map v2 is exactly as it was.
//
//  Pieces: createWatcher (the pure "when do we ask" logic, unit-tested), Globe (the button among the controls and the sheet),
//  OnlineSheet (the list). Text: MapV2Strings.online. Styles: assets/map-v2.css, [data-mv2='globe'] and [data-mv2='online-sheet'].
//
//  Public surface: window.MapV2Online = { SETTLE_MS, FRESH_MS, createWatcher, groupMain, Globe, OnlineSheet }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;
  const useBackGuard = window.useBackGuard || function () {};
  const S = () => window.MapV2Strings.online;
  const Sv = () => window.CCServing;

  const SETTLE_MS = 400;     // the map must be still this long before we look
  const FRESH_MS = 60000;    // an answer is reused this long (the edge caches the same read for about a minute)
  const WIDE_MQ = '(min-width: 768px) and (pointer: fine)';
  const LEVEL_ORDER = { suburb: 0, place: 1, province: 2 };

  /** Is the globe allowed at all: Map v2 on AND the one constant. */
  const globeOn = () => !!(window.isMapV2 && window.isMapV2() && window.MapV2 && window.MapV2.onlineGlobe);

  // ── when do we ask? (pure: a test feeds it a stand-in map, clock and fetcher) ──
  /**
   * The settle-then-ask logic, with no React and no map in it.
   *   getView()      -> { lat, lng, zoom } of the map now, or null
   *   resolve(v)     -> the area id in view, or null (CCServing.areaInView on the loaded index)
   *   prepare(v)     -> an optional promise that must finish before resolving (the suburbs of the city in view)
   *   load(areaId)   -> Promise of CCServing.fetchServing's answer
   *   onState(state) -> { areaId, status: 'idle' | 'loading' | 'ready' | 'error', data }
   * `settle()` is called on every moveend; it waits for stillness, then asks only if the resolved area changed or the last
   * answer is stale. A late answer for an area that is no longer in view is dropped. `requests` counts what was asked.
   */
  function createWatcher(o) {
    const settleMs = o.settleMs == null ? SETTLE_MS : o.settleMs;
    const freshMs = o.freshMs == null ? FRESH_MS : o.freshMs;
    const now = o.now || (() => Date.now());
    const setT = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearT = o.clearTimer || ((t) => clearTimeout(t));
    let timer = null;
    let seq = 0;
    let dead = false;
    const cache = {};                  // areaId -> { at, data }
    const state = { areaId: null, status: 'idle', data: null };
    const api = { requests: 0, state, settle, retry, dispose, peek: () => ({ ...state }) };
    const push = (patch) => { Object.assign(state, patch); if (!dead && o.onState) o.onState({ ...state }); };

    async function look() {
      timer = null;
      if (dead) return;
      const view = o.getView();
      if (!view) return;
      const mine = ++seq;
      if (o.prepare) { try { await o.prepare(view); } catch { /* the suburbs are an extra: the city still answers */ } }
      if (dead || mine !== seq) return;
      const areaId = o.resolve(view);
      if (!areaId) { if (state.areaId !== null || state.status !== 'idle') push({ areaId: null, status: 'idle', data: null }); return; }
      const hit = cache[areaId];
      if (areaId === state.areaId && (state.status === 'loading' || (state.status === 'ready' && hit && now() - hit.at < freshMs))) return;
      if (hit && now() - hit.at < freshMs) { push({ areaId, status: 'ready', data: hit.data }); return; }
      push({ areaId, status: 'loading', data: areaId === state.areaId ? state.data : null });
      api.requests += 1;
      const r = await o.load(areaId);
      if (dead || mine !== seq || state.areaId !== areaId) return;   // the map moved on: this answer is for somewhere else
      if (r && r.ok) { cache[areaId] = { at: now(), data: r }; push({ status: 'ready', data: r }); }
      else push({ status: 'error', data: null });
    }
    function settle() {
      if (dead) return;
      if (timer !== null) clearT(timer);
      timer = setT(look, settleMs);
    }
    /** Ask again for the area in view (the error state's button): forget its answer and let the next look fetch it. */
    function retry() {
      if (!state.areaId) return;
      delete cache[state.areaId];
      state.areaId = null;
      state.status = 'idle';
      settle();
    }
    function dispose() { dead = true; if (timer !== null) clearT(timer); timer = null; }
    return api;
  }

  /** The main list by how specific the chosen area is (suburb, city or town, province), each group A to Z. [{ level, items }] */
  function groupMain(main) {
    const groups = {};
    (main || []).forEach((m) => { (groups[m.served.level] = groups[m.served.level] || []).push(m); });
    const lower = (s) => String(s || '').toLocaleLowerCase('en');
    return Object.keys(groups)
      .sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b])
      .map((level) => ({ level, items: groups[level].slice().sort((a, b) => (lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : a.id < b.id ? -1 : 1)) }));
  }

  const tagText = (presence) => (presence === 'no_fixed_place' ? S().tag.noFixedPlace : S().tag.online);
  const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();

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

  // ── a row ────────────────────────────────────────────────────────────
  function Avatar({ person }) {
    const [bad, setBad] = useState(false);
    const src = person.logoUrl || person.avatarUrl;
    useEffect(() => setBad(false), [src]);
    const cat = window.DATA && window.DATA.getCategory ? window.DATA.getCategory(person.category) : null;
    const hex = cat && cat.hex ? cat.hex : 'var(--accent)';
    const P = window.MapV2Pins;
    const style = { '--pin-cat': hex, '--pin-glyph': P && cat && cat.hex ? P.glyphColor(hex) : 'var(--accent-contrast)' };
    return h('span', { 'data-mv2': 'avatar', 'data-size': 'peek', style, 'aria-hidden': 'true' },
      src && !bad ? h('img', { src, alt: '', decoding: 'async', onError: () => setBad(true), 'data-mv2': 'avatar-img' }) : initialsOf(person.name));
  }
  function Row({ person, lines, onPick }) {
    return h('li', { 'data-online-row': person.id },
      h('button', { type: 'button', 'data-mv2': 'row', 'data-near': '', 'aria-label': S().openProfile(person.name) + '. ' + lines.join('. '), onClick: () => onPick(person) },
        h(Avatar, { person }),
        h('span', { 'data-mv2': 'near-text' },
          h('span', { 'data-mv2': 'row-title' }, person.name),
          lines.map((l, i) => h('span', { key: i, 'data-mv2': 'row-meta' }, l)))));
  }

  // ── the sheet ────────────────────────────────────────────────────────
  /** Props: state ({ areaId, status, data }), onClose, onPick (person) => void, onRetry. */
  function OnlineSheet({ state, onClose, onPick, onRetry }) {
    const Str = S();
    const wide = useWide();
    const titleRef = useRef(null);
    useBackGuard(true, onClose);
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    useEffect(() => { if (titleRef.current) titleRef.current.focus(); }, []);

    const data = state.data;
    const total = data ? data.main.length + data.also.length : 0;
    const areaName = data && data.area ? data.area.name : '';
    let body;
    if (state.status === 'error') {
      body = h('div', { 'data-online': 'error', role: 'alert', 'data-mv2': 'online-note' },
        h('p', null, Str.loadError),
        h('button', { type: 'button', 'data-mv2': 'sort-btn', onClick: onRetry }, Str.retry));
    } else if (!data) {
      body = h('p', { 'data-online': 'loading', role: 'status', 'data-mv2': 'online-note' }, Str.loading);
    } else if (!total) {
      body = h('p', { 'data-online': 'empty', 'data-mv2': 'online-note' }, Str.empty);
    } else {
      body = h('div', null,
        groupMain(data.main).map((g) => h('section', { key: g.level, 'data-online-group': g.level, 'aria-label': Str.groups[g.level] },
          h('h3', { 'data-mv2': 'online-group' }, Str.groups[g.level]),
          h('ul', { 'data-mv2': 'list', role: 'list' }, g.items.map((p) => h(Row, { key: p.id, person: p, onPick, lines: [Str.rowMeta(tagText(p.presence), p.served.name)] }))))),
        data.also.length > 0 && h('section', { 'data-online': 'also', 'aria-labelledby': 'mv2-online-also' },
          h('h3', { id: 'mv2-online-also', 'data-mv2': 'online-group' }, Str.alsoReaching),
          h('p', { 'data-mv2': 'near-hint' }, Str.alsoHint),
          h('ul', { 'data-mv2': 'list', role: 'list' }, data.also.map((p) => h(Row, {
            key: p.id, person: p, onPick,
            lines: [p.presence ? tagText(p.presence) : null, p.centreName ? Str.within(p.radiusKm, p.centreName) : Str.withinPin(p.radiusKm), Str.away(p.distanceKm)].filter(Boolean),
          }))),
          h('p', { 'data-mv2': 'near-hint' }, Str.alsoFoot)));
    }
    return h('div', { 'data-mv2': 'online-sheet', 'data-wide': wide ? '' : undefined, role: 'dialog', 'aria-labelledby': 'mv2-online-title', 'data-online-status': state.status },
      h('div', { 'data-mv2': 'online-head' },
        h('span', { 'data-mv2': 'online-glyph', 'aria-hidden': 'true' }, h(window.Icon, { name: 'Globe', size: 22 })),
        h('div', { 'data-mv2': 'titles' },
          h('h2', { id: 'mv2-online-title', ref: titleRef, tabIndex: -1, 'data-mv2': 'online-title' }, Str.title),
          h('p', { 'data-mv2': 'near-hint' }, areaName ? Str.subtitle(areaName) + (total ? ' · ' + Str.count(total) : '') : Str.loading)),
        h('button', { type: 'button', 'data-mv2': 'icon-btn', 'data-online': 'close', 'aria-label': Str.closeSheet, onClick: onClose }, h(window.Icon, { name: 'X', size: 18 }))),
      h('div', { 'data-mv2': 'online-scroller' }, body));
  }

  // ── the globe among the map's own controls, and its sheet ─────────────
  /** A MapLibre control that is only a place to put our button: it stacks with zoom and locate, wherever they sit. */
  function hostControl() {
    const ctl = { el: null };
    ctl.onAdd = () => {
      ctl.el = document.createElement('div');
      ctl.el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      ctl.el.setAttribute('data-mv2', 'globe-host');
      return ctl.el;
    };
    ctl.onRemove = () => { if (ctl.el && ctl.el.parentNode) ctl.el.parentNode.removeChild(ctl.el); ctl.el = null; };
    return ctl;
  }

  /** The map, once it exists (map.jsx fires 'cc-map-ready' after creating it). */
  function useMap() {
    const [map, setMap] = useState(() => (typeof window !== 'undefined' && window.__ccMap) || null);
    useEffect(() => {
      const on = () => setMap(window.__ccMap || null);
      window.addEventListener('cc-map-ready', on);
      on();
      return () => window.removeEventListener('cc-map-ready', on);
    }, []);
    return map;
  }

  /** Props: onOpenProfile (contributorId) => void. Renders nothing unless the globe is on and something is online here. */
  function Globe({ onOpenProfile }) {
    const on = globeOn();
    const map = useMap();
    const [view, setView] = useState({ areaId: null, status: 'idle', data: null });
    const [open, setOpen] = useState(false);
    const [host, setHost] = useState(null);
    const index = useRef(null);                       // the loaded area index (provinces, cities and towns, suburbs as met)
    const watcher = useRef(null);
    const askedKids = useRef({});
    const btn = useRef(null);

    // the index, once, then the watcher on the map's settling
    useEffect(() => {
      if (!on || !map) return undefined;
      let alive = true;
      const C = Sv();
      const w = createWatcher({
        getView: () => { const c = map.getCenter(); return c ? { lat: c.lat, lng: c.lng, zoom: map.getZoom() } : null; },
        // the suburbs of the city in view load once, only when the zoom is close enough for a suburb to count
        prepare: async (v) => {
          if (!index.current || v.zoom < C.AREA_ZOOM.suburb) return;
          const place = C.resolveLevel(index.current, 'place', v.lat, v.lng);
          if (!place || askedKids.current[place]) return;
          askedKids.current[place] = true;
          const r = await C.fetchAreas('?parent=' + encodeURIComponent(place));
          if (r.ok) index.current = C.mergeAreas(index.current, r.areas); else askedKids.current[place] = false;
        },
        resolve: (v) => (index.current ? C.areaInView(index.current, v.lat, v.lng, v.zoom) : null),
        load: (areaId) => C.fetchServing(areaId),
        onState: (s) => { if (alive) setView(s); },
      });
      watcher.current = w;
      const onSettle = () => w.settle();
      C.fetchAreas('').then((r) => {
        if (!alive || !r.ok || !r.areas.length) return;
        index.current = C.buildIndex(r.areas);
        w.settle();
      });
      map.on('moveend', onSettle);
      return () => { alive = false; map.off('moveend', onSettle); w.dispose(); watcher.current = null; };
    }, [on, map]);

    const data = view.data;
    const total = data ? data.main.length + data.also.length : 0;
    const visible = on && (total > 0 || open);

    // the button's home among the controls (added only while there is something to show, so no empty gap is ever left)
    useEffect(() => {
      if (!map || !visible) { setHost(null); return undefined; }
      const ctl = hostControl();
      map.addControl(ctl, 'bottom-right');
      setHost(ctl.el);
      return () => { try { map.removeControl(ctl); } catch { /* the map is gone */ } setHost(null); };
    }, [map, visible]);

    const close = useCallback(() => { setOpen(false); setTimeout(() => { if (btn.current) btn.current.focus(); }, 0); }, []);
    const pick = useCallback((person) => { if (onOpenProfile) onOpenProfile(person.id); setOpen(false); }, [onOpenProfile]);   // navigate FIRST, then close
    const retry = useCallback(() => { if (watcher.current) watcher.current.retry(); }, []);

    if (!on) return null;
    const Str = S();
    const button = host && h('button', {
      type: 'button', ref: btn, 'data-mv2': 'globe', 'aria-label': Str.button(total), 'aria-haspopup': 'dialog', 'aria-expanded': open,
      onClick: () => setOpen((o) => !o),
    }, h(window.Icon, { name: 'Globe', size: 22 }), h('span', { 'data-mv2': 'globe-count', 'aria-hidden': 'true' }, total));
    return h(React.Fragment, null,
      host && window.ReactDOM && window.ReactDOM.createPortal(button, host),
      open && h(OnlineSheet, { state: view, onClose: close, onPick: pick, onRetry: retry }));
  }

  window.MapV2Online = { SETTLE_MS, FRESH_MS, createWatcher, groupMain, Globe, OnlineSheet };
})();
