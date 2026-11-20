(function () {
  const h = React.createElement;
  const { useState } = React;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'C')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function icon(paths) {
    return h('svg', {
      viewBox: '0 0 24 24', width: '100%', fill: 'none', stroke: 'currentColor',
      strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    }, paths.map((d, i) => h('path', { key: i, d })));
  }
  const ICONS = {
    messages: ['M8 9h8M8 13h5', 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
    friends: ['M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1', 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M20 20v-1a3 3 0 0 0-2.2-2.9', 'M16 5.1a3 3 0 0 1 0 5.8'],
    settings: ['M4 8h10', 'M18 8h2', 'M4 16h2', 'M10 16h10', 'M14 6v4', 'M8 14v4'],
    shield: ['M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z'],
    calendar: ['M7 3v3M17 3v3M4 8h16', 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
    pencil: ['M4 20h4l10-10-4-4L4 16z', 'M13 7l4 4'],
  };
  function Glyph({ name }) {
    return h('span', { className: 'inline-icon' }, icon(ICONS[name] || ICONS.settings));
  }
  function jhb(date, opt) {
    return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Africa/Johannesburg' }, opt)).format(date);
  }
  function monthLabel(date) {
    return jhb(date, { month: 'long' });
  }

  function agendaGroups(events) {
    const groups = [];
    (events || []).forEach((e) => {
      const when = e.date || e.startsAt;
      const t = when ? Date.parse(when) : NaN;
      if (Number.isNaN(t)) return;
      const date = new Date(t);
      const label = monthLabel(date);
      let g = groups.find((x) => x.label === label);
      if (!g) { g = { label, items: [], current: label === monthLabel(new Date()) }; groups.push(g); }
      g.items.push({
        day: jhb(date, { day: 'numeric' }),
        title: e.title || 'Gathering',
        meta: [e.time, e.location].filter(Boolean).join(' · '),
      });
    });
    if (!groups.length) groups.push({ label: monthLabel(new Date()), items: [], current: true });
    return groups;
  }

  function Personal({ app, listing, shown, onSpace, onEdit, onStatus, onExplore, onContrib, vibe, setVibe, status }) {
    const name = shown.name || 'Citizen';
    const seen = app.myProfileMeta?.discoverable === true ? 'Public profile' : 'Personal profile';
    const unread = app.unreadMsgs || 0;
    const notices = (app.notifications || []).filter((n) => !n.read).slice(0, 4);
    const mine = (app.connected && app.ownEvents) ? app.ownEvents.concat((app.events || []).filter((e) => app.connected.has && app.connected.has(e.id))) : (app.ownEvents || []);
    const months = agendaGroups(mine);
    const links = [
      ['Instagram', shown.instagram],
      ['Website', shown.website],
      ['WhatsApp', shown.whatsapp],
    ].filter((row) => row[1]);
    const photos = [...new Set([shown.profilePhoto, shown.coverPhoto, ...(shown.photos || [])].filter(Boolean))];
    const suggest = (app.events || []).find((e) => e.coverPhoto) || (app.places || [])[0] || null;
    const areaName = shown.homeArea || shown.location || '';
    return h(React.Fragment, null,
      h('div', { className: 'cn-cover' },
        shown.coverPhoto ? h('img', { src: shown.coverPhoto, alt: 'Your cover photo' }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': '#7040b5', '--fallback-paper': '#1c241c', '--fallback-ink': '#f7f6f1' } }),
        h('div', { className: 'cover-shade' }),
        h('span', { className: 'cn-eyebrow' }, 'Your corner of Connect')),
      h('div', { className: 'me-identity' },
        h('button', { type: 'button', className: 'me-avatar' + (shown.profilePhoto ? ' has-photo' : ''), 'aria-label': 'Change your profile photo', onClick: onEdit },
          shown.profilePhoto ? h('img', { src: shown.profilePhoto, alt: 'Your profile photo' }) : h('span', null, initials(name)),
          h('span', { className: 'me-avatar-edit', 'aria-hidden': 'true' }, h(Glyph, { name: 'pencil' }))),
        h('div', null,
          h('small', null, (areaName ? areaName + ' · ' : '') + seen),
          h('h1', null, name)),
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Edit your personal profile', onClick: onEdit }, h(Glyph, { name: 'pencil' }))),
      shown.bio ? h('p', { className: 'me-bio' }, shown.bio) : null,
      links.length ? h('div', { className: 'me-links' }, h('div', { className: 'mc-link-chips' }, links.map((row) => h('span', { key: row[0] }, row[1])))) : null,
      h('div', { className: 'me-columns' },
        h('div', { className: 'me-left' },
          h('div', { className: 'me-space-links', 'aria-label': 'Messages, friends and settings' },
            [['Messages', unread ? unread + ' waiting' : 'Conversations', 'messages'], ['Friends', 'People you walk with', 'friends'], ['Settings', 'Make it yours', 'settings']].map((c) =>
              h('button', { key: c[0], type: 'button', className: 'cn-glass', onClick: () => onSpace(c[0]) },
                h(Glyph, { name: c[2] }),
                h('b', null, c[0], c[0] === 'Messages' && unread ? h('span', { className: 'count-dot' }, String(unread)) : null),
                h('small', null, c[1])))),
          listing
            ? h('button', { type: 'button', className: 'me-contrib cn-glass', onClick: onContrib },
              h('span', { className: 'me-role-mark', style: { '--rc': '#7040b5' } }, initials(listing.name)),
              h('span', null, h('b', null, listing.name + ' · your listing'), h('small', null, 'Open your contributor dashboard')),
              h('span', null, '→'))
            : h('div', null,
              h('button', { type: 'button', className: 'me-contrib cn-glass', onClick: () => app.go(app.isPendingApplicant || app.listingRole || app.isContributor ? 'dashboard' : 'apply') },
                h('span', null, h('b', null, app.isPendingApplicant ? 'My application' : app.isContributor || app.listingRole ? 'My dashboard' : 'Become a Contributor'), h('small', null, 'Put your church, ministry or business on the map')))),
          h('button', { type: 'button', className: 'status-entry cn-glass', onClick: onStatus },
            h('span', null, '＋'), h('span', null, status || 'Add a private note for today')),
          h('section', { className: 'me-photos' },
            h('div', { className: 'cn-row' },
              h('h2', null, 'Your photos', h('small', null, photos.length)),
              h('button', { type: 'button', className: 'cn-text', onClick: onEdit }, 'Edit')),
            h('div', { className: 'mc-gallery sm' },
              photos.map((src, n) => h('span', { key: src + n, className: 'mc-thumb' }, h('img', { src, alt: 'Your photo ' + (n + 1) }))),
              h('button', { type: 'button', className: 'mc-add', 'aria-label': 'Manage your profile photo', onClick: onEdit }, 'Profile photo'))),
          h('section', null,
            h('h2', null, 'Notifications', h('small', null, notices.length)),
            notices.length ? notices.map((n) => h('div', { key: n.id, className: 'notice-wrap' },
              h('button', { type: 'button', className: 'notice', onClick: () => { if (n.convId) onSpace('Messages'); else if (app.readNotification) app.readNotification(n.id); } },
                h('b', null, n.title), n.body ? h('small', null, n.body) : null),
              h('button', { type: 'button', className: 'notice-x', 'aria-label': 'Dismiss: ' + (n.title || 'notice'), onClick: () => app.readNotification && app.readNotification(n.id) }, '×')))
              : h('p', { className: 'notice' }, 'You’re all caught up.')),
          h('section', { className: 'vibe-box cn-glass' },
            h('h2', null, 'Vibe Check'),
            h('p', null, 'How are you arriving today?'),
            h('div', { className: 'cn-actions' }, ['Grateful', 'Quiet', 'Hopeful'].map((v) =>
              h('button', { key: v, type: 'button', className: vibe === v ? 'on' : '', 'aria-pressed': vibe === v, onClick: () => setVibe(v) }, v)))),
          h('section', { className: 'for-you' },
            h('h2', null, 'For you'),
            suggest ? h('button', { type: 'button', className: 'me-recommend', onClick: () => app.go(suggest.title ? 'event' : 'place', { id: suggest.id }) },
              suggest.coverPhoto ? h('img', { src: suggest.coverPhoto, alt: '' }) : null,
              h('span', null, suggest.title || suggest.name, h('small', null, ((suggest.location || areaName || 'Nearby') + ' →')))) : null,
            h('button', { type: 'button', className: 'cn-text', onClick: onExplore }, 'Communities around ' + (areaName || 'you') + ' →'))),
        h('section', { className: 'me-calendar cn-glass' },
          h(Glyph, { name: 'calendar' }),
          h('h2', null, 'Your calendar'),
          h('small', null, 'Your agenda · SAST'),
          months.map((g) => h('button', {
            key: g.label, type: 'button', className: 'agenda-month' + (g.current ? ' current' : ''),
            onClick: () => onSpace('Calendar'),
          },
          h('span', null, g.label),
          h('div', null, g.items.length ? g.items.map((item) => h('div', { key: g.label + item.day + item.title },
            h('b', null, item.day), h('p', null, item.title), item.meta ? h('small', null, item.meta) : null))
            : h('p', null, 'Nothing on the agenda yet.')))))));
  }

  function StatusPanel({ status, setStatus, onClose }) {
    return h('div', { className: 'cn-overlay', role: 'dialog', 'aria-label': 'Status' },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'cn-row' }, h('h2', null, 'Status'), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close', onClick: onClose }, '×')),
        h('p', null, 'Your note stays on this device.'),
        h('textarea', { placeholder: 'Write a note for today', value: status, onChange: (e) => setStatus(e.target.value) }),
        h('button', { type: 'button', className: 'cn-primary', onClick: onClose }, 'Save')));
  }

  function CalendarPanel({ events, onClose, onExplore }) {
    const now = new Date();
    const label = jhb(now, { month: 'long', year: 'numeric' });
    const months = agendaGroups(events);
    return h('div', { className: 'cn-overlay', role: 'dialog', 'aria-label': 'Calendar' },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'cn-row' }, h('h2', null, 'Your calendar'), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close', onClick: onClose }, '×')),
        h('p', null, label + ' · SAST'),
        months.map((g) => h('div', { key: g.label, className: 'agenda-month' + (g.current ? ' current' : '') },
          h('span', null, g.label),
          h('div', null, g.items.length ? g.items.map((item) => h('div', { key: item.day + item.title }, h('b', null, item.day), h('p', null, item.title), item.meta ? h('small', null, item.meta) : null)) : h('p', null, 'Nothing on the agenda yet.')))),
        h('button', { type: 'button', className: 'cn-primary', onClick: onExplore }, 'Explore Connect ↗')));
  }

  function personRow(person, followed, app) {
    return h('div', { key: person.id, className: 'ps-person' },
      h('span', { className: 'ps-avatar' }, person.profilePhoto ? h('img', { src: person.profilePhoto, alt: '' }) : h('span', { className: 'ps-initials' }, initials(person.name))),
      h('span', { className: 'ps-thread-copy' }, h('b', null, person.name), person.location ? h('small', null, person.location) : null),
      h('div', { className: 'cn-actions ps-actions' },
        h('button', { type: 'button', onClick: () => app.startConversationWith && app.startConversationWith(person.name, person.profilePhoto, true, person.id) }, 'Message'),
        h('button', { type: 'button', className: 'lead' + (followed ? ' on' : ''), onClick: () => app.toggleFollow && app.toggleFollow(person.id, person.name) }, followed ? 'Following' : 'Follow')));
  }

  function Friends({ app, onBack }) {
    const followed = app.followedOrgs || new Set();
    const people = (app.contributors || []).filter((c) => c && c.name && c.id);
    const walking = people.filter((c) => followed.has && followed.has(c.id));
    const nearby = people.filter((c) => !(followed.has && followed.has(c.id))).slice(0, 8);
    const saved = (app.places || []).filter((p) => app.savedPlaces && app.savedPlaces.has && app.savedPlaces.has(p.id));
    const block = (title, rows, empty) => h('section', { className: 'ps-section' },
      h('h2', null, title),
      rows.length ? h('div', { className: 'ps-list cn-glass' }, rows) : h('p', { className: 'ps-note' }, empty));
    return h('div', { className: 'ps-friends' },
      block('Nearby to follow', nearby.map((p) => personRow(p, false, app)), 'No one new nearby yet.'),
      block('Now walking with you', walking.map((p) => personRow(p, true, app)), 'No one here yet.'),
      block('Saved for later', saved.map((p) => h('div', { key: p.id, className: 'ps-row ps-saved' },
        h('i', { style: { background: '#687d20' } }),
        h('span', null, h('b', null, p.name)))), 'Nothing saved yet.'),
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
  }

  function MePage() {
    const app = window.useApp();
    const [panel, setPanel] = useState('');
    const key = 'connect-me:' + (app.realUser?.id || app.user?.id || 'guest') + ':' + new Date().toLocaleDateString('en-CA');
    const [notes, setNotes] = useState(() => {
      try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
    });
    const update = (field, value) => {
      const next = { ...notes, [field]: value };
      setNotes(next);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage unavailable. */ }
    };
    const open = (name) => {
      if (name === 'Messages' || name === 'Settings') app.go(name.toLowerCase());
      else setPanel(name);
    };
    if (panel === 'Activity') return h(React.Fragment, null,
      h('button', { className: 'cn-text', onClick: () => setPanel('') }, 'Back to Me'), h(window.CitizenProfilePage));
    if (app.guestMode && !app.authed) return h('div', { className: 'connect-scroll', 'data-screen': 'profile' },
      h('div', { className: 'cn-page' }, h('h1', null, 'Me'), h('button', { className: 'cn-primary', onClick: () => app.showSignIn() }, 'Sign in to see your profile')));
    return h('div', { className: 'connect-scroll', 'data-screen': 'profile' },
      h('div', { className: 'cn-page me-page' },
        panel === 'Friends' ? h(Friends, { app, onBack: () => setPanel('') }) : h(Personal, {
          app, shown: app.user, listing: app.myContributor, onSpace: open, onEdit: () => app.go('settings'),
          onStatus: () => open('Status'), onExplore: () => app.go('explore'), onContrib: () => app.go('dashboard'),
          vibe: notes.vibe, status: notes.status, setVibe: (v) => update('vibe', v),
        }),
        !panel && h('div', { className: 'cn-actions' },
          h('button', { onClick: () => setPanel('Activity') }, 'My activity'),
          h('button', { onClick: () => app.go('kingdom-discovery') }, 'Kingdom Exploration'),
          h('button', { onClick: () => app.go('lets') }, 'Let’s…'),
          h('button', { onClick: () => app.go('notifications') }, 'All notifications'),
          app.isAdmin && h('button', { onClick: () => app.go('admin') }, 'Admin panel')),
        panel === 'Calendar' && h(CalendarPanel, { events: [...(app.ownEvents || []), ...app.events.filter((e) => app.connected.has(e.id))], onClose: () => setPanel(''), onExplore: () => app.go('explore') }),
        panel === 'Status' && h(StatusPanel, { status: notes.status || '', setStatus: (v) => update('status', v), onClose: () => setPanel('') })));
  }
  window.ConnectMe = { Page: MePage };
})();
