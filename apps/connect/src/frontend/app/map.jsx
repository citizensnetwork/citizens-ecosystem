// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — REAL map (MapLibre GL + MapTiler)
//  ------------------------------------------------------------------
//  Phase 2: replaces the decorative SVG prototype with a real geographic
//  map. Keeps the same public interface the home screen consumes:
//    window.StylizedMap({ markers, filterCategory, selectedId, onSelect,
//                         onDismissBubble, onZoomBandChange })
//  (the old no-op MapFloatersLayer export is gone — bubbles and labels have
//   ridden the markers themselves since the pin redesign.)
//  Markers are native MapLibre markers: one floating SVG badge per item,
//  carrying that item's own category glyph in its own category colour, on a
//  shape that encodes the entity type — circle for a Place, rounded rectangle
//  for an Event, ringed circle (or its logo) for a Contributor (+ live pulse +
//  broadcast bubble + selected label). Coordinates use real lat/lng when an
//  item has them; legacy mock items (only mapX/mapY) are projected into a
//  greater-Pretoria bounding box so they still place sensibly during the
//  mock→real data migration.
//
//  Visibility: DENSITY-GATED BY ZOOM (founder ask). A place is a street-level
//  fact and an event is a city-level one, so past a certain distance they stop
//  being useful and start being noise — see ZOOM_GATES below. Contributors are
//  never gated: an organisation is the one thing worth seeing at national
//  scale. There is still no clustering, and gating is pure CSS `display` on
//  markers MapLibre already owns — no marker churn on zoom.
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useRef, useEffect } = React;
  const env = window.__CC_ENV || {};

  // ── Geo frame ──────────────────────────────────────────────────────
  const PRETORIA = [28.2293, -25.7479];           // [lng, lat] — Church Square
  // Greater-Pretoria bbox used only to project legacy % coords (mock items).
  const BBOX = { west: 28.10, east: 28.36, south: -25.86, north: -25.66 };

  // ── Zoom gates ─────────────────────────────────────────────────────
  //  Web-Mercator zoom, calibrated against South Africa on a phone viewport:
  //    z≈5–6   the whole country          ("national")
  //    z≈8–9   one province, e.g. Gauteng ("provincial")
  //    z≈10–11 one metro, e.g. Pretoria
  //    z≈13+   suburb / street
  //  Founder's rule: places drop out at provincial scale, and events drop out
  //  with them at national scale.
  const ZOOM_GATES = { place: 9.5, event: 7.5 };
  //  What the current zoom is showing — reported upward so the map screen can
  //  say WHY pins vanished instead of leaving it a mystery.
  //    'all'          everything with coordinates
  //    'places'       places gated out (provincial)
  //    'contributors' events gated out too (national) — contributors remain
  function zoomBandFor(z) {
    if (z >= ZOOM_GATES.place) return 'all';
    if (z >= ZOOM_GATES.event) return 'places';
    return 'contributors';
  }
  // A pin is hidden only when its own type is gated out. The SELECTED pin is
  // always drawn: its preview panel is open, and a preview pointing at nothing
  // would be worse than one extra marker.
  function markerHidden(type, z, selected) {
    if (selected) return false;
    if (type === 'place') return z < ZOOM_GATES.place;
    if (type === 'event') return z < ZOOM_GATES.event;
    return false;
  }
  // Titles only earn their space once you are close enough to read a
  // neighbourhood; below that they'd overlap into mush. The selected pin keeps
  // its label at every zoom (CSS `.cc-pin-label.is-selected`).
  const ZOOM_LABELS = 12.6;

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

  // Raw-DOM Lucide icon builder — mirrors icons.jsx's <Icon>, but map pins
  // are plain DOM nodes (MapLibre markers), not React, so it can't reuse
  // that component. Reads the same window.lucide UMD data.
  //
  // Shape-tolerant on purpose: lucide's UMD has shipped its icon nodes both
  // as a flat child list ([[tag, attrs], …], the current 1.x form) and as a
  // full element triple (['svg', attrs, children]) in the 0.44x line. Reading
  // only one of those turns every icon into a hard error, so normalise first.
  function lucideChildren(name) {
    const lib = window.lucide && window.lucide.icons;
    let node = lib && lib[name];
    if (!node || !Array.isArray(node)) return null;
    if (typeof node[0] === 'string') node = Array.isArray(node[2]) ? node[2] : [];
    return node.filter((c) => Array.isArray(c) && typeof c[0] === 'string');
  }

  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Inner markup of a lucide glyph, ready to drop inside a <g> of a bigger SVG.
  function lucideInner(name) {
    const kids = lucideChildren(name);
    if (!kids || !kids.length) return '';
    return kids.map(([tag, attrs]) => {
      const a = Object.keys(attrs || {}).map((k) => k + '="' + esc(attrs[k]) + '"').join(' ');
      return '<' + tag + (a ? ' ' + a : '') + '></' + tag + '>';
    }).join('');
  }

  function lucideSvgString(name, opts) {
    const size = (opts && opts.size) || 16;
    const color = (opts && opts.color) || '#fff';
    const inner = lucideInner(name);
    if (!inner) return '';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
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
  // Default glyph per entity type, for the (common) rows that carry no
  // category yet — honest and type-specific rather than a generic drop pin.
  const FALLBACK_ICON = Object.assign(Object.create(null),
    { event: 'CalendarDays', place: 'Landmark', contributor: 'Building2', idea: 'Lightbulb' });
  // Most Contributors have not picked a category yet, but nearly all have a
  // kind — so an uncategorised org still gets a glyph that says something true
  // about it rather than one generic building for the whole directory.
  const KIND_ICON = Object.assign(Object.create(null),
    { ministry: 'Church', organization: 'Building2', business: 'Store' });

  function pinIcon(m, cat) {
    if (m.type === 'idea') return 'Lightbulb';
    if (cat && cat.icon) return cat.icon;
    if (m.type === 'contributor' && KIND_ICON[m.kind]) return KIND_ICON[m.kind];
    return FALLBACK_ICON[m.type] || 'MapPin';
  }

  // One floating SVG badge: the category's own glyph, in the category's own
  // colour, on the shape that says what kind of thing this is —
  //   place       → circle
  //   event       → rounded rectangle with a locating nub
  //   contributor → circle with a second, category-coloured halo ring
  //   idea        → circle (gold)
  // Drawn as a real <svg> (not stacked divs) so the white outline traces the
  // whole silhouette and the drop-shadow follows its alpha — that shadow is
  // what makes it read as floating above the map rather than printed on it.
  function pinSvg({ shape, hex, icon, selected }) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const glyph = lucideInner(icon);
    let w, h, body, gx, gy, gsize;

    if (shape === 'event') {
      // Events read very slightly LARGER than places (founder ask): an event is
      // a moment you can still turn up to, so it should carry marginally more
      // weight than the venue it happens in. 40x32 against a place's 30px
      // circle — noticeable side by side, never shouty.
      w = selected ? 48 : 40;
      h = selected ? 38 : 32;
      const nub = 7, r = 9, cx = w / 2, pad = 2;      // pad leaves room for the stroke
      const W = w + pad * 2, H = h + nub + pad * 2;
      const x0 = pad, y0 = pad, x1 = pad + w, y1 = pad + h, ncx = pad + cx;
      body = '<path d="M' + (x0 + r) + ' ' + y0 + ' H' + (x1 - r) +
        ' A' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + (y0 + r) +
        ' V' + (y1 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x1 - r) + ' ' + y1 +
        ' H' + (ncx + 5) + ' L' + ncx + ' ' + (y1 + nub) + ' L' + (ncx - 5) + ' ' + y1 +
        ' H' + (x0 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + x0 + ' ' + (y1 - r) +
        ' V' + (y0 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x0 + r) + ' ' + y0 + ' Z"' +
        ' fill="' + hex + '" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>';
      gsize = Math.round(h * 0.58);
      gx = pad + cx - gsize / 2;
      gy = pad + h / 2 - gsize / 2;
      w = W; h = H;
    } else {
      // Contributor > event > place, by design: an organisation is a permanent
      // anchor (and the only pin that survives to national zoom), an event is
      // time-bound, a place is the smallest unit.
      const d = shape === 'contributor' ? (selected ? 46 : 38) : (selected ? 38 : 30);
      const pad = shape === 'contributor' ? 3 : 2;
      const W = d + pad * 2, c = pad + d / 2;
      body = '';
      if (shape === 'contributor') {
        // outer halo ring — the one visual difference from a Place circle,
        // so the two never read as the same thing at a glance.
        body += '<circle cx="' + c + '" cy="' + c + '" r="' + (d / 2 + 1.25) + '" fill="none" stroke="' + hex + '" stroke-opacity="0.45" stroke-width="2"/>';
      }
      body += '<circle cx="' + c + '" cy="' + c + '" r="' + (d / 2 - 1.25) + '" fill="' + hex + '" stroke="#ffffff" stroke-width="2.5"/>';
      gsize = Math.round(d * 0.46);
      gx = c - gsize / 2;
      gy = c - gsize / 2;
      w = W; h = W;
    }

    // Stable hook for tests/inspection: which pin shape a marker actually got.
    // Cheap, and it makes "did every entity type render on the map?" assertable
    // instead of eyeballed.
    svg.setAttribute('data-cc-pin', shape);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'display:block;overflow:visible;filter:drop-shadow(0 3px 5px rgba(0,0,0,.32));transition:all .15s;';
    svg.innerHTML = body + (glyph
      ? '<g transform="translate(' + gx + ' ' + gy + ') scale(' + (gsize / 24) + ')" fill="none" stroke="#ffffff"' +
        ' stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + glyph + '</g>'
      : '');
    return svg;
  }

  function buildPinInner(m, cat, opts) {
    const selected = opts.selected;
    const isIdea = m.type === 'idea';
    const fill = isIdea ? '#C9A84C' : (cat ? cat.hex : '#C9A84C');
    const icon = pinIcon(m, cat);

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

    let pin;
    if (m.type === 'contributor' && m.profilePhoto) {
      // The one case a flat SVG can't carry: a Contributor's own logo. Same
      // circular silhouette as the SVG badge, drawn as DOM so the photo keeps
      // its onerror fallback — a broken logo URL degrades to the category
      // glyph rather than leaving a dead image on the map.
      const d = selected ? 46 : 38;
      pin = document.createElement('span');
      pin.setAttribute('data-cc-pin', 'contributor-logo');
      pin.style.cssText = 'display:flex;align-items:center;justify-content:center;width:' + d + 'px;height:' + d +
        'px;border-radius:50%;background:' + fill + ';box-shadow:0 0 0 2px ' + fill + '73, 0 3px 5px rgba(0,0,0,.32);transition:all .15s;';
      const img = document.createElement('img');
      img.src = m.profilePhoto;
      img.alt = '';
      img.style.cssText = 'width:calc(100% - 5px);height:calc(100% - 5px);border-radius:50%;object-fit:cover;display:block;border:2px solid #fff;box-sizing:border-box;';
      img.onerror = () => {
        pin.style.boxShadow = 'none';
        pin.style.background = 'transparent';
        pin.replaceChildren(pinSvg({ shape: 'contributor', hex: fill, icon, selected }));
      };
      pin.appendChild(img);
    } else {
      pin = pinSvg({
        shape: isIdea ? 'idea' : m.type === 'event' ? 'event' : m.type === 'contributor' ? 'contributor' : 'place',
        hex: fill, icon, selected,
      });
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

    // ── title label (below the pin) ──────────────────────────────────
    //  Was a tiny 10px pill in a hard white capsule with a gold border — the
    //  founder's words: "the font is odd, and the white labeling around it is
    //  extremely compact and odd". It is now a bolder, larger, properly-spaced
    //  name FLOATING on a fuzzy white mist: a blurred white blob sits behind
    //  the text (`.cc-pin-label-mist`, an actual `filter: blur()`, not a box)
    //  so the label separates from whatever the basemap is doing underneath
    //  without drawing a border around itself. Styles live in index.html so
    //  the zoom gate can toggle them with one attribute instead of touching
    //  every marker. Labels appear from ZOOM_LABELS up; the selected pin keeps
    //  its own at any zoom.
    if (m.title) {
      const l = document.createElement('div');
      l.className = 'cc-pin-label' + (selected ? ' is-selected' : '');
      const mist = document.createElement('span');
      mist.className = 'cc-pin-label-mist';
      const txt = document.createElement('span');
      txt.className = 'cc-pin-label-text';
      txt.textContent = m.title;
      l.appendChild(mist);
      l.appendChild(txt);
      inner.appendChild(l);
    }

    return inner;
  }

  // ── The map component ──────────────────────────────────────────────
  function StylizedMap({ markers, filterCategory, selectedId, onSelect, onDismissBubble, onZoomBandChange }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerObjs = useRef(new Map());    // id → maplibre Marker (individual pin)
    const userMovedRef = useRef(false);      // stop auto-framing once the user takes control
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onDismissBubbleRef = useRef(onDismissBubble);
    onDismissBubbleRef.current = onDismissBubble;
    const onZoomBandChangeRef = useRef(onZoomBandChange);
    onZoomBandChangeRef.current = onZoomBandChange;
    const bandRef = useRef('all');           // last band reported upward
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;

    // Applies the zoom gates to markers already on the map. Runs on every zoom
    // frame, so it does nothing but flip a `display` (and one attribute for the
    // labels) — no marker is created, destroyed or re-anchored by zooming, and
    // the parent is only re-rendered when the BAND changes, not per frame.
    const applyZoomGates = React.useCallback(() => {
      const mp = mapRef.current;
      if (!mp) return;
      const z = mp.getZoom();
      const el = containerRef.current;
      if (el) el.setAttribute('data-cc-labels', z >= ZOOM_LABELS ? '1' : '0');
      markerObjs.current.forEach((mk) => {
        const w = mk.getElement();
        if (!w) return;
        const hidden = markerHidden(mk._ccType, z, selectedRef.current === mk._ccId);
        w.style.display = hidden ? 'none' : '';
      });
      const band = zoomBandFor(z);
      if (band !== bandRef.current) {
        bandRef.current = band;
        if (onZoomBandChangeRef.current) onZoomBandChangeRef.current(band);
      }
    }, []);

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
      // Density gates follow the zoom, including the programmatic flyTo /
      // fitBounds below, so the first frame is already correct.
      map.on('zoom', applyZoomGates);
      map.on('load', applyZoomGates);
      applyZoomGates();

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
        map.off('zoom', applyZoomGates);
        map.off('load', applyZoomGates);
        markerObjs.current.forEach((mk) => mk.remove());
        markerObjs.current.clear();
        map.remove();
        mapRef.current = null;
      };
    }, [applyZoomGates]);

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
        // Event badges carry a locating nub, so they hang from their point
        // ('bottom'); every other pin is a symmetric badge centred on it.
        const anchor = m.type === 'event' ? 'bottom' : 'center';
        const inner = buildPinInner(m, cat, { selected, onDismissBubble: onDismissBubbleRef.current });
        const existing = markerObjs.current.get(m.id);
        // Reuse the marker (and its MapLibre-owned outer element) whenever the
        // anchor is unchanged — swap ONLY the inner content so the
        // `maplibregl-marker` class + absolute positioning survive. The anchor
        // is fixed at construction, so an anchor change forces a rebuild or
        // the pin would render off its coordinate.
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
        const mk = markerObjs.current.get(m.id);
        // Remembered on the Marker (not read back out of the DOM) so the
        // per-zoom-frame gate is a plain property read.
        if (mk) { mk._ccType = m.type; mk._ccId = m.id; }
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
      // New/rebuilt markers start un-gated; bring them in line with the zoom
      // they were actually added at.
      applyZoomGates();
    }, [markers, filterCategory, selectedId, applyZoomGates]);

    return React.createElement('div', {
      ref: containerRef, className: 'absolute inset-0 cc-map',
      style: { background: 'var(--map-bg)' },
    });
  }

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

  // Exported so tests (and any future surface) assert against the SAME
  // thresholds the map enforces, instead of re-declaring them.
  window.MAP_ZOOM = { GATES: ZOOM_GATES, LABELS: ZOOM_LABELS, bandFor: zoomBandFor, hidden: markerHidden };
  window.StylizedMap = StylizedMap;
  window.LocationPicker = LocationPicker;
})();
