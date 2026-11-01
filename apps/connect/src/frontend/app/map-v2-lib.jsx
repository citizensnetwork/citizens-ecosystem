// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 foundations (tracker docs/MAP_UX_TRACKER.md)
//  ------------------------------------------------------------------
//  Map v2 is THE map. The old map and its `?map=v1` escape hatch were deleted
//  (issue #179, R6): there is no flag, no `window.isMapV2`, and no rollback by
//  constant. A link or a bookmark that still says `?map=v1` (or `?map=v2`) is
//  harmless: nothing reads the query, and the device's old `cc_map_v2` choice is
//  forgotten on load (LEGACY_FLAG_KEY), so a stale 'v1' can never linger.
//
//  Also here: the motion constants (mirrored by assets/map-v2.css, a unit test
//  keeps the two equal), prefersReducedMotion(), and the map look, which
//  simply follows the phone's own light/dark setting, live (founder, D1 as
//  revised 2026-10-12: no in-app control).
//
//  The tilt (tracker R8, founder decision D17): Map v2's main map is drawn at ONE fixed
//  oblique angle, PITCH degrees, whatever a person does with two fingers or a right-drag
//  (zoom and rotation are untouched). PITCH = 0 is the rollback: MapLibre's own defaults
//  (flat to start with, a person may tilt it), as before. It applies to the main map only;
//  the address picker stays flat.
//
//  Also: countBucket(n), the rounded-down public count ("100+") that is never shown below 100
//  (tracker P2-08: a small ministry is not shown with a low number).
//
//  Also: trapFocus(root) and lockBehind(), shared by the QR dialog and the photo
//  viewer (issue #223). The news reader keeps its own copy until it moves over.
//
//  Public surface: window.MapV2.
// ════════════════════════════════════════════════════════════════════
(function () {
  // Where the retired `?map=v1` opt-out (and the old `?map=v2` opt-in) stored a choice; cleared on mount.
  const LEGACY_FLAG_KEY = 'cc_map_v2';
  // Where the retired Map look control stored a choice; cleared on mount so a
  // tester's old "Light"/"Dark" can never pin the look against their phone.
  const LEGACY_THEME_KEY = 'cc_map_theme';
  // Bump the ?v= whenever assets/map-v2.css changes: the service worker is
  // cache-first for same-origin static files. Root-absolute, plus the path prefix when the app is served under one
  // (/citizens/connect, C39): routes.jsx loads first and owns it.
  const CSS_HREF = (window.CC_ROUTES ? window.CC_ROUTES.appUrl : (p) => p)('/assets/map-v2.css?v=20261101a');

  // Motion tokens (ms). assets/map-v2.css carries the same numbers as
  // --dur-fast / --dur-base / --dur-slow and the two easings.
  const MOTION = {
    fast: 120, base: 200, slow: 320,
    enter: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  };

  const doc = typeof document !== 'undefined' ? document : null;
  const store = () => { try { return window.localStorage || null; } catch { return null; } };
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

  // ── The globe ─────────────────────────────────────────────────────
  // The "Online in this area" globe (issue #259, founder's option 3): one button among the map's controls, only when Contributors
  // with no fixed place serve the area in view. false takes it away in one line (no button, no request): the map is then exactly as it was.
  const ONLINE_GLOBE_ON = true;

  // ── Dialogs over the sheet (issue #223) ───────────────────────────
  // The news reader's trap stays inside MapV2News.Reader. These two are the
  // shared copy for the QR dialog and the photo viewer, which can be open
  // together: only the topmost dialog wraps Tab, and the page behind (#root
  // inert, and the scroll lock) comes back when the LAST dialog closes.
  const TAB_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusTraps = [];
  let overlayDepth = 0;
  let overlayInert = false;
  let overlayOverflow = '';

  function onTrapKey(e) {
    if (!doc || e.key !== 'Tab' || !focusTraps.length) return;
    const root = focusTraps[focusTraps.length - 1];
    if (!root || !root.isConnected) return;
    const nodes = Array.prototype.slice.call(root.querySelectorAll(TAB_SELECTOR));
    if (!nodes.length) { e.preventDefault(); e.stopPropagation(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = doc.activeElement;
    const inside = !!(active && root.contains(active));
    const idx = active ? nodes.indexOf(active) : -1;
    if (e.shiftKey) {
      if (!inside || idx <= 0) { e.preventDefault(); e.stopPropagation(); last.focus(); }
    } else if (!inside || idx === -1 || idx === nodes.length - 1) {
      e.preventDefault();
      e.stopPropagation();
      first.focus();
    }
  }
  // Capture-phase Tab wrap. Returns the unbind. A dialog opened over another
  // pushes again; only the latest root wraps, until it unbinds.
  function trapFocus(root) {
    if (!doc || !root) return function () {};
    focusTraps.push(root);
    if (focusTraps.length === 1) doc.addEventListener('keydown', onTrapKey, true);
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      const i = focusTraps.lastIndexOf(root);
      if (i >= 0) focusTraps.splice(i, 1);
      if (!focusTraps.length) doc.removeEventListener('keydown', onTrapKey, true);
    };
  }
  // inert on #root, and overflow:hidden on <html>. One counter for both, so a
  // nested dialog restores the values from BEFORE the first one, and only when
  // it was the last. Returns the release. Call it before returning focus: the
  // opener sits inside #root, and a browser will not focus an inert button.
  function lockBehind() {
    if (!doc || !doc.documentElement) return function () {};
    if (overlayDepth === 0) {
      const page = doc.getElementById('root');
      overlayInert = !!(page && page.inert);
      overlayOverflow = doc.documentElement.style.overflow;
      if (page) page.inert = true;
      doc.documentElement.style.overflow = 'hidden';
    }
    overlayDepth += 1;
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      overlayDepth -= 1;
      if (overlayDepth > 0) return;
      overlayDepth = 0;
      const page = doc.getElementById('root');
      if (page) page.inert = overlayInert;
      doc.documentElement.style.overflow = overlayOverflow;
    };
  }

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
    if (!doc || !doc.documentElement) return;
    doc.documentElement.setAttribute('data-theme', resolvedTheme());
    try { window.dispatchEvent(new Event('cc-map-theme')); } catch { /* old webview */ }
  }

  // ── Stylesheet ───────────────────────────────────────────────────────────────────────────────────────
  const api = {
    motion: MOTION, dur, prefersReducedMotion, resolvedTheme, PITCH, countBucket,
    trapFocus, lockBehind,
    // the globe is on only while the constant says so (read when this file loads)
    get onlineGlobe() { return ONLINE_GLOBE_ON; },
    // true once assets/map-v2.css has loaded (or failed: never block the map on it)
    styleReady: false,
    CSS_HREF,
  };
  function mount() {
    if (!doc || !doc.head) return;
    write(LEGACY_FLAG_KEY, null);
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

  window.MapV2 = Object.assign(window.MapV2 || {}, api);
})();
