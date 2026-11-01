// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — route table (pure; no React, no DOM; the one outside input is BASE_PATH, below)
//
//  The ONE place that knows which URL belongs to which screen. store.jsx
//  (history, deep links, titles, the sign-in return path) and the server
//  rewrites in next.config.ts (PREFIXES) both lean on it, so no screen
//  carries a path string of its own. Pure on purpose: it is unit-tested in
//  src/__tests__/frontend/routes.test.ts without a browser.
//
//    /                      map (home)         /map → /  (alias)
//    /discover              Kingdom Exploration list
//    /explore               Map v2's Discover page (#210; the old map shows Kingdom Exploration there)
//    /lets                  Let's… gatherings
//    /community             Kingdom Projects (linked from Let's…, not in the nav)
//    /e/<uuid>              event              /p/<uuid>   place
//    /c/<slug>              Contributor        /me         my own profile
//    /messages[/<uuid>]     inbox [+ thread]   /notifications  /settings
//    /apply  /onboarding    Contributor wizards
//    /upgrade/<64 hex>      confirm an intake upgrade (optional /decline)
//    /dashboard[/<tab>]     Contributor portal (tab in the URL)
//    /admin[/<tab>]         admin panel (tab in the URL)
//    /index.html[?c=<slug>] legacy shell URL → / or /c/<slug>
//
//  A URL grants nothing: `accessFor` only says what a screen NEEDS, and the
//  store enforces it (the real wall stays RLS + the server-side admin/RPC checks).
//
//  Every path in this file is APP-RELATIVE: it is what the table above shows, whether
//  the app is served from the site root (today) or from a prefix on a shared domain
//  (NEXT_PUBLIC_BASE_PATH=/citizens/connect, C39). `stripBase` and `withBase` are the
//  two crossings between that and the address bar, and are no-ops with an empty base.
//  BASE_PATH is the one read of config.js's BASE_PATH key (written by @citizens/frontend-build
//  only when a prefix is set); `appUrl` is `withBase` bound to it. `publicUrl` is the same crossing for a
//  link someone else will open (a share, a QR code): see its note for how the native shell differs.
// ════════════════════════════════════════════════════════════════════
(function () {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SLUG_RE = /^[a-z0-9-]{1,120}$/;
  const UPGRADE_TOKEN_RE = /^[a-f0-9]{64}$/i;
  const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
  const isSlug = (v) => typeof v === 'string' && SLUG_RE.test(v);

  // First entry is each screen's default tab (it gets the short URL).
  const DASHBOARD_TABS = ['overview', 'events', 'news', 'suggestions', 'profile', 'messages', 'tools'];
  const ADMIN_TABS = ['applications', 'overview', 'contributors', 'citizens', 'reports'];
  // Old bookmarks. Replaced (legacy) with Contributors; Create also asks the screen to open its form.
  const ADMIN_LEGACY = { listings: false, create: true };

  // page → path, for the screens that are one fixed path.
  const STATIC_PATHS = {
    home: '/',
    'kingdom-discovery': '/discover',
    explore: '/explore',
    lets: '/lets',
    community: '/community',
    messages: '/messages',
    notifications: '/notifications',
    settings: '/settings',
    apply: '/apply',
    onboarding: '/onboarding',
    dashboard: '/dashboard',
    admin: '/admin',
  };
  const PAGE_BY_SEGMENT = {};
  Object.keys(STATIC_PATHS).forEach((page) => {
    if (page !== 'home') PAGE_BY_SEGMENT[STATIC_PATHS[page].slice(1)] = page;
  });

  // Every first path segment this table owns. next.config.ts rewrites exactly these
  // to index.html (never a catch-all, which would shadow /api, /auth and static files).
  const PREFIXES = [...Object.keys(PAGE_BY_SEGMENT), 'map', 'me', 'e', 'p', 'c', 'upgrade'];

  // Every screen name the app can show (history.state.nav is trusted only for these).
  const PAGES = Object.keys(STATIC_PATHS).concat(['event', 'place', 'profile', 'intake-upgrade']);

  const HOME = () => ({ page: 'home', params: {} });
  const fallback = () => ({ ok: false, nav: HOME(), canonical: '/', legacy: true });
  const resolved = (nav, canonical, legacy) => ({ ok: true, nav, canonical, legacy: !!legacy });

  function queryParam(search, name) {
    try { return new URLSearchParams(typeof search === 'string' ? search : '').get(name); } catch (e) { return null; }
  }

  // /dashboard/<tab>, /admin/<tab>. The default tab has the short URL; an unknown tab
  // opens the screen on its default (the old /dashboard/<anything> rewrite did too).
  function tabbed(page, base, tabs, tab) {
    const known = typeof tab === 'string' && tabs.indexOf(tab) !== -1;
    const useTab = known && tab !== tabs[0] ? tab : null;
    const nav = { page, params: useTab ? { tab: useTab } : {} };
    return { nav, canonical: useTab ? base + '/' + useTab : base, clean: !tab || (known && tab !== tabs[0]) };
  }

  /**
   * Address-bar path → screen. Never throws.
   *   ok        false when the path is unknown or an id/slug is malformed (nav is then home)
   *   nav       { page, params }; a listing link carries `slug` until the store resolves it to an id
   *   canonical the path that belongs in the address bar for this screen
   *   legacy    true when the address bar should be rewritten to `canonical`
   */
  function navFromPath(pathname, search) {
    if (typeof pathname !== 'string' || pathname.charAt(0) !== '/') return fallback();
    let path = pathname;

    // The old shell URL. /index.html?c=<slug> is what existing bookmarks, the Sheet and
    // emailed welcome links hold.
    if (path === '/index.html') {
      const c = queryParam(search, 'c');
      if (c === null) return resolved(HOME(), '/', true);
      return SLUG_RE.test(c) ? resolved({ page: 'profile', params: { slug: c } }, '/c/' + c, true) : fallback();
    }

    let trimmed = false;
    if (path.length > 1 && path.charAt(path.length - 1) === '/') { path = path.slice(0, -1); trimmed = true; }
    if (path === '/') return resolved(HOME(), '/', trimmed);
    const seg = path.split('/').slice(1);
    const head = seg[0];

    if (head === 'map' && seg.length === 1) return resolved(HOME(), '/', true);
    if (head === 'me' && seg.length === 1) return resolved({ page: 'profile', params: {} }, '/me', trimmed);

    if (head === 'dashboard' || head === 'admin') {
      if (seg.length > 2) return fallback();
      if (head === 'admin' && seg.length === 2 && Object.prototype.hasOwnProperty.call(ADMIN_LEGACY, seg[1])) {
        const params = { tab: 'contributors' };
        if (ADMIN_LEGACY[seg[1]]) params.openCreate = true;
        return resolved({ page: 'admin', params: params }, '/admin/contributors', true);
      }
      const dash = head === 'dashboard';
      const t = tabbed(head, '/' + head, dash ? DASHBOARD_TABS : ADMIN_TABS, seg[1]);
      return resolved(t.nav, t.canonical, trimmed || !t.clean);
    }

    if (head === 'messages') {
      if (seg.length === 1) return resolved({ page: 'messages', params: {} }, '/messages', trimmed);
      if (seg.length === 2 && isUuid(seg[1])) {
        const convId = seg[1].toLowerCase();
        return resolved({ page: 'messages', params: { convId } }, '/messages/' + convId, trimmed || convId !== seg[1]);
      }
      return fallback();
    }

    if (seg.length === 1 && PAGE_BY_SEGMENT[head]) {
      return resolved({ page: PAGE_BY_SEGMENT[head], params: {} }, STATIC_PATHS[PAGE_BY_SEGMENT[head]], trimmed);
    }

    if ((head === 'e' || head === 'p') && seg.length === 2 && isUuid(seg[1])) {
      const id = seg[1].toLowerCase();
      return resolved({ page: head === 'e' ? 'event' : 'place', params: { id } }, '/' + head + '/' + id, trimmed || id !== seg[1]);
    }

    if (head === 'c' && seg.length === 2) {
      if (isUuid(seg[1])) {
        const id = seg[1].toLowerCase();
        return resolved({ page: 'profile', params: { id } }, '/c/' + id, trimmed || id !== seg[1]);
      }
      if (SLUG_RE.test(seg[1])) return resolved({ page: 'profile', params: { slug: seg[1] } }, '/c/' + seg[1], trimmed);
    }

    // The token is the path, not a query: safeReturnPath drops queries, and a
    // Google sign-in has to come back to this exact screen. /upgrade alone is
    // not a screen (no token to confirm).
    if (head === 'upgrade' && (seg.length === 2 || seg.length === 3) && UPGRADE_TOKEN_RE.test(seg[1]) && (seg.length === 2 || seg[2] === 'decline')) {
      const token = seg[1].toLowerCase();
      const decline = seg.length === 3;
      const canonical = decline ? '/upgrade/' + token + '/decline' : '/upgrade/' + token;
      const params = decline ? { token: token, intent: 'decline' } : { token: token };
      return resolved({ page: 'intake-upgrade', params: params }, canonical, trimmed || token !== seg[1]);
    }
    return fallback();
  }

  /**
   * Screen → address-bar path, or null when the screen has no routable address (an
   * entity id that is not a UUID: demo data). Callers then leave the address alone.
   * ctx.slugFor(id) lets a Contributor's id become its /c/<slug> link.
   */
  function pathFor(nav, ctx) {
    if (!nav || typeof nav.page !== 'string') return null;
    const p = nav.params || {};
    switch (nav.page) {
      case 'dashboard': return tabbed('dashboard', '/dashboard', DASHBOARD_TABS, p.tab).canonical;
      case 'admin': return tabbed('admin', '/admin', ADMIN_TABS, p.tab).canonical;
      case 'messages': return isUuid(p.convId) ? '/messages/' + p.convId.toLowerCase() : '/messages';
      case 'event': return isUuid(p.id) ? '/e/' + p.id.toLowerCase() : null;
      case 'place': return isUuid(p.id) ? '/p/' + p.id.toLowerCase() : null;
      case 'intake-upgrade': {
        const token = typeof p.token === 'string' ? p.token.toLowerCase() : '';
        if (!/^[a-f0-9]{64}$/.test(token)) return null;
        return p.intent === 'decline' ? '/upgrade/' + token + '/decline' : '/upgrade/' + token;
      }
      case 'profile': {
        if (typeof p.slug === 'string' && SLUG_RE.test(p.slug)) return '/c/' + p.slug;
        if (p.id === undefined || p.id === null || p.id === '') return '/me';
        const slug = ctx && ctx.slugFor ? ctx.slugFor(p.id) : null;
        if (typeof slug === 'string' && SLUG_RE.test(slug)) return '/c/' + slug;
        return isUuid(p.id) ? '/c/' + p.id.toLowerCase() : null;
      }
      default: return STATIC_PATHS[nav.page] || null;
    }
  }

  /** What a screen needs: 'public' | 'auth' (signed in) | 'contributor' | 'admin'. Unknown → 'auth'. */
  function accessFor(nav) {
    const page = nav && nav.page;
    const p = (nav && nav.params) || {};
    switch (page) {
      case 'home': case 'kingdom-discovery': case 'explore': case 'lets': case 'community': case 'event': case 'place': return 'public';
      case 'profile': return p.id || p.slug ? 'public' : 'auth';
      case 'dashboard': return 'contributor';
      case 'admin': return 'admin';
      case 'intake-upgrade': return 'auth';
      default: return 'auth';
    }
  }

  /** A shareable public listing page (event, place, Contributor): the screens a link lands on, with no map before them. */
  function isEntityRoute(nav) {
    const page = nav && nav.page;
    const p = (nav && nav.params) || {};
    return page === 'event' || page === 'place' || (page === 'profile' && !!(p.id || p.slug));
  }

  /**
   * A sign-in return path from untrusted text (sessionStorage), or null. Only a path that
   * the table above recognises survives, and what comes back is the table's own canonical
   * path: no query, no hash, no host, no scheme, so it cannot be turned into an open redirect.
   */
  function safeReturnPath(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    if (s.length === 0 || s.length > 300) return null;
    if (s.charAt(0) !== '/' || s.charAt(1) === '/') return null;
    if (/[\u0000-\u001f\u007f\\]/.test(s)) return null;
    let u;
    try { u = new URL(s, 'https://return.invalid'); } catch (e) { return null; }
    if (u.origin !== 'https://return.invalid') return null;
    const r = navFromPath(u.pathname, u.search);
    return r.ok ? r.canonical : null;
  }

  /**
   * Address-bar path → app-relative path (what navFromPath, pathFor and safeReturnPath speak).
   * `base` is '' (the site root) or a prefix such as "/citizens/connect". The bare prefix, with
   * or without a trailing slash, is the app's front door, '/'. Returns null for a path outside
   * the prefix, a lookalike such as /citizens/connectx included, and for a non-string. With an
   * empty base the path comes back unchanged. Never throws.
   */
  function stripBase(pathname, base) {
    if (typeof pathname !== 'string') return null;
    if (!base) return pathname;
    if (pathname === base || pathname === base + '/') return '/';
    return pathname.indexOf(base + '/') === 0 ? pathname.slice(base.length) : null;
  }

  /**
   * App-relative path (a `?query` or `#hash` may follow it) → the path for the address bar or a
   * link. '/' becomes the bare prefix, not prefix + '/': Next redirects the slash form to the bare
   * one, and a redirect on every home link is a wasted round trip. A string that is not a plain
   * app path (no leading '/', or '//') is returned untouched, so a stray absolute URL is never
   * glued onto the prefix. With an empty base the path comes back unchanged.
   */
  function withBase(path, base) {
    if (!base || typeof path !== 'string' || path.charAt(0) !== '/' || path.charAt(1) === '/') return path;
    const rest = path.slice(1);
    return base + (rest === '' || rest.charAt(0) === '?' || rest.charAt(0) === '#' ? rest : path);
  }

  // The prefix this build is served under: '' (no key in config.js) is the site root, and a mobile build
  // (bundled at the shell's root). A value that is not a path starting with a single '/' is ignored.
  const rawBase = window.__CC_ENV && typeof window.__CC_ENV.BASE_PATH === 'string' ? window.__CC_ENV.BASE_PATH : '';
  const BASE_PATH = /^\/[^/]/.test(rawBase) ? rawBase.replace(/\/+$/, '') : '';
  /** An app-relative path as an address-bar or link path for this build (see withBase). */
  const appUrl = (path) => withBase(path, BASE_PATH);

  // The PUBLIC web address a native build shares. Only a mobile build's config.js carries these two keys
  // (scripts/frontend-config.js; the build validates them strictly). They are checked again here because a
  // hand-written config.js, or a bundle built before the keys existed, must still give a real link, so an
  // unusable value falls back to today's public site at its root.
  const DEFAULT_PUBLIC_ORIGIN = 'https://www.citizenscentral.co.za';
  const env = window.__CC_ENV || {};
  const PUBLIC_ORIGIN = typeof env.PUBLIC_ORIGIN === 'string' && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(env.PUBLIC_ORIGIN) ? env.PUBLIC_ORIGIN : DEFAULT_PUBLIC_ORIGIN;
  const PUBLIC_BASE_PATH = typeof env.PUBLIC_BASE_PATH === 'string' && /^(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\/?$/.test(env.PUBLIC_BASE_PATH) ? env.PUBLIC_BASE_PATH.replace(/\/+$/, '') : '';

  /**
   * The address of a screen that a person can SHARE or print as a QR code (an app-relative path in, a full
   * https URL out), as opposed to the address-bar path of appUrl. `opts.native` is true inside the Capacitor shell.
   *   web:    opts.webOrigin + appUrl(path). The caller picks the origin: the page's own for a share link, the
   *           public site for a printed code. The mobile-only PUBLIC_* keys are never read.
   *   native: PUBLIC_ORIGIN + PUBLIC_BASE_PATH + path. The shell's own origin (capacitor://localhost) is not an
   *           address anyone can open, and its bundle sits at the shell's root, so the web prefix (BASE_PATH) does not
   *           apply either: the public site's own prefix does.
   * Null for anything that is not a plain app path (or a web call with no origin), so no caller builds a half link.
   */
  function publicUrl(path, opts) {
    if (typeof path !== 'string' || path.charAt(0) !== '/' || path.charAt(1) === '/') return null;
    const o = opts || {};
    if (o.native) return PUBLIC_ORIGIN + withBase(path, PUBLIC_BASE_PATH);
    return typeof o.webOrigin === 'string' && o.webOrigin !== '' ? o.webOrigin + appUrl(path) : null;
  }

  const BASE_TITLE = 'Citizens Connect';
  const TITLES = {
    'kingdom-discovery': 'Kingdom Exploration', explore: 'Explore', lets: 'Let\'s…', community: 'Kingdom Projects', messages: 'Messages',
    notifications: 'Notifications', settings: 'Settings', apply: 'Become a Contributor',
    onboarding: 'Set up your profile', dashboard: 'Dashboard', admin: 'Admin',
    'intake-upgrade': 'Confirm your listing',
  };
  /** Tab / history title. `name` is the loaded entity's own name (event title, place, Contributor). */
  function titleFor(nav, name) {
    const page = nav && nav.page;
    if (page === 'home' || !page) return BASE_TITLE;
    let label = TITLES[page];
    if (!label) {
      const fallbackWord = page === 'event' ? 'Event' : page === 'place' ? 'Place' : 'Profile';
      const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      label = clean || fallbackWord;
    }
    return label + ' · ' + BASE_TITLE;
  }

  window.CC_ROUTES = {
    pathFor, navFromPath, safeReturnPath, accessFor, isEntityRoute, titleFor,
    stripBase, withBase, appUrl, BASE_PATH,
    publicUrl, PUBLIC_ORIGIN, PUBLIC_BASE_PATH,
    DASHBOARD_TABS, ADMIN_TABS, PREFIXES, PAGES, isUuid, isSlug,
  };
})();
