// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — app shell (responsive nav + router)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useEffect, useRef } = React;
  const { cx, Avatar, SmartImage, Toasts } = window.UI;
  const Icon = window.Icon;

  const BASE_TABS = [
    { page: 'home', label: 'Discover', icon: 'Map' },
    { page: 'community', label: 'Kingdom Projects', icon: 'Lightbulb' },
    { page: 'messages', label: 'Messages', icon: 'MessageCircle' },
    { page: 'notifications', label: 'Notifications', icon: 'Bell' },
  ];

  function roleBadge(role, level) {
    if (role === 'admin') return { label: 'Admin', color: '#8E44AD', icon: 'Shield' };
    if (role === 'contributor') return { label: level || 'Contributor', color: '#C9A84C', icon: 'Crown' };
    return null;
  }

  // ── Profile / role-switch panel ──
  function ProfilePanel({ onClose, anchor }) {
    const app = window.useApp();
    const { user, role, go, isAdmin, isContributor, signOut } = app;
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const t = setTimeout(() => document.addEventListener('mousedown', h), 0);
      return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
    }, [onClose]);

    const ROLES = [];
    const pos = anchor === 'top' ? 'right-0 top-full mt-2' : 'left-full bottom-0 ml-2';
    const go2 = (p) => { go(p); onClose(); };

    const links = [{ p: 'profile', label: 'View Profile', icon: 'User' }];
    if (isContributor) links.push({ p: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' });
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
          React.createElement('span', { className: 'text-[10px] font-semibold text-muted-foreground capitalize' }, role),
          role === 'contributor' && user.involvementLevel && React.createElement('span', { className: 'text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-gold-dark' }, user.involvementLevel)),
        React.createElement('p', { className: 'text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2' }, user.bio),

        React.createElement('div', { className: 'mt-3 space-y-0.5 border-t border-border pt-3' },
          links.map((l) => React.createElement('button', {
            key: l.p, onClick: () => go2(l.p),
            className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 transition-colors text-left',
          },
            React.createElement(Icon, { name: l.icon, size: 15, className: 'text-muted-foreground' }),
            React.createElement('span', null, l.label),
            React.createElement(Icon, { name: 'ChevronRight', size: 13, className: 'ml-auto text-muted-foreground' })))),

        React.createElement('div', { className: 'mt-3 border-t border-border pt-3' },
          React.createElement('button', { onClick: () => { onClose(); signOut(); }, className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors' },
            React.createElement(Icon, { name: 'LogOut', size: 15 }),
            React.createElement('span', null, 'Sign Out')))));
  }

  // ── Desktop sidebar ──
  function Sidebar() {
    const app = window.useApp();
    const { role, nav, go, user, isAdmin, isContributor, unreadNotifs, unreadMsgs, myApplication, myContributor } = app;
    const [collapsed, setCollapsed] = useState(false);
    const [showProfile, setShowProfile] = useState(false);

    const tabs = [...BASE_TABS];
    if (isContributor) tabs.push({ page: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' });
    if (isAdmin) tabs.push({ page: 'admin', label: 'Admin Panel', icon: 'Shield' });
    tabs.push({ page: 'settings', label: 'Settings', icon: 'Settings' });

    const badge = (p) => (p === 'notifications' ? unreadNotifs : p === 'messages' ? unreadMsgs : p === 'admin' && isAdmin ? app.applications.filter((a) => a.status === 'pending').length : 0);
    const active = (p) => nav.page === p || (p === 'home' && nav.page === 'event') || (p === 'home' && nav.page === 'place');
    const rb = roleBadge(role, user.involvementLevel);

    return React.createElement('aside', {
      className: cx('hidden md:flex flex-col glass border-r border-white/40 z-40 shrink-0 transition-all duration-300 relative', collapsed ? 'w-[74px]' : 'w-64'),
    },
      // logo
      React.createElement('button', {
        onClick: () => go('home'),
        className: cx('px-4 py-5 border-b border-white/30 flex items-center', collapsed ? 'justify-center' : 'gap-3'),
      },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl gold-gradient flex items-center justify-center shadow-lg shrink-0' },
          React.createElement(Icon, { name: 'Crown', size: 16, className: 'text-white', strokeWidth: 2.5 })),
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
            React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size: 36, ring: 'rgba(201,168,76,0.4)' }),
            role !== 'citizen' && React.createElement('span', {
              className: 'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center',
              style: { background: rb.color },
            }, React.createElement(Icon, { name: rb.icon, size: 8, className: 'text-white' }))),
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

      // contributor CTA / application status
      !collapsed && role === 'citizen' && React.createElement('div', { className: 'px-3 pb-3 border-t border-white/20 pt-3' },
        myApplication && myApplication.status === 'pending'
          ? React.createElement('div', { className: 'rounded-xl p-3.5 bg-accent/70 border border-gold/20' },
              React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                React.createElement(Icon, { name: 'Clock', size: 13, className: 'text-gold-dark' }),
                React.createElement('p', { className: 'text-[11px] font-bold text-gold-dark' }, 'Application under review')),
              React.createElement('p', { className: 'text-[9px] text-gold-dark/75' }, "We'll notify you once an admin responds."))
          : myApplication && myApplication.status === 'approved'
          ? React.createElement('button', { onClick: () => go('onboarding'), className: 'w-full rounded-xl p-3.5 bg-gradient-to-br from-[#DCFCE7] to-[#bbf7d0]/50 text-left' },
              React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                React.createElement(Icon, { name: 'PartyPopper', size: 13, className: 'text-[#16A34A]' }),
                React.createElement('p', { className: 'text-[11px] font-bold text-[#15803d]' }, "You're approved!")),
              React.createElement('p', { className: 'text-[9px] text-[#15803d]/80 mb-2' }, 'Set up your contributor profile to go live.'),
              React.createElement('span', { className: 'text-[10px] font-bold text-[#16A34A] flex items-center gap-1' }, 'Complete setup', React.createElement(Icon, { name: 'ArrowRight', size: 11 })))
          : React.createElement('button', { onClick: () => go('apply'), className: 'w-full text-left rounded-xl p-3.5 bg-gradient-to-br from-[#F2E8CC] to-[#E8D48B]/50 hover:from-[#F2E8CC] hover:to-[#E8D48B]/70 transition-all' },
              React.createElement('p', { className: 'text-[11px] font-bold text-gold-dark mb-0.5 font-display' }, 'Become a Contributor'),
              React.createElement('p', { className: 'text-[9px] text-gold-dark/75 mb-2.5' }, 'Create events, places & lead your community.'),
              React.createElement('span', { className: 'w-full flex items-center justify-center text-[10px] font-bold gold-gradient text-white rounded-lg py-1.5' }, 'Apply Now'))),

      // collapse
      React.createElement('div', { className: cx('border-t border-white/20', collapsed ? 'p-2' : 'px-3 py-3') },
        React.createElement('button', {
          onClick: () => setCollapsed((c) => !c),
          className: 'w-full flex items-center justify-center gap-2 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all text-xs font-medium',
        },
          React.createElement(Icon, { name: collapsed ? 'ChevronRight' : 'ChevronLeft', size: 15 }),
          !collapsed && React.createElement('span', null, 'Collapse'))));
  }

  // ── Mobile bottom nav ──
  function BottomNav() {
    const app = window.useApp();
    const { nav, go, user, role, unreadNotifs, unreadMsgs } = app;
    const [showProfile, setShowProfile] = useState(false);
    const tabs = [
      { page: 'home', label: 'Discover', icon: 'Map' },
      { page: 'community', label: 'Projects', icon: 'Lightbulb' },
      { page: 'messages', label: 'Messages', icon: 'MessageCircle' },
      { page: 'notifications', label: 'Alerts', icon: 'Bell' },
    ];
    const badge = (p) => (p === 'notifications' ? unreadNotifs : p === 'messages' ? unreadMsgs : 0);
    const active = (p) => nav.page === p;
    return React.createElement('nav', { className: 'md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-white/50 px-2 pb-[env(safe-area-inset-bottom)]' },
      React.createElement('div', { className: 'flex items-stretch justify-around h-16' },
        tabs.map((t) => {
          const a = active(t.page), b = badge(t.page);
          return React.createElement('button', {
            key: t.page, onClick: () => go(t.page),
            className: cx('flex flex-col items-center justify-center gap-0.5 flex-1 transition-colors', a ? 'text-gold-dark' : 'text-foreground/45'),
          },
            React.createElement('div', { className: 'relative' },
              React.createElement(Icon, { name: t.icon, size: 21, strokeWidth: a ? 2.4 : 1.9 }),
              b > 0 && React.createElement('span', { className: 'absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 bg-gold text-white text-[8px] font-bold rounded-full flex items-center justify-center' }, b)),
            React.createElement('span', { className: 'text-[9px] font-semibold' }, t.label));
        }),
        React.createElement('div', { className: 'relative flex-1 flex items-center justify-center' },
          React.createElement('button', {
            onClick: () => setShowProfile((s) => !s),
            className: cx('flex flex-col items-center justify-center gap-0.5 transition-colors'),
          },
            React.createElement('div', { className: 'relative' },
              React.createElement(Avatar, { src: user.profilePhoto, name: user.name, size: 24, ring: showProfile ? '#C9A84C' : 'rgba(201,168,76,0.3)' }),
              role !== 'citizen' && React.createElement('span', { className: 'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold border border-white flex items-center justify-center' },
                React.createElement(Icon, { name: 'Crown', size: 6, className: 'text-white' }))),
            React.createElement('span', { className: cx('text-[9px] font-semibold', showProfile ? 'text-gold-dark' : 'text-foreground/45') }, 'You')),
          showProfile && React.createElement('div', { className: 'absolute bottom-full right-0 mb-2' },
            React.createElement(ProfilePanel, { onClose: () => setShowProfile(false), anchor: 'top' })))));
  }

  // ── Floating create FAB (contributors) ──
  function CreateFab() {
    const { isContributor, nav, openCreate } = window.useApp();
    const [open, setOpen] = useState(false);
    if (!isContributor || ['messages', 'settings'].includes(nav.page)) return null;
    return React.createElement('div', { className: 'fixed right-4 bottom-20 md:bottom-6 z-40 flex flex-col items-end gap-2' },
      open && React.createElement(React.Fragment, null,
        React.createElement('button', { onClick: () => { openCreate('place'); setOpen(false); }, className: 'flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl glass-strong shadow-xl border border-white/60 scale-in' },
          React.createElement(Icon, { name: 'MapPin', size: 15, className: 'text-[#3498DB]' }), React.createElement('span', { className: 'text-xs font-bold' }, 'Add Place')),
        React.createElement('button', { onClick: () => { openCreate('event'); setOpen(false); }, className: 'flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl glass-strong shadow-xl border border-white/60 scale-in' },
          React.createElement(Icon, { name: 'CalendarPlus', size: 15, className: 'text-gold-dark' }), React.createElement('span', { className: 'text-xs font-bold' }, 'Create Event'))),
      React.createElement('button', {
        onClick: () => setOpen((o) => !o),
        className: 'w-14 h-14 rounded-2xl gold-gradient text-white shadow-[0_8px_24px_rgba(201,168,76,0.5)] flex items-center justify-center transition-transform active:scale-95',
        style: { transform: open ? 'rotate(45deg)' : 'none' },
      }, React.createElement(Icon, { name: 'Plus', size: 24, strokeWidth: 2.5 })));
  }

  // ── Page router ──
  function CurrentPage() {
    const { nav } = window.useApp();
    const p = nav.page;
    switch (p) {
      case 'home': return React.createElement(window.HomePage);
      case 'community': return React.createElement(window.CommunityPage);
      case 'messages': return React.createElement(window.MessagesPage);
      case 'notifications': return React.createElement(window.NotificationsPage);
      case 'dashboard': return React.createElement(window.DashboardPage);
      case 'admin': return React.createElement(window.AdminPage);
      case 'settings': return React.createElement(window.SettingsPage);
      case 'apply': return React.createElement(window.ApplyPage);
      case 'onboarding': return React.createElement(window.OnboardingPage);
      case 'event': return React.createElement(window.EventProfilePage, { id: nav.params.id });
      case 'place': return React.createElement(window.PlaceProfilePage, { id: nav.params.id });
      case 'profile': return nav.params.id
        ? React.createElement(window.ContributorProfilePage, { id: nav.params.id })
        : React.createElement(window.CitizenProfilePage);
      default: return React.createElement(window.HomePage);
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

  function Shell() {
    const { createKind, authed } = window.useApp();
    if (!authed) return React.createElement(window.AuthScreen);
    return React.createElement('div', { className: 'flex h-full w-full overflow-hidden bg-background' },
      React.createElement(Sidebar),
      React.createElement('main', { className: 'flex-1 flex flex-col overflow-hidden relative min-h-0' },
        React.createElement(AssistBanner),
        React.createElement(CurrentPage)),
      React.createElement(BottomNav),
      React.createElement(CreateFab),
      createKind && React.createElement(window.CreateFlow, { kind: createKind }),
      window.CCtweaks && React.createElement(window.CCtweaks),
      React.createElement(Toasts));
  }

  window.Shell = Shell;
  window.ProfilePanel = ProfilePanel;
})();
