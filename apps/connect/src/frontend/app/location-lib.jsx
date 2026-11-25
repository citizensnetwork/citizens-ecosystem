// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — where a listing really is (QA 2026-11-25, CCQA-0009): the logic, with no React in it.
//  ------------------------------------------------------------------
//  An event's pin used to be the FIRST geocoder hit for its free text, with no check at all. One published event that named a
//  Pretoria venue got a pin 522 km away, near Durban, and its Directions sent people there. This file keeps three promises:
//    1. A typed address is only placed on its own when the hit is close to the city the text names (or to the place the
//       person is looking at). Otherwise the answer is "confirm": the form shows the best guess and the owner says yes or
//       moves the pin. Nothing far away is ever accepted silently.
//    2. A pin that is far from the city its own address names is called doubtful, wherever it came from (old rows too).
//    3. Directions never send anyone to a doubtful pin: they hand the address text to the maps provider instead, whose own
//       geocoder then decides. No pin and no text means no Directions.
//  The geocoder is MapTiler's (the key is the one the basemap already uses). Requests carry the typed text only.
//
//  Public surface: window.CCLocation = { CITIES, SA_BOUNDS, FAR_KM, NEAR_KM, MIN_RELEVANCE, haversineKm, inSouthAfrica,
//  cityNamed, pinTrust, needsCheck, describeTrust, directionsFor, chooseCandidate, resolveLocation }.
// ════════════════════════════════════════════════════════════════════
(function () {
  // The city centres the app already labels areas with (connect-chrome reads this list). Aliases are names people write in
  // an address for the same metro; they only decide WHICH centre a pin is measured from, so they can stay coarse.
  const CITIES = [
    { name: 'Pretoria', lat: -25.7479, lng: 28.2293, aliases: ['tshwane', 'centurion'] },
    { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, aliases: ['joburg', 'jozi', 'sandton', 'soweto', 'randburg', 'roodepoort'] },
    { name: 'Cape Town', lat: -33.9249, lng: 18.4241, aliases: ['bellville', 'stellenbosch', 'khayelitsha', 'mitchells plain'] },
    { name: 'Durban', lat: -29.8587, lng: 31.0218, aliases: ['ethekwini', 'pinetown', 'umhlanga', 'umlazi'] },
    { name: 'Gqeberha', lat: -33.9608, lng: 25.6022, aliases: ['port elizabeth', 'nelson mandela bay'] },
    { name: 'Bloemfontein', lat: -29.0852, lng: 26.1596, aliases: ['mangaung'] },
  ];
  // A generous box around South Africa (the app lists South African listings only).
  const SA_BOUNDS = { south: -35, north: -22, west: 16, east: 33 };
  // A pin further than this from the city its own address names is doubtful. A metro plus its outskirts (Hartbeespoort is
  // about 37 km from Pretoria's centre) stays well inside it; another province never does.
  const FAR_KM = 150;
  // A geocoder hit is accepted on its own only within this distance of the named city (or of the place being looked at).
  const NEAR_KM = 60;
  // ...and only when the geocoder itself is reasonably sure it matched the text.
  const MIN_RELEVANCE = 0.6;
  const MIN_RELEVANCE_UNANCHORED = 0.8;

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const hasPin = (it) => !!it && isNum(it.lat) && isNum(it.lng);

  function haversineKm(a, b) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function inSouthAfrica(p) {
    return hasPin(p) && p.lat >= SA_BOUNDS.south && p.lat <= SA_BOUNDS.north && p.lng >= SA_BOUNDS.west && p.lng <= SA_BOUNDS.east;
  }

  // Lower case, accents off, punctuation to spaces: "Pretoria," and "PRETORIA" are the same word.
  function fold(text) {
    return ' ' + String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  }

  // The city an address names: the one mentioned LAST (an address ends with its city: "Woodlands Mall, Olympus, Pretoria").
  // null when the text names none of them.
  function cityNamed(text) {
    const t = fold(text);
    let best = null;
    let bestAt = -1;
    CITIES.forEach((c) => {
      [c.name].concat(c.aliases).forEach((n) => {
        const at = t.lastIndexOf(' ' + fold(n).trim() + ' ');
        if (at > bestAt) { bestAt = at; best = c; }
      });
    });
    return best;
  }

  // How far a listing's pin can be trusted, from its own pin and its own address text.
  //   'none'    no pin at all
  //   'outside' a pin outside South Africa
  //   'far'     a pin more than FAR_KM from the city its address names (km and city say how far, and from what)
  //   'ok'      a pin near the named city, or a pin in South Africa whose text names no city (nothing to contradict it)
  function pinTrust(item) {
    const it = item || {};
    if (!hasPin(it)) return { level: 'none' };
    if (!inSouthAfrica(it)) return { level: 'outside' };
    const city = cityNamed(addressText(it));
    if (!city) return { level: 'ok' };
    const km = haversineKm(it, city);
    return km > FAR_KM ? { level: 'far', km: Math.round(km), city: city.name } : { level: 'ok', km: Math.round(km), city: city.name };
  }

  // A listing an admin should look at: a doubtful pin, or an address the map could not place.
  function needsCheck(item) {
    const lv = pinTrust(item).level;
    if (lv === 'far' || lv === 'outside') return true;
    return lv === 'none' && !!addressText(item).trim() && !(item && item.noFixedLocation);
  }

  function describeTrust(trust) {
    const t = trust || {};
    if (t.level === 'far') return 'The pin is ' + t.km + ' km from ' + t.city + ', which the address names.';
    if (t.level === 'outside') return 'The pin is outside South Africa.';
    if (t.level === 'none') return 'The address is not on the map yet.';
    return '';
  }

  // Every adapted listing keeps its words in one of these (events: location; places: address; contributors: both).
  function addressText(it) {
    if (!it) return '';
    return String(it.address || it.location || '');
  }

  // Directions that fail safe: the pin only when it can be trusted, else the address text, else nothing.
  function directionsFor(item) {
    const it = item || {};
    // An online or travelling Contributor has no venue: its words describe an area served, not a destination.
    if (it.noFixedLocation) return { url: '', by: 'none' };
    const trust = pinTrust(it);
    const base = 'https://www.google.com/maps/dir/?api=1&destination=';
    if (trust.level === 'ok') return { url: base + encodeURIComponent(it.lat + ',' + it.lng), by: 'pin' };
    const text = addressText(it).trim();
    if (text) return { url: base + encodeURIComponent(text), by: 'address' };
    return { url: '', by: 'none' };
  }

  // Pure choice over geocoder candidates (tested on its own). candidates: [{ lat, lng, label, relevance }] in the geocoder's
  // order. The anchor is the city the text names, else `near` (the place being looked at). Returns
  //   { status: 'ok', best }       a candidate close to the anchor that the geocoder is sure of: place it without asking
  //   { status: 'confirm', best }  a guess to SHOW, never to save unasked (best may be far, or there was no anchor)
  //   { status: 'none' }           nothing found
  function chooseCandidate(query, candidates, opts) {
    const list = (candidates || []).filter((c) => hasPin(c) && inSouthAfrica(c));
    if (!list.length) return { status: 'none', candidates: [] };
    const named = cityNamed(query);
    const near = opts && hasPin(opts.near) ? opts.near : null;
    const anchor = named || near;
    const rel = (c) => (isNum(c.relevance) ? c.relevance : 0);
    if (anchor) {
      const min = named ? MIN_RELEVANCE : MIN_RELEVANCE_UNANCHORED;
      const close = list.filter((c) => haversineKm(c, anchor) <= NEAR_KM && rel(c) >= min);
      if (close.length) {
        const best = close.slice().sort((a, b) => rel(b) - rel(a))[0];
        return { status: 'ok', best, candidates: list };
      }
      // Nothing close enough: show the closest guess rather than the geocoder's first.
      const best = list.slice().sort((a, b) => haversineKm(a, anchor) - haversineKm(b, anchor))[0];
      return { status: 'confirm', best, candidates: list, anchor: named ? named.name : null };
    }
    const best = list[0];
    return { status: rel(best) >= MIN_RELEVANCE_UNANCHORED ? 'ok' : 'confirm', best, candidates: list };
  }

  // Forward-geocode with a bias toward `near` and five candidates, then choose. Never throws; 'none' on any failure.
  async function resolveLocation(query, opts) {
    try {
      const q = String(query || '').trim();
      const key = window.__CC_ENV && window.__CC_ENV.MAPTILER_KEY;
      if (!key || !q) return { status: 'none', candidates: [] };
      const named = cityNamed(q);
      const bias = named || (opts && hasPin(opts.near) ? opts.near : null);
      const url = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(q) + '.json?key=' + encodeURIComponent(key)
        + '&limit=5&country=za' + (bias ? '&proximity=' + bias.lng + ',' + bias.lat : '');
      const doFetch = (opts && opts.fetch) || window.fetch.bind(window);
      const res = await doFetch(url);
      if (!res || !res.ok) return { status: 'none', candidates: [] };
      const json = await res.json();
      const feats = (json && Array.isArray(json.features)) ? json.features : [];
      const candidates = feats
        .filter((f) => f && Array.isArray(f.center) && f.center.length >= 2)
        .map((f) => ({ lng: Number(f.center[0]), lat: Number(f.center[1]), label: String(f.place_name || f.text || ''), relevance: Number(f.relevance) }));
      return chooseCandidate(q, candidates, { near: opts && opts.near });
    } catch (e) {
      return { status: 'none', candidates: [] };
    }
  }

  window.CCLocation = {
    CITIES, SA_BOUNDS, FAR_KM, NEAR_KM, MIN_RELEVANCE,
    haversineKm, inSouthAfrica, cityNamed, pinTrust, needsCheck, describeTrust, directionsFor, chooseCandidate, resolveLocation,
  };
})();
