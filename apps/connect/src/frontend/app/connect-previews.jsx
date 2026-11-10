// Connect preview conveyor, big preview, and listing profile (pack 02).
// Replaces the old half sheet. Sample people and preview disclaimers stay out.
(function () {
  const h = React.createElement;
  const { useState, useRef, useEffect } = React;

  function groupOf(item) {
    const X = window.MapV2Explore;
    if (X && X.groupOf) return X.groupOf({ category: item.category }) || '';
    return '';
  }
  function hexOf(item) {
    const C = window.ConnectChrome;
    return (C && C.groupHex && C.groupHex(item.category)) || '#7040b5';
  }
  function groupName(id) {
    const C = window.ConnectChrome;
    const g = C && C.GROUPS && C.GROUPS.find((x) => x.id === id);
    return g ? g.name : id;
  }
  function photoOf(item) {
    return item.image || item.coverPhoto || item.profilePhoto || '';
  }
  function Photo({ src, alt, className, item }) {
    if (src) return h('img', { src, alt: alt || '', className, loading: 'lazy' });
    const color = item ? hexOf(item) : '#7040b5';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return h('span', {
      className: 'photo-fallback ' + (className || ''),
      role: 'img',
      'aria-label': alt || 'No photo yet',
      style: { '--fallback-color': color, '--fallback-paper': dark ? '#272a25' : '#f7f6f1', '--fallback-ink': dark ? '#f7f6f1' : '#272a25' },
    }, h('span', { className: 'fallback-glyph' }, window.ConnectChrome && window.ConnectChrome.glyphNode(item && item.category)));
  }

  function listingsFrom(app, group, query) {
    const q = (query || '').trim().toLowerCase();
    const events = (app.events || []).filter((e) => !window.DATA.isPastEvent(e));
    const rows = [];
    events.forEach((e) => rows.push({
      id: e.id, type: 'event', title: e.title, category: e.category, detail: e.description || '',
      location: e.location || '', when: [e.date, e.time].filter(Boolean).join(' · '),
      image: e.coverPhoto || '', online: !e.lat && !e.location, host: e.organizerName || '',
      hostId: e.organizerId, lat: e.lat, lng: e.lng, website: e.website || '',
      connected: !!(app.connected && app.connected.has && app.connected.has(e.id)),
      connectCount: e.connectCount || 0, considerCount: e.considerCount || 0,
    }));
    (app.places || []).forEach((p) => rows.push({
      id: p.id, type: 'place', title: p.name, category: p.category, detail: p.description || p.about || '',
      location: p.address || p.location || '', when: p.hours || '', image: p.coverPhoto || '',
      host: p.organizerName || '', lat: p.lat, lng: p.lng, website: p.website || '', phone: p.phone || '',
      openToCollaborate: !!p.openToCollaborate,
    }));
    (app.contributors || []).forEach((c) => {
      if (c.lat == null && c.lng == null && !c.name) return;
      rows.push({
        id: c.id, type: 'contributor', title: c.name, category: c.category, kind: c.kind,
        detail: c.bio || '', location: c.location || '', when: c.kind || '',
        image: c.profilePhoto || c.coverPhoto || '', host: c.name, lat: c.lat, lng: c.lng,
        website: c.website || '', verified: !!c.verified, followers: c.followerCount || 0,
        openToCollaborate: !!c.openToCollaborate, slug: c.slug,
      });
    });
    return rows.filter((i) => {
      const g = groupOf(i);
      const gok = !group || group === 'all' || g === group;
      const blob = (i.title + ' ' + (i.category || '') + ' ' + (i.detail || '')).toLowerCase();
      return gok && (!q || blob.indexOf(q) !== -1);
    }).map((i) => Object.assign({}, i, { color: hexOf(i), group: groupOf(i), groupLabel: groupName(groupOf(i)) }));
  }

  const TOGGLE = { Connect: 'Connected', Follow: 'Following', Save: 'Saved', Consider: 'Considering' };
  function actionLabels(item) {
    if (item.type === 'event') return item.online ? ['Connect', 'Consider', 'Share', 'Website', 'Message'] : ['Directions', 'Connect', 'Consider', 'Share', 'Website', 'Message'];
    if (item.type === 'place') return ['Directions', 'Follow', 'Save', 'Share', 'Website', 'Call', 'Message'];
    return ['Directions', 'Follow', 'Save', 'Share', 'Website'];
  }
  function leadOf(item) {
    if (item.type === 'event') return 'Connect';
    if (item.type === 'place') return 'Directions';
    return 'Follow';
  }
  function Actions({ item, flags, onAction }) {
    const labels = actionLabels(item);
    const lead = leadOf(item);
    return h('div', { className: 'cn-actions' }, labels.map((label) => {
      const on = !!(flags && flags[item.id + label]);
      const cls = (label === lead || (label === 'Connect' && lead === 'Connect') ? ' lead' : '') + (label === 'Connect' ? ' connect' : '') + (on ? ' on' : '');
      const text = on && TOGGLE[label] ? TOGGLE[label] : label;
      return h('button', { key: label, type: 'button', className: cls.trim(), onClick: (e) => { e.stopPropagation(); onAction(item, label); } },
        text, label === 'Connect' && item.online ? h('small', { className: 'connect-online' }, 'Online') : null);
    }));
  }

  function Conveyor({ items, activeId, flags, onPick, onClose, onStep, onAction }) {
    const start = useRef(0);
    const dragged = useRef(false);
    const len = items.length;
    const center = Math.max(0, items.findIndex((i) => i.id === activeId));
    const belt = useRef(null);
    const onDown = (e) => { start.current = e.clientX; dragged.current = false; };
    const onUp = (e) => {
      const dx = e.clientX - start.current;
      if (Math.abs(dx) > 35) { dragged.current = true; onStep(dx < 0 ? 1 : -1); }
    };
    const onKey = (e) => {
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    return h('div', {
      className: 'cn-conveyor', ref: belt, role: 'region', 'aria-label': 'Listing preview carousel', tabIndex: 0,
      onPointerDown: onDown, onPointerUp: onUp, onKeyDown: onKey,
    },
      items.map((item, n) => {
        let offset = (n - center + len) % len;
        if (offset > Math.floor(len / 2)) offset -= len;
        const distance = Math.abs(offset);
        const scale = distance === 0 ? 1 : distance === 1 ? 0.8 : 0.61;
        const selected = distance === 0;
        return h('article', {
          key: item.id,
          className: 'cn-preview cn-glass' + (selected ? ' selected' : ''),
          'aria-hidden': distance > 2 ? 'true' : undefined,
          style: {
            left: 'calc(50% + ' + offset + ' * var(--belt-step))',
            transform: 'translate(-50%,-50%) scale(' + scale + ')',
            zIndex: 10 - distance,
            opacity: distance > 2 ? 0 : 1,
            pointerEvents: distance > 2 ? 'none' : 'auto',
            '--depth-blur': distance === 0 ? '0px' : distance === 1 ? '.55px' : '1.15px',
            '--category': item.color,
            borderTopColor: item.color,
          },
        },
          h('button', {
            type: 'button', className: 'preview-tap',
            'aria-label': selected ? item.title + ', tap again for more' : item.title + ', focus on map',
            onClick: (e) => { if (dragged.current) { dragged.current = false; e.preventDefault(); return; } onPick(item); },
          },
            h(Photo, { src: photoOf(item), alt: item.title, item }),
            h('div', { className: 'preview-text' },
              h('div', { className: 'preview-kicker' },
                h('span', { className: 'preview-type' }, item.online ? 'Online event' : item.type),
                h('span', { className: 'category-line' }, h('i', { style: { background: item.color } }), item.groupLabel)),
              h('h2', null, item.title),
              h('div', { className: 'preview-meta' },
                h('div', null, h('b', null, item.type === 'event' ? 'When' : 'Status'), item.when || '—'),
                h('div', null, h('b', null, item.online ? 'Online' : 'Where'), item.online ? 'Online · not a physical venue' : (item.location || '—')))),
          ),
          selected ? h(Actions, { item, flags, onAction }) : null);
      }),
      h('button', { type: 'button', className: 'close-conveyor cn-round', 'aria-label': 'Hide previews', onClick: onClose }, '×'),
      h('div', { className: 'cn-belt-arrows' },
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Previous listing', onClick: () => onStep(-1) }, '‹'),
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Next listing', onClick: () => onStep(1) }, '›')));
  }

  function BigPreview({ item, items, flags, onAction, onClose, onProfile, onGroup, onFocus }) {
    const [tab, setTab] = useState('Events');
    if (!item) return null;
    const nearby = items.filter((i) => i.id !== item.id).slice(0, 3);
    const facts = item.type === 'event'
      ? [['Host', item.host || '—'], ['When', item.when || '—'], [item.online ? 'Online' : 'Where', item.online ? 'Online · not a physical venue' : (item.location || '—')], ['Responses', (item.connectCount || 0) + ' connected · ' + (item.considerCount || 0) + ' considering']]
      : [['Host', item.host || item.title], ['Status', item.when || '—'], ['Where', item.location || '—'], ['Community', (item.followers || 0) + ' followers']];
    return h('div', {
      className: 'cn-big', role: 'dialog', 'aria-label': item.title + ' expanded preview',
      style: { '--category': item.color },
    },
      h('div', { className: 'big-bar' },
        h('button', { type: 'button', className: 'big-bar-filter', 'aria-label': 'Show ' + item.groupLabel + ' on the map', onClick: () => onGroup(item.group) }, 'Connect · ' + item.groupLabel),
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Back to smaller preview', onClick: onClose }, '×')),
      h(Photo, { src: photoOf(item), alt: item.title, className: 'big-photo', item }),
      h('div', { className: 'big-copy' },
        h('div', { className: 'big-kicker' },
          h('span', { className: 'type-chip' }, item.online ? 'Online event' : item.type),
          h('button', { type: 'button', className: 'category-filter', onClick: () => onGroup(item.group) },
            h('span', { className: 'category-line' }, h('i', { style: { background: item.color } }), item.groupLabel, h('span', null, '→')))),
        h('h1', null, item.title),
        h('div', { className: 'big-meta' },
          item.when ? h('span', null, item.when) : null,
          h('span', { className: 'mode-chip' }, item.online ? 'Online · not a physical venue' : 'In person')),
        h(Actions, { item, flags, onAction }),
        item.detail ? h('p', { className: 'big-lede' }, item.detail) : null,
        h('div', { className: 'listing-facts' }, facts.map((f) => h('div', { key: f[0], className: 'fact' }, h('small', null, f[0]), f[0] === 'Host'
          ? h('button', { type: 'button', className: 'host-line', onClick: onProfile }, f[1])
          : h('p', null, f[1])))),
        item.type === 'contributor' ? h(React.Fragment, null,
          h('div', { className: 'big-tabs', role: 'tablist', 'aria-label': 'Contributor content' },
            ['Events', 'News', 'Gallery', 'Today'].map((name) => h('button', { key: name, type: 'button', role: 'tab', className: tab === name ? 'on' : '', 'aria-selected': tab === name, onClick: () => setTab(name) }, name))),
          h('div', { className: 'tab-carousel' },
            h('button', { type: 'button', className: 'tab-tile', onClick: onProfile },
              h(Photo, { src: photoOf(item), alt: '', item }),
              h('span', { className: 'tab-caption' }, h('b', null, item.title), h('small', null, tab)))),
          h('button', { type: 'button', className: 'cn-text see-all', onClick: onProfile }, 'See all ' + tab + ' →')) : null,
        nearby.length ? h(React.Fragment, null,
          h('h2', null, 'Nearby'),
          h('div', { className: 'nearby-row' }, nearby.map((n) => h('button', { key: n.id, type: 'button', onClick: () => onFocus(n, true) },
            h(Photo, { src: photoOf(n), alt: '', item: n }),
            h('span', null, h('b', null, n.title), h('small', null, n.groupLabel + ' →')))))) : null,
        h('div', { className: 'cn-actions quiet-actions' },
          item.type === 'contributor' ? h('button', { type: 'button', onClick: () => onAction(item, 'QR code') }, 'QR code') : null,
          h('button', { type: 'button', onClick: () => onAction(item, 'Report') }, 'Report')),
        h('button', { type: 'button', className: 'cn-ink-button full-profile-button', onClick: onProfile }, 'View full profile ↗')));
  }

  function ListingProfile({ item, onBack, onAction, flags }) {
    const slides = [{ key: 'Cover', src: photoOf(item) }];
    const [slide, setSlide] = useState(0);
    const start = useRef(0);
    if (!item) return null;
    const socials = [
      ['Call', item.phone], ['Website', item.website], ['Directions', item.lat != null || item.location],
    ].filter((s) => s[1]);
    return h('div', { className: 'cn-page listing-profile', style: { '--category': item.color }, 'data-screen': 'listing-profile' },
      h('div', {
        className: 'profile-hero',
        onPointerDown: (e) => { start.current = e.clientX; },
        onPointerUp: (e) => { const dx = e.clientX - start.current; if (Math.abs(dx) > 35 && slides.length > 1) setSlide((s) => (s + (dx < 0 ? 1 : slides.length - 1)) % slides.length); },
      },
        h(Photo, { src: slides[slide].src, alt: item.title, item }),
        h('button', { type: 'button', className: 'profile-back cn-round', 'aria-label': 'Back to listing preview', onClick: onBack }, '←'),
        h('div', { className: 'hero-dots' },
          slides.map((s, n) => h('button', { key: s.key, type: 'button', className: n === slide ? 'active' : '', 'aria-label': s.key, onClick: () => setSlide(n) })),
          h('small', null, slides[slide].key))),
      h('div', { className: 'profile-copy' },
        h('div', { className: 'profile-identity' },
          h('span', { className: 'org-logo', style: { background: item.color, color: '#f7f6f1' } }, window.ConnectChrome && window.ConnectChrome.glyphNode(item.category)),
          h('div', null,
            h('h1', null, item.title, item.verified ? h('span', { className: 'verified', 'aria-label': 'Verified' }, '✓') : null),
            h('span', { className: 'category-line' }, h('i', { style: { background: item.color } }), item.groupLabel))),
        h('div', { className: 'cn-row' },
          item.openToCollaborate ? h('span', { className: 'collab-label' }, 'Open to collaborate') : null,
          item.type !== 'event' ? h('span', null, (item.followers || 0) + ' followers') : null),
        h('div', { className: 'cn-actions profile-actions' },
          ['Follow', 'Message', 'Share'].map((label) => {
            const on = !!(flags && flags[item.id + label]);
            return h('button', { key: label, type: 'button', className: (label === 'Follow' ? 'lead ' : '') + (on ? 'on' : ''), onClick: () => onAction(item, label) }, on && TOGGLE[label] ? TOGGLE[label] : label);
          })),
        socials.length ? h('div', { className: 'social-row' }, socials.map((s) => h('button', { key: s[0], type: 'button', 'aria-label': s[0], onClick: () => onAction(item, s[0]) }, h('small', null, s[0].slice(0, 2))))) : null,
        item.detail ? h('section', { className: 'profile-section' },
          h('div', { className: 'profile-about cn-glass' },
            h('h2', null, 'About'),
            h('p', null, item.detail),
            h('div', { className: 'about-facts' },
              h('div', null, h('small', null, 'Hours'), h('p', null, item.when || '—')),
              h('div', null, h('small', null, 'Find us'), h('p', null, item.location || '—')),
              h('div', null, h('small', null, 'Organisation'), h('p', null, item.host || item.title))),
            h('button', { type: 'button', className: 'cn-text', onClick: () => onAction(item, 'Directions') }, 'Get directions →'))) : null));
  }

  function ActionModal({ action, item, onClose, onSend }) {
    const [note, setNote] = useState('');
    const [reason, setReason] = useState('Listing details');
    if (!action || !item) return null;
    let body = null;
    if (action === 'Message') body = h(React.Fragment, null, h('p', null, 'A conversation can begin with a simple hello.'), h('textarea', { 'aria-label': 'Write a message', placeholder: 'Write a little note…', value: note, onChange: (e) => setNote(e.target.value) }), h('button', { type: 'button', className: 'cn-primary', onClick: () => onSend(item, note) }, 'Send'));
    else if (action === 'Share' || action === 'QR code') body = h('p', null, 'A link to keep or pass on.');
    else if (action === 'Report') body = h(React.Fragment, null, h('p', null, 'What would you like the team to look at?'), h('select', { 'aria-label': 'Report reason', value: reason, onChange: (e) => setReason(e.target.value) }, ['Listing details', 'Content concern', 'Something else'].map((o) => h('option', { key: o }, o))));
    else if (action === 'Directions') body = h('p', null, item.location || 'The listing has no address yet.');
    else body = h('p', null, item.website || item.location || item.title);
    return h('div', { className: 'cn-overlay', role: 'dialog', 'aria-label': action },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'cn-row' }, h('h2', null, action), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close action', onClick: onClose }, '×')),
        h('h3', null, item.title),
        body));
  }

  window.ConnectPreviews = { listingsFrom, Conveyor, BigPreview, ListingProfile, ActionModal, groupOf, hexOf };
})();
