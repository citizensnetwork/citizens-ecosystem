// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — app shell (responsive nav + router)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useEffect, useRef } = React;
  const { cx, Avatar, SmartImage, Toasts } = window.UI;
  const Icon = window.Icon;
  const useBackGuard = window.useBackGuard || function () {};

  const BASE_TABS = [
    { page: 'home', label: 'Map', icon: 'Map' },
    { page: 'explore', label: 'Explore', icon: 'Compass' },
    { page: 'lets', label: 'Let\'s…', icon: 'Users' },
    { page: 'messages', label: 'Messages', icon: 'MessageCircle' },
    { page: 'notifications', label: 'Notifications', icon: 'Bell' },
  ];

  function roleBadge(role) {
    if (role === 'admin') return { label: 'Admin', color: '#8E44AD', fg: '#FFFFFF', icon: 'Shield' };
    if (role === 'contributor') return { label: 'Contributor', color: '#F2BD22', fg: '#0A0908', icon: 'Crown' };
    return null;
  }

  // ── Profile / role-switch panel ──
  // anchor 'top' (under the account button), 'nav' (above Map v2's folding nav, #210), 'rail' (beside the map home's
  // desktop nav), 'dock' (above the map home's sticky nav), or the sidebar's default.
  // extras: Map v2's nav has no Projects, Messages or Alerts of its own, so its account menu lists them, with counts.
  // `true` lists all three; an array lists only those pages (the map home's Me: Let's… is hidden with Do for now).
  const PANEL_POS = {
    top: 'right-0 top-full mt-2',
    nav: 'left-0 right-0 mx-auto bottom-0',
    rail: 'left-full top-0 ml-3',
    dock: 'right-0 bottom-full mb-3',
  };
  function ProfilePanel({ onClose, anchor, extras }) {
    const app = window.useApp();
    useBackGuard(true, onClose);
    const { user, role, go, isAdmin, isContributor, isPendingApplicant, listingRole, signOut, showSignIn, authed, toast, realUser, askAboutListing, unreadMsgs, unreadNotifs } = app;
    const ref = useRef(null);
    const [claiming, setClaiming] = useState(false);
    useEffect(() => {
      // A press outside closes the panel, but not one on the button that opened it (the panel's own parent box):
      // that button toggles, and closing here first would let its click open the panel straight back up.
      const h = (e) => {
        const box = ref.current;
        if (!box || box.contains(e.target)) return;
        if (box.parentNode && box.parentNode.contains(e.target)) return;
        onClose();
      };
      const t = setTimeout(() => document.addEventListener('mousedown', h), 0);
      return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
    }, [onClose]);

    const pos = PANEL_POS[anchor] || 'left-full bottom-0 ml-2';
    const go2 = (p) => { go(p); onClose(); };

    // An admin, or the Google Form, may have made a listing for this person's email (see
    // admin.jsx "Create Contributor"). This only ASKS (C10): when one is waiting, the confirm screen
    // opens; nothing is attached until they press Confirm there. Harmless to show broadly, since
    // the answer comes from the caller's own verified email.
    const claimListing = async () => {
      if (claiming || !realUser) return;
      setClaiming(true);
      try {
        const found = await askAboutListing(realUser.id, true);
        if (found) onClose();
        else toast('No pending listing found for your email.', 'red');
      } catch {
        toast('Could not check for a listing — please check your connection.', 'red');
      }
      setClaiming(false);
    };

    const links = [{ p: 'profile', label: 'View Profile', icon: 'User' }];
    if (extras) {
      const menu = (window.MapV2Strings && window.MapV2Strings.nav && window.MapV2Strings.nav.menu) || {};
      const wanted = Array.isArray(extras) ? extras : ['lets', 'messages', 'notifications'];
      [
        { p: 'lets', label: menu.lets, icon: 'Users' },
        { p: 'messages', label: menu.messages, icon: 'MessageCircle', count: unreadMsgs },
        { p: 'notifications', label: menu.alerts, icon: 'Bell', count: unreadNotifs },
      ].forEach((l) => { if (wanted.indexOf(l.p) !== -1) links.push(l); });
    }
    // citizenscentral.co.za/dashboard is a real, bookmarkable destination
    // (next.config.ts rewrite + store.jsx deep link) once you ARE a
    // contributor. "Become a Contributor" itself deliberately lives only in
    // Settings now, not this everyday menu — founder ask: stop advertising
    // it everywhere and let a citizen find it in their own profile management.
    const teamPortal = listingRole === 'editor' || listingRole === 'viewer';
    if (isContributor || teamPortal) links.push({ p: 'dashboard', label: 'Contributor Portal', icon: 'LayoutDashboard' });
    // Someone whose application is waiting for an admin has a Dashboard too (D-12).
    else if (isPendingApplicant) links.push({ p: 'dashboard', label: 'My Application', icon: 'Clock' });
    if (isAdmin) links.push({ p: 'admin', label: 'Admin Panel', icon: 'Shield' });
    links.push({ p: 'settings', label: 'Settings', icon: 'Settings' });

    return React.createElement('div', {
      ref, className: cx('absolute z-[150] w-72 glass-strong rounded-2xl shadow-2xl border border-white/60 overflow-hidden fade-in', pos),
    },
      React.createElement('div', { className: 'relative' },
        React.createElement('div', { className: 'h-20 overflow-hidden' },
          React.createElement(SmartImage, { src: user.coverPhoto, alt: '', className: 'w-full h-full' }),
          React.createElement('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/55 to-transparent' })),
        React.createElement('div', { className: 'absolute bottom-0 left-4 translate-y-1/2' },
          React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size: 48, rounded: 'xl', ring: '#F7F4EE' }))),
      React.createElement('div', { className: 'pt-8 pb-4 px-4' },
        React.createElement('p', { className: 'text-sm font-bold text-foreground' }, user.name),
        React.createElement('div', { className: 'flex items-center gap-1.5 mt-0.5' },
          role === 'admin' && React.createElement(Icon, { name: 'Shield', size: 11, className: 'text-[#8E44AD]' }),
          role === 'contributor' && React.createElement(Icon, { name: 'Crown', size: 11, className: 'text-gold' }),
          React.createElement('span', { className: 'text-[10px] font-semibold text-muted-foreground capitalize' }, role)),
        React.createElement('p', { className: 'text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2' }, user.bio),

        React.createElement('div', { className: 'mt-3 space-y-0.5 border-t border-border pt-3' },
          links.map((l) => React.createElement('button', {
            key: l.p, onClick: () => go2(l.p),
            className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 transition-colors text-left',
          },
            React.createElement(Icon, { name: l.icon, size: 15, className: 'text-muted-foreground' }),
            React.createElement('span', null, l.label),
            l.count > 0 && React.createElement('span', {
              className: 'ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-foreground text-[11px] font-bold flex items-center justify-center',
              'aria-label': window.MapV2Strings.nav.unread(l.count),
            }, l.count),
            React.createElement(Icon, { name: 'ChevronRight', size: 13, className: cx(l.count > 0 ? '' : 'ml-auto', 'text-muted-foreground') })))),

        role === 'citizen' && realUser && React.createElement('button', {
          onClick: claimListing, disabled: claiming,
          className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 transition-colors text-left disabled:opacity-60',
        },
          React.createElement(Icon, { name: 'Sparkles', size: 15, className: 'text-muted-foreground' }),
          React.createElement('span', null, claiming ? 'Checking…' : 'Claim a Contributor listing')),

        React.createElement('div', { className: 'mt-3 border-t border-border pt-3' },
          authed
            ? React.createElement('button', { onClick: () => { onClose(); signOut(); }, className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors' },
                React.createElement(Icon, { name: 'LogOut', size: 15 }),
                React.createElement('span', null, 'Sign Out'))
            : React.createElement('button', { onClick: () => { onClose(); showSignIn(); }, className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gold-dark hover:bg-accent/60 transition-colors' },
                React.createElement(Icon, { name: 'LogIn', size: 15 }),
                React.createElement('span', null, 'Sign in')))));
  }

  // ── AccountButton — THE profile entry point, top-right, everywhere ────
  //  There used to be two: this one on the map, and a "You" tab in the mobile
  //  bottom bar whose panel opened off the bottom of the screen (it wrapped
  //  ProfilePanel in an `absolute bottom-full` box and then positioned the
  //  panel `top-full` BELOW that box — so it rendered past the viewport edge
  //  and could not be used). The bottom-bar copy is gone; this is the only
  //  one, and it sits in the same corner on the map, on Kingdom Exploration
  //  and on every `Header`-based screen.
  //
  //  variant 'floating' — glass tile, for sitting over the map
  //  variant 'inline'   — plain avatar, for sitting inside a solid header
  function AccountButton({ variant = 'floating' }) {
    const { user, role } = window.useApp();
    const [open, setOpen] = useState(false);
    const floating = variant === 'floating' || variant === 'round';
    const round = variant === 'round';   // Map v2's home (#210): a round glass button with a gold ring
    const size = floating ? 48 : 36;
    return React.createElement('div', { className: 'relative shrink-0' },
      React.createElement('button', {
        onClick: () => setOpen((s) => !s),
        'aria-label': 'Your account',
        'aria-expanded': open,
        className: cx('overflow-hidden relative block',
          round ? 'w-12 h-12 glass rounded-full shadow-xl ring-2 ring-gold'
            : floating ? 'w-12 h-12 glass rounded-2xl shadow-xl border border-white/60'
              : 'w-9 h-9 rounded-xl ring-1 ring-border'),
      },
        React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size, rounded: round ? 'full' : 'xl' }),
        role !== 'citizen' && React.createElement('span', {
          className: 'absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-gold border-2 border-white flex items-center justify-center',
        }, React.createElement(Icon, { name: 'Crown', size: 7, className: 'text-white' }))),
      open && React.createElement(ProfilePanel, { onClose: () => setOpen(false), anchor: 'top' }));
  }

  // ── Desktop sidebar ──
  function Sidebar() {
    const app = window.useApp();
    const { role, nav, go, user, isAdmin, isContributor, isPendingApplicant, listingRole, unreadNotifs, unreadMsgs } = app;
    const [collapsed, setCollapsed] = useState(false);
    const [showProfile, setShowProfile] = useState(false);

    const tabs = [...BASE_TABS];
    const teamPortal = listingRole === 'editor' || listingRole === 'viewer';
    if (isContributor || teamPortal) tabs.push({ page: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' });
    else if (isPendingApplicant) tabs.push({ page: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' });
    if (isAdmin) tabs.push({ page: 'admin', label: 'Admin Panel', icon: 'Shield' });
    tabs.push({ page: 'settings', label: 'Settings', icon: 'Settings' });

    const badge = (p) => (p === 'notifications' ? unreadNotifs : p === 'messages' ? unreadMsgs : p === 'admin' && isAdmin ? app.applications.filter((a) => a.status === 'pending').length : 0);
    const active = (p) => nav.page === p || (p === 'home' && nav.page === 'event') || (p === 'home' && nav.page === 'place');
    const rb = roleBadge(role);

    return React.createElement('aside', {
      className: cx('hidden md:flex flex-col glass border-r border-white/40 z-40 shrink-0 transition-all duration-300 relative', collapsed ? 'w-[74px]' : 'w-64'),
    },
      // logo
      React.createElement('button', {
        onClick: () => go('home'),
        className: cx('px-4 py-5 border-b border-white/30 flex items-center', collapsed ? 'justify-center' : 'gap-3'),
      },
        // the Citizens crown (auth.jsx), bare on the glass: the gold PNG would
        // vanish on the old gold-gradient tile
        React.createElement(window.CrownMark, { size: 40 }),
        !collapsed && React.createElement('div', { className: 'text-left overflow-hidden' },
          React.createElement('p', { className: 'text-sm font-bold text-foreground tracking-tight leading-none font-display' }, 'Citizens'),
          React.createElement('p', { className: 'text-[10px] text-gold font-bold tracking-[0.22em] uppercase mt-0.5' }, 'Connect'))),

      // user mini profile
      React.createElement('div', { className: cx('border-b border-white/20 relative', collapsed ? 'px-2 py-3' : 'px-3 py-3') },
        React.createElement('button', {
          onClick: () => setShowProfile((s) => !s),
          className: cx('flex items-center w-full rounded-xl transition-colors hover:bg-accent/50 p-2', collapsed ? 'justify-center' : 'gap-3'),
        },
          React.createElement('div', { className: 'relative shrink-0' },
            React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size: 36, ring: 'rgba(242,189,34,0.4)' }),
            role !== 'citizen' && React.createElement('span', {
              className: 'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center',
              style: { background: rb.color },
            }, React.createElement(Icon, { name: rb.icon, size: 8, style: { color: rb.fg } }))),
          !collapsed && React.createElement('div', { className: 'text-left overflow-hidden flex-1' },
            React.createElement('p', { className: 'text-xs font-semibold text-foreground truncate leading-tight' }, user.name),
            React.createElement('p', { className: 'text-[10px] text-muted-foreground capitalize' }, role))),
        showProfile && React.createElement(ProfilePanel, { onClose: () => setShowProfile(false), anchor: 'sidebar' })),

      // nav
      React.createElement('nav', { className: 'flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-none' },
        tabs.map((t) => {
          const a = active(t.page), b = badge(t.page);
          return React.createElement('button', {
            key: t.page, onClick: () => go(t.page), title: collapsed ? t.label : undefined,
            className: cx('w-full flex items-center rounded-xl text-sm transition-all duration-200 relative',
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5',
              a ? 'bg-gold/12 text-gold-dark font-semibold' : 'text-foreground/60 hover:bg-accent/60 hover:text-foreground'),
          },
            a && !collapsed && React.createElement('span', { className: 'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gold rounded-r-full' }),
            React.createElement('div', { className: 'relative shrink-0' },
              React.createElement(Icon, { name: t.icon, size: 17, strokeWidth: a ? 2.4 : 1.8 }),
              b > 0 && collapsed && React.createElement('span', { className: 'absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-gold text-white text-[8px] font-bold rounded-full flex items-center justify-center' }, b)),
            !collapsed && React.createElement(React.Fragment, null,
              React.createElement('span', { className: 'flex-1 text-left' }, t.label),
              b > 0 && React.createElement('span', { className: 'min-w-[20px] h-5 px-1 bg-gold text-black text-[10px] font-bold rounded-full flex items-center justify-center' }, b)));
        })),

      // Application status only — shown once a citizen has actually started
      // the flow, never as cold advertising. "Become a Contributor" itself
      // now lives only in Settings (founder ask: stop pitching it on every
      // page; a citizen finds it in their own profile management instead).
      // Pending (D-12) → their Dashboard; an approved one is already a Contributor.
      !collapsed && isPendingApplicant &&
        React.createElement('div', { className: 'px-3 pb-3 border-t border-white/20 pt-3' },
          React.createElement('button', { onClick: () => go('dashboard'), className: 'w-full text-left rounded-xl p-3.5 bg-accent/70 border border-gold/20 hover:bg-accent' },
            React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
              React.createElement(Icon, { name: 'Clock', size: 13, className: 'text-gold-dark' }),
              React.createElement('p', { className: 'text-[11px] font-bold text-gold-dark' }, 'Application under review')),
            React.createElement('p', { className: 'text-[9px] text-gold-dark/75' }, "Finish your profile while you wait. We'll notify you once an admin responds."))),

      // collapse
      React.createElement('div', { className: cx('border-t border-white/20', collapsed ? 'p-2' : 'px-3 py-3') },
        React.createElement('button', {
          onClick: () => setCollapsed((c) => !c),
          className: 'w-full flex items-center justify-center gap-2 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all text-xs font-medium',
        },
          React.createElement(Icon, { name: collapsed ? 'ChevronRight' : 'ChevronLeft', size: 15 }),
          !collapsed && React.createElement('span', null, 'Collapse'))));
  }

  // ── Floating create FAB (contributors) ──
  // Pack 08: the + button is hidden on the map so the map keeps the screen.
  // The create flow itself stays (openCreate, this menu, every other screen). Restore by flipping the flag.
  const SHOW_CREATE_ON_MAP = false;
  function CreateFab() {
    const { isContributor, listingRole, nav, openCreate } = window.useApp();
    const [open, setOpen] = useState(false);
    if (!SHOW_CREATE_ON_MAP && nav.page === 'home') return null;
    if (!(isContributor || listingRole === 'editor') || ['messages', 'settings', 'intake-upgrade'].includes(nav.page)) return null;
    // There is no bottom bar: the button sits level with the folding nav, clear of the Explore row above it.
    return React.createElement('div', { className: 'fixed right-4 md:bottom-6 z-40 flex flex-col items-end gap-2 bottom-[calc(env(safe-area-inset-bottom)+12px)]' },
      open && React.createElement(React.Fragment, null,
        React.createElement('button', { onClick: () => { openCreate('place'); setOpen(false); }, className: 'flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl glass-strong shadow-xl border border-white/60 scale-in' },
          React.createElement(Icon, { name: 'MapPin', size: 15, className: 'text-[#3498DB]' }), React.createElement('span', { className: 'text-xs font-bold' }, 'Add Place')),
        React.createElement('button', { onClick: () => { openCreate('event'); setOpen(false); }, className: 'flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl glass-strong shadow-xl border border-white/60 scale-in' },
          React.createElement(Icon, { name: 'CalendarPlus', size: 15, className: 'text-gold-dark' }), React.createElement('span', { className: 'text-xs font-bold' }, 'Create Event'))),
      React.createElement('button', {
        onClick: () => setOpen((o) => !o),
        className: 'w-14 h-14 rounded-2xl gold-gradient text-white shadow-[0_8px_24px_rgba(242,189,34,0.5)] flex items-center justify-center transition-transform active:scale-95',
        style: { transform: open ? 'rotate(45deg)' : 'none' },
      }, React.createElement(Icon, { name: 'Plus', size: 24, strokeWidth: 2.5 })));
  }

  // ── Page router ──
  // Me and Explore sit in the live shell. The class gives them the pack layout
  // without the pack dock's top and bottom clearance.
  function placed(wide, node) {
    return React.createElement('div', { className: 'connect-shell connect-placed ' + (wide ? 'desktop-review' : 'phone-review') },
      React.createElement('div', { className: 'connect-frame' }, node));
  }

  // The map, Explore and Me share ONE stage (founder's design, 2026-11-26): Explore is pulled in over the live map from the
  // right and Me from the left, so the map stays mounted underneath (same element type in the same place for all three, so
  // React keeps it). Under either screen the map is shown as one small stretched snapshot (ConnectExplore.MapSnapshot), the
  // cheap blur. On the map, a pill on each edge pulls its screen in (a swipe or flick, a tap or Enter); the left one is for
  // a phone, where there is no rail. A swipe back toward the map's side puts the screen away.
  function MeOver({ wide }) {
    const app = window.useApp();
    const X = window.ConnectExplore;
    const ref = useRef(null);
    const press = useRef(null);
    const swipes = X.swipeHandlers(press, (dir) => {
      if (dir !== 'left') return;
      X.slideAway(ref.current, 'left', () => app.go('home', {}));
    }, X.SWIPE_IGNORE);
    return React.createElement('div', Object.assign({ ref, 'data-mv2': 'me-over' }, swipes),
      React.createElement('div', { 'data-mv2': 'me-veil', 'aria-hidden': 'true' }),
      placed(wide, React.createElement(window.ConnectMe.Page)));
  }
  function MapStage({ over, wide }) {
    const app = window.useApp();
    const X = window.ConnectExplore;
    return React.createElement('div', { 'data-mv2': 'map-stage', 'data-over': over || undefined },
      React.createElement('div', { 'data-mv2': 'map-under', 'aria-hidden': over ? 'true' : undefined, inert: over ? '' : undefined },
        React.createElement(window.HomePage, { under: !!over }),
        over ? React.createElement(X.MapSnapshot) : null),
      over === 'explore' ? React.createElement(X.Page)
        : over === 'me' ? React.createElement(MeOver, { wide })
          : React.createElement(React.Fragment, null,
            wide ? null : React.createElement(X.EdgeHandle, { side: 'left', onOpen: () => app.go('profile', {}) }),
            React.createElement(X.EdgeHandle, { side: 'right', onOpen: () => app.go('explore') })));
  }

  function CurrentPage() {
    const { nav, isPendingApplicant, listingRole } = window.useApp();
    const wide = window.ConnectChrome && window.ConnectChrome.useWide ? window.ConnectChrome.useWide() : false;
    const p = nav.page;
    switch (p) {
      case 'home': return React.createElement(MapStage, { wide });
      case 'explore': return React.createElement(MapStage, { over: 'explore', wide });
      case 'lets': return React.createElement(window.LetsPage);
      case 'community': return React.createElement(window.CommunityPage);
      case 'messages': return React.createElement(window.MessagesPage);
      case 'notifications': return React.createElement(window.NotificationsPage);
      case 'dashboard': return React.createElement((listingRole === 'editor' || listingRole === 'viewer') ? window.DashboardPage : (isPendingApplicant ? window.PendingApplicationPage : window.DashboardPage));
      case 'admin': return React.createElement(window.AdminPage);
      case 'settings': return placed(wide, React.createElement(window.ConnectMe.Page, { space: 'Settings' }));
      case 'intake-upgrade': return React.createElement(window.IntakeUpgradePage);
      case 'apply': return React.createElement(window.ApplyPage);
      case 'onboarding': return React.createElement(window.OnboardingPage);
      case 'event': return React.createElement(window.EventProfilePage, { id: nav.params.id });
      case 'place': return React.createElement(window.PlaceProfilePage, { id: nav.params.id });
      case 'profile': return nav.params.id
        ? React.createElement(window.ContributorProfilePage, { id: nav.params.id })
        : React.createElement(MapStage, { over: 'me', wide });
      default: return React.createElement(MapStage, { wide });
    }
  }

  function AssistBanner() {
    const { assistMode, activeContributor, exitAssist } = window.useApp();
    if (!assistMode) return null;
    return React.createElement('div', { className: 'shrink-0 flex items-center gap-2.5 px-4 py-2 bg-[#8E44AD] text-white z-30' },
      React.createElement(Icon, { name: 'KeyRound', size: 14, className: 'shrink-0' }),
      React.createElement('p', { className: 'text-xs font-semibold flex-1 min-w-0 truncate' },
        'Assist mode — acting as ',
        React.createElement('b', null, activeContributor ? activeContributor.name : 'contributor')),
      React.createElement('button', {
        onClick: exitAssist,
        className: 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-bold shrink-0',
      },
        React.createElement(Icon, { name: 'LogOut', size: 12 }), 'Exit'));
  }

  // One rail. The crown stays at the top; the words beside it hide when the rail
  // is closed. Me, Map, Explore keep that order (founder, 2026-11-26), and Do sits under them.
  const RAIL_DO = [
    { page: 'lets', label: 'Let\u2019s\u2026' },
    { page: 'community', label: 'Kingdom Projects' },
  ];
  function AppRail() {
    const app = window.useApp();
    const nav = app.nav || { page: 'home', params: {} };
    const page = nav.page || 'home';
    const wide = window.ConnectChrome && window.ConnectChrome.useWide ? window.ConnectChrome.useWide() : false;
    const onMap = page === 'home';
    const open = !onMap;
    const [door, setDoor] = useState(false);
    useEffect(() => { setDoor(false); }, [page]);
    const chrome = window.ConnectChrome;
    const icon = (kind) => chrome ? React.createElement('span', { className: 'inline-icon' }, React.createElement(chrome.Icon, { kind: kind })) : null;
    const goMap = () => {
      app.go('home', {});
      window.dispatchEvent(new Event('cc-rail-map'));
    };
    const goItem = (id) => {
      setDoor(false);
      if (id === 'map') { goMap(); return; }
      if (id === 'explore') { app.go('explore'); return; }
      if (id === 'me') { app.go('profile', {}); return; }
    };
    const current = page === 'explore' ? 'explore' : (page === 'profile' && !(nav.params && nav.params.id) ? 'me' : (onMap ? 'map' : ''));
    const item = (id, label) => React.createElement('button', {
      key: id, type: 'button', className: 'cn-rail-btn' + (current === id ? ' on' : ''),
      'data-rail-item': id, 'aria-label': label, 'aria-current': current === id ? 'page' : undefined,
      onClick: () => goItem(id),
    }, icon(id === 'me' ? 'Me' : id === 'explore' ? 'Explore' : 'Map'),
      React.createElement('small', { className: 'cn-rail-label' }, label));
    const showLabels = open && wide;
    return React.createElement('nav', {
      className: 'cn-rail', 'data-open': showLabels ? 'true' : 'false', 'aria-label': 'Connect',
    },
      React.createElement('button', {
        type: 'button', className: 'cn-rail-brand', 'aria-label': 'Citizens Connect', onClick: goMap,
      },
        window.CrownMark ? React.createElement(window.CrownMark, { size: 36 }) : null,
        React.createElement('span', { className: 'cn-rail-word' }, React.createElement('b', null, 'Citizens'), React.createElement('small', null, 'Connect'))),
      React.createElement('div', { className: 'cn-rail-stack' },
        item('me', 'Me'), item('map', 'Map'), item('explore', 'Explore'),
        React.createElement('div', { className: 'cn-rail-do-wrap' },
          React.createElement('button', {
            type: 'button', className: 'cn-rail-do' + (door || page === 'lets' || page === 'community' ? ' on' : ''),
            'aria-label': 'Do', 'aria-expanded': door ? 'true' : 'false',
            onClick: () => setDoor((v) => !v),
          }, icon('Do'), React.createElement('small', { className: 'cn-rail-label' }, 'Do')),
          door && React.createElement('div', { className: 'cn-rail-door cn-glass', role: 'menu', 'aria-label': 'Do' },
            RAIL_DO.map((row) => React.createElement('button', {
              key: row.page, type: 'button', role: 'menuitem', onClick: () => { setDoor(false); app.go(row.page); },
            }, row.label))))));
  }

  // ── The phone's chrome (founder, 2026-11-25): no side rail on a phone. ──
  // The crown floats in the top-left corner on every screen and takes the person home: the map, every panel
  // closed and every filter cleared ('cc-crown-home', which home.jsx and the Explore panel answer). Off the map the
  // Citizens · Connect words sit beside it, and the same floating nav the map uses (Me, Map, Explore, Do) sits at
  // the foot. On the map the Explore panel draws that nav itself, where the crown used to be.
  // Order (founder, 2026-11-26): Me, Map, Explore, Do, the way the screens sit around the map (Me left, Explore right).
  const PHONE_DOCK = [
    { id: 'me', label: 'Me', kind: 'Me' },
    { id: 'map', label: 'Map', kind: 'Map' },
    { id: 'explore', label: 'Explore', kind: 'Explore' },
    { id: 'do', label: 'Do', kind: 'Do' },
  ];
  // The screens drawn by placed() (CurrentPage): their own scroller runs under the floating nav.
  const PLACED = ['settings', 'profile'];
  // Step-by-step forms keep their own Continue bar at the foot, so the floating nav stands aside there (the crown stays).
  const FLOWS = ['apply', 'onboarding', 'intake-upgrade'];
  function crownHome(app, onMap) {
    // Off the map, the map screen mounts fresh: at rest, with no filter. On it, the screen and its panel reset themselves.
    if (onMap) window.dispatchEvent(new Event('cc-crown-home'));
    else app.go('home', {});
  }
  function PhoneChrome() {
    const app = window.useApp();
    const nav = app.nav || { page: 'home', params: {} };
    const page = nav.page || 'home';
    const onMap = page === 'home';
    const flow = FLOWS.indexOf(page) !== -1;
    const [door, setDoor] = useState(false);
    useEffect(() => { setDoor(false); }, [page]);
    const chrome = window.ConnectChrome;
    const icon = (kind) => (chrome ? React.createElement('span', { className: 'inline-icon' }, React.createElement(chrome.Icon, { kind: kind })) : null);
    const current = page === 'explore' ? 'explore'
      : (page === 'profile' && !(nav.params && nav.params.id) ? 'me'
        : (RAIL_DO.some((r) => r.page === page) ? 'do' : ''));
    const goItem = (id) => {
      if (id === 'do') { setDoor((v) => !v); return; }
      setDoor(false);
      if (id === 'map') { app.go('home', {}); return; }
      if (id === 'explore') { app.go('explore'); return; }
      if (id === 'me') app.go('profile', {});
    };
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'cn-phone-crown', 'data-words': onMap ? undefined : '' },
        React.createElement('button', {
          type: 'button', className: 'cn-phone-crown-btn', 'aria-label': 'Citizens Connect: back to the map',
          onClick: () => crownHome(app, onMap),
        }, window.CrownMark ? React.createElement(window.CrownMark, { size: 30 }) : null),
        onMap ? null : React.createElement('span', { className: 'cn-phone-word', 'aria-hidden': 'true' },
          React.createElement('b', null, 'Citizens'), React.createElement('small', null, 'Connect'))),
      onMap || flow ? null : React.createElement('nav', { className: 'cn-phone-dock', 'data-mv2': 'explore-dock', 'aria-label': 'Connect' },
        door && React.createElement('div', { 'data-mv2': 'dock-door', className: 'cn-glass', role: 'menu', 'aria-label': 'Do' },
          RAIL_DO.map((row) => React.createElement('button', {
            key: row.page, type: 'button', role: 'menuitem', onClick: () => { setDoor(false); app.go(row.page); },
          }, row.label))),
        PHONE_DOCK.map((it) => React.createElement('button', {
          key: it.id, type: 'button', 'data-mv2': 'explore-nav', 'data-nav': it.id,
          'data-emphasis': it.id === 'map' ? '' : undefined,
          'aria-current': current === it.id ? 'page' : undefined,
          'aria-expanded': it.id === 'do' ? (door ? 'true' : 'false') : undefined,
          onClick: () => goItem(it.id),
        }, icon(it.kind), React.createElement('small', null, it.label)))));
  }

  function Shell() {
    const { createKind, createEditing, authed, guestMode, authResolved, nav } = window.useApp();
    const wide = window.ConnectChrome && window.ConnectChrome.useWide ? window.ConnectChrome.useWide() : true;
    const onMap = nav && nav.page === 'home';
    // Signed out: the landing — but while a probable session is still resolving,
    // the loading splash instead, so a returning member sees no "sign in" flash.
    if (!authed && !guestMode) return React.createElement(authResolved ? window.AuthScreen : window.LoadingSplash);
    return React.createElement('div', {
      className: 'connect-app', 'data-rail': onMap ? 'closed' : 'open', 'data-phone': wide ? undefined : '',
      'data-page': nav && nav.page ? nav.page : 'home',
      // Explore and Me float over the map (MapStage): no crown band, the screen runs edge to edge
      'data-over': nav && (nav.page === 'explore' || (nav.page === 'profile' && !(nav.params && nav.params.id))) ? '' : undefined,
      'data-placed': PLACED.indexOf(nav && nav.page) !== -1 && !(nav.params && nav.params.id) ? '' : undefined,
      'data-flow': FLOWS.indexOf(nav && nav.page) !== -1 ? '' : undefined,
    },
      wide ? React.createElement(AppRail) : React.createElement(PhoneChrome),
      React.createElement('main', { className: 'connect-app-main' },
        React.createElement(AssistBanner),
        React.createElement(CurrentPage)),
      React.createElement(CreateFab),
      createKind && React.createElement(window.CreateFlow, { kind: createKind, editing: createEditing }),
      window.CCtweaks && React.createElement(window.CCtweaks),
      window.CCListingClaim && React.createElement(window.CCListingClaim.Host),
      React.createElement(Toasts));
  }

  window.Shell = Shell;
  window.ProfilePanel = ProfilePanel;
  window.AccountButton = AccountButton;
})();
