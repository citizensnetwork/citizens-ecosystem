// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 folding navigation (issue #210)
//  ------------------------------------------------------------------
//  On a phone the navigation folds into ONE round frosted button with a gold ring, bottom centre. A tap
//  opens the bar: Home (the map with the Explore row), Explore (the Discover page), Map (the same map,
//  clean: no pills, no row) and Profile (the account menu, which also lists Projects, Messages and
//  Alerts with their counts; founder, 2026-10-26). The open bar dims the map a little, and folds itself
//  back after IDLE_MS without a touch, a click or a key, or on a tap outside, Escape or Back.
//  The folded button shows a small dot (and says so in its name) when anything is unread.
//
//  Wide screens keep the sidebar (shell.jsx); this draws nothing there. The old map (?map=v1) keeps the old
//  bottom bar: shell.jsx picks one or the other.
//  Styles: assets/map-v2.css section 4l (tokens only). Text: MapV2Strings.nav.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;

  const IDLE_MS = 5000;                          // the open bar folds back after this long untouched
  const WIDE_MQ = '(min-width: 768px)';          // the sidebar's breakpoint (Tailwind md)
  const S = () => (window.MapV2Strings && window.MapV2Strings.nav) || {};
  const useBackGuard = (open, fn) => (window.useBackGuard ? window.useBackGuard(open, fn) : undefined);

  const ITEMS = [
    { id: 'home', icon: 'House' },
    { id: 'explore', icon: 'Compass' },
    { id: 'map', icon: 'Map' },
    { id: 'profile', icon: 'User' },
  ];
  // Screens that now live under Profile's menu light up Profile.
  const UNDER_PROFILE = ['messages', 'notifications', 'community', 'settings', 'dashboard', 'admin'];

  /** Which item a screen belongs to: 'home' | 'explore' | 'map' | 'profile', or '' (an event or place page). */
  function currentOf(nav) {
    const page = nav && nav.page;
    const params = (nav && nav.params) || {};
    if (!page || page === 'home') return params.view === 'map' ? 'map' : 'home';
    if (page === 'explore' || page === 'kingdom-discovery') return 'explore';
    if (page === 'profile') return params.id ? '' : 'profile';
    return UNDER_PROFILE.indexOf(page) !== -1 ? 'profile' : '';
  }

  /** Where an item goes: [page, params]. Profile opens a menu instead, so it has none. */
  function targetOf(id) {
    if (id === 'home') return ['home', {}];
    if (id === 'map') return ['home', { view: 'map' }];
    if (id === 'explore') return ['explore', {}];
    return null;
  }

  function useWide() {
    const get = () => !!(window.matchMedia && window.matchMedia(WIDE_MQ).matches);
    const [wide, setWide] = useState(get);
    useEffect(() => {
      if (!window.matchMedia) return undefined;
      const mq = window.matchMedia(WIDE_MQ);
      const update = () => setWide(mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }, []);
    return wide;
  }

  function Nav() {
    const app = window.useApp();
    const { nav, go } = app;
    const unread = (app.unreadNotifs || 0) + (app.unreadMsgs || 0);
    const wide = useWide();
    const [open, setOpen] = useState(false);
    const [menu, setMenu] = useState(false);
    const box = useRef(null);
    const toggle = useRef(null);
    const timer = useRef(null);
    const str = S();
    const Icon = window.Icon;
    const cur = currentOf(nav);

    // Fold back. Focus returns to the round button when it was inside the bar (a keyboard user is not dropped).
    const fold = useCallback(() => {
      const inside = box.current && box.current.contains(document.activeElement);
      setOpen(false);
      setMenu(false);
      if (inside) requestAnimationFrame(() => { if (toggle.current) toggle.current.focus({ preventScroll: true }); });
    }, []);

    // Inactivity: any touch, click or key inside the bar starts the count again. Not while the menu is open.
    const arm = useCallback(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(fold, IDLE_MS);
    }, [fold]);
    useEffect(() => {
      if (open && !menu) arm(); else clearTimeout(timer.current);
      return () => clearTimeout(timer.current);
    }, [open, menu, arm]);

    // A new screen folds the bar.
    const where = nav ? nav.page + '|' + ((nav.params && nav.params.view) || '') : '';
    useEffect(() => { setOpen(false); setMenu(false); }, [where]);

    useBackGuard(open && !menu, fold);
    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e) => { if (e.key === 'Escape' && !menu) { e.stopPropagation(); fold(); } };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, [open, menu, fold]);

    // Opening by keyboard puts focus on the current item (or the first), so the bar is reachable at once.
    const byKeyboard = useRef(false);
    useEffect(() => {
      if (!open || !box.current) return;
      const el = box.current.querySelector("[data-mv2='nav-item'][aria-current='page']") || box.current.querySelector("[data-mv2='nav-item']");
      if (el && byKeyboard.current) el.focus({ preventScroll: true });
      byKeyboard.current = false;
    }, [open]);

    if (wide) return null;

    const pick = (id) => {
      if (id === 'profile') { setMenu((m) => !m); return; }
      const t = targetOf(id);
      setOpen(false);
      setMenu(false);
      if (t) go(t[0], t[1]);
    };

    const item = (it) => h('button', {
      key: it.id, type: 'button', 'data-mv2': 'nav-item', 'data-nav': it.id,
      'aria-current': cur === it.id ? 'page' : undefined,
      'aria-expanded': it.id === 'profile' ? (menu ? 'true' : 'false') : undefined,
      // The account menu closes on a press outside it; this press is the toggle, so keep it from counting as "outside".
      onMouseDown: it.id === 'profile' ? (e) => e.stopPropagation() : undefined,
      onClick: () => pick(it.id),
    },
      Icon ? h(Icon, { name: it.icon, size: 22 }) : null,
      h('span', { 'data-mv2': 'nav-label' }, (str.items || {})[it.id]),
      it.id === 'profile' && unread > 0 ? h('span', { 'data-mv2': 'nav-dot', 'aria-hidden': 'true' }) : null);

    const curIcon = (ITEMS.find((it) => it.id === cur) || {}).icon || 'Menu';

    return h(React.Fragment, null,
      open ? h('div', { 'data-mv2': 'nav-dim', 'aria-hidden': 'true', onClick: fold }) : null,
      h('div', {
        ref: box, 'data-mv2': 'nav', 'data-open': open ? '' : undefined,
        onPointerDown: open ? arm : undefined, onKeyDown: open ? arm : undefined,
      },
        open
          ? h('nav', { id: 'mv2-nav', 'data-mv2': 'nav-bar', 'aria-label': str.label },
            ITEMS.map(item),
            h('button', {
              type: 'button', 'data-mv2': 'nav-close', 'aria-label': str.close, onClick: fold,
            }, Icon ? h(Icon, { name: 'X', size: 20 }) : null))
          : h('button', {
            ref: toggle, type: 'button', 'data-mv2': 'nav-toggle', 'aria-expanded': 'false',
            'aria-label': unread > 0 ? str.openUnread : str.open,
            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') byKeyboard.current = true; },
            onClick: () => setOpen(true),
          },
            Icon ? h(Icon, { name: curIcon, size: 22 }) : null,
            unread > 0 ? h('span', { 'data-mv2': 'nav-dot', 'aria-hidden': 'true' }) : null),
        menu && window.ProfilePanel
          ? h('div', { 'data-mv2': 'nav-menu' }, h(window.ProfilePanel, { anchor: 'nav', extras: true, onClose: () => setMenu(false) }))
          : null));
  }

  window.MapV2Nav = Nav;
  window.MapV2NavLib = { IDLE_MS, ITEMS, currentOf, targetOf };
})();
