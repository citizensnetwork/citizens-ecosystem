// Me hub, Messages, Friends, and Settings (pack 03). Role comes from the signed-in session.
// Vibe and daily status stay on this device. Theme writes citizens-theme.
// Profile name and bio save through the existing saveProfile. Notification
// switches use the existing preference keys. No new tables.
(function () {
  const h = React.createElement;
  const { useState, useEffect } = React;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'C')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function themeNow() {
    const M = window.MapV2;
    return M && M.themePref ? M.themePref : 'System';
  }
  function resolved() {
    const M = window.MapV2;
    return M && M.resolvedTheme ? M.resolvedTheme() : 'light';
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

  function Switch({ on, onClick, label }) {
    return h('button', { type: 'button', className: 'ps-switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on, 'aria-label': label, onClick }, h('i'));
  }

  function RoleSwitch({ sides, side, onSide }) {
    if (sides.length < 2) return null;
    const listing = (sides.find((s) => s[0] === 'contributor') || ['', 'your listing'])[1];
    const note = side === 'admin' ? 'Looking after Connect · Admin'
      : side === 'contributor' ? 'Editing ' + listing + ' · what people see on Connect'
      : 'Your personal Me · friends, messages and settings';
    const chrome = window.ConnectChrome;
    return h('div', { className: 'me-role' },
      h('div', { className: 'me-role-seg cn-glass', role: 'tablist', 'aria-label': 'What you are looking after' },
        sides.map((s) => h('button', {
          key: s[0], type: 'button', role: 'tab', 'aria-selected': side === s[0],
          className: 'me-role-' + s[0] + (side === s[0] ? ' on' : ''),
          onClick: () => onSide(s[0]),
        },
        s[0] === 'me' && chrome ? h('span', { className: 'inline-icon' }, h(chrome.Icon, { kind: 'Me' })) : null,
        s[0] === 'contributor' ? h('span', { className: 'me-role-mark', style: { '--rc': '#7040b5' } }, initials(s[1])) : null,
        s[0] === 'admin' ? h(Glyph, { name: 'shield' }) : null,
        s[0] === 'me' ? 'Me' : s[0] === 'admin' ? 'Admin' : s[1]))),
      h('p', { className: 'me-role-note' }, note));
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
    const seen = shown.seenBy === 'Everyone' ? 'seen by everyone on Connect' : 'seen by friends';
    const unread = app.unreadMsgs || 0;
    const notices = (app.notifications || []).filter((n) => !n.read).slice(0, 4);
    const mine = (app.connected && app.ownEvents) ? app.ownEvents.concat((app.events || []).filter((e) => app.connected.has && app.connected.has(e.id))) : (app.ownEvents || []);
    const months = agendaGroups(mine);
    const links = [
      ['Instagram', shown.instagram],
      ['Website', shown.website],
      ['WhatsApp', shown.whatsapp],
    ].filter((row) => row[1]);
    const photos = Array.isArray(shown.photos) ? shown.photos.filter(Boolean) : [];
    const suggest = (app.events || []).find((e) => e.coverPhoto) || (app.places || [])[0] || null;
    const areaName = shown.homeArea || shown.location || '';
    return h(React.Fragment, null,
      h('div', { className: 'cn-cover' },
        shown.coverPhoto ? h('img', { src: shown.coverPhoto, alt: 'Your cover photo' }) : h('span', { className: 'photo-fallback', style: { position: 'absolute', inset: 0, '--fallback-color': '#7040b5', '--fallback-paper': '#1c241c', '--fallback-ink': '#f7f6f1' } }),
        h('div', { className: 'cover-shade' }),
        h('span', { className: 'cn-eyebrow' }, 'Your corner of Connect'),
        h('button', { type: 'button', className: 'mc-chip', onClick: onEdit }, 'Change cover')),
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
              h('span', null, h('b', null, listing.name + ' · your listing'), h('small', null, 'Edit what people see, from the switch above')),
              h('span', null, '→'))
            : h('div', null,
              h('button', { type: 'button', className: 'me-contrib cn-glass', onClick: () => app.go('apply') },
                h('span', null, h('b', null, 'Become a Contributor'), h('small', null, 'Put your church, ministry or business on the map'))),
              h('button', { type: 'button', className: 'me-contrib-link cn-text', onClick: () => app.go('dashboard') }, 'Already approved? Open your listing home →')),
          h('button', { type: 'button', className: 'status-entry cn-glass', onClick: onStatus },
            h('span', null, '＋'), h('span', null, status || 'Share a little of your day')),
          h('section', { className: 'me-photos' },
            h('div', { className: 'cn-row' },
              h('h2', null, 'Your photos', h('small', null, String(photos.length).padStart(2, '0'))),
              h('button', { type: 'button', className: 'cn-text', onClick: onEdit }, 'Edit')),
            h('div', { className: 'mc-gallery sm' },
              photos.map((src, n) => h('span', { key: src + n, className: 'mc-thumb' }, h('img', { src, alt: 'Your photo ' + (n + 1) }))),
              h('button', { type: 'button', className: 'mc-add', 'aria-label': 'Add a photo', onClick: onEdit }, '＋'))),
          h('section', null,
            h('h2', null, 'Notifications', h('small', null, String(notices.length).padStart(2, '0'))),
            notices.length ? notices.map((n) => h('div', { key: n.id, className: 'notice-wrap' },
              h('button', { type: 'button', className: 'notice', onClick: () => { if (n.convId) onSpace('Messages'); else if (app.readNotification) app.readNotification(n.id); } },
                h('b', null, n.title), n.body ? h('small', null, n.body) : null),
              h('button', { type: 'button', className: 'notice-x', 'aria-label': 'Dismiss: ' + (n.title || 'notice'), onClick: () => app.readNotification && app.readNotification(n.id) }, '×')))
              : h('p', { className: 'notice' }, 'You’re all caught up.')),
          h('section', { className: 'vibe-box cn-glass' },
            h('h2', null, 'Vibe Check'),
            h('p', null, 'How are you arriving today?'),
            h('div', { className: 'cn-actions' }, ['Grateful', 'Quiet', 'Hopeful'].map((v) =>
              h('button', { key: v, type: 'button', className: vibe === v ? 'on' : '', onClick: () => setVibe(v) }, v)))),
          h('section', { className: 'for-you' },
            h('h2', null, 'For you'),
            suggest ? h('button', { type: 'button', className: 'me-recommend', onClick: onExplore },
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

  function Editor({ app, shown, onClose, onSave }) {
    const [name, setName] = useState(shown.name || '');
    const [about, setAbout] = useState(shown.bio || '');
    const [home, setHome] = useState(shown.homeArea || '');
    const [site, setSite] = useState(shown.website || '');
    const [ig, setIg] = useState(shown.instagram || '');
    const [wa, setWa] = useState(shown.whatsapp || '');
    const [seen, setSeen] = useState(shown.seenBy || 'Friends');
    const citizenOnly = !app.isAdmin && !app.isContributor;
    return h('div', { className: 'cn-overlay personal-edit', role: 'dialog', 'aria-label': 'Personal profile editing' },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'pe' },
          h('div', { className: 'cn-row' }, h('h2', null, 'Your profile'), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close', onClick: onClose }, '×')),
          h('div', { className: 'pe-hero' },
            shown.coverPhoto ? h('img', { className: 'edit-cover', src: shown.coverPhoto, alt: 'Your cover photo' }) : h('span', { className: 'photo-fallback edit-cover', style: { '--fallback-color': '#7040b5', '--fallback-paper': '#1c241c', '--fallback-ink': '#f7f6f1' } }),
            h('span', { className: 'pe-avatar' }, shown.profilePhoto ? h('img', { src: shown.profilePhoto, alt: 'Your profile photo' }) : h('span', { className: 'ps-initials' }, initials(name || 'Citizen')))),
          h('p', { className: 'pe-lede' }, 'The personal you: what friends see when they open your profile.' + (citizenOnly ? '' : ' Your listing and admin sides are edited from the switch at the top of Me.')),
          h('p', { className: 'pe-h' }, 'Who sees your profile'),
          h('div', { className: 'pe-seg', role: 'radiogroup', 'aria-label': 'Who sees your profile' },
            [['Friends', 'Only people you walk with'], ['Everyone', 'Anyone on Connect']].map((s) =>
              h('button', { key: s[0], type: 'button', className: seen === s[0] ? 'on' : '', onClick: () => setSeen(s[0]) }, s[0]))),
          h('p', { className: 'pe-lede' }, seen === 'Friends' ? 'Only people you walk with' : 'Anyone on Connect'),
          h('label', null, 'Display name', h('input', { value: name, onChange: (e) => setName(e.target.value) })),
          h('label', null, 'About you', h('textarea', { maxLength: 160, value: about, onChange: (e) => setAbout(e.target.value) }), h('small', null, about.length + '/160')),
          h('label', null, 'Home area', h('input', { value: home, onChange: (e) => setHome(e.target.value) })),
          h('label', null, 'Instagram', h('input', { value: ig, onChange: (e) => setIg(e.target.value) })),
          h('label', null, 'Website', h('input', { placeholder: 'Your site, if you have one', value: site, onChange: (e) => setSite(e.target.value) })),
          h('label', null, 'WhatsApp', h('input', { value: wa, onChange: (e) => setWa(e.target.value) })),
          h('button', {
            type: 'button', className: 'cn-primary cs-plate', style: { '--acc': '#d4af37' },
            onClick: () => onSave({ name: name.trim(), bio: about, homeArea: home, website: site, instagram: ig, whatsapp: wa, seenBy: seen }),
          }, 'Save'))));
  }

  function StatusPanel({ status, setStatus, onClose }) {
    return h('div', { className: 'cn-overlay', role: 'dialog', 'aria-label': 'Status' },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'cn-row' }, h('h2', null, 'Status'), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close', onClick: onClose }, '×')),
        h('p', null, 'A little window into your day.'),
        h('textarea', { placeholder: 'What would you like to share?', value: status, onChange: (e) => setStatus(e.target.value) }),
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

  const NOTIF_ROWS = [
    ['announcements', 'When a conversation is waiting', ''],
    ['friends_activity', 'Friend requests', 'When someone would like to walk with you'],
    ['event_reminders', 'Events near you', 'A gentle note, never a flood'],
    ['weekly_digest', 'Weekly guide', 'One summary each Monday'],
  ];

  function Settings({ app, onBack }) {
    const [pref, setPref] = useState(themeNow());
    const [local, setLocal] = useState({});
    const [detail, setDetail] = useState('');
    const [visibility, setVisibility] = useState('Friends and communities');
    const [who, setWho] = useState('Friends only');
    const meta = app.myProfileMeta;
    useEffect(() => {
      const sync = () => setPref(themeNow());
      window.addEventListener('cc-map-theme', sync);
      return () => window.removeEventListener('cc-map-theme', sync);
    }, []);
    const choose = (p) => {
      if (window.MapV2 && window.MapV2.setThemePref) window.MapV2.setThemePref(p);
      setPref(p);
    };
    const on = (key) => {
      if (meta && meta.notificationPrefs && key in meta.notificationPrefs) return meta.notificationPrefs[key] !== false;
      if (key in local) return local[key] !== false;
      return key !== 'event_reminders';
    };
    const flip = (key) => {
      const next = !on(key);
      setLocal((t) => Object.assign({}, t, { [key]: next }));
      if (app.saveNotificationPref) app.saveNotificationPref(key, next);
    };
    const help = pref === 'Dark' ? 'Always dark on this device' : pref === 'Light' ? 'Always light on this device' : 'Follows your device · ' + (resolved() === 'dark' ? 'Dark' : 'Light');
    const discoverable = meta ? meta.discoverable !== false : true;
    if (detail === 'Cover and profile photo') {
      return h('div', { className: 'ps-detail' },
        h('button', { type: 'button', className: 'cn-text', onClick: () => setDetail('') }, '← Settings'),
        h('h2', null, 'Cover and profile photo'),
        h('p', null, 'Change it from the profile editor on Me.'));
    }
    if (detail) {
      const options = detail === 'Who can message me' ? ['Friends only', 'No one for now', 'Everyone in Connect'] : ['Everyone in Connect', 'Friends and communities', 'Only me'];
      const cur = detail === 'Who can message me' ? who : visibility;
      return h('div', { className: 'ps-detail' },
        h('button', { type: 'button', className: 'cn-text', onClick: () => setDetail('') }, '← Settings'),
        h('h2', null, detail),
        options.map((o) => h('button', {
          key: o, type: 'button', className: 'ps-option ps-row' + (cur === o ? ' on' : ''),
          onClick: () => {
            if (detail === 'Who can message me') setWho(o);
            else {
              setVisibility(o);
              if (app.setDiscoverable) app.setDiscoverable(o !== 'Only me');
            }
          },
        }, h('b', null, o), h('span', { className: 'ps-radio' }))));
    }
    const saved = (app.places || []).filter((p) => app.savedPlaces && app.savedPlaces.has && app.savedPlaces.has(p.id));
    const row = (title, sub, control) => h('div', { className: 'ps-row cn-glass' }, h('span', null, h('b', null, title), sub ? h('small', null, sub) : null), control);
    return h('div', { className: 'ps-settings' },
      app.isPendingApplicant ? h('section', { className: 'ps-section' },
        h('h2', null, 'Become a Contributor'),
        h('p', null, 'Your Contributor application is being reviewed'),
        h('button', { type: 'button', className: 'cn-text', onClick: () => app.go('dashboard') }, 'Open my application')) : null,
      h('section', { className: 'ps-section' }, h('h2', null, 'Account'),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => setDetail('Cover and profile photo') },
          h('span', null, h('b', null, 'Cover and profile photo'), h('small', null, 'Change it from the profile editor on Me.')))),
      h('section', { className: 'ps-section' }, h('h2', null, 'Notifications'),
        NOTIF_ROWS.map((r) => row(r[1], r[2], h(Switch, { on: on(r[0]), label: r[1], onClick: () => flip(r[0]) })))),
      h('section', { className: 'ps-section' }, h('h2', null, 'Privacy'),
        row('Show me on the map', 'Off keeps your location to yourself', h(Switch, { on: discoverable, label: 'Show me on the map', onClick: () => app.setDiscoverable && app.setDiscoverable(!discoverable) })),
        row('Friends see what I’m attending', 'Only people you walk with', h(Switch, { on: on('share_considering'), label: 'Friends see what I’m attending', onClick: () => flip('share_considering') })),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => setDetail('Who sees your profile') }, h('span', null, h('b', null, 'Who sees your profile'), h('small', null, visibility))),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => setDetail('Who can message me') }, h('span', null, h('b', null, 'Who can message me'), h('small', null, who)))),
      h('section', { className: 'ps-section' }, h('h2', null, 'Saved places'),
        saved.length ? h('div', { className: 'ps-list cn-glass' }, saved.map((p) => h('div', { key: p.id, className: 'ps-row ps-saved' },
          h('i', { style: { background: (window.ConnectChrome && window.ConnectChrome.groupHex && window.ConnectChrome.groupHex(p.category)) || '#687d20' } }),
          h('span', null, h('b', null, p.name), p.address ? h('small', null, p.address) : null)))) : null),
      h('section', { className: 'ps-section ps-appearance' }, h('h2', null, 'Appearance'),
        h('div', { className: 'ps-row cn-glass' },
          h('span', null, h('b', null, 'Theme'), h('small', null, help)),
          h('div', { className: 'ps-choice', role: 'radiogroup', 'aria-label': 'Theme' },
            ['System', 'Light', 'Dark'].map((p) => h('button', { key: p, type: 'button', role: 'radio', 'aria-checked': pref === p, className: pref === p ? 'on' : '', onClick: () => choose(p) }, p))))),
      app.isAdmin ? h('section', { className: 'ps-section' }, h('h2', null, 'Administration'),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => app.go('admin') },
          h('span', null, h('b', null, 'Admin dashboard'), h('small', null, 'Applications, membership, moderation, insights and audit log')))) : null,
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
  }

  function Messages({ app, onBack }) {
    const threads = app.conversations || [];
    const [openId, setOpenId] = useState(null);
    const [note, setNote] = useState('');
    const open = threads.find((t) => t.id === openId) || null;
    if (open) {
      return h('div', { className: 'ps-conversation cn-glass' },
        h('div', { className: 'ps-convo-head' },
          h('button', { type: 'button', className: 'cn-text', onClick: () => setOpenId(null) }, 'Back to conversations'),
          h('span', null, h('b', null, open.participantName || 'Conversation'), h('small', null, open.lastTime || ''))),
        h('div', { className: 'ps-bubbles' },
          (open.messages || []).length ? open.messages.map((m) => h('div', { key: m.id, className: 'ps-bubble ' + (m.from === 'me' ? 'mine' : 'theirs') }, h('p', null, m.text || ''), m.time ? h('small', null, m.time) : null))
            : h('p', { className: 'ps-opening' }, 'A conversation can begin with a simple hello.')),
        h('form', { className: 'ps-compose', onSubmit: (e) => { e.preventDefault(); if (!note.trim()) return; if (app.sendMessage) app.sendMessage(open.id, note.trim()); setNote(''); } },
          h('input', { 'aria-label': 'Write a message', placeholder: 'Write a little note…', value: note, onChange: (e) => setNote(e.target.value) }),
          h('button', { type: 'submit', className: 'ps-send', 'aria-label': 'Send' }, 'Send')));
    }
    return h('div', { className: 'ps-messages' },
      threads.length ? h('div', { className: 'ps-list cn-glass' }, threads.map((t) => h('button', {
        key: t.id, type: 'button', className: 'ps-thread' + (t.unread ? ' unread' : ''),
        onClick: () => { setOpenId(t.id); if (app.openConversation) app.openConversation(t.id); },
      },
      h('span', { className: 'ps-avatar' }, t.participantPhoto ? h('img', { src: t.participantPhoto, alt: '' }) : h('span', { className: 'ps-initials' }, initials(t.participantName))),
      h('span', { className: 'ps-thread-copy' }, h('b', null, t.participantName || 'Conversation'), h('small', null, t.lastMessage || '')),
      h('span', { className: 'ps-thread-meta' }, t.lastTime ? h('small', null, t.lastTime) : null, t.unread ? h('i') : null))))
        : h('p', { className: 'ps-opening' }, 'A conversation can begin with a simple hello.'),
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
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

  function Space({ start, app, onBack }) {
    const [seg, setSeg] = useState(start || 'Messages');
    useEffect(() => { setSeg(start || 'Messages'); }, [start]);
    return h('div', { className: 'cn-page personal-space', 'data-screen': seg === 'Settings' ? 'settings' : 'profile' },
      h('div', { className: 'ps-head' },
        h('div', null, h('small', null, 'Your corner of Connect'), h('h1', null, 'Your space')),
        h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me')),
      h('div', { className: 'ps-seg cn-glass', role: 'tablist', 'aria-label': 'Your space' },
        ['Messages', 'Friends', 'Settings'].map((s) => h('button', { key: s, type: 'button', className: seg === s ? 'on' : '', onClick: () => setSeg(s) }, s))),
      seg === 'Friends' ? h(Friends, { app, onBack }) : seg === 'Settings' ? h(Settings, { app, onBack }) : h(Messages, { app, onBack }));
  }

  function ContributorSide({ app, listing }) {
    const [edit, setEdit] = useState(true);
    const [about, setAbout] = useState((listing && (listing.bio || listing.about)) || '');
    const [name, setName] = useState(listing ? listing.name : '');
    const events = app.ownEvents || [];
    const gallery = (listing && listing.gallery) || [];
    return h('div', { className: 'me-c', style: listing && listing.category ? { '--category': (window.ConnectChrome && window.ConnectChrome.groupHex && window.ConnectChrome.groupHex(listing.category)) || '#7040b5' } : null },
      h('div', { className: 'mc-bar' },
        h('small', null, edit ? 'Editing what people see on Connect' : 'Exactly as Citizens see it'),
        h('div', { className: 'mc-toggle cn-glass' },
          h('button', { type: 'button', className: edit ? 'on' : '', onClick: () => setEdit(true) }, 'Edit'),
          h('button', { type: 'button', className: edit ? '' : 'on', onClick: () => setEdit(false) }, 'Preview'))),
      listing && listing.verified ? h('span', { className: 'cs-status' }, 'Verified contributor') : null,
      h('div', { className: 'mc-columns' },
        h('div', { className: 'mc-left' },
          h('section', { className: 'mc-sec cn-glass' },
            h('label', { className: 'ev-f' }, 'Listing name', edit ? h('input', { value: name, onChange: (e) => setName(e.target.value) }) : h('p', null, name || 'Your listing')),
            h('label', { className: 'ev-f' }, 'About', edit ? h('textarea', { value: about, onChange: (e) => setAbout(e.target.value) }) : h('p', null, about))),
          h('section', { className: 'mc-sec cn-glass' },
            h('div', { className: 'mc-sec-head' }, h('h2', null, 'Gallery', h('small', null, 'Change logo'))),
            gallery.length ? h('div', { className: 'mc-gallery sm' }, gallery.map((src, n) => h('span', { key: n, className: 'mc-thumb' }, h('img', { src, alt: '' }))))
              : h('p', { className: 'mc-empty' }, 'Let’s add a few photos, so people can picture being there.')),
          h('section', { className: 'mc-sec cn-glass' },
            h('h2', null, 'Your events'),
            events.length ? h('div', { className: 'mc-evlist' }, events.slice(0, 6).map((e) => h('div', { key: e.id, className: 'mc-ev' }, h('i'), h('span', null, h('b', null, e.title), h('small', null, [e.date, e.time].filter(Boolean).join(' · ')))))) : h('p', { className: 'mc-empty' }, '＋ New event'),
            edit ? h('p', { className: 'mc-empty' }, 'Drafts stay private until you schedule them.') : null))),
      h('div', { className: 'mc-dash cn-glass' },
        h('div', null,
          h('b', null, 'Calendar · places · team · submissions · insights · inbox · collaborations'),
          h('small', null, 'Open the listing home for the full tools.')),
        h('button', { type: 'button', className: 'cn-primary', onClick: () => app.go('dashboard') }, 'Open full dashboard →')));
  }

  function AdminSide({ app }) {
    const [edit, setEdit] = useState(false);
    const waiting = (app.applications || []).filter((a) => a.status === 'pending').length;
    const openReports = (app.reports || []).length;
    return h('div', { className: 'me-a' },
      h('div', { className: 'ma-hero cn-glass' },
        h('span', { className: 'ma-ring' }, h(Glyph, { name: 'shield' })),
        h('div', null,
          h('span', { className: 'cn-eyebrow' }, 'Connect · Admin'),
          h('h1', null, 'A calm look at the platform.'),
          h('p', null, edit ? 'Editing what Citizens and contributors see from the team' : 'Exactly as Citizens see it'))),
      h('div', { className: 'mc-toggle cn-glass' },
        h('button', { type: 'button', className: edit ? 'on' : '', onClick: () => setEdit(true) }, 'Edit'),
        h('button', { type: 'button', className: edit ? '' : 'on', onClick: () => setEdit(false) }, 'Preview')),
      h('section', { className: 'mc-sec cn-glass' },
        h('h2', null, 'How you appear as an admin'),
        h('div', { className: 'ma-me' },
          h('span', { className: 'ma-mark' }, initials((app.user && app.user.name) || 'Admin')),
          h('span', null, h('b', null, 'Signature'), h('small', null, 'Signs replies, notices and moderation notes')))),
      h('section', { className: 'mc-sec cn-glass' },
        h('button', { type: 'button', className: 'ma-row', onClick: () => app.go('admin') },
          h('span', null, h('b', null, 'Waiting for a person'), h('small', null, 'Review →')),
          h('span', null, String(waiting))),
        h('button', { type: 'button', className: 'ma-row', onClick: () => app.go('admin') },
          h('span', null, h('b', null, 'Open reports')),
          h('span', null, String(openReports)))),
      h('section', { className: 'mc-sec cn-glass' },
        h('h2', null, 'Platform notice'),
        h('p', null, 'No notice is showing.'),
        h('small', null, 'Show a notice on Central and Connect'),
        h('small', { className: 'ma-sub' }, 'One calm line, never urgent · From the Citizens team')),
      h('section', { className: 'mc-sec cn-glass' },
        h('h2', null, 'Featured on Central'),
        h('p', null, 'Pick up to three listings for this week.')),
      h('section', { className: 'mc-sec cn-glass' },
        h('h2', null, 'Platform pulse'),
        h('p', null, 'Citizens active each day'),
        h('h2', null, 'Membership this week'),
        h('h2', null, 'Messages to the Citizens team'),
        h('h2', null, 'Team calendar')),
      h('button', { type: 'button', className: 'cn-primary', onClick: () => app.go('admin') }, 'Open admin dashboard →'));
  }

  function Page({ space }) {
    const app = window.useApp();
    const listing = (app.myContributor && app.myContributor.id && app.myContributor.name) ? app.myContributor
      : (app.contributors || []).find((c) => c.id && app.user && (c.id === app.user.id || c.slug === app.user.slug)) || null;
    const sides = [['me', 'Me']];
    if (listing) sides.push(['contributor', listing.name]);
    if (app.isAdmin) sides.push(['admin', 'Admin']);
    const [side, setSide] = useState('me');
    const [panel, setPanel] = useState(space || '');
    const [edit, setEdit] = useState(false);
    const [status, setStatus] = useState(() => { try { return sessionStorage.getItem('cc_me_status') || ''; } catch (e) { return ''; } });
    const [statusOpen, setStatusOpen] = useState(false);
    const [vibe, setVibe] = useState(() => { try { return sessionStorage.getItem('cc_me_vibe') || ''; } catch (e) { return ''; } });
    const [draft, setDraft] = useState(null);
    useEffect(() => { try { sessionStorage.setItem('cc_me_vibe', vibe); } catch (e) { /* private mode */ } }, [vibe]);
    useEffect(() => { try { sessionStorage.setItem('cc_me_status', status); } catch (e) { /* private mode */ } }, [status]);
    const shown = Object.assign({}, app.user || {}, draft || {});
    const mine = []
      .concat(app.ownEvents || [])
      .concat((app.events || []).filter((e) => app.connected && app.connected.has && app.connected.has(e.id)));
    if (panel === 'Calendar') {
      return h('div', { className: 'connect-scroll', 'data-screen': 'profile' },
        h(CalendarPanel, { events: mine, onClose: () => setPanel(''), onExplore: () => app.go('explore') }));
    }
    if (panel) {
      return h('div', { className: 'connect-scroll', 'data-screen': panel === 'Settings' ? 'settings' : 'profile' },
        h(Space, { start: panel, app, onBack: () => setPanel('') }));
    }
    return h('div', { className: 'connect-scroll', 'data-screen': 'profile' },
      h('div', { className: 'cn-page me-page' + (side === 'admin' ? ' me-a' : side === 'contributor' ? ' me-c' : '') },
        h(RoleSwitch, { sides, side, onSide: setSide }),
        side === 'admin' ? h(AdminSide, { app })
          : side === 'contributor' ? h(ContributorSide, { app, listing })
          : h(Personal, {
            app, listing, shown, onSpace: setPanel, onEdit: () => setEdit(true), onStatus: () => setStatusOpen(true),
            onExplore: () => app.go('explore'), onContrib: () => setSide('contributor'), vibe, setVibe, status,
          }),
        edit ? h(Editor, {
          app, shown, onClose: () => setEdit(false),
          onSave: (fields) => {
            setDraft(fields);
            if (app.saveProfile) app.saveProfile({ name: fields.name, bio: fields.bio });
            if (fields.seenBy === 'Everyone' && app.setDiscoverable) app.setDiscoverable(true);
            setEdit(false);
          },
        }) : null,
        statusOpen ? h(StatusPanel, { status, setStatus, onClose: () => setStatusOpen(false) }) : null));
  }

  window.ConnectMe = { Page };
})();
