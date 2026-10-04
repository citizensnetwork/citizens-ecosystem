// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — route table (pure; no React, no DOM)
//
//  The ONE place that knows which URL belongs to which screen. store.jsx
//  (history, deep links, titles, the sign-in return path) and the server
//  rewrites in next.config.ts (PREFIXES) both lean on it, so no screen
//  carries a path string of its own. Pure on purpose: it is unit-tested in
//  src/__tests__/frontend/routes.test.ts without a browser.
//
//    /                      map (home)         /map → /  (alias)
//    /discover              Kingdom Exploration list
//    /community             Kingdom Projects
//    /e/<uuid>              event              /p/<uuid>   place
//    /c/<slug>              Contributor        /me         my own profile
//    /messages[/<uuid>]     inbox [+ thread]   /notifications  /settings
//    /apply  /onboarding    Contributor wizards
//    /dashboard[/<tab>]     Contributor portal (tab in the URL)
//    /admin[/<tab>]         admin panel (tab in the URL)
//    /index.html[?c=<slug>] legacy shell URL → / or /c/<slug>
//
//  A URL grants nothing: `accessFor` only says what a screen NEEDS, and the
//  store enforces it (the real wall stays RLS + the server-side admin/RPC checks).
// ════════════════════════════════════════════════════════════════════
(function () {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SLUG_RE = /^[a-z0-9-]{1,120}$/;
  const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
  const isSlug = (v) => typeof v === 'string' && SLUG_RE.test(v);

  // First entry is each screen's default tab (it gets the short URL).
  const DASHBOARD_TABS = ['overview', 'events', 'news', 'suggestions', 'profile', 'messages', 'tools'];
  const ADMIN_TABS = ['applications', 'overview', 'listings', 'create', 'reports'];

  // page → path, for the screens that are one fixed path.
  const STATIC_PATHS = {
    home: '/',
    'kingdom-discovery': '/discover',
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
  const PREFIXES = [...Object.keys(PAGE_BY_SEGMENT), 'map', 'me', 'e', 'p', 'c'];

  // Every screen name the app can show (history.state.nav is trusted only for these).
  const PAGES = Object.keys(STATIC_PATHS).concat(['event', 'place', 'profile']);

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
      case 'home': case 'kingdom-discovery': case 'community': case 'event': case 'place': return 'public';
      case 'profile': return p.id || p.slug ? 'public' : 'auth';
      case 'dashboard': return 'contributor';
      case 'admin': return 'admin';
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

  const BASE_TITLE = 'Citizens Connect';
  const TITLES = {
    'kingdom-discovery': 'Kingdom Exploration', community: 'Kingdom Projects', messages: 'Messages',
    notifications: 'Notifications', settings: 'Settings', apply: 'Become a Contributor',
    onboarding: 'Set up your profile', dashboard: 'Dashboard', admin: 'Admin',
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
    DASHBOARD_TABS, ADMIN_TABS, PREFIXES, PAGES, isUuid, isSlug,
  };
})();
