// ── Settings: edit profile + sign out ──────────────────────────────
// PATCH /api/me (bio / visibility / displayNameOverride) + CW_AUTH.signOut.
(function () {
  const { createElement: h, useState } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, ScreenHeader } = window.CWUI;

  const field = {
    width: '100%', border: '1px solid #efedea', borderRadius: 14, padding: '12px 14px',
    fontSize: 13.5, fontWeight: 500, outline: 'none', background: '#fff', color: '#1a1a1a',
  };
  const label = { fontSize: 12, fontWeight: 700, color: '#4a4a4a', margin: '16px 0 6px' };
  const card = { background: '#fff', border: '1px solid #f0eee9', borderRadius: 18, padding: '18px 20px', marginTop: 16 };

  function SettingsScreen() {
    const { me, pop, refreshMe, signOut } = useStore();
    const [bio, setBio] = useState((me && me.profile && me.profile.bio) || '');
    const [displayName, setDisplayName] = useState((me && me.settings && me.settings.displayNameOverride) || '');
    const [visibility, setVisibility] = useState((me && me.profile && me.profile.visibility) || 'public');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    const save = async () => {
      setBusy(true);
      setNote(null);
      try {
        await window.CW_API.patch('/api/me', {
          bio,
          visibility,
          displayNameOverride: displayName,
        });
        await refreshMe();
        setNote({ ok: true, text: 'Saved.' });
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Could not save.' });
      } finally {
        setBusy(false);
      }
    };

    return h(
      'div',
      { className: 'cwsc fade-in', style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' } },
      h(ScreenHeader, { title: 'Settings', onBack: pop }),
      h('div', { style: { padding: '4px 18px 0' } },
        h('div', { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Profile'),
          h('div', { style: label }, 'Display name (leave blank to use your Google name)'),
          h('input', { value: displayName, onChange: (e) => setDisplayName(e.target.value), maxLength: 80, placeholder: (me && me.user && me.user.displayName) || '', style: field }),
          h('div', { style: label }, 'Bio'),
          h('textarea', { value: bio, onChange: (e) => setBio(e.target.value), rows: 4, maxLength: 500, placeholder: 'Living for His glory…', style: { ...field, resize: 'vertical', lineHeight: 1.5 } }),
          h('div', { style: label }, 'Profile visibility'),
          h('div', { style: { display: 'flex', gap: 10 } },
            ['public', 'private'].map((v) =>
              h('button', {
                key: v,
                onClick: () => setVisibility(v),
                style: {
                  flex: 1, border: '1.5px solid ' + (visibility === v ? '#1a1a1a' : '#e6e3dc'),
                  background: visibility === v ? '#1a1a1a' : '#fff', color: visibility === v ? '#fff' : '#5a5a5a',
                  borderRadius: 12, padding: 13, fontSize: 13.5, fontWeight: 700, textTransform: 'capitalize',
                },
              }, v)),
          ),
          note
            ? h('div', { style: { marginTop: 14, fontSize: 12.5, fontWeight: 600, color: note.ok ? '#3f6f34' : '#8f4a2b' } }, note.text)
            : null,
          h('div', { style: { marginTop: 18 } },
            h(GoldButton, { label: busy ? 'Saving…' : 'Save Changes', onClick: save, disabled: busy }),
          ),
        ),
        h('div', { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800, marginBottom: 12 } }, 'Account'),
          h('div', { style: { fontSize: 12.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55 } },
            'One Kingdom identity: your Google sign-in is shared across Citizens Connect, Vision, and Wear.'),
          h('button', {
            onClick: signOut,
            style: {
              width: '100%', marginTop: 16, border: '1.5px solid #e6e3dc', background: '#fff', color: '#8f4a2b',
              borderRadius: 13, padding: 13, fontSize: 13.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            },
          }, Icon('logout', { size: 17, color: '#8f4a2b' }), 'Sign out'),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Settings = SettingsScreen;
})();
