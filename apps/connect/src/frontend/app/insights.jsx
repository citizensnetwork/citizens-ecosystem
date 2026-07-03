// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Insights: Volunteer Manager · Analytics ·
//  Admin Overview · Admin Reports · Assist-login
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState } = React;
  const { cx, Avatar, SmartImage, Button, Segmented, Empty } = window.UI;
  const Icon = window.Icon;

  // deterministic pseudo-random for synthetic series
  const seed = (n) => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;

  // ── tiny charts ─────────────────────────────────────────────────────
  function Trend({ data, color = '#C9A84C', height = 120, gid }) {
    const max = Math.max(...data, 1);
    const id = 'tg' + (gid || Math.round(seed(data[0] + data.length) * 1e6));
    const pts = data.map((v, i) => [data.length === 1 ? 0 : (i / (data.length - 1)) * 100, 96 - (v / max) * 88]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L 100 100 L 0 100 Z';
    return h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', style: { width: '100%', height, display: 'block' } },
      h('defs', null, h('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        h('stop', { offset: 0, stopColor: color, stopOpacity: 0.32 }),
        h('stop', { offset: 1, stopColor: color, stopOpacity: 0 }))),
      h('path', { d: area, fill: 'url(#' + id + ')' }),
      h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }

  function Bars({ groups, series, height = 130 }) {
    // groups: [label...], series: [{name,color,data:[]}]
    const max = Math.max(...series.flatMap((s) => s.data), 1);
    return h('div', { className: 'flex items-end justify-between gap-2', style: { height } },
      groups.map((g, i) => h('div', { key: g, className: 'flex-1 flex flex-col items-center gap-1.5 h-full justify-end' },
        h('div', { className: 'w-full flex items-end justify-center gap-0.5 flex-1' },
          series.map((s) => h('div', { key: s.name, className: 'rounded-t-md transition-all', title: s.name + ': ' + s.data[i], style: { width: 7, height: Math.max(2, (s.data[i] / max) * 100) + '%', background: s.color } }))),
        h('span', { className: 'text-[9px] text-muted-foreground font-medium' }, g))));
  }

  function StackBar({ parts }) { // parts: [{label,value,color}]
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    return h(F, null,
      h('div', { className: 'flex h-3 rounded-full overflow-hidden bg-muted' },
        parts.map((p) => p.value > 0 && h('div', { key: p.label, title: p.label + ': ' + p.value, style: { width: (p.value / total * 100) + '%', background: p.color } }))),
      h('div', { className: 'flex flex-wrap gap-x-4 gap-y-1.5 mt-3' },
        parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value).map((p) => h('span', { key: p.label, className: 'flex items-center gap-1.5 text-[11px] text-muted-foreground' },
          h('span', { className: 'w-2.5 h-2.5 rounded-sm', style: { background: p.color } }),
          h('b', { className: 'text-foreground' }, p.label), Math.round(p.value / total * 100) + '%'))));
  }

  const KpiCard = (label, value, color, sub) => h('div', { className: 'bg-card rounded-2xl p-3 border border-border' },
    h('p', { className: 'text-[10px] text-muted-foreground font-semibold leading-tight' }, label),
    h('p', { className: 'text-xl font-bold mt-1', style: { color } }, value),
    sub && h('p', { className: 'text-[10px] font-semibold mt-0.5', style: { color: sub.up ? '#16A34A' : '#7A7060' } }, (sub.up ? '▲ ' : '') + sub.text));

  const SectionCard = ({ title, right, children }) => h('div', { className: 'bg-card rounded-2xl border border-border p-4' },
    h('div', { className: 'flex items-center justify-between mb-3' }, h('p', { className: 'text-sm font-bold text-foreground' }, title), right),
    children);

  const VSTATUS = { pending: { label: 'Pending', color: '#D97706', bg: '#FEF3C7' }, approved: { label: 'Approved', color: '#16A34A', bg: '#DCFCE7' }, declined: { label: 'Declined', color: '#DC2626', bg: '#FEE2E2' } };

  // ══════════════════════ VOLUNTEER MANAGER ══════════════════════════
  function VolunteerRow({ v, hex, onReview, onMessage }) {
    const st = VSTATUS[v.status];
    return h('div', { className: 'p-3 rounded-xl bg-white/60 border border-border' },
      h('div', { className: 'flex items-start gap-3' },
        h(Avatar, { src: v.photo, size: 40, rounded: 'xl' }),
        h('div', { className: 'flex-1 min-w-0' },
          h('div', { className: 'flex items-center gap-2 flex-wrap' },
            h('p', { className: 'text-sm font-bold text-foreground' }, v.name),
            h('span', { className: 'px-2 py-0.5 rounded-full text-[9px] font-bold', style: { background: st.bg, color: st.color } }, st.label)),
          h('span', { className: 'inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full', style: { background: hex + '1c', color: hex } }, h(Icon, { name: 'HandHeart', size: 10 }), v.role),
          h('p', { className: 'text-xs text-muted-foreground mt-1.5 leading-relaxed' }, v.message),
          v.skills && v.skills.length > 0 && h('div', { className: 'flex flex-wrap gap-1 mt-2' },
            v.skills.map((s) => h('span', { key: s, className: 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground' }, s))))),
      v.status === 'pending'
        ? h('div', { className: 'flex gap-2 mt-3' },
            h(Button, { variant: 'success', size: 'sm', className: 'flex-1', icon: 'Check', onClick: () => onReview(v.id, 'approved') }, 'Approve'),
            h(Button, { variant: 'danger', size: 'sm', className: 'flex-1', icon: 'X', onClick: () => onReview(v.id, 'declined') }, 'Decline'),
            h(Button, { variant: 'outline', size: 'sm', icon: 'MessageCircle', onClick: () => onMessage(v) }, 'Message'))
        : h('div', { className: 'flex justify-end mt-2' },
            h(Button, { variant: 'ghost', size: 'sm', icon: 'MessageCircle', onClick: () => onMessage(v) }, 'Message')));
  }

  function EventVolunteers({ ev, apps, hex, onReview, onMessage }) {
    const cat = window.DATA.getEventCategory(ev.category);
    const c = cat ? cat.hex : hex;
    const pending = apps.filter((a) => a.status === 'pending').length;
    const approved = apps.filter((a) => a.status === 'approved').length;
    const [open, setOpen] = useState(true);
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('button', { onClick: () => setOpen((o) => !o), className: 'w-full flex items-center gap-3 p-3 text-left' },
        h('div', { className: 'w-12 h-12 rounded-xl overflow-hidden shrink-0' }, h(SmartImage, { src: ev.coverPhoto, cat, alt: ev.title, className: 'w-full h-full' })),
        h('div', { className: 'flex-1 min-w-0' },
          h('p', { className: 'text-sm font-bold text-foreground truncate' }, ev.title),
          h('div', { className: 'flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground' },
            h('span', { className: 'flex items-center gap-1' }, h('span', { className: 'w-1.5 h-1.5 rounded-full', style: { background: '#D97706' } }), pending + ' pending'),
            h('span', { className: 'flex items-center gap-1' }, h('span', { className: 'w-1.5 h-1.5 rounded-full', style: { background: '#16A34A' } }), approved + ' on team'))),
        pending > 0 && h('span', { className: 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] shrink-0' }, pending),
        h(Icon, { name: open ? 'ChevronUp' : 'ChevronDown', size: 16, className: 'text-muted-foreground shrink-0' })),
      open && h('div', { className: 'px-3 pb-3 space-y-2' },
        apps.length === 0 ? h('p', { className: 'text-xs text-muted-foreground text-center py-3' }, 'No applications yet.')
          : apps.slice().sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)).map((v) => h(VolunteerRow, { key: v.id, v, hex: c, onReview, onMessage }))));
  }

  function VolunteerManager() {
    const app = window.useApp();
    const { activeContributor, activeContributorId, events, volunteerApps, reviewVolunteer, startConversationWith } = app;
    const hex = '#C9A84C';
    const myEvents = events.filter((e) => e.organizerId === activeContributorId);
    const evs = myEvents.filter((e) => e.volunteeringEnabled || volunteerApps.some((v) => v.eventId === e.id));
    const mine = volunteerApps.filter((v) => myEvents.some((e) => e.id === v.eventId));
    const pendingTotal = mine.filter((v) => v.status === 'pending').length;
    const approvedTotal = mine.filter((v) => v.status === 'approved').length;
    const onMessage = (v) => startConversationWith(v.name, v.photo, false, v.userId);

    if (evs.length === 0) return h('div', { className: 'fade-in' }, h(Empty, { icon: 'HandHeart', title: 'No volunteer roles yet', sub: 'Enable volunteering on an event to start receiving applications to serve.' }));

    return h('div', { className: 'space-y-4 fade-in' },
      h('div', { className: 'flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-[#DCFCE7] to-[#bbf7d0]/40 border border-[#16A34A]/20' },
        h('div', { className: 'w-10 h-10 rounded-xl bg-[#16A34A] flex items-center justify-center shrink-0' }, h(Icon, { name: 'HandHeart', size: 18, className: 'text-white' })),
        h('div', { className: 'flex-1' },
          h('p', { className: 'text-sm font-bold text-[#15803d]' }, pendingTotal + ' volunteer' + (pendingTotal === 1 ? '' : 's') + ' awaiting review'),
          h('p', { className: 'text-xs text-[#15803d]/80' }, approvedTotal + ' already serving across ' + evs.length + ' event' + (evs.length === 1 ? '' : 's'))),
        h('span', { className: 'text-2xl font-bold text-[#16A34A]' }, pendingTotal)),
      evs.map((ev) => h(EventVolunteers, { key: ev.id, ev, apps: volunteerApps.filter((v) => v.eventId === ev.id), hex, onReview: reviewVolunteer, onMessage })));
  }

  // ══════════════════════════ ANALYTICS ══════════════════════════════
  const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
  function AnalyticsPanel() {
    const app = window.useApp();
    const { activeContributor, activeContributorId, events, places, contributorDash, cityReach, myContributor, toast } = app;
    const real = !!contributorDash; // signed-in contributor with live analytics
    const stats = real ? contributorDash.stats : null;
    const myEvents = events.filter((e) => e.organizerId === activeContributorId);
    const totalConnects = myEvents.reduce((a, e) => a + e.connectCount, 0);
    const totalConsiders = myEvents.reduce((a, e) => a + e.considerCount, 0);
    const followers = real && stats ? stats.total_followers : (activeContributor.followerCount || 0);
    const reach = Math.round(totalConnects * 6.4 + totalConsiders * 4.2 + followers * 1.1);
    const [metric, setMetric] = useState('views');
    const [generating, setGenerating] = useState(false);

    // Funder report: fetch the PDF with the Bearer token, then download it.
    const downloadFunderReport = async () => {
      const slug = myContributor && myContributor.slug;
      if (!slug || generating) return;
      setGenerating(true);
      try {
        const res = await window.authedFetch('/api/contributor/' + slug + '/funder-report');
        if (!res.ok) throw new Error('report ' + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = slug + '-funder-report.pdf'; a.click();
        URL.revokeObjectURL(url);
      } catch (e) { toast('Could not generate the report — please try again.', 'red'); }
      setGenerating(false);
    };

    // synthetic weekly series scaled to the contributor's size
    const base = Math.max(8, Math.round(reach / 70));
    const mk = (mult, jitter) => WEEKS.map((_, i) => Math.round(base * mult * (0.55 + i * 0.07) * (0.8 + seed(i + jitter) * 0.5)));
    const seriesData = { views: mk(2.4, 1), connects: mk(0.6, 7), considers: mk(0.4, 13) };
    const metaMap = { views: { c: '#C9A84C', label: 'Profile views' }, connects: { c: '#16A34A', label: 'Connects' }, considers: { c: '#7C3AED', label: 'Considers' } };

    const top = myEvents.slice().sort((a, b) => b.connectCount - a.connectCount).slice(0, 5);
    const topMax = Math.max(...top.map((e) => e.connectCount), 1);

    // follower growth (6 months ending at current)
    const fg = [0.62, 0.7, 0.78, 0.85, 0.93, 1].map((p) => Math.round(followers * p));
    const fgDelta = followers - fg[0];

    // audience by category
    const catCounts = {};
    myEvents.forEach((e) => { catCounts[e.category] = (catCounts[e.category] || 0) + e.connectCount; });
    const catParts = Object.entries(catCounts).map(([id, v]) => { const c = window.DATA.getCategory(id); return { label: c ? c.short : id, value: v, color: c ? c.hex : '#C9A84C' }; });

    return h('div', { className: 'space-y-4 fade-in' },
      real
        ? h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2' },
            KpiCard('Followers', (stats ? stats.total_followers : 0).toLocaleString(), '#2563EB'),
            KpiCard('Connects (30d)', (stats ? stats.rsvps_in_period : 0).toLocaleString(), '#16A34A'),
            KpiCard('Upcoming events', (stats ? stats.upcoming_events : 0).toLocaleString(), '#C9A84C'),
            KpiCard('Active places', (stats ? stats.active_places : 0).toLocaleString(), '#7C3AED'))
        : h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2' },
            KpiCard('Total reach', reach.toLocaleString(), '#C9A84C', { up: true, text: '24% this week' }),
            KpiCard('Connects', totalConnects.toLocaleString(), '#16A34A', { up: true, text: '12%' }),
            KpiCard('Considers', totalConsiders.toLocaleString(), '#7C3AED', null),
            KpiCard('Followers', followers.toLocaleString(), '#2563EB', { up: true, text: fgDelta.toLocaleString() })),

      // Real mode: city reach (province snapshots of connected citizens) +
      // funder-facing PDF export.
      real && h(SectionCard, { title: 'City reach', right: h('span', { className: 'text-[11px] text-muted-foreground' }, 'where your people connect from') },
        (!cityReach || cityReach.length === 0)
          ? h('p', { className: 'text-xs text-muted-foreground py-2' }, 'No reach data yet — it builds as citizens connect to your events.')
          : h('div', { className: 'space-y-2' }, (() => {
              const max = Math.max(...cityReach.map((r) => r.count), 1);
              return cityReach.slice(0, 8).map((r) => h('div', { key: r.area, className: 'flex items-center gap-3' },
                h('span', { className: 'text-xs font-semibold text-foreground w-28 truncate shrink-0' }, r.area),
                h('div', { className: 'flex-1 h-2 rounded-full bg-muted overflow-hidden' },
                  h('div', { className: 'h-full gold-gradient rounded-full', style: { width: (r.count / max * 100) + '%' } })),
                h('span', { className: 'text-xs font-bold text-foreground w-8 text-right shrink-0' }, r.count)));
            })())),
      real && h(Button, { variant: 'outline', className: 'w-full', icon: 'FileDown', disabled: generating, onClick: downloadFunderReport },
        generating ? 'Generating report…' : 'Generate funder report (PDF)'),

      !real && h(SectionCard, { title: 'Engagement over time',
        right: h('div', { className: 'flex gap-1' }, Object.keys(metaMap).map((k) => h('button', { key: k, onClick: () => setMetric(k), className: cx('px-2 py-1 rounded-lg text-[10px] font-bold transition-all', metric === k ? 'text-white' : 'text-muted-foreground bg-muted'), style: metric === k ? { background: metaMap[k].c } : undefined }, metaMap[k].label))) },
        h('div', { className: 'flex items-end justify-between mb-1' },
          h('p', { className: 'text-2xl font-bold text-foreground' }, seriesData[metric].reduce((a, b) => a + b, 0).toLocaleString()),
          h('p', { className: 'text-[11px] text-muted-foreground' }, 'last 8 weeks · ' + metaMap[metric].label.toLowerCase())),
        h(Trend, { data: seriesData[metric], color: metaMap[metric].c, gid: metric }),
        h('div', { className: 'flex justify-between mt-1' }, WEEKS.map((w) => h('span', { key: w, className: 'text-[8px] text-muted-foreground' }, w)))),

      h(SectionCard, { title: 'Top events', right: h('span', { className: 'text-[11px] text-muted-foreground' }, 'by connects') },
        top.length === 0 ? h('p', { className: 'text-xs text-muted-foreground py-2' }, 'No events yet.')
          : h('div', { className: 'space-y-2.5' }, top.map((e, i) => {
              const c = window.DATA.getEventCategory(e.category);
              return h('div', { key: e.id, className: 'flex items-center gap-3' },
                h('span', { className: 'text-[11px] font-bold text-muted-foreground w-4 shrink-0' }, i + 1),
                h('div', { className: 'flex-1 min-w-0' },
                  h('div', { className: 'flex items-center justify-between gap-2 mb-1' },
                    h('p', { className: 'text-xs font-semibold text-foreground truncate' }, e.title),
                    h('span', { className: 'text-xs font-bold text-foreground shrink-0' }, e.connectCount.toLocaleString())),
                  h('div', { className: 'h-2 rounded-full bg-muted overflow-hidden' }, h('div', { className: 'h-full rounded-full', style: { width: (e.connectCount / topMax * 100) + '%', background: c ? c.hex : '#C9A84C' } }))));
            }))),

      h('div', { className: 'grid sm:grid-cols-2 gap-4' },
        !real && h(SectionCard, { title: 'Follower growth' },
          h('div', { className: 'flex items-end gap-2 mb-1' },
            h('p', { className: 'text-2xl font-bold text-foreground' }, followers.toLocaleString()),
            h('p', { className: 'text-[11px] font-semibold text-[#16A34A] pb-1' }, '▲ ' + fgDelta.toLocaleString() + ' / 6mo')),
          h(Trend, { data: fg, color: '#2563EB', height: 84, gid: 'fg' })),
        h(SectionCard, { title: 'Audience by category' },
          catParts.length === 0 ? h('p', { className: 'text-xs text-muted-foreground py-2' }, 'No data yet.') : h(StackBar, { parts: catParts }))));
  }

  // ════════════════════════ ADMIN OVERVIEW ═══════════════════════════
  const agoShort = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hour' + (Math.floor(s / 3600) === 1 ? '' : 's') + ' ago';
    return Math.floor(s / 86400) + ' day' + (Math.floor(s / 86400) === 1 ? '' : 's') + ' ago';
  };

  function AdminOverview({ setTab }) {
    const app = window.useApp();
    const { events, places, citizens, contributors, applications, reports, assistLoginAs, adminStats } = app;
    const liveNow = events.filter((e) => e.isLive).length;
    const pendingApps = applications.filter((a) => a.status === 'pending').length;
    const openReports = reports.filter((r) => r.status === 'open').length;
    const [q, setQ] = useState('');
    const real = !!adminStats; // signed-in admin with live platform data

    // category distribution across all events
    const catCounts = {};
    events.forEach((e) => { catCounts[e.category] = (catCounts[e.category] || 0) + 1; });
    const catParts = Object.entries(catCounts).map(([id, v]) => { const c = window.DATA.getCategory(id); return { label: c ? c.short : id, value: v, color: c ? c.hex : '#C9A84C' }; });

    // growth (6 weeks): real mode = actual events-created-per-week from
    // created_at; demo keeps the synthetic two-series chart.
    let growthSeries, growthGroups;
    if (real) {
      const weeks = [0, 0, 0, 0, 0, 0];
      events.forEach((e) => {
        if (!e.createdAt) return;
        const age = Math.floor((Date.now() - new Date(e.createdAt).getTime()) / (7 * 86400000));
        if (age >= 0 && age < 6) weeks[5 - age] += 1;
      });
      growthGroups = ['-5w', '-4w', '-3w', '-2w', '-1w', 'now'];
      growthSeries = [{ name: 'New events', color: '#C9A84C', data: weeks }];
    } else {
      const ev6 = [3, 4, 6, 8, 10, events.length].map((n, i) => Math.max(1, n - (5 - i)));
      const us6 = WEEKS.slice(0, 6).map((_, i) => 40 + Math.round(seed(i + 3) * 30) + i * 14);
      growthGroups = WEEKS.slice(0, 6);
      growthSeries = [{ name: 'Events', color: '#C9A84C', data: ev6 }, { name: 'Citizens', color: '#2563EB', data: us6 }];
    }

    // activity feed: real mode = latest created events (honest, derivable
    // from live data); demo keeps the illustrative feed.
    const activity = real
      ? events.filter((e) => e.createdAt).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
          .map((e) => { const org = contributors.find((c) => c.id === e.organizerId); return ['CalendarPlus', '#C9A84C', (org ? org.name : e.organizerName || 'A community member') + ' created “' + e.title + '”', agoShort(e.createdAt)]; })
      : [
      ['CalendarPlus', '#C9A84C', 'Grace City Church created “Members\u2019 Covenant Gathering”', '12 min ago'],
      ['UserPlus', '#2563EB', '8 new citizens joined the platform', '40 min ago'],
      ['Radio', '#8B6914', 'Lighthouse Community Centre sent a broadcast', '1 hour ago'],
      ['Flag', '#DC2626', 'A new content report was filed', '2 hours ago'],
      ['Crown', '#16A34A', 'Cornerstone Sports League was approved as a contributor', '5 hours ago'],
    ];
    const filtered = contributors.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

    return h('div', { className: 'px-4 sm:px-5 py-4 space-y-4 fade-in' },
      h('div', { className: 'grid grid-cols-2 sm:grid-cols-5 gap-2' },
        KpiCard('Events', events.length, '#C9A84C'), KpiCard('Places', places.length, '#2563EB'),
        KpiCard(real ? 'Members' : 'Citizens', real ? adminStats.totalUsers : citizens.length, '#16A34A'),
        KpiCard('Contributors', contributors.length, '#9B59B6'),
        KpiCard('Live now', liveNow, '#DC2626', liveNow ? { up: false, text: 'on the map' } : null)),

      (pendingApps > 0 || openReports > 0) && h('div', { className: 'grid sm:grid-cols-2 gap-2' },
        h('button', { onClick: () => setTab('applications'), className: 'flex items-center gap-3 p-3.5 bg-[#FEF3C7]/60 border border-[#D97706]/25 rounded-2xl text-left hover:bg-[#FEF3C7] transition-colors' },
          h('div', { className: 'w-9 h-9 rounded-xl bg-[#D97706]/15 flex items-center justify-center shrink-0' }, h(Icon, { name: 'Clock', size: 16, style: { color: '#D97706' } })),
          h('div', { className: 'flex-1' }, h('p', { className: 'text-sm font-bold text-[#92400e]' }, pendingApps + ' application' + (pendingApps === 1 ? '' : 's') + ' to review'), h('p', { className: 'text-[11px] text-[#92400e]/70' }, 'Awaiting your decision')),
          h(Icon, { name: 'ArrowRight', size: 15, style: { color: '#D97706' } })),
        h('button', { onClick: () => setTab('reports'), className: 'flex items-center gap-3 p-3.5 bg-[#FEE2E2]/50 border border-[#DC2626]/20 rounded-2xl text-left hover:bg-[#FEE2E2] transition-colors' },
          h('div', { className: 'w-9 h-9 rounded-xl bg-[#DC2626]/12 flex items-center justify-center shrink-0' }, h(Icon, { name: 'Flag', size: 16, style: { color: '#DC2626' } })),
          h('div', { className: 'flex-1' }, h('p', { className: 'text-sm font-bold text-[#991b1b]' }, openReports + ' open report' + (openReports === 1 ? '' : 's')), h('p', { className: 'text-[11px] text-[#991b1b]/70' }, 'Content moderation queue')),
          h(Icon, { name: 'ArrowRight', size: 15, style: { color: '#DC2626' } }))),

      h('div', { className: 'grid sm:grid-cols-2 gap-4' },
        h(SectionCard, { title: 'Platform growth', right: h('span', { className: 'text-[11px] text-muted-foreground' }, '6 weeks') },
          h('div', { className: 'flex items-center gap-4 mb-2 text-[10px] text-muted-foreground' },
            growthSeries.map((s) => h('span', { key: s.name, className: 'flex items-center gap-1' }, h('span', { className: 'w-2.5 h-2.5 rounded', style: { background: s.color } }), s.name))),
          h(Bars, { groups: growthGroups, series: growthSeries })),
        h(SectionCard, { title: 'Events by category' }, h(StackBar, { parts: catParts }))),

      h(SectionCard, { title: 'Recent platform activity' },
        h('div', { className: 'space-y-0 -mb-1' }, activity.map(([ic, c, t, time], i) => h('div', { key: i, className: 'flex items-start gap-3 py-2.5 border-b border-border/50 last:border-b-0' },
          h('div', { className: 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style: { background: c + '1c', color: c } }, h(Icon, { name: ic, size: 13 })),
          h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-xs text-foreground leading-snug' }, t), h('p', { className: 'text-[10px] text-muted-foreground mt-0.5' }, time)))))),

      // assist-login
      h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
        h('div', { className: 'p-4 border-b border-border' },
          h('div', { className: 'flex items-center gap-2 mb-1' }, h('div', { className: 'w-8 h-8 rounded-xl flex items-center justify-center', style: { background: '#8E44AD22' } }, h(Icon, { name: 'KeyRound', size: 15, style: { color: '#8E44AD' } })),
            h('p', { className: 'text-sm font-bold text-foreground' }, 'Assist a contributor')),
          h('p', { className: 'text-xs text-muted-foreground' }, 'Log into a contributor\u2019s dashboard to help them — only with their permission. Your actions are logged.'),
          h('div', { className: 'flex items-center gap-2 px-3 py-2 mt-3 bg-white/60 border border-border rounded-xl' },
            h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground shrink-0' }),
            h('input', { value: q, onChange: (e) => setQ(e.target.value), placeholder: 'Search contributors…', className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground' }))),
        h('div', { className: 'divide-y divide-border/60 max-h-72 overflow-y-auto' },
          filtered.map((c) => h('div', { key: c.id, className: 'flex items-center gap-3 px-4 py-2.5' },
            h(Avatar, { src: c.profilePhoto, name: c.name, size: 36, rounded: 'xl' }),
            h('div', { className: 'flex-1 min-w-0' }, h('p', { className: 'text-sm font-bold text-foreground truncate flex items-center gap-1' }, c.name, h(Icon, { name: 'BadgeCheck', size: 12, className: 'text-gold' })), h('p', { className: 'text-[11px] text-muted-foreground truncate' }, c.dominantNiche + ' · ' + c.followerCount.toLocaleString() + ' followers')),
            h(Button, { variant: 'soft', size: 'sm', icon: 'LogIn', onClick: () => assistLoginAs(c.id) }, 'Log in as')))))); 
  }

  // ════════════════════════ ADMIN REPORTS ════════════════════════════
  const RSEV = { high: { c: '#DC2626', l: 'High' }, medium: { c: '#D97706', l: 'Medium' }, low: { c: '#5D6D7E', l: 'Low' } };
  const RICON = { event: 'Calendar', place: 'MapPin', user: 'User', message: 'MessageCircle', broadcast: 'Radio' };
  const RSTATUS = { open: { c: '#D97706', bg: '#FEF3C7', l: 'Open' }, resolved: { c: '#16A34A', bg: '#DCFCE7', l: 'Resolved' }, removed: { c: '#DC2626', bg: '#FEE2E2', l: 'Removed' }, dismissed: { c: '#5D6D7E', bg: '#EDE8DC', l: 'Dismissed' } };

  function ReportCard({ r, onResolve }) {
    const sev = RSEV[r.severity] || RSEV.low;
    const st = RSTATUS[r.status] || RSTATUS.open;
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('div', { className: 'p-4' },
        h('div', { className: 'flex items-start gap-3' },
          h('div', { className: 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0', style: { background: sev.c + '18', color: sev.c } }, h(Icon, { name: RICON[r.targetType] || 'Flag', size: 17 })),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'flex items-center gap-2 flex-wrap' },
              h('p', { className: 'text-sm font-bold text-foreground' }, r.targetName),
              h('span', { className: 'px-2 py-0.5 rounded-full text-[9px] font-bold', style: { background: st.bg, color: st.c } }, st.l)),
            h('div', { className: 'flex items-center gap-2 mt-1 flex-wrap text-[10px]' },
              h('span', { className: 'font-bold px-2 py-0.5 rounded-full', style: { background: sev.c + '1c', color: sev.c } }, sev.l + ' severity'),
              h('span', { className: 'text-muted-foreground capitalize flex items-center gap-1' }, h(Icon, { name: 'Tag', size: 9 }), r.reason),
              h('span', { className: 'text-muted-foreground' }, r.targetType)))),
        h('p', { className: 'text-xs text-muted-foreground mt-3 leading-relaxed' }, r.detail),
        h('div', { className: 'flex items-center gap-2 mt-3 text-[11px] text-muted-foreground' },
          r.reporterPhoto ? h(Avatar, { src: r.reporterPhoto, size: 18, rounded: 'full' }) : h('div', { className: 'w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center' }, h(Icon, { name: 'User', size: 10 })),
          h('span', null, 'Reported by ', h('b', { className: 'text-foreground/80' }, r.reporter)),
          h('span', null, '· ' + new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))),
        r.resolution && r.status !== 'open' && h('div', { className: 'mt-3 p-2.5 bg-muted/60 rounded-xl' },
          h('p', { className: 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5' }, 'Resolution'), h('p', { className: 'text-xs text-foreground' }, r.resolution))),
      r.status === 'open' && h('div', { className: 'border-t border-border p-3 flex gap-2' },
        h(Button, { variant: 'success', size: 'sm', className: 'flex-1', icon: 'Check', onClick: () => onResolve(r.id, 'resolved', 'Reviewed and actioned.') }, 'Resolve'),
        h(Button, { variant: 'danger', size: 'sm', className: 'flex-1', icon: 'Trash2', onClick: () => onResolve(r.id, 'removed', 'Content removed for violating guidelines.') }, 'Remove'),
        h(Button, { variant: 'outline', size: 'sm', icon: 'X', onClick: () => onResolve(r.id, 'dismissed', 'Reviewed — no action needed.') }, 'Dismiss')));
  }

  function AdminReports() {
    const app = window.useApp();
    const { reports, resolveReport } = app;
    const [filter, setFilter] = useState('open');
    const open = reports.filter((r) => r.status === 'open').length;
    const list = reports.filter((r) => filter === 'all' || (filter === 'open' ? r.status === 'open' : r.status !== 'open'));
    // reason breakdown
    const reasons = {};
    reports.forEach((r) => { reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
    const reasonArr = Object.entries(reasons).sort((a, b) => b[1] - a[1]);

    return h('div', { className: 'px-4 sm:px-5 py-4 space-y-4 fade-in' },
      h(SectionCard, { title: 'Reports by reason', right: h('span', { className: 'text-[11px] font-bold text-[#D97706]' }, open + ' open') },
        h('div', { className: 'flex flex-wrap gap-2' }, reasonArr.map(([reason, n]) => h('span', { key: reason, className: 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted text-xs' },
          h('span', { className: 'font-bold text-foreground' }, n), h('span', { className: 'text-muted-foreground capitalize' }, reason))))),
      h(Segmented, { options: [{ value: 'open', label: 'Open (' + open + ')' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }], value: filter, onChange: setFilter }),
      list.length === 0 ? h(Empty, { icon: 'ShieldCheck', title: 'All clear', sub: 'No reports match this filter.' })
        : h('div', { className: 'space-y-3' }, list.map((r) => h(ReportCard, { key: r.id, r, onResolve: resolveReport }))));
  }

  window.VolunteerManager = VolunteerManager;
  window.AnalyticsPanel = AnalyticsPanel;
  window.AdminOverview = AdminOverview;
  window.AdminReports = AdminReports;
})();
