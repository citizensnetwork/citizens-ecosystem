// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — serving areas (issue #259): the logic behind the area picker, with no React in it.
//  ------------------------------------------------------------------
//  A Contributor with no fixed location says which areas they serve (province, city or town, optional suburb), so people
//  looking at those areas find them under the globe. The rules the founder set on 2026-10-21, kept in ONE place:
//    * Expanding an area is not ticking it. A tick means that area AND everything inside it.
//    * A tick never propagates upward: choosing Eldoraigne does not choose Centurion, Pretoria or Gauteng. A parent that
//      holds a chosen area only shows a neutral "contains a chosen area" marker, which stores nothing.
//    * Matching goes downward only (that is the database's job; this file never widens a choice).
//    * A distance is an ADD-ON to the areas: it needs a centre, so it stays off until at least one area is chosen, and it is
//      measured from the most specific chosen area unless the owner picks another chosen area.
//    * The owner also says how people find them: "online" (the default) or "no_fixed_place" (a travelling ministry that is
//      NOT online). The public list shows that tag so nobody is labelled Online who is not.
//  The server is the wall (set_service_areas, migrations 195 and 197); this file mirrors its rules so the screen can explain
//  them before a save, and turns every answer into plain words. It never shows the server's own text.
//
//  Public surface: window.CCServing = { PRESETS, MAX_AREAS, MAX_RADIUS_KM, DEFAULT_PRESENCE, emptySelection, buildIndex,
//  mergeAreas, childIds, rootIds, ancestorsOf, hasChosenInside, toggleArea, normalise, defaultCentre, setRadius, setCentre,
//  setPresence, summaryParts, summaryText, search, payloadOf, selectionFromServer, offersPicker, isUuid, AREA_ZOOM,
//  resolveLevel, areaInView, fetchServing, fetchAreas, loadSelection, saveSelection, messageFor }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const PRESETS = [10, 25, 50, 100];       // km; the server accepts 1 to MAX_RADIUS_KM, the screen offers these
  const MAX_RADIUS_KM = 100;
  const MAX_AREAS = 20;                    // the database's own cap
  const DEFAULT_PRESENCE = 'online';
  const LEVELS = ['province', 'place', 'suburb'];
  const SPECIFICITY = { province: 1, place: 2, suburb: 3 };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const GENERIC = 'Something went wrong. Please try again.';

  const strings = () => (window.MapV2Strings && window.MapV2Strings.serving) || null;
  const lower = (s) => String(s || '').toLocaleLowerCase('en');
  const byName = (a, b) => (lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const emptySelection = () => ({ areaIds: [], radiusKm: null, radiusCentreAreaId: null, presence: DEFAULT_PRESENCE });

  // ── the hierarchy as a lookup ────────────────────────────────────────
  /** One row from /api/v1/service-areas, kept only when it is well formed. */
  const validArea = (a) => !!a && typeof a.id === 'string' && UUID_RE.test(a.id) && LEVELS.indexOf(a.level) >= 0
    && typeof a.name === 'string' && a.name.trim() !== '' && (a.parent_id == null || (typeof a.parent_id === 'string' && UUID_RE.test(a.parent_id)));

  /** { byId, kids } where kids[parentId] is that area's children, A to Z by `sort` then name; roots are kids[ROOT]. */
  const ROOT = 'root';
  function buildIndex(areas) {
    const byId = {};
    const kids = {};
    (Array.isArray(areas) ? areas : []).forEach((a) => {
      if (!validArea(a)) return;
      const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const bbox = [a.bbox_south, a.bbox_west, a.bbox_north, a.bbox_east].every((v) => num(v) !== null)
        ? { s: a.bbox_south, w: a.bbox_west, n: a.bbox_north, e: a.bbox_east } : null;
      byId[a.id] = {
        id: a.id, parentId: a.parent_id || null, level: a.level, name: a.name.trim(), sort: typeof a.sort === 'number' ? a.sort : 0, slug: a.slug || '',
        lat: num(a.centroid_lat), lng: num(a.centroid_lng), bbox, raw: a,
      };
    });
    Object.keys(byId).forEach((id) => { const p = byId[id].parentId || ROOT; (kids[p] = kids[p] || []).push(id); });
    Object.keys(kids).forEach((p) => kids[p].sort((x, y) => (byId[x].sort - byId[y].sort) || byName(byId[x], byId[y])));
    return { byId, kids };
  }
  /** A new index with more rows added (suburbs arrive after the first load). */
  function mergeAreas(index, areas) {
    const have = Object.keys(index.byId).map((id) => index.byId[id].raw);
    return buildIndex(have.concat(Array.isArray(areas) ? areas : []).filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i));
  }
  const childIds = (index, id) => index.kids[id || ROOT] || [];
  const rootIds = (index) => index.kids[ROOT] || [];

  /** Every area that contains this one, nearest first (never includes the area itself). */
  function ancestorsOf(index, id) {
    const out = [];
    let cur = index.byId[id];
    let guard = 0;
    while (cur && cur.parentId && guard++ < 5) {
      out.push(cur.parentId);
      cur = index.byId[cur.parentId];
    }
    return out;
  }
  /** Is any area strictly inside `id` chosen? Display only: it stores nothing and ticks nothing. */
  function hasChosenInside(index, ids, id) {
    return ids.some((x) => x !== id && ancestorsOf(index, x).indexOf(id) >= 0);
  }

  // ── the selection ────────────────────────────────────────────────────
  /** The chosen area a distance is measured from by default: most specific first (suburb, city or town, province), A to Z. */
  function defaultCentre(index, ids) {
    if (!ids.length) return null;
    const rows = ids.map((id) => index.byId[id] || { id, name: '', level: 'province' });
    rows.sort((a, b) => (SPECIFICITY[b.level] - SPECIFICITY[a.level]) || byName(a, b));
    return rows[0].id;
  }

  /** Make a selection consistent: a distance needs a chosen area and a chosen centre; the tag is one of two values. */
  function normalise(index, sel) {
    const seen = {};
    const ids = (Array.isArray(sel && sel.areaIds) ? sel.areaIds : []).filter((id) => typeof id === 'string' && !seen[id] && (seen[id] = true)).slice(0, MAX_AREAS);
    const presence = sel && (sel.presence === 'no_fixed_place' || sel.presence === 'online') ? sel.presence : DEFAULT_PRESENCE;
    const km = sel && Number.isInteger(sel.radiusKm) && sel.radiusKm >= 1 && sel.radiusKm <= MAX_RADIUS_KM ? sel.radiusKm : null;
    if (!ids.length || km === null) return { areaIds: ids, radiusKm: null, radiusCentreAreaId: null, presence };
    const centre = sel.radiusCentreAreaId && ids.indexOf(sel.radiusCentreAreaId) >= 0 ? sel.radiusCentreAreaId : defaultCentre(index, ids);
    return { areaIds: ids, radiusKm: km, radiusCentreAreaId: centre, presence };
  }

  /** Tick or untick ONE area. Nothing else is ever added or removed (a tick never goes upward, never fans out). */
  function toggleArea(index, sel, id) {
    const has = sel.areaIds.indexOf(id) >= 0;
    if (!has && sel.areaIds.length >= MAX_AREAS) return { selection: sel, reason: 'too_many' };
    const areaIds = has ? sel.areaIds.filter((x) => x !== id) : sel.areaIds.concat([id]);
    return { selection: normalise(index, { ...sel, areaIds }), reason: null };
  }

  /** Turn the distance on (a preset) or off (null). A no-op until at least one area is chosen. */
  function setRadius(index, sel, km) {
    if (!sel.areaIds.length) return sel;
    return normalise(index, { ...sel, radiusKm: km, radiusCentreAreaId: sel.radiusCentreAreaId });
  }
  /** Pick which CHOSEN area the distance is measured from. Anything else is ignored. */
  function setCentre(index, sel, id) {
    if (sel.areaIds.indexOf(id) < 0) return sel;
    return normalise(index, { ...sel, radiusCentreAreaId: id });
  }
  const setPresence = (sel, presence) => (presence === 'online' || presence === 'no_fixed_place' ? { ...sel, presence } : sel);

  // ── the plain-words summary ("Serving: Eldoraigne", "Serving: all of Pretoria") ──
  /** What the owner has chosen, with anything already covered by a chosen parent left out. */
  function summaryParts(index, ids) {
    const rows = ids.map((id) => index.byId[id]).filter(Boolean);
    return rows
      .filter((r) => !ancestorsOf(index, r.id).some((a) => ids.indexOf(a) >= 0))
      .sort(byName)
      .map((r) => ({ id: r.id, name: r.name, level: r.level, all: r.level !== 'suburb' }));
  }
  /** `S` is window.MapV2Strings.serving (passed in so a test can use its own). */
  function summaryText(index, ids, S) {
    const parts = summaryParts(index, ids);
    if (!parts.length) return S.summaryNone;
    const named = parts.map((p) => (p.all ? S.allOf(p.name) : p.name));
    const shown = named.slice(0, 3);
    const rest = named.length - shown.length;
    let list;
    if (rest > 0) list = shown.join(', ') + ' ' + S.and + ' ' + S.more(rest);
    else if (shown.length === 1) list = shown[0];
    else list = shown.slice(0, -1).join(', ') + ' ' + S.and + ' ' + shown[shown.length - 1];
    return S.summary(list);
  }

  /** The search box: every loaded area whose name contains the words typed, most specific first then A to Z. */
  function search(index, query) {
    const q = lower(query).trim();
    if (!q) return [];
    return Object.keys(index.byId)
      .map((id) => index.byId[id])
      .filter((a) => lower(a.name).indexOf(q) >= 0)
      .sort((a, b) => (SPECIFICITY[b.level] - SPECIFICITY[a.level]) || byName(a, b))
      .map((a) => a.id);
  }

  // ── what goes to the server and what comes back ──────────────────────
  /** The PUT body, exactly the fields the route reads. A distance with no chosen area is dropped. */
  function payloadOf(sel) {
    const ids = Array.isArray(sel.areaIds) ? sel.areaIds : [];
    const km = ids.length && Number.isInteger(sel.radiusKm) ? sel.radiusKm : null;
    return {
      area_ids: ids,
      radius_km: km,
      radius_centre_area_id: km === null ? null : (sel.radiusCentreAreaId || null),
      presence: sel.presence === 'no_fixed_place' ? 'no_fixed_place' : 'online',
    };
  }
  function selectionFromServer(body) {
    const b = body && typeof body === 'object' ? body : {};
    return {
      areaIds: (Array.isArray(b.area_ids) ? b.area_ids : []).filter((x) => typeof x === 'string' && UUID_RE.test(x)),
      radiusKm: Number.isInteger(b.radius_km) ? b.radius_km : null,
      radiusCentreAreaId: typeof b.radius_centre_area_id === 'string' ? b.radius_centre_area_id : null,
      presence: b.presence === 'no_fixed_place' ? 'no_fixed_place' : 'online',
    };
  }
  /** Only a Contributor who chose "no fixed location" is offered the picker; everyone else sees no extra step. */
  const offersPicker = (row) => !!row && row.noFixedLocation === true;
  const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

  // ── "the area in view" (the globe, issue #259) ───────────────────────
  //  Resolved on the device from the small public index, so the map never sends coordinates to us: the centre of the map is
  //  matched to the SMALLEST area whose rectangle contains it (ties go to the nearest centre), per level. The rectangles are
  //  approximate by design (no boundary polygons), so near an edge the answer can be the neighbour: it is a hint to look in
  //  the right place, never a promise about a border.
  //  The level that counts follows the zoom, with the same gate style as ZOOM_GATES in map.jsx: zoomed right out (a whole
  //  country) there is no area in view; then the province; then a city or town; then a suburb where one is loaded.
  const AREA_ZOOM = { province: 6, place: 9.5, suburb: 12.5 };
  const bboxSize = (a) => (a.bbox.n - a.bbox.s) * (a.bbox.e - a.bbox.w);
  const centreGap = (a, lat, lng) => ((a.lat === null ? lat : a.lat) - lat) ** 2 + ((a.lng === null ? lng : a.lng) - lng) ** 2;
  /** The area of ONE level whose rectangle contains the point, or null. */
  function resolveLevel(index, level, lat, lng) {
    let best = null;
    Object.keys(index.byId).forEach((id) => {
      const a = index.byId[id];
      if (a.level !== level || !a.bbox) return;
      if (lat < a.bbox.s || lat > a.bbox.n || lng < a.bbox.w || lng > a.bbox.e) return;
      if (!best) { best = a; return; }
      const d = bboxSize(a) - bboxSize(best) || centreGap(a, lat, lng) - centreGap(best, lat, lng) || (a.id < best.id ? -1 : 1);
      if (d < 0) best = a;
    });
    return best ? best.id : null;
  }
  /** The area to ask about for this centre and zoom: the most specific level the zoom allows that has an answer. Null = none. */
  function areaInView(index, lat, lng, zoom) {
    if (!index || !index.byId || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
    if (zoom < AREA_ZOOM.province) return null;
    const levels = ['suburb', 'place', 'province'].filter((l) => zoom >= AREA_ZOOM[l]);
    for (let i = 0; i < levels.length; i += 1) {
      const id = resolveLevel(index, levels[i], lat, lng);
      if (id) return id;
    }
    return null;
  }

  // ── the three requests ───────────────────────────────────────────────
  const base = () => (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
  /** GET /api/v1/service-areas[query]: public, cached at the edge. Returns { ok, areas } and never throws. */
  async function fetchAreas(query, fetcher) {
    const f = fetcher || (typeof fetch === 'function' ? fetch : null);
    if (!f) return { ok: false, areas: [] };
    try {
      const res = await f(base() + '/api/v1/service-areas' + (query || ''));
      if (!res || !res.ok) return { ok: false, areas: [] };
      const j = await res.json();
      return { ok: true, areas: (j && Array.isArray(j.data) ? j.data : []).filter(validArea) };
    } catch {
      return { ok: false, areas: [] };
    }
  }
  /** One Contributor row from /api/v1/serving, kept to the allow-listed fields (a contact detail can never ride along). */
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const person = (r) => (r && isUuid(r.id) && text(r.name)
    ? { id: r.id, name: text(r.name), slug: text(r.slug), category: text(r.category), kind: text(r.kind), avatarUrl: text(r.avatar_url), logoUrl: text(r.logo_url), presence: r.presence === 'no_fixed_place' ? 'no_fixed_place' : r.presence === 'online' ? 'online' : null }
    : null);
  /** GET /api/v1/serving?area=<uuid>: who is online in this area. Returns { ok, area, main, also } and never throws. */
  async function fetchServing(areaId, fetcher) {
    const f = fetcher || (typeof fetch === 'function' ? fetch : null);
    if (!f || !isUuid(areaId)) return { ok: false };
    try {
      const res = await f(base() + '/api/v1/serving?area=' + encodeURIComponent(areaId));
      if (!res || !res.ok) return { ok: false };
      const d = ((await res.json()) || {}).data || {};
      const area = d.area && isUuid(d.area.id) && text(d.area.name) ? { id: d.area.id, name: text(d.area.name), level: d.area.level } : null;
      if (!area) return { ok: false };
      const main = (Array.isArray(d.main) ? d.main : []).map((r) => {
        const p = person(r);
        const sv = r && r.served;
        return p && sv && isUuid(sv.id) && text(sv.name) && LEVELS.indexOf(sv.level) >= 0 ? { ...p, served: { id: sv.id, name: text(sv.name), level: sv.level } } : null;
      }).filter(Boolean);
      const also = (Array.isArray(d.also_served_by) ? d.also_served_by : []).map((r) => {
        const p = person(r);
        return p && Number.isInteger(r.radius_km) && typeof r.distance_km === 'number' && Number.isFinite(r.distance_km)
          ? { ...p, centreName: text(r.centre_name), radiusKm: r.radius_km, distanceKm: r.distance_km } : null;
      }).filter(Boolean);
      return { ok: true, area, main, also };
    } catch {
      return { ok: false };
    }
  }

  /** GET /api/contributor/service-areas: the saved choice. `contributorId` null means the signed-in person's own. */
  async function loadSelection(authedFetch, contributorId) {
    if (typeof authedFetch !== 'function') return { ok: false };
    if (contributorId && !UUID_RE.test(contributorId)) return { ok: false };
    try {
      const res = await authedFetch('/api/contributor/service-areas' + (contributorId ? '?contributor_id=' + encodeURIComponent(contributorId) : ''));
      if (!res || !res.ok) return { ok: false };
      return { ok: true, selection: selectionFromServer(await res.json()) };
    } catch {
      return { ok: false };
    }
  }
  /** What to tell the person for a refusal. The server's own wording is never shown (it can name internal states). */
  function messageFor(status, error) {
    const S = strings();
    const E = (S && S.errors) || {};
    if (status === 'offline') return E.offline || GENERIC;
    if (status === 401) return E.signIn || GENERIC;
    if (status === 429) return E.slowDown || GENERIC;
    if (status === 403) return error === 'not_a_contributor' ? (E.notReady || GENERIC) : (E.forbidden || GENERIC);
    if (status === 404) return E.notReady || GENERIC;
    if (status === 400 && error === 'too_many_areas') return E.tooMany || GENERIC;
    return E.generic || GENERIC;
  }
  /** PUT /api/contributor/service-areas. `contributorId` null saves the signed-in person's own listing. */
  async function saveSelection(authedFetch, contributorId, sel) {
    if (typeof authedFetch !== 'function') return { ok: false, reason: 'error', message: messageFor(0) };
    if (contributorId && !UUID_RE.test(contributorId)) return { ok: false, reason: 'error', message: messageFor(0) };
    const body = payloadOf(sel);
    if (contributorId) body.contributor_id = contributorId;
    let res;
    try {
      res = await authedFetch('/api/contributor/service-areas', { method: 'PUT', body: JSON.stringify(body) });
    } catch {
      return { ok: false, reason: 'offline', message: messageFor('offline') };
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, selection: selectionFromServer(json) };
    return { ok: false, reason: 'refused', message: messageFor(res.status, json && json.error) };
  }

  window.CCServing = {
    PRESETS, MAX_AREAS, MAX_RADIUS_KM, DEFAULT_PRESENCE,
    emptySelection, buildIndex, mergeAreas, childIds, rootIds, ancestorsOf, hasChosenInside,
    toggleArea, normalise, defaultCentre, setRadius, setCentre, setPresence,
    summaryParts, summaryText, search, payloadOf, selectionFromServer, offersPicker, isUuid,
    AREA_ZOOM, resolveLevel, areaInView, fetchServing,
    fetchAreas, loadSelection, saveSelection, messageFor,
  };
})();
