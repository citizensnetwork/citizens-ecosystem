// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — Timeline Map helpers (pure; window.CV_TIMELINE)
//  ------------------------------------------------------------------
//  Everything the Timeline Map needs that is NOT drawing: turning API rows
//  into map points, the playback window arithmetic, the summary line, ring
//  sizes, and the base-map style choice. Kept pure (no DOM, no MapLibre,
//  no React) so a unit test can run it directly — see
//  src/__tests__/frontend/timelineLib.test.ts.
//
//  Dates are whole UTC days (YYYY-MM-DD → days since 1970-01-01), so a
//  playback cursor is an integer and "the last 30 days up to the cursor" is
//  plain arithmetic with no timezone drift.
// ════════════════════════════════════════════════════════════════════
(() => {
  const DAY_MS = 86400000;

  // 'YYYY-MM-DD…' → whole days since the epoch, or null for anything that is
  // not a real calendar date (2026-02-31 rolls over in Date.UTC, so reject it).
  function dayNumber(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? "" : iso));
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const t = Date.UTC(y, mo - 1, d);
    if (Number.isNaN(t)) return null;
    const back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return Math.floor(t / DAY_MS);
  }

  function isoFromDay(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }

  // Activities come from user-entered rows: never trust a coordinate. 0,0 is
  // "null island" — a default that means "not set", never a real venue.
  function validCoord(lat, lng) {
    const a = Number(lat);
    const o = Number(lng);
    if (lat === null || lng === null || lat === undefined || lng === undefined) return false;
    if (!Number.isFinite(a) || !Number.isFinite(o)) return false;
    if (a < -90 || a > 90 || o < -180 || o > 180) return false;
    return !(a === 0 && o === 0);
  }

  // /api/map/activities rows → the points the map draws. Rows without a real
  // date or a real coordinate are dropped (never plotted at a made-up place).
  function toPoints(rows) {
    const out = [];
    (rows || []).forEach((r) => {
      if (!r || !validCoord(r.latitude, r.longitude)) return;
      const t = dayNumber(r.date);
      if (t === null) return;
      const people = Number(r.participant_count);
      out.push({
        id: String(r.id),
        title: String(r.title || "Untitled activity"),
        type: String(r.type || "other"),
        date: String(r.date).slice(0, 10),
        t,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        people: Number.isFinite(people) && people > 0 ? Math.round(people) : 0,
        place: r.location_name ? String(r.location_name) : "",
        dept: r.department_name ? String(r.department_name) : "",
      });
    });
    return out;
  }

  // GeoJSON the map layers read. `t` is the day number the layers filter on.
  function featureCollection(points) {
    return {
      type: "FeatureCollection",
      features: (points || []).map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { id: p.id, t: p.t, people: p.people, type: p.type },
      })),
    };
  }

  function extent(points) {
    if (!points || points.length === 0) return null;
    let min = points[0].t;
    let max = points[0].t;
    points.forEach((p) => {
      if (p.t < min) min = p.t;
      if (p.t > max) max = p.t;
    });
    return { min, max };
  }

  // [[west, south], [east, north]] for fitBounds; null when there is nothing.
  function bounds(points) {
    if (!points || points.length === 0) return null;
    let w = 180;
    let s = 90;
    let e = -180;
    let n = -90;
    points.forEach((p) => {
      if (p.lng < w) w = p.lng;
      if (p.lng > e) e = p.lng;
      if (p.lat < s) s = p.lat;
      if (p.lat > n) n = p.lat;
    });
    return [[w, s], [e, n]];
  }

  const SPANS = [7, 30, 90, 365];

  // The playback window: the `span` days ending on `cursor` (inclusive).
  function windowAt(cursor, span) {
    const s = Math.max(1, Math.floor(span));
    return { from: cursor - s + 1, to: cursor, span: s };
  }

  // The window of the same length immediately before `win`.
  function previousWindow(win) {
    return { from: win.from - win.span, to: win.from - 1, span: win.span };
  }

  // Counts for one window, honouring the type filter (empty set = all types).
  function summarise(points, win, types) {
    let count = 0;
    let people = 0;
    (points || []).forEach((p) => {
      if (p.t < win.from || p.t > win.to) return;
      if (types && types.size > 0 && !types.has(p.type)) return;
      count += 1;
      people += p.people;
    });
    return { count, people };
  }

  // Pixel radii. The ring encodes "how many people this activity reached" as
  // SIZE, not as distance on the ground, so the label in the UI says so.
  // radius = base + min(cap, sqrt(people) * k); the same constants feed both the
  // plain function (tests, the selected card) and the MapLibre expression, so the
  // two cannot drift apart.
  const DOT = { base: 5, cap: 9, k: 0.9 };
  const RING = { base: 14, cap: 34, k: 2.4 };
  function radius(c, people) {
    return c.base + Math.min(c.cap, Math.sqrt(Math.max(0, people)) * c.k);
  }
  function radiusExpr(c) {
    return ["+", c.base, ["min", c.cap, ["*", c.k, ["sqrt", ["max", 0, ["get", "people"]]]]]];
  }
  const dotRadius = (people) => radius(DOT, people);
  const ringRadius = (people) => radius(RING, people);
  const dotRadiusExpr = () => radiusExpr(DOT);
  const ringRadiusExpr = () => radiusExpr(RING);

  // MapLibre filter for "in this window, of these types" (empty set = all types).
  function windowFilter(win, types) {
    const f = ["all", [">=", ["get", "t"], win.from], ["<=", ["get", "t"], win.to]];
    if (types && types.size > 0) f.push(["in", ["get", "type"], ["literal", Array.from(types)]]);
    return f;
  }
  // A filter that matches nothing, for a layer that is switched off.
  const NOTHING = ["==", ["get", "t"], -1e9];

  // How far a playback tick moves the cursor: about a quarter of the window,
  // so a 30-day window advances a week at a time.
  function playStep(span) {
    return Math.max(1, Math.ceil(span / 4));
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  // The one sentence under the map: counts beside people, never a bare percent.
  function summaryLine(cur, prev, compare) {
    const base =
      cur.count + " " + plural(cur.count, "activity", "activities") + " · " + cur.people + " " + plural(cur.people, "person", "people") + " reached";
    if (!compare || !prev) return base;
    const diff = cur.people - prev.people;
    if (prev.count === 0 && cur.count === 0) return base;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
    return base + " · " + sign + Math.abs(diff) + " vs the " + "previous window (" + prev.people + " " + plural(prev.people, "person", "people") + ")";
  }

  // ── Base map ───────────────────────────────────────────────────────
  // A MapTiler style needs a key that works for THIS origin (the key is
  // restricted by HTTP origin). When there is no key — or MapTiler refuses it —
  // the map still draws the activity points on a plain ground in the canon
  // surface colour instead of failing: the Kingdom activity is the content, the tiles are context.
  // MapLibre paint cannot read CSS variables. These fallbacks are the Map v2
  // canon hexes (map-v2.css); the live page reads the same tokens off :root
  // so Light and Noir stay in step with the stylesheet.
  function tokenColour(name) {
    if (typeof document === "undefined" || !document.documentElement) return "";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function mapPaint() {
    const read = (name, fallback) => tokenColour(name) || fallback;
    return {
      accent: read("--accent", "#c9a84c"),
      text: read("--text-1", "#0a0908"),
      muted: read("--text-2", "#5c5444"),
      paper: read("--logo-bg", "#ffffff"),
      ground: read("--surface-0", "#f7f4ee"),
    };
  }

  function blankStyle() {
    return {
      version: 8,
      sources: {},
      layers: [{ id: "cv-ground", type: "background", paint: { "background-color": mapPaint().ground } }],
    };
  }

  const BLANK_STYLE = blankStyle();

  function isDarkTheme(theme) {
    return theme === "dark" || theme === "noir";
  }

  function hasKey(env) {
    const k = env && env.MAPTILER_KEY;
    return !!k && String(k).indexOf("REPLACE_WITH") !== 0;
  }

  function styleUrl(env, theme) {
    if (!hasKey(env)) return null;
    const name = isDarkTheme(theme) ? "dataviz-dark" : "dataviz";
    return "https://api.maptiler.com/maps/" + name + "/style.json?key=" + encodeURIComponent(env.MAPTILER_KEY);
  }

  // MapLibre reports a refused/failed request as an error event with a status;
  // 401 and 403 mean "this key is not allowed here", the case we fall back on.
  function isKeyRefusal(err) {
    const status = err && (err.status || (err.error && err.error.status));
    return status === 401 || status === 403;
  }

  window.CV_TIMELINE = {
    DAY_MS, SPANS,
    dayNumber, isoFromDay, validCoord, toPoints, featureCollection, extent, bounds,
    windowAt, previousWindow, summarise, dotRadius, ringRadius, dotRadiusExpr, ringRadiusExpr,
    windowFilter, NOTHING, playStep, summaryLine,
    BLANK_STYLE, blankStyle, mapPaint, tokenColour, isDarkTheme, hasKey, styleUrl, isKeyRefusal,
  };
})();
