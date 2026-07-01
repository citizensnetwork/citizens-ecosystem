// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Contributor Dashboard
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState } = React;
  const { cx, Avatar, SmartImage, Button, Segmented, Empty } = window.UI;
  const Icon = window.Icon;

  // Build the last-7-days series from the real analytics API response
  // ({ rsvps: [{date,value}], views: [{date,value}] }) — days with no row are 0.
  function buildWeek(series) {
    const byDay = {}; const keys = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { day: d.toLocaleDateString('en-GB', { weekday: 'short' }), connects: 0, views: 0 };
      keys.push(key);
    }
    ((series && series.rsvps) || []).forEach((r) => { if (byDay[r.date]) byDay[r.date].connects += r.value; });
    ((series && series.views) || []).forEach((r) => { if (byDay[r.date]) byDay[r.date].views += r.value; });
    return keys.map((k) => byDay[k]);
  }

  const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hour' + (Math.floor(s / 3600) === 1 ? '' : 's') + ' ago';
    return Math.floor(s / 86400) + ' day' + (Math.floor(s / 86400) === 1 ? '' : 's') + ' ago';
  };

  function BarChart({ week }) {
    // No real series yet → an honest zeroed week (correct day labels, no bars),
    // never fabricated traffic.
    const data = week || buildWeek(null);
    const max = Math.max(1, ...data.map((d) => Math.max(d.views, d.connects)));
    return h('div', { className: 'flex items-end justify-between gap-2 h-36 pt-2' },
      data.map((d, i) => h('div', { key: i, className: 'flex-1 flex flex-col items-center gap-1.5 h-full justify-end' },
        h('div', { className: 'w-full flex items-end justify-center gap-0.5 flex-1' },
          h('div', { className: 'w-1/2 rounded-t-md bg-gold transition-all', style: { height: (d.connects / max * 100) + '%' }, title: d.connects + ' connects' }),
          h('div', { className: 'w-1/2 rounded-t-md bg-gold-light transition-all', style: { height: (d.views / max * 100) + '%' }, title: d.views + ' views' })),
        h('span', { className: 'text-[9px] text-muted-foreground font-medium' }, d.day))));
  }

  // Real activity_log row → display row. Falls back to a readable generic
  // label for unrecognised actions; never invents data.
  const ACTIVITY_ICON = { event: ['Calendar', '#C9A84C'], place: ['MapPin', '#2563EB'], broadcast: ['Radio', '#C9A84C'], volunteer: ['HandHeart', '#16A34A'], team: ['Users', '#7C3AED'] };
  function activityRow(a) {
    const kind = (a.entity_type || '').toLowerCase();
    const [ic, c] = ACTIVITY_ICON[kind] || ['Activity', '#C9A84C'];
    const who = a.actor && a.actor.full_name ? a.actor.full_name + ' — ' : '';
    const label = String(a.action || 'activity').replace(/[._-]/g, ' ');
    return { icon: ic, color: c, text: who + label + (a.entity_type ? ' (' + a.entity_type + ')' : ''), time: timeAgo(a.created_at) };
  }

  function StatCard({ label, value, color }) {
    return h('div', { className: 'bg-card rounded-2xl p-3 border border-border text-center' },
      h('p', { className: 'text-xl font-bold', style: { color } }, value),
      h('p', { className: 'text-[10px] text-muted-foreground leading-tight mt-0.5' }, label));
  }

  function EventManageCard({ ev, onView, onBroadcast }) {
    const cat = window.DATA.getEventCategory(ev.category);
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('div', { className: 'relative h-28' },
        h(SmartImage, { src: ev.coverPhoto, cat, label: 'Event', alt: ev.title, className: 'w-full h-full' }),
        h('div', { className: 'absolute inset-0 bg-gradient-to-t from-black/65 to-transparent' }),
        ev.isLive && h('div', { className: 'absolute top-2 left-2 flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full' },
          h('span', { className: 'w-1.5 h-1.5 bg-white rounded-full', style: { animation: 'pinPulse 1.4s infinite' } }), h('span', { className: 'text-[9px] font-bold text-white' }, 'LIVE')),
        ev.broadcast && h('div', { className: 'absolute top-2 right-2 flex items-center gap-1 glass-strong px-2 py-0.5 rounded-full' },
          h(Icon, { name: 'Radio', size: 10, className: 'text-gold-dark' }), h('span', { className: 'text-[9px] font-bold text-gold-dark' }, 'Broadcasting')),
        h('div', { className: 'absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2' },
          h('p', { className: 'text-white text-xs font-bold drop-shadow truncate' }, ev.title),
          cat && h('span', { className: 'text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0', style: { background: cat.hex } }, cat.short))),
      h('div', { className: 'p-3' },
        h('div', { className: 'flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-wrap' },
          h(Stat, { icon: 'Users', text: ev.connectCount + ' connected' }),
          h(Stat, { icon: 'Star', text: ev.considerCount + ' considering' }),
          h(Stat, { icon: 'Calendar', text: new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })),
        h('div', { className: 'flex gap-2' },
          h(Button, { variant: 'outline', size: 'sm', className: 'flex-1', icon: 'Eye', onClick: onView }, 'View'),
          h(Button, { variant: 'outline', size: 'sm', className: 'flex-1', icon: 'Pencil' }, 'Edit'),
          h(Button, { variant: 'soft', size: 'sm', className: 'flex-1', icon: 'Radio', onClick: onBroadcast }, 'Broadcast'))));
  }
  const Stat = ({ icon, text }) => h('div', { className: 'flex items-center gap-1.5' }, h(Icon, { name: icon, size: 11, className: 'text-gold' }), h('span', null, text));

  // ── Broadcast tool ──
  function BroadcastTool({ myEvents, myPlaces, preselect }) {
    const { sendBroadcast } = window.useApp();
    const [target, setTarget] = useState(preselect || '');
    const [text, setText] = useState('');
    const [sent, setSent] = useState(false);
    const send = () => {
      const isEvent = myEvents.some((e) => e.id === target);
      sendBroadcast(isEvent ? 'event' : 'place', target, text);
      setSent(true);
    };
    return h('div', { className: 'bg-card rounded-2xl border border-border p-4' },
      h('div', { className: 'flex items-center gap-2 mb-3' },
        h('div', { className: 'w-8 h-8 rounded-xl gold-gradient flex items-center justify-center' }, h(Icon, { name: 'Radio', size: 14, className: 'text-white' })),
        h('div', null,
          h('p', { className: 'text-sm font-bold text-foreground' }, 'Broadcast Update'),
          h('p', { className: 'text-xs text-muted-foreground' }, 'Notify all attendees, followers & considerers'))),
      sent
        ? h('div', { className: 'flex flex-col items-center py-4 text-center' },
            h(Icon, { name: 'CheckCircle2', size: 28, className: 'text-[#16A34A] mb-2' }),
            h('p', { className: 'text-sm font-bold text-foreground mb-0.5' }, 'Broadcast sent!'),
            h('p', { className: 'text-xs text-muted-foreground mb-3' }, 'A speech bubble is now live on the map for 24 hours.'),
            h(Button, { variant: 'outline', size: 'sm', onClick: () => { setSent(false); setText(''); setTarget(''); } }, 'Send another'))
        : h(F, null,
            h('select', { value: target, onChange: (e) => setTarget(e.target.value), className: window.UI.inputCls + ' mb-2 appearance-none' },
              h('option', { value: '' }, 'Select event / place…'),
              myEvents.map((e) => h('option', { key: e.id, value: e.id }, '🗓  ' + e.title)),
              myPlaces.map((p) => h('option', { key: p.id, value: p.id }, '📍  ' + p.name))),
            h('textarea', { value: text, onChange: (e) => setText(e.target.value), rows: 3, placeholder: 'Write your broadcast… (shows as a speech bubble above your map pin for 24h)', className: window.UI.inputCls + ' resize-none mb-3' }),
            h(Button, { variant: 'primary', className: 'w-full', disabled: !text || !target, icon: 'Send', onClick: send }, 'Send Broadcast')));
  }

  function DashboardPage() {
    const app = window.useApp();
    const { activeContributor, activeContributorId, events, places, conversations, contributorDash, realUser, openCreate, go } = app;
    const [tab, setTab] = useState('overview');
    const [tool, setTool] = useState(null); // null | 'volunteer' | 'analytics'
    const [bcTarget, setBcTarget] = useState('');
    const myEvents = events.filter((e) => e.organizerId === activeContributorId);
    const myPlaces = places.filter((p) => p.organizerId === activeContributorId);
    const totalConnects = myEvents.reduce((a, e) => a + e.connectCount, 0);
    const totalConsider = myEvents.reduce((a, e) => a + e.considerCount, 0);
    // Real-mode signals (null/undefined in demo → the mock placeholders show).
    const dash = contributorDash;
    const realWeek = dash && dash.week ? buildWeek(dash.week) : null;
    const realActivity = dash ? (dash.recentActivity || []).map(activityRow) : null;
    const followerCount = dash && dash.stats ? dash.stats.total_followers : activeContributor.followerCount;

    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'dashboard' },
      h('div', { className: 'px-4 sm:px-5 pt-5 pb-4 border-b border-border glass-strong shrink-0' },
        h('div', { className: 'flex items-center justify-between' },
          h('div', { className: 'flex items-center gap-3' },
            h(Avatar, { src: activeContributor.profilePhoto, name: activeContributor.name, size: 40, rounded: 'xl', ring: 'rgba(201,168,76,0.4)' }),
            h('div', null,
              h('h2', { className: 'text-foreground leading-none text-xl' }, 'Dashboard'),
              h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, activeContributor.name))),
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent text-gold-dark flex items-center gap-1' }, h(Icon, { name: 'Crown', size: 11 }), activeContributor.involvementLevel),
            h('button', { onClick: () => go('settings'), className: 'w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground' }, h(Icon, { name: 'Settings', size: 16 }))))),

      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8' },
        h('div', { className: 'px-4 sm:px-5 py-4 grid grid-cols-4 gap-2' },
          h(StatCard, { label: 'Connected', value: totalConnects, color: '#C9A84C' }),
          h(StatCard, { label: 'Considering', value: totalConsider, color: '#7C3AED' }),
          h(StatCard, { label: 'Events', value: myEvents.length, color: '#16A34A' }),
          h(StatCard, { label: 'Places', value: myPlaces.length, color: '#2563EB' })),

        h('div', { className: 'px-4 sm:px-5 mb-4' }, h(Segmented, { options: ['overview', 'events', 'messages', 'tools'], value: tab, onChange: setTab })),

        h('div', { className: 'px-4 sm:px-5' },
          tab === 'overview' && h('div', { className: 'space-y-4 fade-in' },
            h('div', { className: 'bg-card rounded-2xl p-4 border border-border' },
              h('div', { className: 'flex items-center justify-between mb-1' },
                h('p', { className: 'text-sm font-bold text-foreground' }, "This Week's Activity")),
              h('div', { className: 'flex items-center gap-4 mb-2 text-[10px] text-muted-foreground' },
                h('span', { className: 'flex items-center gap-1' }, h('span', { className: 'w-2.5 h-2.5 rounded bg-gold' }), 'Connects'),
                h('span', { className: 'flex items-center gap-1' }, h('span', { className: 'w-2.5 h-2.5 rounded bg-gold-light' }), 'Views')),
              h(BarChart, { week: realWeek })),
            h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
              h('div', { className: 'px-4 py-3 border-b border-border' }, h('p', { className: 'text-sm font-bold text-foreground' }, 'Recent Activity')),
              (realActivity && realActivity.length)
                ? realActivity.map((r, i) => h('div', { key: i, className: 'flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-b-0' },
                    h('div', { className: 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', style: { background: r.color + '20', color: r.color } }, h(Icon, { name: r.icon, size: 13 })),
                    h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-xs text-foreground leading-snug capitalize' }, r.text), h('p', { className: 'text-[10px] text-muted-foreground mt-0.5' }, r.time))))
                : h('p', { className: 'px-4 py-6 text-xs text-muted-foreground text-center' }, 'No activity yet — it shows here as citizens connect with your work.')),
            h('button', { onClick: () => go('profile', { id: activeContributorId }), className: 'w-full flex items-center gap-3 p-4 bg-gradient-to-r from-[#F2E8CC] to-[#E8D48B]/30 rounded-2xl border border-gold/30 hover:border-gold/60 transition-all' },
              h('div', { className: 'flex-1 text-left' },
                h('p', { className: 'text-sm font-bold text-gold-dark' }, 'View Public Profile'),
                h('p', { className: 'text-xs text-gold-dark/70' }, (followerCount || 0).toLocaleString() + ' followers' + (activeContributor.dominantNiche ? ' · ' + activeContributor.dominantNiche : ''))),
              h(Icon, { name: 'ChevronRight', size: 16, className: 'text-gold' }))),

          tab === 'events' && h('div', { className: 'space-y-4 fade-in' },
            h('div', { className: 'grid grid-cols-2 gap-2' },
              h(Button, { variant: 'primary', icon: 'CalendarPlus', onClick: () => openCreate('event') }, 'Create Event'),
              h(Button, { variant: 'outline', icon: 'MapPin', onClick: () => openCreate('place') }, 'Add Place')),
            myEvents.length === 0 && h(Empty, { icon: 'Calendar', title: 'No events yet', sub: 'Create your first event to appear on the map.' }),
            myEvents.map((ev) => h(EventManageCard, { key: ev.id, ev, onView: () => go('event', { id: ev.id }), onBroadcast: () => { setBcTarget(ev.id); setTab('tools'); } })),
            myPlaces.length > 0 && h(F, null,
              h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2' }, 'Your Places'),
              myPlaces.map((p) => h('div', { key: p.id, className: 'flex items-center gap-3 p-3 bg-card rounded-2xl border border-border' },
                h(Avatar, { src: p.coverPhoto, name: p.name, size: 56, rounded: 'xl' }),
                h('div', { className: 'flex-1 min-w-0' },
                  h('p', { className: 'text-sm font-bold text-foreground truncate' }, p.name),
                  h('p', { className: 'text-xs text-muted-foreground truncate flex items-center gap-1' }, h(Icon, { name: 'MapPin', size: 10 }), p.address),
                  h('p', { className: 'text-xs text-gold-dark font-semibold' }, p.followerCount.toLocaleString() + ' followers')),
                h('button', { onClick: () => go('place', { id: p.id }), className: 'w-8 h-8 rounded-lg bg-muted flex items-center justify-center' }, h(Icon, { name: 'ChevronRight', size: 14, className: 'text-muted-foreground' })))))),

          tab === 'messages' && h('div', { className: 'space-y-3 fade-in' },
            h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1' }, 'Recent Conversations'),
            conversations.slice(0, 3).map((c) => h('button', { key: c.id, onClick: () => go('messages', { convId: c.id }), className: 'w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:border-gold/40 transition-all text-left' },
              h('div', { className: 'relative' }, h(Avatar, { src: c.participantPhoto, name: c.participantName, size: 40, rounded: 'xl' }), c.unread > 0 && h('span', { className: 'absolute -top-1 -right-1 w-4 h-4 bg-gold text-white text-[8px] font-bold rounded-full flex items-center justify-center' }, c.unread)),
              h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground truncate' }, c.participantName), h('p', { className: 'text-xs text-muted-foreground truncate' }, c.lastMessage)),
              h('span', { className: 'text-[10px] text-muted-foreground shrink-0' }, c.lastTime))),
            h(Button, { variant: 'outline', className: 'w-full', onClick: () => go('messages') }, 'View All Messages')),

          tab === 'tools' && (tool
            ? h('div', { className: 'space-y-4 fade-in' },
                h('button', { onClick: () => setTool(null), className: 'flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors' },
                  h(Icon, { name: 'ArrowLeft', size: 14 }), 'Back to tools'),
                h('div', { className: 'flex items-center gap-2.5' },
                  h('div', { className: 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0', style: tool === 'volunteer' ? { background: '#16A34A18', color: '#16A34A' } : { background: '#7C3AED18', color: '#7C3AED' } },
                    h(Icon, { name: tool === 'volunteer' ? 'HandHeart' : 'TrendingUp', size: 17 })),
                  h('div', null,
                    h('p', { className: 'text-base font-bold text-foreground leading-tight' }, tool === 'volunteer' ? 'Volunteer Manager' : 'Analytics'),
                    h('p', { className: 'text-[11px] text-muted-foreground' }, tool === 'volunteer' ? 'Review applicants & build your team' : 'Reach, engagement & growth'))),
                tool === 'volunteer' ? h(window.VolunteerManager, null) : h(window.AnalyticsPanel, null))
            : h('div', { className: 'space-y-4 fade-in' },
                h(BroadcastTool, { myEvents, myPlaces, preselect: bcTarget }),
                [['Create Event', 'CalendarPlus', '#C9A84C', 'Post a new event on the map', () => openCreate('event')],
                 ['Add Place', 'MapPin', '#2563EB', 'Register a venue or community space', () => openCreate('place')],
                 ['Volunteer Manager', 'HandHeart', '#16A34A', 'Review volunteer applications', () => setTool('volunteer')],
                 ['Analytics', 'TrendingUp', '#7C3AED', 'Detailed insights and reach data', () => setTool('analytics')]]
                  .map(([l, ic, c, d, fn]) => h('button', { key: l, onClick: fn || (() => app.toast('Coming soon')), className: 'w-full flex items-center gap-3 p-4 bg-card rounded-2xl border border-border hover:border-gold/40 transition-all text-left' },
                    h('div', { className: 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0', style: { background: c + '18', color: c } }, h(Icon, { name: ic, size: 18 })),
                    h('div', null, h('p', { className: 'text-sm font-bold text-foreground' }, l), h('p', { className: 'text-xs text-muted-foreground' }, d)),
                    h(Icon, { name: 'ChevronRight', size: 15, className: 'text-muted-foreground ml-auto' }))))))));
  }

  window.DashboardPage = DashboardPage;
})();
