// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 foundations (tracker docs/MAP_UX_TRACKER.md)
//  ------------------------------------------------------------------
//  Everything Map v2 adds sits behind ONE flag, default ON (founder D15,
//  2026-10-13; MAP_V2_NEXT_PHASE_HANDOFF R2). It is the escape hatch for a
//  release or two:
//    ?map=v1   turns it off and remembers that on this device (`cc_map_v2` = 'v1')
//    ?map=v2   turns it on again and forgets the choice (back to the default)
//  A device only stores a value when it differs from DEFAULT_ON; a stored value
//  always wins over the default. Rollback for everyone is DEFAULT_ON = false.
//  With the flag off nothing here touches the page: no stylesheet is requested,
//  no attribute is set. The flag is read when this file
//  LOADS (the third app script, before the store boots), so it is captured
//  before the router's arrival `replaceState` can rewrite the address bar;
//  the stored value then survives the URL being rewritten by go().
//
//  Also here: the motion constants (mirrored by assets/map-v2.css, a unit test
//  keeps the two equal), prefersReducedMotion(), and the map look, which
//  simply follows the phone's own light/dark setting, live (founder, D1 as
//  revised 2026-10-12: no in-app control).
//
//  The tilt (tracker R8, founder decision D17): Map v2's main map is drawn at ONE fixed
//  oblique angle, PITCH degrees, whatever a person does with two fingers or a right-drag
//  (zoom and rotation are untouched). PITCH = 0 is the rollback: MapLibre's own defaults
//  (flat to start with, a person may tilt it), as before. It applies to the main map only
//  and only while Map v2 is on; the old map and the address picker stay flat.
//
//  Also: countBucket(n), the rounded-down public count ("100+") that is never shown below 100
//  (tracker P2-08: a small ministry is not shown with a low number).
//
//  Public surface: window.isMapV2(), window.MapV2.
// ════════════════════════════════════════════════════════════════════
(function () {
  const FLAG_KEY = 'cc_map_v2';
  // Where the retired Map look control stored a choice; cleared on mount so a
  // tester's old "Light"/"Dark" can never pin the look against their phone.
  const LEGACY_THEME_KEY = 'cc_map_theme';
  // Bump the ?v= whenever assets/map-v2.css changes: the service worker is
  // cache-first for same-origin static files.
  const CSS_HREF = '/assets/map-v2.css?v=20261019a';

  // Motion tokens (ms). assets/map-v2.css carries the same numbers as
  // --dur-fast / --dur-base / --dur-slow and the two easings.
  const MOTION = {
    fast: 120, base: 200, slow: 320,
    enter: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  };

  const doc = typeof document !== 'undefined' ? document : null;
  const store = () => { try { return window.localStorage || null; } catch { return null; } };
  const read = (k) => { try { const s = store(); return s ? s.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { const s = store(); if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch { /* private mode or blocked storage: the setting lasts this page only */ } };

  // ── The tilt ──────────────────────────────────────────────────────
  // Degrees from straight down. The founder chose 45 on 2026-10-15 (D17, after the tile cost was shown to him): about
  // a fifth more MapTiler requests than a flat map, where 60 (MapLibre's own maximum, the "fully tilted" first pick)
  // about doubled them. 45 keeps the horizon off screen, so there is no empty sky. 0 = off (the one-line rollback);
  // 60 puts the first pick back.
  const PITCH = 45;

  // ── Count buckets (P2-08) ─────────────────────────────────────────
  // A public count is shown only from 100 up, rounded DOWN to the nearest step: "100+", "250+", "1,000+". Below 100
  // (or not a number) it is not shown at all, so no small ministry is put next to a low figure. Returns '' for
  // "show nothing".
  const COUNT_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  function countBucket(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < COUNT_STEPS[0]) return '';
    let step = COUNT_STEPS[0];
    for (const s of COUNT_STEPS) if (v >= s) step = s;
    return step.toLocaleString('en-US') + '+';
  }

  // ── The flag ──────────────────────────────────────────────────────
  // Map v2 is the default (D15). Set false to take everyone back to the old map
  // in one line (a device with a stored choice keeps it).
  const DEFAULT_ON = true;
  let on = DEFAULT_ON;
  function resolveFlag() {
    let q = null;
    try { q = new URLSearchParams(window.location.search).get('map'); } catch { /* no location (tests) */ }
    if (q === 'v2' || q === 'v1') {
      // Store only what differs from the default, so a later change of default reaches this device.
      write(FLAG_KEY, (q === 'v2') === DEFAULT_ON ? null : q);
      on = q === 'v2';
    } else {
      const stored = read(FLAG_KEY);
      on = stored === 'v2' ? true : stored === 'v1' ? false : DEFAULT_ON;
    }
  }
  resolveFlag();
  const isMapV2 = () => on;

  // ── Reduced motion ────────────────────────────────────────────────
  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
  }
  // A duration in ms for JS-driven motion: 0 when the person asked for less motion.
  const dur = (name) => (prefersReducedMotion() ? 0 : MOTION[name]);

  // ── Map look: follows the phone ───────────────────────────────────
  function systemPrefersDark() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch { return false; }
  }
  // 'light' or 'dark': what is actually drawn.
  const resolvedTheme = () => (systemPrefersDark() ? 'dark' : 'light');
  function applyTheme() {
    if (!on || !doc || !doc.documentElement) return;
    doc.documentElement.setAttribute('data-theme', resolvedTheme());
    try { window.dispatchEvent(new Event('cc-map-theme')); } catch { /* old webview */ }
  }

  // ── Stylesheet (flag on only) ─────────────────────────────────────
  const api = {
    isOn: isMapV2, motion: MOTION, dur, prefersReducedMotion, resolvedTheme, PITCH, countBucket,
    // true once assets/map-v2.css has loaded (or failed: never block the map on it)
    styleReady: false,
    FLAG_KEY, CSS_HREF,
  };
  function mount() {
    if (!on || !doc || !doc.head) return;
    write(LEGACY_THEME_KEY, null);
    applyTheme();
    try {
      const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      // The phone switched (by hand, or its own sunset schedule): follow it at once.
      if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
    } catch { /* optional */ }
    const done = () => {
      api.styleReady = true;
      try { window.dispatchEvent(new Event('cc-map-v2-style')); } catch { /* old webview */ }
    };
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    link.onload = done;
    link.onerror = done;
    doc.head.appendChild(link);
  }
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  window.isMapV2 = isMapV2;
  window.MapV2 = Object.assign(window.MapV2 || {}, api);
})();
