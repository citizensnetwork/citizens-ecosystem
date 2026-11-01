// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — "Let's…" page (issue #313, stage 2)
//  ------------------------------------------------------------------
//  The nav item that was Kingdom Projects. Starters open event creation
//  with the category and the marker set. The list is public upcoming
//  Let's events (the same published-and-public rule as the map). Kingdom
//  Projects stays at /community, one link from the foot of this page.
//  Report stays on the event page, the same action every event has.
//  Styles: assets/map-v2.css section 4o (tokens only). Text: MapV2Strings.lets.
//  Starter names: window.LETS (data, like categories).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect } = React;

  const S = () => (window.MapV2Strings && window.MapV2Strings.lets) || {};
  const monthsOf = () => {
    const time = window.MapV2Strings && window.MapV2Strings.time;
    return (time && time.monthShort) || [];
  };

  function dateParts(item) {
    const raw = item && (item.startsAt || item.date);
    const d = raw ? new Date(item.startsAt || (item.date + 'T00:00:00')) : null;
    if (!d || isNaN(d.getTime())) return null;
    return { day: String(d.getDate()), month: monthsOf()[d.getMonth()] || '' };
  }

  function Page() {
    const app = window.useApp();
    const narrow = window.MapV2Explore.useNarrow();
    const str = S();
    const Icon = window.Icon;
    const [remote, setRemote] = useState(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
      let on = true;
      const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
      fetch(base + window.LETS.letsFeedPath()).then((res) => {
        if (!res.ok) throw new Error('lets');
        return res.json();
      }).then((json) => {
        if (!on) return;
        const rows = ((json && json.data) || []).map(window.LETS.fromApiRow).filter(Boolean);
        setRemote(window.LETS.upcomingLets(rows));
      }).catch(() => { if (on) setRemote('error'); });
      return () => { on = false; };
    }, [attempt]);

    const local = window.LETS.upcomingLets(app.events || []);
    const list = window.LETS.mergeActivities(local, Array.isArray(remote) ? remote : []);
    const loading = remote === null && list.length === 0;
    const failed = remote === 'error';

    const start = (id) => {
      if (!app.authed) { app.showSignIn(); return; }
      app.openCreate('event', null, { letsStarter: id });
    };

    const starter = (s) => h('button', {
      key: s.id, type: 'button', 'data-mv2': 'lets-starter', 'data-starter': s.id,
      onClick: () => start(s.id),
    },
      Icon ? h(Icon, { name: s.icon, size: 18 }) : null,
      h('span', null, s.label));

    const card = (item) => {
      const parts = dateParts(item);
      const cat = window.DATA && window.DATA.getEventCategory(item.category);
      const starterRow = window.LETS.starterById(item.letsStarter);
      const group = window.MapV2Explore.groupOf({ category: item.category });
      const chip = (starterRow && starterRow.label) || (cat && cat.name) || '';
      const where = item.location || '';
      const name = [item.title, parts && parts.day, parts && parts.month, where].filter(Boolean).join(', ');
      return h('li', { key: item.id },
        h('button', {
          type: 'button', 'data-mv2': 'lets-card', 'aria-label': name,
          onClick: () => app.go('event', { id: item.id }),
        },
          parts ? h('span', { 'data-mv2': 'lets-date', 'aria-hidden': 'true' },
            h('span', { 'data-mv2': 'lets-date-day' }, parts.day),
            h('span', { 'data-mv2': 'lets-date-month' }, parts.month)) : null,
          h('span', { 'data-mv2': 'lets-card-body' },
            chip ? h('span', { 'data-mv2': 'lets-chip' },
              h('span', { 'data-mv2': 'lets-dot', 'data-cat': group || undefined, 'aria-hidden': 'true' }),
              h('span', null, chip)) : null,
            h('span', { 'data-mv2': 'lets-card-title' }, item.title),
            where ? h('span', { 'data-mv2': 'lets-card-meta' }, where) : null)));
    };

    return h('div', {
      'data-screen': 'lets', 'data-mv2': 'lets', 'data-narrow': narrow ? '' : undefined,
      'data-state': loading ? 'loading' : (failed && list.length === 0 ? 'error' : (list.length === 0 ? 'empty' : 'ready')),
    },
      h('div', { 'data-mv2': 'lets-scroll' },
        h('div', { 'data-mv2': 'lets-top' },
          h('div', { 'data-mv2': 'lets-bar' },
            h('div', null,
              h('h1', { 'data-mv2': 'lets-title' }, str.title),
              str.sub ? h('p', { 'data-mv2': 'lets-sub' }, str.sub) : null),
            window.AccountButton ? h(window.AccountButton, { variant: 'round' }) : null)),
        h('section', { 'aria-labelledby': 'lets-start' },
          h('h2', { id: 'lets-start', 'data-mv2': 'lets-heading' }, str.start),
          h('div', { 'data-mv2': 'lets-starters', role: 'group', 'aria-labelledby': 'lets-start' },
            window.LETS.STARTERS.map(starter))),
        h('section', { 'aria-labelledby': 'lets-happening' },
          h('h2', { id: 'lets-happening', 'data-mv2': 'lets-heading' }, str.happening),
          failed ? h('div', { 'data-mv2': 'lets-alert' },
            h('p', { role: 'alert', 'data-mv2': 'lets-error' }, str.error),
            h('button', { type: 'button', 'data-mv2': 'lets-retry', onClick: () => { setRemote(null); setAttempt((n) => n + 1); } }, str.retry)) : null,
          loading ? h('div', { 'data-mv2': 'lets-list', 'aria-busy': 'true', 'aria-label': str.loading },
            [0, 1, 2].map((i) => h('div', { key: i, 'data-mv2': 'lets-skel', 'data-skeleton': '' }))) : null,
          !loading && list.length === 0 && !failed
            ? h('p', { 'data-mv2': 'lets-empty' }, str.empty)
            : null,
          list.length ? h('ul', { 'data-mv2': 'lets-list' }, list.map(card)) : null),
        h('div', { 'data-mv2': 'lets-foot' },
          h('button', { type: 'button', 'data-mv2': 'lets-projects', onClick: () => app.go('community') },
            Icon ? h(Icon, { name: 'Lightbulb', size: 18 }) : null,
            h('span', null, str.projects)),
          str.projectsHint ? h('p', { 'data-mv2': 'lets-pick-hint' }, str.projectsHint) : null)));
  }

  window.LetsPage = Page;
})();
