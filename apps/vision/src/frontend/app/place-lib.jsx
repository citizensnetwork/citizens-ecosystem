// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — "Place" helpers for the Log-an-activity form
//  (pure; window.CV_PLACE)
//  ------------------------------------------------------------------
//  Everything the optional Place field needs that is NOT drawing: cleaning
//  what a person typed, reading a pasted coordinate pair, building the
//  MapTiler geocoding URLs, turning their answers into a short result list,
//  and turning the chosen place into the three fields POST /api/activities
//  already accepts (latitude, longitude, location_name). Pure (no DOM, no
//  fetch, no React) so a unit test can run it directly — see
//  src/__tests__/frontend/placeLib.test.ts.
//
//  A coordinate is only ever sent when it passes the Timeline Map's own rule
//  (window.CV_TIMELINE.validCoord: a real number pair in range, never 0,0
//  "null island"). A place without one is saved as a plain name: it shows in
//  the list but is not plotted, and the screen says so.
//
//  A "place" here is { name, lat, lng } — name text, lat/lng numbers or null.
// ════════════════════════════════════════════════════════════════════
(() => {
  const NAME_MAX = 300; // vision.activities.location_name / createActivitySchema max
  const MIN_QUERY = 3; // characters before we spend a geocoding request
  const MAX_RESULTS = 5;
  const GEOCODING = "https://api.maptiler.com/geocoding/";
  // Pretoria — the Timeline Map's default centre. Search results are BIASED
  // toward it (a nudge, not a filter), so a hall in Mamelodi ranks above one in
  // Georgia while a church in Nairobi can still be found.
  const HOME = { lat: -25.75, lng: 28.19 };

  const TL = () => window.CV_TIMELINE; // read lazily: timeline-lib.jsx loads first, but never assume
  const validCoord = (lat, lng) => TL().validCoord(lat, lng);

  function cleanName(s) {
    let out = String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    // Don't leave half of an emoji at the cut: the API would refuse a lone surrogate.
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
    return out;
  }

  const round6 = (n) => Math.round(n * 1e6) / 1e6; // about 0.1 m
  const isNum = (n) => typeof n === "number" && Number.isFinite(n);

  function coordLabel(lat, lng) {
    return Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5);
  }

  // "-25.7461, 28.1881" (latitude first, as map apps copy it) → { lat, lng }.
  // Anything that is not exactly two numbers, or is not a real place, is null.
  const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
  function parseCoordPair(q) {
    const m = COORD_RE.exec(String(q == null ? "" : q));
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return validCoord(lat, lng) ? { lat, lng } : null;
  }

  // The forward-search URL, or null when there is nothing worth asking:
  // no usable key, fewer than MIN_QUERY characters, or a coordinate pair
  // (MapTiler reads a bare pair as longitude,latitude and would answer the
  // wrong end of the planet — parseCoordPair handles those locally).
  function searchUrl(env, q) {
    const text = cleanName(q);
    if (text.length < MIN_QUERY || parseCoordPair(text) || !TL().hasKey(env)) return null;
    return (
      GEOCODING + encodeURIComponent(text) + ".json?key=" + encodeURIComponent(env.MAPTILER_KEY) +
      "&limit=" + MAX_RESULTS + "&language=en&proximity=" + HOME.lng + "," + HOME.lat
    );
  }

  // The reverse URL (a dropped pin → a name), or null without a key or a real spot.
  function reverseUrl(env, lat, lng) {
    if (!TL().hasKey(env) || !validCoord(lat, lng)) return null;
    return (
      GEOCODING + round6(Number(lng)) + "," + round6(Number(lat)) + ".json?key=" +
      encodeURIComponent(env.MAPTILER_KEY) + "&limit=1&language=en"
    );
  }

  // MapTiler's GeoJSON → at most MAX_RESULTS { id, label, lat, lng }. A result
  // with no usable centre is dropped (never plotted at a made-up spot), and two
  // results that read the same are one choice.
  function parseResults(json) {
    const feats = json && Array.isArray(json.features) ? json.features : [];
    const out = [];
    const seen = new Set();
    feats.forEach((f) => {
      const c = f && f.center;
      if (!Array.isArray(c) || !isNum(c[0]) || !isNum(c[1]) || !validCoord(c[1], c[0])) return;
      const label = cleanName((f.place_name || f.text) ?? "");
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: String(f.id || label), label, lat: c[1], lng: c[0] });
    });
    return out.slice(0, MAX_RESULTS);
  }

  // A reverse-geocode answer → the best (first) name, or "".
  function parseReverse(json) {
    const f = json && Array.isArray(json.features) ? json.features[0] : null;
    return f ? cleanName((f.place_name || f.text) ?? "") : "";
  }

  const EMPTY = Object.freeze({ name: "", lat: null, lng: null });

  // Whatever the form holds → a clean { name, lat, lng }, or null for "no place".
  // Coordinates are kept only as a valid pair (rounded to ~0.1 m); a pin with no
  // name is named by its coordinates so the list never shows a blank place.
  function normalise(place) {
    if (!place) return null;
    const hasPin = validCoord(place.lat, place.lng);
    let name = cleanName(place.name);
    if (!hasPin && !name) return null;
    if (hasPin && !name) name = cleanName("Pin at " + coordLabel(place.lat, place.lng));
    return hasPin
      ? { name, lat: round6(Number(place.lat)), lng: round6(Number(place.lng)) }
      : { name, lat: null, lng: null };
  }

  // 'empty' | 'text' (a name only) | 'pinned' (a name and a real spot).
  function kind(place) {
    const p = normalise(place);
    if (!p) return "empty";
    return p.lat === null ? "text" : "pinned";
  }

  // The fields to spread into the POST body — none at all for "no place", so
  // logging an activity without one is byte-for-byte what it was before.
  function toPayload(place) {
    const p = normalise(place);
    if (!p) return {};
    if (p.lat === null) return { location_name: p.name };
    return { latitude: p.lat, longitude: p.lng, location_name: p.name };
  }

  // A saved activity row → what the list shows: the name, and whether the
  // Timeline Map can plot it (the same test the map applies to every row).
  function rowPlace(row) {
    const name = cleanName(row && row.location_name);
    return { name, onMap: !!row && validCoord(row.latitude, row.longitude) };
  }

  // A just-logged demo activity in the shape GET /api/map/activities returns, so
  // the demo's Timeline Map can show it without a network. No participant count
  // is invented: the demo logs none, so the ring stays the smallest size.
  function demoMapRow(id, title, type, date, place) {
    const p = normalise(place);
    if (!p || p.lat === null) return null;
    return {
      id, title, type, date,
      latitude: p.lat, longitude: p.lng, location_name: p.name,
      participant_count: 0, department_name: "",
    };
  }

  window.CV_PLACE = {
    NAME_MAX, MIN_QUERY, MAX_RESULTS, HOME, EMPTY,
    cleanName, coordLabel, parseCoordPair, searchUrl, reverseUrl, parseResults, parseReverse,
    normalise, kind, toPayload, rowPlace, demoMapRow,
  };
})();
