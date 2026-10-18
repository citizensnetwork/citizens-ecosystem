// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — "Place" helpers for the Log-an-activity form
//  (pure; window.CV_PLACE)
//  ------------------------------------------------------------------
//  Everything the optional Place field needs that is NOT drawing: cleaning
//  what a person typed, reading a pasted coordinate pair, building the
//  MapTiler geocoding URLs, turning their answers into a short result list,
//  and turning the chosen place into the three fields POST /api/activities
//  already accepts (latitude, longitude, location_name), and the same place
//  into a PATCH that can also clear it (V7: add, change or remove the place of
//  an activity that is already logged). Pure (no DOM, no React; the one network
//  call, savePlace, takes its fetch as an argument) so a unit test can run it
//  directly — see src/__tests__/frontend/placeLib.test.ts.
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

  // The fields to send in a PATCH. Unlike a create, an edit has to be able to
  // CLEAR: an omitted field means "leave it as it is", so the three place columns
  // are always named, and `null` (what PATCH /api/activities/:id reads as "empty
  // this column") fills whatever the place does not have. A place with no spot
  // takes the activity off the Timeline Map but keeps its name; no place at all
  // clears all three.
  function toPatch(place) {
    return { latitude: null, longitude: null, location_name: null, ...toPayload(place) };
  }

  // Do two places say the same thing once cleaned (name, spot, rounding)? Two
  // "no place" values are the same.
  function samePlace(a, b) {
    const x = normalise(a);
    const y = normalise(b);
    if (!x || !y) return x === y;
    return x.name === y.name && x.lat === y.lat && x.lng === y.lng;
  }

  // A saved activity row → the place as the editor holds it ({ name, lat, lng }).
  // The spot is kept only if the Timeline Map would plot it, and a spot saved
  // without a name is named by its coordinates, as the Log form would have done.
  function fromRow(row) {
    const spot = !!row && validCoord(row.latitude, row.longitude);
    return (
      normalise({
        name: row && row.location_name,
        lat: spot ? row.latitude : null,
        lng: spot ? row.longitude : null,
      }) || EMPTY
    );
  }

  // A place → the fields of a row in the Activities list: the name shown under
  // the title, whether the Timeline Map can plot it, and the spot (so the next
  // edit starts where this one ended).
  function fieldsOfPlace(place) {
    const p = normalise(place) || EMPTY;
    return { place: p.name, onMap: p.lat !== null, lat: p.lat, lng: p.lng };
  }

  // A saved activity row (GET / PATCH /api/activities) → those same fields.
  function rowFields(row) {
    return fieldsOfPlace(fromRow(row));
  }

  // The message for a place that could not be saved, by HTTP status (0 = the
  // request never got an answer). Every one says what to do next.
  function failureMessage(status) {
    if (status === 0) return "Could not save the place. Check your connection and try again.";
    if (status === 400) return "Could not save the place. Check it, or remove it and try again.";
    if (status === 401) return "Your session has ended. Sign in again to save the place.";
    if (status === 403 || status === 404) {
      return "Could not save the place. The activity may have been removed, or you may not be allowed to change it (the person who logged it and organisation admins can).";
    }
    return "Could not save the place. Try again in a moment.";
  }

  // Save one activity's place: PATCH it, then trust the ANSWER over our own
  // intent. Resolves { ok: true, fields } with the row fields the server now
  // holds, or { ok: false, message }. A 200 whose echo does not match what we
  // sent counts as a failure: a server that quietly changed nothing must never
  // leave the list claiming the activity is on the map.
  async function savePlace(authFetch, id, place) {
    let res;
    try {
      res = await authFetch("/api/activities/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(toPatch(place)),
      });
    } catch (e) {
      return { ok: false, status: 0, message: failureMessage(0) };
    }
    if (!res.ok) return { ok: false, status: res.status, message: failureMessage(res.status) };
    let row = null;
    try {
      const json = await res.json();
      row = json && json.data ? json.data : null;
    } catch (e) { /* saved, but no echo to check: the sent place stands */ }
    if (row && !samePlace(fromRow(row), place)) {
      return { ok: false, status: res.status, message: "The place was not saved. Try again, or ask an organisation admin." };
    }
    return { ok: true, fields: row ? rowFields(row) : fieldsOfPlace(place) };
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

  // Move keyboard focus once the key press that caused it has finished. Focusing
  // inside a keydown handler makes Chrome deliver that same press's keypress to
  // the NEW element, and Enter on a button is a click: pressing Enter to save a
  // place closed the editor, focused "Change place" and so opened it again.
  // `find()` returns the element to focus (or nothing); returns a cancel function.
  function focusSoon(find) {
    const t = setTimeout(() => {
      const el = find();
      if (el && typeof el.focus === "function") el.focus();
    }, 0);
    return () => clearTimeout(t);
  }

  // Keep the demo's Timeline Map list (D.mapActivities, the array the map reads)
  // in step with a place that was added, changed or cleared. `key` is the map
  // row's id, `meta` is { title, type, date } for a row that has to be created.
  // A cleared spot does what the database does: the row stays, with no position,
  // and the map skips it. So its reach and department survive a later re-add.
  // Mutates and returns `list`.
  function syncDemoMap(list, key, meta, place) {
    const p = normalise(place);
    const i = list.findIndex((m) => m.id === key);
    if (!p || p.lat === null) {
      if (i >= 0) {
        list[i] = { ...list[i], latitude: null, longitude: null, location_name: p ? p.name : null };
      }
      return list;
    }
    if (i >= 0) {
      list[i] = { ...list[i], latitude: p.lat, longitude: p.lng, location_name: p.name };
    } else {
      const row = demoMapRow(key, meta.title, meta.type || "other", meta.date, p);
      if (row) list.unshift(row);
    }
    return list;
  }

  window.CV_PLACE = {
    NAME_MAX, MIN_QUERY, MAX_RESULTS, HOME, EMPTY,
    cleanName, coordLabel, parseCoordPair, searchUrl, reverseUrl, parseResults, parseReverse,
    normalise, kind, toPayload, toPatch, samePlace, fromRow, fieldsOfPlace, rowFields,
    failureMessage, savePlace, focusSoon, demoMapRow, syncDemoMap,
  };
})();
