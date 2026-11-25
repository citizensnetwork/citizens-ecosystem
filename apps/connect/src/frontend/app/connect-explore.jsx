// Explore page (pack 07). Replaces the Discover row page. Tiles open the map's big preview.
(function () {
  const h = React.createElement;
  const { useState, useMemo } = React;

  // QA 2026-11-25 (CCQA-0002/0003). Search words match the title, kind, category, description, where and who; case and
  // accents are ignored, and every word must match (so "coffee hatfield" finds a coffee place in Hatfield).
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function matchesQuery(item, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const blob = fold([item.title, item.groupLabel, item.group, item.category, item.detail, item.location, item.host].join(' '));
    return words.every((w) => blob.indexOf(w) !== -1);
  }

  function Page({ onPick }) {
    const app = window.useApp();
    const chrome = window.ConnectChrome;
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [all, setAll] = useState('');
    const [picked, setPicked] = useState('');
    const [wide, setWide] = useState(false);
    const area = chrome.useArea();
    const cities = (chrome && chrome.CITIES) || [];
    const rows = useMemo(() => (window.ConnectPreviews ? window.ConnectPreviews.listingsFrom(app, 'all', '') : []), [app.events, app.places, app.contributors]);
    const groups = (chrome && chrome.GROUPS) || [];
    // The city the page is about: the one chosen here, else the one the map is looking at. Listings are scoped to
    // CITY_RADIUS_KM around it unless the person widens to all of South Africa. A listing with no pin is never hidden:
    // it sits in its own group below.
    const L = window.CCLocation;
    const cityName = picked || area;
    const city = cities.find((c) => c.name === cityName) || null;
    const radius = (L && L.CITY_RADIUS_KM) || 35;
    const scopeOf = (i) => (L ? L.cityScope(i, city, radius) : 'in');
    const pinned = rows.filter((i) => scopeOf(i) !== 'nopin' && (wide || !city || scopeOf(i) === 'in'));
    const unpinned = rows.filter((i) => scopeOf(i) === 'nopin');
    const catOk = (i) => category === 'All' || (i.groupLabel || '') === category || i.group === category;
    const matched = pinned.filter((i) => catOk(i) && matchesQuery(i, query));
    const onlineMatched = unpinned.filter((i) => catOk(i) && matchesQuery(i, query));
    const searching = !!query.trim() || category !== 'All';
    const nothing = searching && !matched.length && !onlineMatched.length;
    const clearSearch = () => { setQuery(''); setCategory('All'); setAll(''); };
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
      i.image ? h('img', { src: i.image, alt: i.title }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': i.color, '--fallback-paper': '#272a25', '--fallback-ink': '#f7f6f1' } }),
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
            h('h1', null, 'Discover more ', h('br'), 'of the Kingdom ', h('br'), 'around you.'),
            h('p', null, 'Find people, places and possibilities.'))),
        h('div', { className: 'explore-search cn-glass' },
          h('span', { className: 'inline-icon' }, chrome && h(chrome.Icon || 'span', { kind: 'search' })),
          h('input', { 'aria-label': 'Explore search', placeholder: 'What would you like to find?', value: query, onChange: (e) => setQuery(e.target.value) }),
          h('select', {
            'aria-label': 'Location',
            value: picked || (cities.some((c) => c.name === area) ? area : ''),
            onChange: (e) => {
              const city = cities.find((c) => c.name === e.target.value);
              setPicked(e.target.value);
              setWide(false);
              if (!city) return;
              try {
                window.sessionStorage.setItem('cc_area_pick', JSON.stringify(city));
                window.sessionStorage.setItem('cc_area_pending', JSON.stringify(city));
              } catch (err) { /* private mode */ }
              window.dispatchEvent(new CustomEvent('cc-set-area', { detail: city }));
            },
          },
          !cities.some((c) => c.name === (picked || area)) ? h('option', { value: '' }, area || 'Nearby') : null,
          cities.map((c) => h('option', { key: c.name, value: c.name }, c.name))),
          h('button', { type: 'button', className: 'cn-primary', onClick: () => setAll('Search results') }, 'Search')),
        h('div', { className: 'explore-content' },
          h('div', { className: 'cn-row' },
            h('h2', null, all || 'Happening around you'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => setAll(all ? '' : 'All around you') }, all ? 'Show fewer' : 'See all →')),
          city ? h('p', { className: 'explore-scope', 'data-cc': 'explore-scope' },
            wide ? 'Showing all of South Africa. ' : 'Showing ' + city.name + ': ' + matched.length + (matched.length === 1 ? ' listing' : ' listings') + ' within ' + radius + ' km. ',
            h('button', { type: 'button', className: 'cn-text', onClick: () => setWide(!wide) }, wide ? 'Back to ' + city.name : 'Widen to all South Africa')) : null,
          nothing ? h('div', { className: 'explore-empty cn-glass', role: 'status', 'aria-live': 'polite', 'data-cc': 'explore-empty' },
            h('p', null, query.trim()
              ? 'Nothing for \u201c' + query.trim() + '\u201d' + (city && !wide ? ' in ' + city.name : '') + ' yet.'
              : 'Nothing in ' + category + (city && !wide ? ' in ' + city.name : '') + ' yet.'),
            h('div', { className: 'cn-actions' },
              h('button', { type: 'button', onClick: clearSearch }, 'Clear the search'),
              city && !wide ? h('button', { type: 'button', onClick: () => setWide(true) }, 'Widen to all South Africa') : null,
              h('button', { type: 'button', onClick: () => app.go('apply') }, 'Add a listing'))) : null,
          h('div', { className: all ? 'explore-grid' : 'photo-carousel' }, matched.map(tile)),
          onlineMatched.length ? h('section', { 'data-cc': 'explore-online' },
            h('div', { className: 'cn-row' }, h('h2', null, 'Online and serving across South Africa')),
            h('div', { className: 'photo-carousel' }, onlineMatched.map(tile))) : null,
          h('div', { className: 'cn-row' },
            h('h2', null, 'Explore what’s possible'),
            h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory('All'); setAll(''); } }, 'All categories →')),
          h('div', { className: 'category-tiles' }, groups.map((g) => {
            const cover = rows.find((i) => i.group === g.id && i.image);
            return h('button', {
              key: g.id, type: 'button', className: category === g.name ? 'active' : '',
              style: { borderBottomColor: g.hex, '--category': g.hex },
              onClick: () => { setCategory(category === g.name ? 'All' : g.name); setAll(g.name); },
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
          groups.filter((g) => category === 'All' || category === g.name).map((g) => h('section', { key: g.id },
            h('div', { className: 'cn-row' },
              h('h2', null, g.name),
              h('button', { type: 'button', className: 'cn-text', onClick: () => { setCategory(g.name); setAll(g.name); } }, 'See all →')),
            h('div', { className: 'photo-carousel' }, pinned.concat(unpinned).filter((i) => i.group === g.id).map(tile)))))));
  }

  window.ConnectExplore = { Page, matchesQuery };
})();
