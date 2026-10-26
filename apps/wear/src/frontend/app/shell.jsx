// ── Shell: navigation chrome + screen router ───────────────────────
// Mobile: the design's 84px bottom nav (5 tabs, gold active).
// Desktop (≥1024px): the design's left sidebar, content column centered.
// Overlay screens (post/brand/user/settings) stack above the active tab.
(function () {
  const { createElement: h, useState, useEffect } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD_INK } = window.CWUI;

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
      case 'brandApply':
        return h(S.BrandApply, {});
      case 'concepts':
        return h(S.Concepts, {});
      case 'concept':
        return h(S.ConceptDetail, { params });
      case 'createConcept':
        return h(S.CreateConcept, {});
      case 'admin':
        return h(S.AdminQueue, {});
      case 'impersonate':
        return h(S.Impersonate, {});
      default:
        return h(S.Home, {});
    }
  }

  // Persistent, unmissable banner for the whole sign-in-as session (§7.4).
  // Fixed to the very top, visually distinct (danger red), always on top,
  // with the one-tap Exit control. Rendered above BOTH layouts.
  function ImpersonationBanner() {
    const { impersonation, exitImpersonation, openImpersonate, nav } = useStore();
    if (!impersonation || !impersonation.session) return null;
    const t = impersonation.target;
    const handle = t ? '@' + t.handle : 'user';
    const onView = nav.stack.length && nav.stack[nav.stack.length - 1].screen === 'impersonate';
    return h(
      'div',
      {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          background: '#b42318',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'calc(8px + var(--safe-top)) 14px 8px',
          boxShadow: '0 2px 10px -2px rgba(0,0,0,0.4)',
        },
      },
      Icon('user', { size: 15, color: '#fff' }),
      h(
        'div',
        { style: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.25 } },
        h('span', null, 'Viewing as ' + handle),
        h(
          'span',
          { style: { display: 'block', fontSize: 10.5, fontWeight: 600, opacity: 0.85 } },
          'Read-only admin session · audited',
        ),
      ),
      onView
        ? null
        : h(
            'button',
            {
              onClick: openImpersonate,
              style: {
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: '#fff',
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 11.5,
                fontWeight: 700,
              },
            },
            'View',
          ),
      h(
        'button',
        {
          onClick: () => exitImpersonation(),
          style: {
            border: 'none',
            background: '#fff',
            color: '#b42318',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 11.5,
            fontWeight: 800,
          },
        },
        'Exit',
      ),
    );
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
          background: 'var(--surface-0)',
          borderTop: '1px solid var(--divider)',
          display: 'flex',
          alignItems: 'flex-start',
          padding: '11px 8px calc(0px + var(--safe-bottom))',
          zIndex: 45,
        },
      },
      TABS.map((t) => {
        const active = !overlayOpen && nav.tab === t.k;
        const col = active ? GOLD_INK : 'var(--text-2)';
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
    const { nav, setTab, openSettings, openConcepts, openAdmin, me } = useStore();
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
            background: active ? 'var(--surface-2)' : 'transparent',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            width: '100%',
          },
        },
        Icon(t.icon, { size: 20, color: active ? GOLD_INK : 'var(--text-2)' }),
        h(
          'span',
          {
            style: {
              fontSize: 13.5,
              fontWeight: active ? 700 : 600,
              color: active ? GOLD_INK : 'var(--text-2)',
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
          borderRight: '1px solid var(--divider)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          background: 'var(--surface-1)',
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
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              letterSpacing: '0.3em',
              fontWeight: 600,
            },
          },
          'CITIZENS',
        ),
      ),
      TABS.map((t) => item(t, () => setTab(t.k))),
      h('div', { style: { height: 1, background: 'var(--divider)', margin: '11px 10px' } }),
      item(
        { k: 'concepts', label: 'Concepts', icon: 'tee' },
        openConcepts,
        overlayTop === 'concepts' || overlayTop === 'concept' || overlayTop === 'createConcept',
      ),
      me && me.role
        ? item({ k: 'admin', label: 'Admin', icon: 'doc' }, openAdmin, overlayTop === 'admin')
        : null,
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
            background: 'var(--surface-0)',
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
              background: 'var(--surface-1)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--elev-2)',
              border: '1px solid var(--divider)',
            },
          },
          h(Sidebar, {}),
          h(
            'div',
            {
              style: { flex: 1, minWidth: 0, position: 'relative', background: 'var(--surface-0)' },
            },
            h(ImpersonationBanner, {}),
            h(
              'div',
              {
                key: current.screen + JSON.stringify(current.params),
                style: {
                  height: '100%',
                  maxWidth: 640,
                  margin: '0 auto',
                  background: 'var(--surface-1)',
                  borderLeft: '1px solid var(--divider)',
                  borderRight: '1px solid var(--divider)',
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
      {
        style: {
          height: '100%',
          position: 'relative',
          background: 'var(--surface-1)',
          overflow: 'hidden',
        },
      },
      h(ImpersonationBanner, {}),
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
