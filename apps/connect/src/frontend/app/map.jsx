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
//  Date-based zoom layering: items are sorted by event-date proximity
//  (closest future first, then recent past last) and split into 5 equal
//  groups assigned minZoom 9–13. At zoom ≥ 13 all items are visible.
//  Live events, active broadcasts, and the selected pin are always visible.
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

  // ── DOM pin builder (mirrors the prototype's teardrop / dot / glass) ──
  function buildPin(m, cat, opts) {
    const selected = opts.selected, pinStyle = opts.pinStyle;
    const isIdea = m.type === 'idea';
    const fill = isIdea ? '#C9A84C' : (cat ? cat.hex : '#C9A84C');

    // Outer element handed to MapLibre. It must NOT set `position` — MapLibre's
    // `.maplibregl-marker { position:absolute }` rule anchors the pin to its
    // lng/lat via a transform. An inline `position:relative` here would override
    // that rule and the pin would drift on zoom/pan instead of staying glued.
    // All decoration is positioned relative to `inner` instead.
    const wrap = document.createElement('div');
    wrap.style.cssText = 'cursor:pointer;line-height:0;';
    if (opts.dim) wrap.style.opacity = '0.3';

    const inner = document.createElement('div');
    inner.style.cssText = 'position:relative;line-height:0;';
    wrap.appendChild(inner);

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

    // broadcast bubble (above the pin)
    if (m.broadcast && m.broadcast.message) {
      const b = document.createElement('div');
      b.className = 'cc-pin-bubble';
      b.style.cssText = 'position:absolute;left:50%;bottom:100%;margin-bottom:10px;' +
        'transform:translateX(-50%);max-width:170px;display:flex;align-items:center;gap:4px;' +
        'background:#fff;border:1px solid rgba(201,168,76,.3);border-radius:14px 14px 14px 4px;' +
        'padding:4px 8px;box-shadow:0 6px 16px rgba(0,0,0,.16);white-space:nowrap;overflow:hidden;';
      const dot = document.createElement('span');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#C9A84C;flex:0 0 auto;';
      const txt = document.createElement('span');
      txt.style.cssText = 'font-size:9px;font-weight:600;color:#0A0908;overflow:hidden;text-overflow:ellipsis;';
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
        'background:#fff;border:1px solid rgba(201,168,76,.3);border-radius:999px;padding:3px 9px;' +
        'font-size:10px;font-weight:700;color:#0A0908;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.18);';
      l.textContent = m.title;
      inner.appendChild(l);
    }

    return wrap;
  }

  // ── Date-based zoom layering ────────────────────────────────────────
  //  Items sorted by event-date proximity: future events closest to now
  //  come first; past events ordered most-recent first; undated items last.
  //  Divided into 5 equal groups → minZoom 9 (widest) through 13 (closest).
  //  At zoom ≥ 13 everything is visible. Live/broadcast/selected bypass the
  //  filter entirely (VISION: make the unseen seen — don't bury what's live).
  const LAYER_MIN = 9;
  const LAYER_MAX = 13;
  const LAYER_COUNT = LAYER_MAX - LAYER_MIN + 1;  // 5 groups

  function assignLayerZooms(items) {
    if (!items.length) return new Map();
    const now = Date.now();
    const sorted = [...items].sort((a, b) => {
      const da = a.m.date ? new Date(a.m.date).getTime() : null;
      const db = b.m.date ? new Date(b.m.date).getTime() : null;
      if (da === null && db === null) return 0;
      if (da === null) return 1;   // undated items sink to the back
      if (db === null) return -1;
      const futureA = da >= now;
      const futureB = db >= now;
      if (futureA !== futureB) return futureA ? -1 : 1;  // future before past
      return futureA ? da - db : db - da;  // future: sooner first; past: more-recent first
    });
    const groupSize = Math.max(1, Math.ceil(sorted.length / LAYER_COUNT));
    const result = new Map();
    sorted.forEach((it, i) => {
      const group = Math.min(Math.floor(i / groupSize), LAYER_COUNT - 1);
      result.set(it.m.id, LAYER_MIN + group);
    });
    return result;
  }

  // ── The map component ──────────────────────────────────────────────
  function StylizedMap({ markers, filterCategory, selectedId, onSelect, onDismissBubble }) {
    const { pinStyle } = window.useApp();
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerObjs = useRef(new Map());    // id → maplibre Marker (individual pin)
    const layerZoomMap = useRef(new Map());  // id → minZoom (9–13) assigned by date proximity
    const userMovedRef = useRef(false);      // stop auto-framing once the user takes control
    const renderRef = useRef(() => {});      // latest render fn, so moveend can re-layer
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
      // Re-render after any pan/zoom settles — date layering is zoom-dependent,
      // so visibility changes as the user zooms in or out.
      map.on('moveend', () => renderRef.current());
      mapRef.current = map;

      // ── Default framing: user location FIRST, national data as fallback ──
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (mapRef.current !== map || userMovedRef.current) return;
            userMovedRef.current = true;
            map.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 12,
              duration: 0,
            });
          },
          () => { /* denied / unavailable → keep the national fallback */ },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
        );
      }

      return () => { map.remove(); mapRef.current = null; };
    }, []);

    // (re)render pins whenever inputs change
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !window.maplibregl) return;

      // Resolve coords once and compute date-layer assignments whenever markers change.
      const items = [];
      markers.forEach((m) => { const c = coordsFor(m); if (c) items.push({ m, coords: c }); });
      layerZoomMap.current = assignLayerZooms(items);

      const renderMarkers = () => {
        const mp = mapRef.current;
        if (!mp || !window.maplibregl) return;
        const currentZoom = mp.getZoom();

        // Filter: always-visible items (live, broadcast, selected) plus items
        // whose date-group minZoom is at or below the current zoom level.
        const pinItems = [];
        items.forEach((it) => {
          const m = it.m;
          const always = selectedId === m.id || m.isLive || (m.broadcast && m.broadcast.message);
          if (always || currentZoom >= (layerZoomMap.current.get(m.id) || LAYER_MIN)) {
            pinItems.push(it);
          }
        });

        // ── individual pins ──
        const seenPins = new Set();
        pinItems.forEach(({ m, coords }) => {
          seenPins.add(m.id);
          const cat = window.DATA.getCategory(m.category);
          const dim = !!(filterCategory && m.category !== filterCategory && m.type !== 'idea');
          const selected = selectedId === m.id;
          const el = buildPin(m, cat, { selected, dim, pinStyle, onDismissBubble: onDismissBubbleRef.current });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelectRef.current && onSelectRef.current(m.id, m.type);
          });
          const anchor = pinStyle === 'teardrop' ? 'bottom' : 'center';
          const existing = markerObjs.current.get(m.id);
          // Reuse the marker only while its anchor is unchanged; the anchor is
          // fixed at construction, so a pinStyle switch (teardrop↔center) must
          // rebuild the marker or it would render off its coordinate.
          if (existing && existing._ccAnchor === anchor) {
            existing.getElement().replaceWith(el);
            existing._element = el;                 // keep ref in sync
            existing.setLngLat(coords);
          } else {
            if (existing) existing.remove();
            const mk = new window.maplibregl.Marker({ element: el, anchor }).setLngLat(coords).addTo(mp);
            mk._ccAnchor = anchor;
            markerObjs.current.set(m.id, mk);
          }
        });
        markerObjs.current.forEach((mk, id) => {
          if (!seenPins.has(id)) { mk.remove(); markerObjs.current.delete(id); }
        });
      };

      renderRef.current = renderMarkers;
      renderMarkers();

      // National fit-to-data — the FALLBACK when geolocation is denied/unavailable.
      if (!userMovedRef.current) {
        const coordsList = markers.map(coordsFor).filter(Boolean);
        if (coordsList.length) {
          const b = new window.maplibregl.LngLatBounds(coordsList[0], coordsList[0]);
          coordsList.forEach((c) => b.extend(c));
          map.fitBounds(b, { padding: 70, maxZoom: 13, duration: 0 });
        }
      }
    }, [markers, filterCategory, selectedId, pinStyle]);

    return React.createElement('div', { ref: containerRef, className: 'absolute inset-0', style: { background: 'var(--map-bg)' } });
  }

  // Bubbles + selected labels now ride the markers themselves, so the old
  // sibling floaters overlay is a no-op. Kept exported so home.jsx is unchanged.
  function MapFloatersLayer() { return null; }

  window.StylizedMap = StylizedMap;
  window.MapFloatersLayer = MapFloatersLayer;
})();
