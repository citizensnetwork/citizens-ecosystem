// ── Shell: navigation chrome + screen router ───────────────────────
// Mobile: the design's 84px bottom nav (5 tabs, gold active).
// Desktop (≥1024px): the design's left sidebar, content column centered.
// Overlay screens (post/brand/user/settings) stack above the active tab.
(function () {
  const { createElement: h, useState, useEffect } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD } = window.CWUI;

  const TABS = [
    { k: 'home', label: 'Home', icon: 'home' },
    { k: 'discover', label: 'Discover', icon: 'search' },
    { k: 'create', label: 'Create', icon: 'plus' },
    { k: 'inbox', label: 'Inbox', icon: 'chat' },
    { k: 'profile', label: 'Profile', icon: 'user' },
  ];

  function useIsDesktop() {
    const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
    useEffect(() => {
      const mq = window.matchMedia('(min-width: 1024px)');
      const onChange = (e) => setWide(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }, []);
    return wide;
  }

  function activeScreen(nav) {
    if (nav.stack.length) return nav.stack[nav.stack.length - 1];
    return { screen: nav.tab, params: {} };
  }

  function renderScreen({ screen, params }) {
    const S = window.CWScreens;
    switch (screen) {
      case 'home':
        return h(S.Home, {});
      case 'discover':
        return h(S.Discover, {});
      case 'create':
        return h(S.Create, {});
      case 'inbox':
        return h(S.Inbox, {});
      case 'profile':
        return h(S.Profile, {});
      case 'user':
        return h(S.Profile, { params });
      case 'brand':
        return h(S.Brand, { params });
      case 'post':
        return h(S.Post, { params });
      case 'settings':
        return h(S.Settings, {});
      default:
        return h(S.Home, {});
    }
  }

  function BottomNav() {
    const { nav, setTab } = useStore();
    const overlayOpen = nav.stack.length > 0;
    return h(
      'div',
      {
        style: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(84px + var(--safe-bottom))',
          background: '#fbfaf8',
          borderTop: '1px solid #f0eee9',
          display: 'flex',
          alignItems: 'flex-start',
          padding: '11px 8px calc(0px + var(--safe-bottom))',
          zIndex: 45,
        },
      },
      TABS.map((t) => {
        const active = !overlayOpen && nav.tab === t.k;
        const col = active ? GOLD : '#9a9892';
        return h(
          'button',
          {
            key: t.k,
            onClick: () => setTab(t.k),
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: 'none',
              padding: '4px 0',
            },
          },
          Icon(t.icon, { size: 24, color: col, sw: active ? 2.1 : 1.8 }),
          h(
            'span',
            { style: { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2px', color: col } },
            t.label,
          ),
        );
      }),
    );
  }

  function Sidebar() {
    const { nav, setTab, openSettings } = useStore();
    const overlayTop = nav.stack.length ? nav.stack[nav.stack.length - 1].screen : null;
    const item = (t, onClick, activeOverride) => {
      const active =
        activeOverride !== undefined ? activeOverride : !nav.stack.length && nav.tab === t.k;
      return h(
        'button',
        {
          key: t.k,
          onClick,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            border: 'none',
            background: active ? '#faf6ec' : 'transparent',
            borderRadius: 11,
            padding: '10px 12px',
            width: '100%',
          },
        },
        Icon(t.icon, { size: 20, color: active ? GOLD : '#6a6a6a' }),
        h(
          'span',
          {
            style: {
              fontSize: 13.5,
              fontWeight: active ? 700 : 600,
              color: active ? GOLD : '#555',
            },
          },
          t.label,
        ),
      );
    };
    return h(
      'div',
      {
        style: {
          width: 236,
          flex: 'none',
          borderRight: '1px solid #f0eee9',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          background: '#fff',
        },
      },
      h(
        'button',
        {
          onClick: () => setTab('home'),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            border: 'none',
            background: 'none',
            padding: '6px 10px 24px',
          },
        },
        h(Crown, { size: 22 }),
        h('span', { style: { fontSize: 14, letterSpacing: '0.3em', fontWeight: 700 } }, 'CITIZENS'),
      ),
      TABS.map((t) => item(t, () => setTab(t.k))),
      h('div', { style: { height: 1, background: '#f0eee9', margin: '11px 10px' } }),
      item(
        { k: 'settings', label: 'Settings', icon: 'sliders' },
        openSettings,
        overlayTop === 'settings',
      ),
    );
  }

  function Shell() {
    const { nav } = useStore();
    const isDesktop = useIsDesktop();
    const current = activeScreen(nav);

    if (isDesktop) {
      // Desktop: sidebar + centered phone-width content column (the app's
      // screens are mobile-composed; the design's full desktop layouts are a
      // fast-follow — this keeps one source of truth per screen).
      return h(
        'div',
        {
          style: {
            height: '100%',
            display: 'flex',
            background: '#e9e7e1',
            justifyContent: 'center',
            padding: '26px 16px',
          },
        },
        h(
          'div',
          {
            style: {
              width: '100%',
              maxWidth: 1180,
              height: '100%',
              display: 'flex',
              background: '#fff',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 30px 70px -30px rgba(0,0,0,0.35)',
              border: '1px solid #ececec',
            },
          },
          h(Sidebar, {}),
          h(
            'div',
            { style: { flex: 1, minWidth: 0, position: 'relative', background: '#fcfbf9' } },
            h(
              'div',
              {
                key: current.screen + JSON.stringify(current.params),
                style: {
                  height: '100%',
                  maxWidth: 640,
                  margin: '0 auto',
                  background: '#fff',
                  borderLeft: '1px solid #f0eee9',
                  borderRight: '1px solid #f0eee9',
                },
              },
              renderScreen(current),
            ),
          ),
        ),
      );
    }

    return h(
      'div',
      { style: { height: '100%', position: 'relative', background: '#fff', overflow: 'hidden' } },
      h(
        'div',
        {
          key: current.screen + JSON.stringify(current.params),
          style: { position: 'absolute', inset: 0 },
        },
        renderScreen(current),
      ),
      h(BottomNav, {}),
    );
  }

  window.CWShell = { Shell };
})();
