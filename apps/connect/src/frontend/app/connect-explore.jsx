// Explore page (pack 07). Replaces the Discover row page. Tiles open the map's big preview.
(function () {
  const h = React.createElement;
  const { useState, useMemo } = React;

  function Page({ onPick }) {
    const app = window.useApp();
    const chrome = window.ConnectChrome;
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [all, setAll] = useState('');
    const area = chrome.useArea();
    const rows = useMemo(() => (window.ConnectPreviews ? window.ConnectPreviews.listingsFrom(app, 'all', '') : []), [app.events, app.places, app.contributors]);
    const groups = (chrome && chrome.GROUPS) || [];
    const matched = rows.filter((i) => {
      const name = i.groupLabel || '';
      const catOk = category === 'All' || name === category || i.group === category;
      const blob = (i.title + ' ' + name + ' ' + (i.detail || '')).toLowerCase();
      return catOk && blob.indexOf(query.toLowerCase()) !== -1;
    });
    const cover = rows.find((i) => i.image);
    const pick = (item) => {
      if (onPick) onPick(item);
      else {
        try { window.sessionStorage.setItem('cc_explore_pick', item.id); } catch (e) { /* private mode */ }
        app.go('home');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('cc-explore-pick', { detail: item })), 40);
      }
    };
    const tile = (i) => h('button', {
      key: i.id, type: 'button', className: 'photo-tile', style: { borderTopColor: i.color, '--category': i.color },
      onClick: () => pick(i),
    },
      i.image ? h('img', { src: i.image, alt: i.title }) : h('span', { className: 'photo-fallback', style: { '--fallback-color': i.color, '--fallback-paper': '#272a25', '--fallback-ink': '#f7f6f1' } }),
      h('div', { className: 'photo-shade' }),
      h('div', { className: 'photo-title' },
        h('small', null, h('i', { style: { background: i.color } }), i.groupLabel),
        h('h3', null, i.title),
        h('span', null, (i.location || area || 'Nearby') + ' ↗')));
    return h('div', { className: 'connect-scroll', 'data-screen': 'explore', 'data-mv2': 'discover' },
      h('div', { className: 'cn-page explore-page' },
        h('div', { className: 'explore-hero' },
          cover && cover.image ? h('img', { src: cover.image, alt: '' }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': '#7040b5', '--fallback-paper': '#1c241c', '--fallback-ink': '#f7f6f1' } }),
          h('div', { className: 'cover-shade' }),
          h('div', null,
            h('span', { className: 'cn-eyebrow' }, 'Citizens Connect · Explore'),
            h('h1', null, 'Discover more', h('br'), 'of the Kingdom', h('br'), 'around you.'),
            h('p', null, 'Find people, places and possibilities.'))),
        h('div', { className: 'explore-search cn-glass' },
          h('span', { className: 'inline-icon' }, chrome && h(chrome.Icon || 'span', { kind: 'search' })),
          h('input', { 'aria-label': 'Explore search', placeholder: 'What would you like to find?', value: query, onChange: (e) => setQuery(e.target.value) }),
          h('select', { 'aria-label': 'Location', value: area || '', onChange: () => {} }, h('option', { value: area || '' }, area || 'Nearby')),
          h('button', { type: 'button', className: 'cn-primary', onClick: () => setAll('Search results') }, 'Search')),
        h('div', { className: 'explore-content' },
          h('div', { className: 'cn-row' },
            h('h2', null, all || 'Happening around you'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => setAll(all ? '' : 'All around you') }, all ? 'Show fewer' : 'See all →')),
          h('div', { className: all ? 'explore-grid' : 'photo-carousel' }, matched.map(tile)),
          h('div', { className: 'cn-row' },
            h('h2', null, 'Explore what’s possible'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory('All'); setAll(''); } }, 'All categories →')),
          h('div', { className: 'category-tiles' }, groups.map((g) => h('button', {
            key: g.id, type: 'button', className: category === g.name ? 'active' : '',
            style: { borderBottomColor: g.hex, '--category': g.hex },
            onClick: () => { setCategory(category === g.name ? 'All' : g.name); setAll(g.name); },
          }, h('span', null, g.name)))),
          h('div', { className: 'activity-call cn-glass' },
            h('span', { className: 'cn-eyebrow' }, 'Make room for a shared moment'),
            h('h2', null, 'What shall we do together?'),
            h('div', { className: 'cn-actions' }, ['Worship', 'Sports', 'Coffee'].map((s) => h('button', {
              key: s, type: 'button', onClick: () => { setQuery(s); setCategory('All'); setAll(s + ' around you'); },
            }, s + ' →')))),
          groups.filter((g) => category === 'All' || category === g.name).map((g) => h('section', { key: g.id },
            h('div', { className: 'cn-row' },
              h('h2', null, g.name),
              h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory(g.name); setAll(g.name); } }, 'See all →')),
            h('div', { className: 'photo-carousel' }, rows.filter((i) => i.group === g.id).map(tile)))))));
  }

  window.ConnectExplore = { Page };
})();
