// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — REAL map (MapLibre GL + MapTiler)
//  ------------------------------------------------------------------
//  Phase 2: replaces the decorative SVG prototype with a real geographic
//  map. Keeps the same public interface the home screen consumes:
//    window.StylizedMap({ markers, routes, filterCategory, selectedId, onSelect })
//    window.MapFloatersLayer(...)  → now a no-op (bubbles ride the markers).
//  Markers are native MapLibre markers built as small DOM pins that mirror
//  the teardrop / dot / glass styles from the prototype (+ live pulse +
//  broadcast bubble + selected label). Coordinates use real lat/lng when an
//  item has them; legacy mock items (only mapX/mapY) are projected into a
//  greater-Pretoria bounding box so they still place sensibly during the
//  mock→real data migration.
//
//  Visibility: EVERY item with coordinates is shown — no clustering and no
//  zoom-based layering (both were tried and both ended up hiding events).
//  MapLibre repositions DOM markers itself as the user zooms/pans, so the
//  marker set only re-renders when the data / filter / selection changes.
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useRef, useEffect } = React;
  const env = window.__CC_ENV || {};

  // ── Geo frame ──────────────────────────────────────────────────────
  const PRETORIA = [28.2293, -25.7479];           // [lng, lat] — Church Square
  // Greater-Pretoria bbox used only to project legacy % coords (mock items).
  const BBOX = { west: 28.10, east: 28.36, south: -25.86, north: -25.66 };

  function coordsFor(m) {
    if (typeof m.lng === 'number' && typeof m.lat === 'number' && (m.lng !== 0 || m.lat !== 0)) {
      return [m.lng, m.lat];
    }
    if (typeof m.mapX === 'number' && typeof m.mapY === 'number') {
      const lng = BBOX.west + (m.mapX / 100) * (BBOX.east - BBOX.west);
      const lat = BBOX.north - (m.mapY / 100) * (BBOX.north - BBOX.south);
      return [lng, lat];
    }
    return null;
  }

  function styleUrl() {
    const key = env.MAPTILER_KEY;
    if (!key || key.indexOf('REPLACE_WITH') === 0) return null;
    const style = env.MAPTILER_STYLE || 'streets-v2';
    return 'https://api.maptiler.com/maps/' + style + '/style.json?key=' + key;
  }

  // ── Pin content builder ─────────────────────────────────────────────
  //  Returns the INNER node (a position:relative wrapper holding the pulse
  //  ring, the pin shape, the broadcast bubble and the selected label).
  //
  //  The OUTER element handed to MapLibre is built (and kept) by the render
  //  loop and is NEVER replaced — MapLibre adds its `maplibregl-marker` class
  //  (which carries `position:absolute`) once at construction and anchors the
  //  pin to its lng/lat with a transform. Replacing that element on every
  //  re-render dropped the class → the pin fell to `position:static` and
  //  drifted on zoom/pan. So on reuse we swap only this inner content.
  function buildPinInner(m, cat, opts) {
    const selected = opts.selected, pinStyle = opts.pinStyle;
    const isIdea = m.type === 'idea';
    const fill = isIdea ? '#C9A84C' : (cat ? cat.hex : '#C9A84C');

    const inner = document.createElement('div');
    inner.style.cssText = 'position:relative;line-height:0;';

    // live / busy pulse ring (behind the pin)
    if (m.isLive || m.isBusy) {
      const ring = document.createElement('span');
      const c = m.isLive ? '#ef4444' : fill;
      const sz = m.isLive ? 16 : 14;
      ring.className = 'cc-pin-pulse';
      ring.style.cssText = 'position:absolute;left:50%;top:50%;width:' + sz + 'px;height:' + sz +
        'px;margin:-' + (sz / 2) + 'px 0 0 -' + (sz / 2) + 'px;border-radius:50%;background:' + c + ';';
      inner.appendChild(ring);
    }

    const pin = document.createElement('span');
    if (pinStyle === 'dot') {
      const d = selected ? 22 : 16;
      pin.style.cssText = 'display:block;width:' + d + 'px;height:' + d +
        'px;border:2.5px solid #fff;border-radius:50%;background:' + fill +
        ';box-shadow:0 3px 8px rgba(0,0,0,.28);transition:all .15s;';
    } else if (pinStyle === 'glass') {
      const d = selected ? 40 : 32;
      pin.style.cssText = 'display:block;width:' + d + 'px;height:' + d +
        'px;border:1.5px solid rgba(255,255,255,.7);border-radius:16px;background:' + fill +
        'E6;box-shadow:0 4px 10px rgba(0,0,0,.22);transition:all .15s;';
    } else { // teardrop
      const d = selected ? 38 : 30;
      pin.style.cssText = 'display:block;width:' + d + 'px;height:' + d +
        'px;border:2.5px solid #fff;background:' + fill +
        ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 10px rgba(0,0,0,.24);transition:all .15s;';
      const dot = document.createElement('span');
      dot.style.cssText = 'position:absolute;left:50%;top:42%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(255,255,255,.9);';
      pin.appendChild(dot);
    }
    inner.appendChild(pin);

    // broadcast bubble (above the pin). Capped width with a clean one-line
    // ellipsis: the text child needs `min-width:0` for the ellipsis to engage
    // inside the flex row, and the bubble itself sizes to its content up to the
    // cap, so short updates stay small instead of stretching into a long bar.
    if (m.broadcast && m.broadcast.message) {
      const b = document.createElement('div');
      b.className = 'cc-pin-bubble';
      b.style.cssText = 'position:absolute;left:50%;bottom:100%;margin-bottom:10px;' +
        'transform:translateX(-50%);max-width:188px;width:max-content;display:flex;align-items:center;gap:5px;' +
        'background:#fff;border:1px solid rgba(201,168,76,.3);border-radius:14px 14px 14px 4px;' +
        'padding:5px 9px;box-shadow:0 6px 16px rgba(0,0,0,.16);';
      const dot = document.createElement('span');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#C9A84C;flex:0 0 auto;';
      const txt = document.createElement('span');
      txt.style.cssText = 'flex:0 1 auto;min-width:0;font-size:10px;line-height:1.3;font-weight:600;color:#0A0908;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      txt.textContent = m.broadcast.message;
      b.appendChild(dot); b.appendChild(txt);
      // Dismiss × — only for real (dismissible) bubbles with a handler wired.
      if (m.broadcast.bubbleId && opts.onDismissBubble) {
        const x = document.createElement('button');
        x.textContent = '×';
        x.setAttribute('aria-label', 'Dismiss update');
        x.style.cssText = 'flex:0 0 auto;margin-left:2px;width:15px;height:15px;line-height:13px;' +
          'border:none;border-radius:50%;background:rgba(0,0,0,.06);color:#0A0908;font-size:13px;' +
          'cursor:pointer;padding:0;';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onDismissBubble(m.broadcast.bubbleId, m.id);
        });
        b.appendChild(x);
      }
      inner.appendChild(b);
    }

    // selected title label (below the pin)
    if (selected && m.title) {
      const l = document.createElement('div');
      l.style.cssText = 'position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:8px;' +
        'max-width:200px;background:#fff;border:1px solid rgba(201,168,76,.3);border-radius:999px;padding:3px 9px;' +
        'font-size:10px;font-weight:700;color:#0A0908;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'box-shadow:0 3px 10px rgba(0,0,0,.18);';
      l.textContent = m.title;
      inner.appendChild(l);
    }

    return inner;
  }

  // ── The map component ──────────────────────────────────────────────
  function StylizedMap({ markers, filterCategory, selectedId, onSelect, onDismissBubble }) {
    const { pinStyle } = window.useApp();
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerObjs = useRef(new Map());    // id → maplibre Marker (individual pin)
    const userMovedRef = useRef(false);      // stop auto-framing once the user takes control
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onDismissBubbleRef = useRef(onDismissBubble);
    onDismissBubbleRef.current = onDismissBubble;

    // init the map once
    useEffect(() => {
      if (mapRef.current || !containerRef.current) return;
      if (!window.maplibregl) { console.error('[map] maplibre-gl not loaded'); return; }
      const style = styleUrl();
      if (!style) { console.warn('[map] MAPTILER_KEY missing — set it in config.js'); return; }
      const map = new window.maplibregl.Map({
        container: containerRef.current,
        style,
        center: PRETORIA,
        zoom: 11,
        attributionControl: { compact: true },
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new window.maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
      }), 'bottom-right');
      // Once the user pans/zooms by hand, stop auto-framing the data.
      const onUserMove = (e) => { if (!e || e.originalEvent) userMovedRef.current = true; };
      map.on('dragstart', onUserMove);
      map.on('zoomstart', onUserMove);
      mapRef.current = map;

      // MapLibre sizes its canvas once, from the container's dimensions at
      // construction — it never re-measures on its own. Without this, a map
      // built while the container was phone-sized (or mid-layout, before
      // flex/grid settles) stays cropped to that size even after the window
      // grows to desktop. A ResizeObserver keeps the canvas in sync with
      // whatever the container actually measures, on every layout change.
      let ro = null;
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { if (mapRef.current === map) map.resize(); });
        ro.observe(containerRef.current);
      }

      // ── Default framing: user location FIRST, national data as fallback ──
      // Native shell (Capacitor): route through @capacitor/geolocation so the
      // proper native permission prompt fires (raw navigator.geolocation is
      // unreliable in a WKWebView/Android WebView without it — runbook Step 4).
      // Web: unchanged browser Geolocation API. Either way this only fires once
      // the map itself has mounted (first map view), never at app boot.
      const isNativeMap = !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
      const positionOpts = { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 };
      const onLocated = (coords) => {
        if (mapRef.current !== map || userMovedRef.current) return;
        userMovedRef.current = true;
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 12, duration: 0 });
      };
      if (isNativeMap && window.CapGeolocation) {
        window.CapGeolocation.getCurrentPosition(positionOpts)
          .then((pos) => onLocated(pos.coords))
          .catch(() => { /* denied / unavailable → keep the national fallback */ });
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => onLocated(pos.coords),
          () => { /* denied / unavailable → keep the national fallback */ },
          positionOpts,
        );
      }

      return () => {
        if (ro) ro.disconnect();
        markerObjs.current.forEach((mk) => mk.remove());
        markerObjs.current.clear();
        map.remove();
        mapRef.current = null;
      };
    }, []);

    // (re)render pins whenever inputs change. Visibility is no longer
    // zoom-dependent, so this only needs to run on data/filter/selection/style
    // changes — MapLibre keeps each marker glued to its coordinate on zoom/pan.
    useEffect(() => {
      const mp = mapRef.current;
      if (!mp || !window.maplibregl) return;

      // Resolve coordinates once.
      const items = [];
      markers.forEach((m) => { const c = coordsFor(m); if (c) items.push({ m, coords: c }); });

      // ── individual pins — show them all ──
      const seenPins = new Set();
      items.forEach(({ m, coords }) => {
        seenPins.add(m.id);
        const cat = window.DATA.getCategory(m.category);
        const dim = !!(filterCategory && m.category !== filterCategory && m.type !== 'idea');
        const selected = selectedId === m.id;
        const anchor = pinStyle === 'teardrop' ? 'bottom' : 'center';
        const inner = buildPinInner(m, cat, { selected, pinStyle, onDismissBubble: onDismissBubbleRef.current });
        const existing = markerObjs.current.get(m.id);
        // Reuse the marker (and its MapLibre-owned outer element) whenever the
        // anchor is unchanged — swap ONLY the inner content so the
        // `maplibregl-marker` class + absolute positioning survive. The anchor
        // is fixed at construction, so a pinStyle switch (teardrop↔center)
        // forces a rebuild or the pin would render off its coordinate.
        if (existing && existing._ccAnchor === anchor) {
          const wrap = existing.getElement();
          wrap.style.opacity = dim ? '0.3' : '';
          wrap.replaceChildren(inner);
          existing.setLngLat(coords);
        } else {
          if (existing) existing.remove();
          const wrap = document.createElement('div');
          wrap.style.cssText = 'cursor:pointer;line-height:0;';
          if (dim) wrap.style.opacity = '0.3';
          wrap.appendChild(inner);
          wrap.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelectRef.current && onSelectRef.current(m.id, m.type);
          });
          const mk = new window.maplibregl.Marker({ element: wrap, anchor }).setLngLat(coords).addTo(mp);
          mk._ccAnchor = anchor;
          markerObjs.current.set(m.id, mk);
        }
      });
      // drop markers whose item is gone
      markerObjs.current.forEach((mk, id) => {
        if (!seenPins.has(id)) { mk.remove(); markerObjs.current.delete(id); }
      });

      // National fit-to-data — the FALLBACK when geolocation is denied/unavailable.
      if (!userMovedRef.current && items.length) {
        const b = new window.maplibregl.LngLatBounds(items[0].coords, items[0].coords);
        items.forEach(({ coords }) => b.extend(coords));
        mp.fitBounds(b, { padding: 70, maxZoom: 13, duration: 0 });
      }
    }, [markers, filterCategory, selectedId, pinStyle]);

    return React.createElement('div', { ref: containerRef, className: 'absolute inset-0', style: { background: 'var(--map-bg)' } });
  }

  // Bubbles + selected labels now ride the markers themselves, so the old
  // sibling floaters overlay is a no-op. Kept exported so home.jsx is unchanged.
  function MapFloatersLayer() { return null; }

  // ── LocationPicker — bidirectional address ↔ pin widget ─────────────
  //  Small embedded MapLibre map with a FIXED center pin (Uber/Airbnb-style
  //  drop pin, not a draggable maplibregl.Marker — dragging the map under a
  //  fixed pin is far more robust on touch than marker-drag handling).
  //  · Drag the map → moveend reverse-geocodes the new center into an address.
  //  · Typed address (debounced) → forward-geocodes and flies the map there.
  //  A `lastResolvedRef` guard against the type→geocode→reverse-geocode→
  //  refill loop: we only re-geocode typed text that doesn't already match
  //  the address we ourselves just resolved.
  //  value: { address, lat, lng } — lat/lng may be null (no pin placed yet).
  //  onChange(patch) receives only the field(s) that changed.
  function LocationPicker({ value, onChange, height }) {
    const h = React.createElement;
    const { useRef, useEffect, useState } = React;
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const suppressMoveRef = useRef(false);
    const lastResolvedRef = useRef('');
    const [busy, setBusy] = useState(false); // false | 'geocode' | 'reverse' | 'locate'
    const hasPin = typeof value.lat === 'number' && typeof value.lng === 'number';

    useEffect(() => {
      if (mapRef.current || !containerRef.current || !window.maplibregl) return;
      const style = styleUrl();
      if (!style) return;
      const map = new window.maplibregl.Map({
        container: containerRef.current, style,
        center: hasPin ? [value.lng, value.lat] : PRETORIA,
        zoom: hasPin ? 15 : 11,
        attributionControl: false,
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('moveend', () => {
        if (suppressMoveRef.current) { suppressMoveRef.current = false; return; }
        const c = map.getCenter();
        onChangeRef.current({ lat: c.lat, lng: c.lng });
        setBusy('reverse');
        window.reverseGeocode(c.lat, c.lng).then((addr) => {
          setBusy(false);
          if (addr) { lastResolvedRef.current = addr; onChangeRef.current({ lat: c.lat, lng: c.lng, address: addr }); }
        });
      });
      mapRef.current = map;
      let ro = null;
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { if (mapRef.current === map) map.resize(); });
        ro.observe(containerRef.current);
      }
      return () => { if (ro) ro.disconnect(); map.remove(); mapRef.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // External lat/lng change (typed-address geocode below, or "use my
    // location") flies the map there without re-triggering reverse-geocode.
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !hasPin) return;
      const c = map.getCenter();
      if (Math.abs(c.lat - value.lat) > 0.0002 || Math.abs(c.lng - value.lng) > 0.0002) {
        suppressMoveRef.current = true;
        map.flyTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), 14), duration: 500 });
      }
    }, [value.lat, value.lng]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced forward-geocode while the address text is typed.
    useEffect(() => {
      const addr = (value.address || '').trim();
      if (!addr || addr === lastResolvedRef.current) return;
      const t = setTimeout(() => {
        setBusy('geocode');
        window.geocodeAddress(addr).then((geo) => {
          setBusy(false);
          if (geo) { lastResolvedRef.current = addr; onChangeRef.current({ lat: geo.lat, lng: geo.lng }); }
        });
      }, 800);
      return () => clearTimeout(t);
    }, [value.address]);

    const useMyLocation = () => {
      if (!navigator.geolocation) return;
      setBusy('locate');
      navigator.geolocation.getCurrentPosition(
        (pos) => { setBusy(false); onChangeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => setBusy(false),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
      );
    };

    return h('div', { className: 'rounded-2xl overflow-hidden border border-border relative', style: { height: height || 190 } },
      h('div', { ref: containerRef, className: 'absolute inset-0', style: { background: 'var(--map-bg)' } }),
      !styleUrl() && h('div', { className: 'absolute inset-0 flex items-center justify-center text-center text-[11px] text-muted-foreground bg-accent/30 px-4' }, 'Map unavailable — MapTiler key not configured.'),
      // fixed center pin (the map moves under it, not the other way round)
      h('div', { className: 'absolute left-1/2 top-1/2 pointer-events-none', style: { transform: 'translate(-50%, -100%)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))' } },
        h('svg', { width: 28, height: 36, viewBox: '0 0 30 38' },
          h('path', { d: 'M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z', fill: '#C9A84C' }),
          h('circle', { cx: 15, cy: 15, r: 6, fill: '#fff' }))),
      h('button', {
        type: 'button', onClick: useMyLocation, disabled: busy === 'locate',
        className: 'absolute right-2 top-2 w-8 h-8 rounded-xl bg-white/90 shadow-md border border-border flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60',
        title: 'Use my current location',
      }, busy === 'locate'
        ? h('span', { className: 'w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent spin' })
        : h(window.Icon, { name: 'LocateFixed', size: 15, className: 'text-gold-dark' })),
      (busy === 'geocode' || busy === 'reverse') && h('div', { className: 'absolute left-2 top-2 px-2 py-1 rounded-lg bg-white/90 shadow-sm text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5' },
        h('span', { className: 'w-2.5 h-2.5 rounded-full border-2 border-gold border-t-transparent spin' }),
        busy === 'geocode' ? 'Finding address…' : 'Reading location…'),
      !hasPin && !busy && h('div', { className: 'absolute left-2 bottom-2 px-2 py-1 rounded-lg bg-white/90 shadow-sm text-[10px] font-semibold text-muted-foreground' }, 'Drag the map to drop your pin'));
  }

  window.StylizedMap = StylizedMap;
  window.MapFloatersLayer = MapFloatersLayer;
  window.LocationPicker = LocationPicker;
})();
