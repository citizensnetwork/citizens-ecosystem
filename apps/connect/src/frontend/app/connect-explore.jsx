// Explore listings by location, category or keyword.
(function () {
  const h = React.createElement;
  const { useState, useMemo } = React;

  function Page({ onPick }) {
    const app = window.useApp();
    const chrome = window.ConnectChrome;
    const memory = React.useRef(history.state?.connectExplore || {});
    const scroller = React.useRef(null);
    const [query, setQuery] = useState(() => memory.current.query || '');
    const [category, setCategory] = useState(() => memory.current.category || 'All');
    const [all, setAll] = useState(() => memory.current.all || '');
    const [picked, setPicked] = useState(() => memory.current.picked || '');
    const rows = useMemo(() => window.ConnectPreviews.listingsFrom(app), [app.events, app.places, app.contributors]);
    const cities = useMemo(() => [...new Set(rows.map((i) => i.location).filter(Boolean))].sort(), [rows]);
    const save = React.useCallback(() => {
      if (!scroller.current || history.state?.guard || history.state?.nav?.page !== 'explore') return;
      const left = {};
      scroller.current.querySelectorAll('[data-row]').forEach((row) => { left[row.dataset.row] = row.scrollLeft; });
      try { history.replaceState({ ...history.state, connectExplore: { query, category, all, picked, top: scroller.current.scrollTop, left } }, ''); } catch { /* History writes can be rate limited. */ }
    }, [query, category, all, picked]);
    React.useLayoutEffect(() => {
      if (!rows.length || !memory.current) return;
      scroller.current.scrollTop = memory.current.top || 0;
      scroller.current.querySelectorAll('[data-row]').forEach((row) => { row.scrollLeft = memory.current.left?.[row.dataset.row] || 0; });
      memory.current = null;
    }, [rows.length]);
    React.useEffect(() => {
      if (memory.current) return;
      save();
      const el = scroller.current;
      let timer;
      const onScroll = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 180);
      };
      el.addEventListener('scroll', onScroll, true);
      return () => { clearTimeout(timer); el.removeEventListener('scroll', onScroll, true); };
    }, [rows.length, save]);
    const groups = (chrome && chrome.GROUPS) || [];
    const matched = rows.filter((i) => {
      const name = i.groupLabel || '';
      const catOk = category === 'All' || name === category || i.group === category;
      const blob = (i.title + ' ' + name + ' ' + (i.detail || '')).toLowerCase();
      return (!picked || i.location === picked) && catOk && blob.indexOf(query.toLowerCase()) !== -1;
    });
    const cover = rows.find((i) => i.image);
    const pick = (item) => {
      save();
      if (onPick) onPick(item);
      else {
        app.go(item.type === 'contributor' ? 'profile' : item.type, { id: item.id });
      }
    };
    const tile = (i) => h('button', {
      key: i.type + ':' + i.id, 'data-listing-id': i.id, type: 'button', className: 'photo-tile', style: { borderTopColor: i.color, '--category': i.color },
      onClick: () => pick(i),
    },
      i.image ? h('img', { src: i.image, alt: i.title }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': i.color, '--fallback-paper': '#272a25', '--fallback-ink': '#f7f6f1' } }),
      h('div', { className: 'photo-shade' }),
      h('div', { className: 'photo-title' },
        h('small', null, h('i', { style: { background: i.color } }), i.groupLabel),
        h('h3', null, i.title),
        h('span', null, (i.location || 'Nearby') + ' ↗')));
    return h('div', { ref: scroller, className: 'connect-scroll', 'data-screen': 'explore' },
      h('div', { className: 'cn-page explore-page' },
        h('div', { className: 'explore-hero' },
          cover && cover.image ? h('img', { src: cover.image, alt: '' }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': '#7040b5', '--fallback-paper': '#1c241c', '--fallback-ink': '#f7f6f1' } }),
          h('div', { className: 'cover-shade' }),
          h('div', null,
            h('span', { className: 'cn-eyebrow' }, 'Citizens Connect · Explore'),
            h('h1', null, 'Discover more', h('br'), 'of the Kingdom', h('br'), 'around you.'),
            h('p', null, 'Find people, places and possibilities.'))),
        h('form', { className: 'explore-search cn-glass', onSubmit: (e) => { e.preventDefault(); setAll('Search results'); } },
          h('span', { className: 'inline-icon' }, h(window.Icon, { name: 'Search', size: 18 })),
          h('input', { 'aria-label': 'Explore search', placeholder: 'What would you like to find?', value: query, onChange: (e) => setQuery(e.target.value) }),
          h('select', {
            'aria-label': 'Location',
            value: picked, onChange: (e) => setPicked(e.target.value),
          }, h('option', { value: '' }, 'All locations'), cities.map((city) => h('option', { key: city, value: city }, city))),
          h('button', { type: 'submit', className: 'cn-primary' }, 'Search')),
        h('div', { className: 'explore-content' },
          h('div', { className: 'cn-row' },
            h('h2', null, all || 'Happening around you'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => setAll(all ? '' : 'All around you') }, all ? 'Show fewer' : 'See all →')),
          matched.length ? (all ? h('div', { className: 'explore-grid' }, matched.map(tile)) : h(window.MapV2Explore.XRow, { id: 'explore-all', fine: true }, matched.map(tile))) : h('p', { role: 'status' }, 'No listings match these filters.'),
          h('div', { className: 'cn-row' },
            h('h2', null, 'Explore what’s possible'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory('All'); setAll(''); } }, 'All categories →')),
          h('div', { className: 'category-tiles' }, groups.map((g) => {
            const cover = rows.find((i) => i.group === g.id && i.image);
            return h('button', {
              key: g.id, type: 'button', className: category === g.name ? 'active' : '',
              style: { borderBottomColor: g.hex, '--category': g.hex },
              onClick: () => { const active = category === g.name; setCategory(active ? 'All' : g.name); setAll(active ? '' : g.name); },
            },
            cover ? h('img', { src: cover.image, alt: '' })
              : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': g.hex, '--fallback-paper': '#272a25', '--fallback-ink': '#f7f6f1' } }),
            h('span', null, g.name));
          })),
          h('div', { className: 'activity-call cn-glass' },
            h('span', { className: 'cn-eyebrow' }, 'Make room for a shared moment'),
            h('h2', null, 'What shall we do together?'),
            h('div', { className: 'cn-actions' }, ['Worship', 'Sports', 'Coffee'].map((s) => h('button', {
              key: s, type: 'button', onClick: () => { setQuery(s); setCategory('All'); setAll(s + ' around you'); },
            }, s + ' →')))),
          groups.filter((g) => matched.some((i) => i.group === g.id)).map((g) => h('section', { key: g.id },
            h('div', { className: 'cn-row' },
              h('h2', null, g.name),
              h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory(g.name); setAll(g.name); } }, 'See all →')),
            h(window.MapV2Explore.XRow, { id: g.id, fine: true }, matched.filter((i) => i.group === g.id).map(tile)))))));
  }

  window.ConnectExplore = { Page };
})();
