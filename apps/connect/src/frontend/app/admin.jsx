// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Admin panel (contributor application review)
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState } = React;
  const { cx, Avatar, Button, Segmented, Empty, Input } = window.UI;
  const Icon = window.Icon;

  const STATUS = {
    pending: { label: 'Pending Review', color: '#D97706', bg: '#FEF3C7', icon: 'Clock' },
    approved: { label: 'Approved', color: '#16A34A', bg: '#DCFCE7', icon: 'CheckCircle2' },
    rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEE2E2', icon: 'XCircle' },
  };

  function PageHeader({ children }) {
    return h('div', { className: 'px-4 sm:px-5 pt-5 pb-4 border-b border-border glass-strong shrink-0' }, children);
  }

  function AppCard({ app, onReview }) {
    const [mode, setMode] = useState(null); // 'approve' | 'reject' | null
    const [note, setNote] = useState('');
    const st = STATUS[app.status];
    const cat = window.DATA.getEventCategory(app.category);
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('div', { className: 'p-4' },
        h('div', { className: 'flex items-start gap-3' },
          h(Avatar, { src: app.photo, size: 48, rounded: 'xl' }),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'flex items-center gap-2 flex-wrap' },
              h('p', { className: 'text-sm font-bold text-foreground' }, app.name),
              app.isMine && h('span', { className: 'px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gold/15 text-gold-dark' }, 'YOUR APP'),
              h('span', { className: 'px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1', style: { background: st.bg, color: st.color } },
                h(Icon, { name: st.icon, size: 9 }), st.label)),
            h('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
              cat && h('span', { className: 'text-[10px] font-semibold px-2 py-0.5 rounded-full', style: { background: cat.hex + '1c', color: cat.hex } }, cat.name),
              h('span', { className: 'text-[10px] text-muted-foreground flex items-center gap-1' }, h(Icon, { name: 'MapPin', size: 9 }), app.location),
              h('span', { className: 'text-[10px] text-muted-foreground' }, 'Applied ' + fmt(app.submittedAt))))),
        h('p', { className: 'text-xs text-muted-foreground mt-3 leading-relaxed' }, app.bio),
        h('div', { className: 'mt-3 p-3 bg-muted/60 rounded-xl' },
          h('p', { className: 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1' }, 'Why they want to contribute'),
          h('p', { className: 'text-xs text-foreground leading-relaxed' }, app.reason)),
        h('div', { className: 'flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap' },
          app.website && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Globe', size: 11, className: 'text-gold' }), app.website),
          app.socials && Object.values(app.socials)[0] && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Instagram', size: 11, className: 'text-gold' }), Object.values(app.socials)[0])),
        app.reviewNote && h('div', { className: 'mt-3 p-3 bg-card border border-border rounded-xl' },
          h('p', { className: 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1' }, 'Admin note'),
          h('p', { className: 'text-xs text-foreground' }, app.reviewNote))),
      // actions
      app.status === 'pending' && h('div', { className: 'border-t border-border p-4' },
        !mode
          ? h('div', { className: 'flex gap-2' },
              h(Button, { variant: 'success', className: 'flex-1', icon: 'CheckCircle2', onClick: () => setMode('approve') }, 'Approve'),
              h(Button, { variant: 'danger', className: 'flex-1', icon: 'XCircle', onClick: () => setMode('reject') }, 'Reject'))
          : h('div', { className: 'space-y-3 fade-in' },
              h('p', { className: 'text-xs font-bold text-foreground' }, (mode === 'approve' ? '✅ Approving' : '❌ Rejecting') + ' — ' + app.name),
              h('textarea', { value: note, onChange: (e) => setNote(e.target.value), rows: 2, placeholder: 'Optional note to applicant…', className: window.UI.inputCls + ' resize-none' }),
              h('div', { className: 'flex gap-2' },
                h('button', { onClick: () => { onReview(app.id, mode === 'approve' ? 'approved' : 'rejected', note.trim()); setMode(null); }, className: cx('flex-1 py-2.5 rounded-xl text-xs font-bold text-white', mode === 'approve' ? 'bg-[#16A34A] hover:bg-green-700' : 'bg-[#DC2626] hover:bg-red-700') }, 'Confirm'),
                h(Button, { variant: 'outline', onClick: () => { setMode(null); setNote(''); } }, 'Cancel')))),
      app.status === 'approved' && h('div', { className: 'border-t border-green-100 px-4 py-3 bg-[#DCFCE7]/40 flex items-center gap-2' },
        h(Icon, { name: 'CheckCircle2', size: 14, className: 'text-[#16A34A]' }),
        h('p', { className: 'text-xs font-semibold text-[#16A34A]' }, 'Approved — contributor access granted' + (app.reviewedAt ? ' · ' + fmt(app.reviewedAt) : ''))),
      app.status === 'rejected' && h('div', { className: 'border-t border-red-100 px-4 py-3 bg-[#FEE2E2]/40 flex items-center gap-2' },
        h(Icon, { name: 'XCircle', size: 14, className: 'text-[#DC2626]' }),
        h('p', { className: 'text-xs font-semibold text-[#DC2626]' }, 'Rejected' + (app.reviewedAt ? ' · ' + fmt(app.reviewedAt) : ''))));
  }
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function AdminPage() {
    const { isAdmin, applications, reviewApplication, contributors, events, places, citizens, go } = window.useApp();
    const [tab, setTab] = useState('applications');
    const [status, setStatus] = useState('all');
    const [search, setSearch] = useState('');

    if (!isAdmin) {
      return h('div', { className: 'flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center' },
        h('div', { className: 'w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center' }, h(Icon, { name: 'Shield', size: 28, className: 'text-destructive' })),
        h('h3', { className: 'text-foreground text-lg' }, 'Admin Access Required'),
        h('p', { className: 'text-sm text-muted-foreground max-w-xs' }, 'Switch to the Admin role from the profile panel to access this area.'),
        h(Button, { variant: 'primary', onClick: () => go('home') }, 'Back to Map'));
    }

    const pending = applications.filter((a) => a.status === 'pending').length;
    const filtered = applications.filter((a) => status === 'all' || a.status === status).filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()));

    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'admin' },
      h(PageHeader, null,
        h('div', { className: 'flex items-center gap-3 mb-4' },
          h('div', { className: 'w-10 h-10 rounded-2xl flex items-center justify-center', style: { background: '#8E44AD22' } }, h(Icon, { name: 'Shield', size: 18, style: { color: '#8E44AD' } })),
          h('div', null,
            h('h2', { className: 'text-foreground leading-none text-xl' }, 'Admin Panel'),
            h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, 'Platform management & oversight')),
          pending > 0 && h('span', { className: 'ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#D97706]' }, pending + ' pending')),
        h('div', { className: 'grid grid-cols-4 gap-2 mb-4' },
          [['Total Apps', applications.length, '#5D6D7E'], ['Pending', pending, '#D97706'], ['Approved', applications.filter((a) => a.status === 'approved').length, '#16A34A'], ['Rejected', applications.filter((a) => a.status === 'rejected').length, '#DC2626']]
            .map(([l, v, c]) => h('div', { key: l, className: 'bg-card rounded-xl p-2.5 border border-border text-center' },
              h('p', { className: 'text-base font-bold', style: { color: c } }, v),
              h('p', { className: 'text-[9px] text-muted-foreground' }, l)))),
        h(Segmented, { options: [{ value: 'applications', label: 'Applications' + (pending ? ' (' + pending + ')' : '') }, { value: 'overview', label: 'Overview' }, { value: 'reports', label: 'Reports' }], value: tab, onChange: setTab })),

      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8' },
        tab === 'applications' && h('div', { className: 'px-4 sm:px-5 py-4 space-y-4 fade-in' },
          h('div', { className: 'flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-xl' },
            h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground shrink-0' }),
            h('input', { value: search, onChange: (e) => setSearch(e.target.value), placeholder: 'Search applicants…', className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground' })),
          h('div', { className: 'flex gap-1.5 overflow-x-auto scrollbar-none' },
            ['all', 'pending', 'approved', 'rejected'].map((s) => h('button', { key: s, onClick: () => setStatus(s), className: cx('px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap capitalize transition-all', status === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground') }, s))),
          filtered.length === 0
            ? h(Empty, { icon: 'FileText', title: 'No applications match your filter' })
            : filtered.map((a) => h(AppCard, { key: a.id, app: a, onReview: reviewApplication }))),

        tab === 'overview' && h(window.AdminOverview, { setTab }),

        tab === 'reports' && h(window.AdminReports, null)));
  }

  window.AdminPage = AdminPage;
})();
