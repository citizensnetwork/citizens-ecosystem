// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 "Nearby" list (tracker P2-01, founder D2: the sheet sits BESIDE the profile page)
//  ------------------------------------------------------------------
//  At the bottom of the sheet's content (so it shows when the sheet is pulled to full), the listings that are
//  closest to the one you are looking at: a Contributor, a Place or an Event, with no kind put above another.
//  They come from the markers the map itself is drawing, so "nearby" never offers something the map cannot show.
//
//  Order is distance and then name. Never popularity, followers or activity: a small ministry two streets away
//  is as near as a large one (VISION, "the small are honoured"). At most MAX_ROWS rows within MAX_METERS.
//  Nothing at all is drawn when nothing is near (no empty box).
//
//  Pure helpers (metersBetween, rank, distanceText) are unit-tested in src/__tests__/frontend/mapV2Nearby.test.ts.
//  The rows live inside the sheet's scroller, which already carries the touch rule for everything in it
//  (assets/map-v2.css, --mv2-ta). Text: MapV2Strings.sheet.nearby.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;

  const EARTH_M = 6371008.8;      // mean earth radius, metres
  const MAX_ROWS = 8;
  const MAX_METERS = 10000;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const rad = (d) => (d * Math.PI) / 180;

  /** Great-circle distance in metres between two { lat, lng } points (haversine). */
  function metersBetween(a, b) {
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /**
   * The listings nearest to `origin`, closest first. `pool` is the map's marker list ({ id, type, title, lat, lng, ... });
   * Impact ideas and anything without both coordinates are left out. `skip(marker)` drops what is already on the sheet.
   * Returns [{ marker, meters }].
   */
  function rank(origin, pool, opts) {
    const o = opts || {};
    const max = o.max || MAX_ROWS;
    const limit = o.maxMeters || MAX_METERS;
    const skip = o.skip || (() => false);
    if (!origin || !isNum(origin.lat) || !isNum(origin.lng)) return [];
    const out = [];
    (Array.isArray(pool) ? pool : []).forEach((m) => {
      if (!m || m.type === 'idea' || !isNum(m.lat) || !isNum(m.lng) || skip(m)) return;
      const meters = metersBetween(origin, m);
      if (meters <= limit) out.push({ marker: m, meters });
    });
    // distance, then name, then id: the same list every time, and never a popularity signal
    out.sort((a, b) => a.meters - b.meters
      || String(a.marker.title || '').localeCompare(String(b.marker.title || ''))
      || String(a.marker.id).localeCompare(String(b.marker.id)));
    return out.slice(0, max);
  }

  /** "Under 100 m", "350 m", "1.2 km", "12 km": rounded so it never claims more precision than a pin has. */
  function distanceText(meters, S) {
    if (!isNum(meters) || meters < 100) return S.under;
    const r = Math.round(meters / 50) * 50;
    if (r < 1000) return S.metres(r);
    if (meters < 10000) return S.km(Number((meters / 1000).toFixed(1)));
    return S.km(Math.round(meters / 1000));
  }

  /**
   * The list. `rows` come from the sheet already described:
   * [{ id, type, name, meta, photo, item, kind, openState }]. Each row is a listing card.
   */
  function List({ rows, strings, onPick }) {
    const Card = window.MapV2Card;
    if (!rows || !rows.length || !Card) return null;
    return h('section', { 'data-mv2': 'nearby', 'aria-labelledby': 'mv2-nearby-title' },
      h('h3', { id: 'mv2-nearby-title', 'data-mv2': 'near-title' }, strings.title),
      h('p', { 'data-mv2': 'near-hint' }, strings.hint),
      h('ul', { 'data-mv2': 'list', role: 'list' }, rows.map((r) => h('li', { key: r.type + ':' + r.id },
        h(Card, {
          variant: 'listing',
          item: r.item,
          kind: r.kind,
          title: r.name,
          meta: r.meta ? [r.meta] : [],
          media: r.photo ? { src: r.photo } : null,
          openState: r.openState,
          idPrefix: 'mv2-near-' + r.type + '-' + r.id,
          onClick: () => onPick(r.id, r.type),
          'data-near': '',
        })))));
  }

  window.MapV2Nearby = { MAX_ROWS, MAX_METERS, metersBetween, rank, distanceText, List };
})();
