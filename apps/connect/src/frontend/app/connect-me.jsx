// Me hub, Messages, Friends, and Settings (pack 03). Role comes from the signed-in session.
// Vibe and daily status stay on this device. Theme writes citizens-theme.
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

  function Switch({ on, onClick, label }) {
    return h('button', { type: 'button', className: 'ps-switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on, 'aria-label': label, onClick }, h('i'));
  }

  function RoleSwitch({ sides, side, onSide }) {
    if (sides.length < 2) return null;
    const note = side === 'admin' ? 'Looking after Connect · Admin'
      : side === 'contributor' ? 'Editing ' + (sides.find((s) => s[0] === 'contributor') || ['', 'your listing'])[1] + ' · what people see on Connect'
      : 'Your personal Me · friends, messages and settings';
    return h('div', { className: 'me-role' },
      h('div', { className: 'me-role-seg cn-glass', role: 'tablist', 'aria-label': 'What you are looking after' },
        sides.map((s) => h('button', {
          key: s[0], type: 'button', role: 'tab', 'aria-selected': side === s[0],
          className: 'me-role-' + s[0] + (side === s[0] ? ' on' : ''),
          onClick: () => onSide(s[0]),
        }, s[0] === 'contributor' ? h('span', { className: 'me-role-mark' }, initials(s[1])) : null, s[0] === 'me' ? 'Me' : s[0] === 'admin' ? 'Admin' : s[1]))),
      h('p', { className: 'me-role-note' }, note));
  }

  function Personal({ app, listing, onSpace, onEdit, onStatus, onExplore, vibe, setVibe, status }) {
    const user = app.user || {};
    const name = user.name || 'Citizen';
    const area = user.homeArea || user.location || '';
    const unread = app.unreadMsgs || 0;
    return h('div', { className: 'me-personal' },
      h('div', { className: 'cn-cover' },
        user.coverPhoto ? h('img', { src: user.coverPhoto, alt: '' }) : null,
        h('div', { className: 'cover-shade' }),
        h('span', { className: 'cn-eyebrow' }, 'Your corner of Connect'),
        h('button', { type: 'button', className: 'mc-chip', onClick: onEdit }, 'Change cover')),
      h('div', { className: 'me-identity' },
        h('button', { type: 'button', className: 'me-avatar' + (user.profilePhoto ? ' has-photo' : ''), 'aria-label': 'Change your profile photo', onClick: onEdit },
          user.profilePhoto ? h('img', { src: user.profilePhoto, alt: '' }) : h('span', null, initials(name))),
        h('div', null,
          h('small', null, (area ? area + ' · ' : '') + 'seen by friends'),
          h('h1', null, name)),
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Edit your personal profile', onClick: onEdit }, '✎')),
      user.bio ? h('p', { className: 'me-bio' }, user.bio) : null,
      h('div', { className: 'me-space-links', 'aria-label': 'Messages, friends and settings' },
        [['Messages', unread ? unread + ' waiting' : 'Conversations'], ['Friends', 'People you walk with'], ['Settings', 'Make it yours']].map((c) =>
          h('button', { key: c[0], type: 'button', className: 'cn-glass', onClick: () => onSpace(c[0]) },
            h('b', null, c[0]), h('small', null, c[1]), c[0] === 'Messages' && unread ? h('span', { className: 'count-dot' }, String(unread)) : null))),
      listing
        ? h('button', { type: 'button', className: 'me-contrib cn-glass', onClick: () => {} },
          h('span', { className: 'me-role-mark' }, initials(listing.name)),
          h('span', null, h('b', null, listing.name + ' · your listing'), h('small', null, 'Edit what people see, from the switch above')))
        : h('div', { className: 'me-contrib' },
          h('button', { type: 'button', className: 'cn-glass', onClick: () => app.go('apply') },
            h('b', null, 'Become a Contributor'), h('small', null, 'Put your church, ministry or business on the map')),
          h('button', { type: 'button', className: 'me-contrib-link cn-text', onClick: () => app.go('dashboard') }, 'Already approved? Open your listing home →')),
      h('button', { type: 'button', className: 'status-entry cn-glass', onClick: onStatus },
        h('span', null, '＋'), h('span', null, status || 'Share a little of your day')),
      h('section', null,
        h('div', { className: 'cn-row' }, h('h2', null, 'Your photos'), h('button', { type: 'button', className: 'cn-text', onClick: onEdit }, 'Edit')),
        h('div', { className: 'mc-gallery sm' },
          h('button', { type: 'button', className: 'mc-add', 'aria-label': 'Add a photo', onClick: onEdit }, '＋'))),
      h('section', null,
        h('h2', null, 'Notifications'),
        h('p', { className: 'notice' }, 'You’re all caught up.')),
      h('section', { className: 'vibe-box cn-glass' },
        h('h2', null, 'Vibe Check'),
        h('p', null, 'How are you arriving today?'),
        h('div', { className: 'cn-actions' }, ['Grateful', 'Quiet', 'Hopeful'].map((v) =>
          h('button', { key: v, type: 'button', className: vibe === v ? 'on' : '', onClick: () => setVibe(v) }, v)))),
      h('section', { className: 'for-you' },
        h('h2', null, 'For you'),
        h('button', { type: 'button', className: 'cn-text', onClick: onExplore }, 'Explore Connect ↗')),
      h('section', { className: 'me-calendar cn-glass' },
        h('h2', null, 'Your calendar'),
        h('p', null, 'Your agenda · SAST'),
        h('div', { className: 'agenda-month current' }, h('span', null, new Date().toLocaleString('en-GB', { month: 'long', timeZone: 'Africa/Johannesburg' })))));
  }

  function Editor({ app, onClose }) {
    const user = app.user || {};
    const [name, setName] = useState(user.name || '');
    const [about, setAbout] = useState(user.bio || '');
    const [home, setHome] = useState(user.homeArea || '');
    const [seen, setSeen] = useState('Friends');
    return h('div', { className: 'cn-overlay personal-edit', role: 'dialog', 'aria-label': 'Personal profile editing' },
      h('div', { className: 'cn-modal cn-glass' },
        h('div', { className: 'cn-row' }, h('h2', null, 'Your profile'), h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Close', onClick: onClose }, '×')),
        h('p', { className: 'pe-lede' }, 'The personal you: what friends see when they open your profile. Your listing and admin sides are edited from the switch at the top of Me.'),
        h('label', null, 'Display name', h('input', { value: name, onChange: (e) => setName(e.target.value) })),
        h('label', null, 'About you', h('textarea', { maxLength: 160, value: about, onChange: (e) => setAbout(e.target.value) }), h('small', null, about.length + '/160')),
        h('label', null, 'Home area', h('input', { value: home, onChange: (e) => setHome(e.target.value) })),
        h('label', null, 'Website', h('input', { placeholder: 'Your site, if you have one' })),
        h('div', { className: 'pe-seg', 'aria-label': 'Who sees your profile' },
          ['Friends', 'Everyone'].map((s) => h('button', { key: s, type: 'button', className: seen === s ? 'on' : '', onClick: () => setSeen(s) }, s === 'Friends' ? 'Only people you walk with' : 'Anyone on Connect'))),
        h('button', { type: 'button', className: 'cn-primary cs-plate', onClick: onClose }, 'Save')));
  }

  function StatusPanel({ status, setStatus, onClose }) {
    return h('div', { className: 'cn-overlay', role: 'dialog', 'aria-label': 'Status' },
      h('div', { className: 'cn-modal cn-glass' },
        h('h2', null, 'Status'),
        h('p', null, 'A little window into your day.'),
        h('textarea', { placeholder: 'What would you like to share?', value: status, onChange: (e) => setStatus(e.target.value) }),
        h('button', { type: 'button', className: 'cn-primary', onClick: onClose }, 'Save')));
  }

  function Settings({ app, onBack }) {
    const [pref, setPref] = useState(themeNow());
    const [toggles, setToggles] = useState({ talk: true, friends: true, near: false, week: true, map: false, attend: true });
    const [detail, setDetail] = useState('');
    const [visibility, setVisibility] = useState('Friends and communities');
    const [who, setWho] = useState('Friends only');
    useEffect(() => {
      const sync = () => setPref(themeNow());
      window.addEventListener('cc-map-theme', sync);
      return () => window.removeEventListener('cc-map-theme', sync);
    }, []);
    const choose = (p) => {
      if (window.MapV2 && window.MapV2.setThemePref) window.MapV2.setThemePref(p);
      setPref(p);
    };
    const flip = (k) => setToggles((t) => Object.assign({}, t, { [k]: !t[k] }));
    const help = pref === 'Dark' ? 'Always dark on this device' : pref === 'Light' ? 'Always light on this device' : 'Follows your device · ' + (resolved() === 'dark' ? 'Dark' : 'Light');
    if (detail) {
      const options = detail === 'Who can message me' ? ['Friends only', 'No one for now', 'Everyone in Connect'] : ['Everyone in Connect', 'Friends and communities', 'Only me'];
      const cur = detail === 'Who can message me' ? who : visibility;
      return h('div', { className: 'ps-detail' },
        h('button', { type: 'button', className: 'cn-text', onClick: () => setDetail('') }, '← Settings'),
        h('h2', null, detail),
        options.map((o) => h('button', { key: o, type: 'button', className: 'ps-option' + (cur === o ? ' on' : ''), onClick: () => { if (detail === 'Who can message me') setWho(o); else setVisibility(o); } }, h('b', null, o), h('span', { className: 'ps-radio' }))));
    }
    const row = (title, sub, key) => h('div', { className: 'ps-row cn-glass' }, h('span', null, h('b', null, title), sub ? h('small', null, sub) : null), key ? h(Switch, { on: !!toggles[key], label: title, onClick: () => flip(key) }) : null);
    return h('div', { className: 'ps-settings' },
      h('section', null, h('h2', null, 'Account'), row('Cover and profile photo', 'Change it from the profile editor on Me.')),
      h('section', null, h('h2', null, 'Notifications'),
        row('When a conversation is waiting', '', 'talk'),
        row('Friend requests', 'When someone would like to walk with you', 'friends'),
        row('Events near you', 'A gentle note, never a flood', 'near'),
        row('Weekly guide', 'One summary each Monday', 'week')),
      h('section', null, h('h2', null, 'Privacy'),
        row('Show me on the map', 'Off keeps your location to yourself', 'map'),
        row('Friends see what I’m attending', 'Only people you walk with', 'attend'),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => setDetail('Who sees your profile') }, h('b', null, visibility)),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => setDetail('Who can message me') }, h('span', null, h('b', null, 'Who can message me'), h('small', null, who)))),
      h('section', null, h('h2', null, 'Saved places')),
      h('section', { className: 'ps-appearance' }, h('h2', null, 'Appearance'),
        h('div', { className: 'ps-row cn-glass' },
          h('span', null, h('b', null, 'Theme'), h('small', null, help)),
          h('div', { className: 'ps-choice', role: 'radiogroup', 'aria-label': 'Theme' },
            ['System', 'Light', 'Dark'].map((p) => h('button', { key: p, type: 'button', role: 'radio', 'aria-checked': pref === p, className: pref === p ? 'on' : '', onClick: () => choose(p) }, p))))),
      app.isAdmin ? h('section', null, h('h2', null, 'Administration'),
        h('button', { type: 'button', className: 'ps-row cn-glass', onClick: () => app.go('admin') },
          h('span', null, h('b', null, 'Admin dashboard'), h('small', null, 'Applications, membership, moderation, insights and audit log')))) : null,
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
  }

  function Messages({ app, onBack }) {
    const [threads, setThreads] = useState([]);
    const [open, setOpen] = useState(null);
    const [note, setNote] = useState('');
    useEffect(() => {
      let gone = false;
      fetch('/api/conversations', { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : { data: [] }).then((j) => {
        if (!gone) setThreads((j && (j.data || j.conversations)) || []);
      }).catch(() => { if (!gone) setThreads([]); });
      return () => { gone = true; };
    }, []);
    if (open) {
      return h('div', { className: 'ps-thread' },
        h('button', { type: 'button', className: 'cn-text', onClick: () => setOpen(null) }, 'Back to conversations'),
        h('h2', null, open.title || 'Conversation'),
        h('div', { className: 'ps-bubbles' }, (open.messages || []).map((m, n) => h('div', { key: n, className: m.mine ? 'mine' : 'theirs' }, m.body || m.text || ''))),
        h('form', { onSubmit: (e) => { e.preventDefault(); if (!note.trim() || !open.id) return; fetch('/api/conversations/' + open.id + '/messages', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: note }) }).catch(() => {}); setNote(''); } },
          h('input', { 'aria-label': 'Write a message', placeholder: 'Write a little note…', value: note, onChange: (e) => setNote(e.target.value) }),
          h('button', { type: 'submit', className: 'cn-primary' }, 'Send')));
    }
    return h('div', { className: 'ps-messages' },
      h('p', null, 'A conversation can begin with a simple hello.'),
      threads.length ? threads.map((t) => h('button', { key: t.id, type: 'button', className: 'ps-row cn-glass', onClick: () => setOpen(t) }, h('b', null, t.title || t.name || 'Conversation'), h('small', null, t.last || ''))) : h('p', null, 'You’re all caught up.'),
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
  }

  function Friends({ onBack }) {
    return h('div', { className: 'ps-friends' },
      h('h2', null, 'Nearby to follow'),
      h('h2', null, 'Now walking with you'),
      h('h2', null, 'Saved for later'),
      h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me'));
  }

  function Space({ start, app, onBack }) {
    const [seg, setSeg] = useState(start || 'Messages');
    return h('div', { className: 'cn-page personal-space', 'data-screen': seg === 'Settings' ? 'settings' : 'profile' },
      h('div', { className: 'cn-row' },
        h('div', null, h('span', { className: 'cn-eyebrow' }, 'Your corner of Connect'), h('h1', null, 'Your space')),
        h('button', { type: 'button', className: 'cn-text', onClick: onBack }, 'Back to Me')),
      h('div', { className: 'ps-seg', role: 'tablist' },
        ['Messages', 'Friends', 'Settings'].map((s) => h('button', { key: s, type: 'button', className: seg === s ? 'on' : '', onClick: () => setSeg(s) }, s))),
      seg === 'Friends' ? h(Friends, { onBack }) : seg === 'Settings' ? h(Settings, { app, onBack }) : h(Messages, { app, onBack }));
  }

  function ContributorSide({ app, listing }) {
    const [edit, setEdit] = useState(true);
    const [about, setAbout] = useState((listing && listing.bio) || '');
    return h('div', { className: 'me-page me-c' },
      h('div', { className: 'cn-row' },
        h('p', null, edit ? 'Editing what people see on Connect' : 'Exactly as Citizens see it'),
        h('button', { type: 'button', className: 'cn-text', onClick: () => setEdit((v) => !v) }, edit ? 'Preview' : 'Edit')),
      listing && listing.verified ? h('span', { className: 'verified' }, 'Verified contributor') : null,
      h('label', null, 'Listing name', h('input', { value: listing ? listing.name : '', readOnly: !edit })),
      h('label', null, 'About', edit ? h('textarea', { value: about, onChange: (e) => setAbout(e.target.value) }) : h('p', null, about)),
      h('p', null, 'Calendar · places · team · submissions · insights · inbox · collaborations'),
      h('button', { type: 'button', className: 'cn-primary', onClick: () => app.go('dashboard') }, 'Open full dashboard →'));
  }

  function AdminSide({ app }) {
    const [edit, setEdit] = useState(false);
    return h('div', { className: 'me-page me-a' },
      h('span', { className: 'cn-eyebrow' }, 'Connect · Admin'),
      h('h1', null, 'A calm look at the platform.'),
      h('div', { className: 'cn-row' },
        h('p', null, edit ? 'Editing what Citizens and contributors see from the team' : 'Exactly as Citizens see it'),
        h('button', { type: 'button', className: 'cn-text', onClick: () => setEdit((v) => !v) }, edit ? 'Preview' : 'Edit')),
      h('section', null, h('h2', null, 'How you appear as an admin'), h('p', null, 'Signs replies, notices and moderation notes')),
      h('section', null, h('h2', null, 'Waiting for a person'), h('button', { type: 'button', className: 'cn-text', onClick: () => app.go('admin') }, 'Review →')),
      h('button', { type: 'button', className: 'cn-text', onClick: () => app.go('admin') }, 'Open reports'),
      h('section', null, h('h2', null, 'Platform notice'), h('p', null, 'No notice is showing.'), h('small', null, 'One calm line, never urgent')),
      h('section', null, h('h2', null, 'Platform pulse'), h('p', null, 'Citizens active each day')),
      h('button', { type: 'button', className: 'cn-primary', onClick: () => app.go('admin') }, 'Open admin dashboard →'));
  }

  function Page({ space }) {
    const app = window.useApp();
    const listing = (app.contributors || []).find((c) => c.id && (app.user && (c.id === app.user.id || c.slug === app.user.slug))) || (app.isContributor ? (app.contributors || [])[0] : null);
    const sides = [['me', 'Me']];
    if (listing) sides.push(['contributor', listing.name]);
    if (app.isAdmin) sides.push(['admin', 'Admin']);
    const [side, setSide] = useState('me');
    const [panel, setPanel] = useState(space || '');
    const [edit, setEdit] = useState(false);
    const [status, setStatus] = useState('');
    const [statusOpen, setStatusOpen] = useState(false);
    const [vibe, setVibe] = useState('');
    if (panel) return h(Space, { start: panel, app, onBack: () => setPanel('') });
    return h('div', { className: 'connect-scroll', 'data-screen': 'profile' },
      h('div', { className: 'cn-page me-page' },
        h(RoleSwitch, { sides, side, onSide: setSide }),
        side === 'admin' ? h(AdminSide, { app })
          : side === 'contributor' ? h(ContributorSide, { app, listing })
          : h(Personal, { app, listing, onSpace: setPanel, onEdit: () => setEdit(true), onStatus: () => setStatusOpen(true), onExplore: () => app.go('explore'), vibe, setVibe, status }),
        edit ? h(Editor, { app, onClose: () => setEdit(false) }) : null,
        statusOpen ? h(StatusPanel, { status, setStatus, onClose: () => setStatusOpen(false) }) : null));
  }

  window.ConnectMe = { Page };
})();
