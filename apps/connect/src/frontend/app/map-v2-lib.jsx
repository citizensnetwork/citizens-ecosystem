// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 foundations (tracker docs/MAP_UX_TRACKER.md)
//  ------------------------------------------------------------------
//  Everything Map v2 adds sits behind ONE flag, default OFF:
//    ?map=v2   turns it on and remembers it (localStorage `cc_map_v2` = 'v2')
//    ?map=v1   turns it off again (clears the key)
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
//  Public surface: window.isMapV2(), window.MapV2.
// ════════════════════════════════════════════════════════════════════
(function () {
  const FLAG_KEY = 'cc_map_v2';
  // Where the retired Map look control stored a choice; cleared on mount so a
  // tester's old "Light"/"Dark" can never pin the look against their phone.
  const LEGACY_THEME_KEY = 'cc_map_theme';
  // Bump the ?v= whenever assets/map-v2.css changes: the service worker is
  // cache-first for same-origin static files.
  const CSS_HREF = '/assets/map-v2.css?v=20261012a';

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

  // ── The flag ──────────────────────────────────────────────────────
  let on = false;
  function resolveFlag() {
    let q = null;
    try { q = new URLSearchParams(window.location.search).get('map'); } catch { /* no location (tests) */ }
    if (q === 'v2') { write(FLAG_KEY, 'v2'); on = true; }
    else if (q === 'v1') { write(FLAG_KEY, null); on = false; }
    else on = read(FLAG_KEY) === 'v2';
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
    isOn: isMapV2, motion: MOTION, dur, prefersReducedMotion, resolvedTheme,
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
