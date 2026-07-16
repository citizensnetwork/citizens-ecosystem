// ── Settings: edit profile + Become a Brand + sign out ─────────────
// PATCH /api/me (bio / visibility / displayNameOverride) + CW_AUTH.signOut.
// Become-a-Brand panel (mig 162): GET /api/brand-applications, fetched
// lazily HERE (not on /api/me) so app boot stays lean.
(function () {
  const { createElement: h, useState, useEffect } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, ScreenHeader, timeAgo } = window.CWUI;

  const field = {
    width: '100%',
    border: '1px solid #efedea',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: 13.5,
    fontWeight: 500,
    outline: 'none',
    background: '#fff',
    color: '#1a1a1a',
  };
  const label = { fontSize: 12, fontWeight: 700, color: '#4a4a4a', margin: '16px 0 6px' };
  const card = {
    background: '#fff',
    border: '1px solid #f0eee9',
    borderRadius: 18,
    padding: '18px 20px',
    marginTop: 16,
  };

  /** One eligibility progress line: "Concepts posted · 14 / 20". */
  function GateRow({ met, text }) {
    return h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' } },
      h(
        'span',
        {
          style: {
            width: 18,
            height: 18,
            flex: 'none',
            borderRadius: '50%',
            background: met ? '#eef5e9' : '#faf8f3',
            border: '1px solid ' + (met ? '#cfe3c4' : '#eceae3'),
            color: met ? '#3f6f34' : '#b5b3ac',
            fontSize: 11,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        met ? '✓' : '·',
      ),
      h('span', { style: { fontSize: 12.5, fontWeight: 600, color: met ? '#3f6f34' : '#6a6862' } }, text),
    );
  }

  /**
   * The Become-a-Brand panel (§6.1): locked (progress) → unlocked (apply) →
   * pending (under review) → rejected (note + immediate re-apply). Hidden for
   * existing brand owners — they are already through this door.
   */
  function BecomeABrandCard() {
    const { me, openBrandApply, nav } = useStore();
    const [state, setState] = useState({ loading: true, error: null, data: null });

    const ownsBrand = !!(me && me.brands && me.brands.length);
    // Re-fetch when the screen regains focus (e.g. back from the form).
    const stackDepth = nav.stack.length;
    useEffect(() => {
      if (ownsBrand) return;
      let alive = true;
      setState((s) => ({ ...s, loading: true, error: null }));
      window.CW_API.get('/api/brand-applications')
        .then((data) => alive && setState({ loading: false, error: null, data }))
        .catch((e) => alive && setState({ loading: false, error: e.message, data: null }));
      return () => {
        alive = false;
      };
    }, [ownsBrand, stackDepth]);

    if (ownsBrand) return null;

    const body = (() => {
      if (state.loading) {
        return h('div', { style: { fontSize: 12.5, color: '#b5b3ac', fontWeight: 600, marginTop: 10 } }, 'Checking your progress…');
      }
      if (state.error || !state.data) {
        return h('div', { style: { fontSize: 12.5, color: '#8f4a2b', fontWeight: 600, marginTop: 10 } }, state.error || 'Could not load your progress.');
      }
      const { eligibility: e, application: a } = state.data;
      if (a && a.status === 'pending') {
        return h(
          'div',
          { style: { marginTop: 10 } },
          h('div', { style: { fontSize: 13, fontWeight: 800, color: '#7a6212' } }, '“' + a.brandName + '” is under review'),
          h(
            'div',
            { style: { fontSize: 12.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55, marginTop: 5 } },
            'Submitted ' + timeAgo(a.createdAt) + ' ago. The team will decide soon — the answer lands in your inbox.',
          ),
        );
      }
      const gates = h(
        'div',
        { style: { marginTop: 8 } },
        h(GateRow, { met: e.conceptsPosted >= e.conceptsPostedRequired, text: 'Concepts posted · ' + e.conceptsPosted + ' / ' + e.conceptsPostedRequired }),
        h(GateRow, { met: e.conceptsClaimed >= e.conceptsClaimedRequired, text: 'Your Concepts claimed by Brands · ' + e.conceptsClaimed + ' / ' + e.conceptsClaimedRequired }),
        h(GateRow, { met: e.actionedReports === 0, text: e.actionedReports === 0 ? 'Standing with the community · clear' : 'A sustained report currently holds this door closed' }),
      );
      const rejectedNote =
        a && a.status === 'rejected'
          ? h(
              'div',
              { style: { fontSize: 12.5, color: '#8f4a2b', fontWeight: 600, lineHeight: 1.55, marginTop: 10 } },
              'Your previous application was not approved' + (a.reviewNote ? ': “' + a.reviewNote + '”' : '.') + (e.eligible ? ' You may apply again right away.' : ''),
            )
          : null;
      if (e.eligible) {
        return h(
          'div',
          null,
          rejectedNote,
          gates,
          h(
            'div',
            { style: { marginTop: 14 } },
            h(GoldButton, { label: a && a.status === 'rejected' ? 'Apply again' : 'Apply now', onClick: openBrandApply }),
          ),
        );
      }
      return h(
        'div',
        null,
        rejectedNote,
        gates,
        h(
          'div',
          { style: { fontSize: 12, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55, marginTop: 10 } },
          'Brands are grown here, not bought: keep posting Concepts and serving the community — the door opens on track record.',
        ),
      );
    })();

    return h(
      'div',
      { style: card },
      h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Become a Brand'),
      h(
        'div',
        { style: { fontSize: 12.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55, marginTop: 6 } },
        'Verified Brands post to the Home feed, propose on Concepts, and produce for the Kingdom community.',
      ),
      body,
    );
  }

  function SettingsScreen() {
    const { me, pop, refreshMe, signOut, openAdmin, changePassword } = useStore();
    const [bio, setBio] = useState((me && me.profile && me.profile.bio) || '');
    const [displayName, setDisplayName] = useState(
      (me && me.settings && me.settings.displayNameOverride) || '',
    );
    const [visibility, setVisibility] = useState(
      (me && me.profile && me.profile.visibility) || 'public',
    );
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    // ── change/set password ──
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [pwBusy, setPwBusy] = useState(false);
    const [pwNote, setPwNote] = useState(null);

    const savePassword = async () => {
      setPwNote(null);
      if (pw.length < 8) {
        setPwNote({ ok: false, text: 'Password must be at least 8 characters.' });
        return;
      }
      if (pw !== pw2) {
        setPwNote({ ok: false, text: 'Passwords do not match.' });
        return;
      }
      setPwBusy(true);
      try {
        await changePassword(pw);
        setPw('');
        setPw2('');
        setPwNote({ ok: true, text: 'Password updated.' });
      } catch (e) {
        setPwNote({ ok: false, text: e.message || 'Could not update your password.' });
      } finally {
        setPwBusy(false);
      }
    };

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
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: 'Settings', onBack: pop }),
      h(
        'div',
        { style: { padding: '4px 18px 0' } },
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Profile'),
          h('div', { style: label }, 'Display name (leave blank to use your Google name)'),
          h('input', {
            value: displayName,
            onChange: (e) => setDisplayName(e.target.value),
            maxLength: 80,
            placeholder: (me && me.user && me.user.displayName) || '',
            style: field,
          }),
          h('div', { style: label }, 'Bio'),
          h('textarea', {
            value: bio,
            onChange: (e) => setBio(e.target.value),
            rows: 4,
            maxLength: 500,
            placeholder: 'Living for His glory…',
            style: { ...field, resize: 'vertical', lineHeight: 1.5 },
          }),
          h('div', { style: label }, 'Profile visibility'),
          h(
            'div',
            { style: { display: 'flex', gap: 10 } },
            ['public', 'private'].map((v) =>
              h(
                'button',
                {
                  key: v,
                  onClick: () => setVisibility(v),
                  style: {
                    flex: 1,
                    border: '1.5px solid ' + (visibility === v ? '#1a1a1a' : '#e6e3dc'),
                    background: visibility === v ? '#1a1a1a' : '#fff',
                    color: visibility === v ? '#fff' : '#5a5a5a',
                    borderRadius: 12,
                    padding: 13,
                    fontSize: 13.5,
                    fontWeight: 700,
                    textTransform: 'capitalize',
                  },
                },
                v,
              ),
            ),
          ),
          note
            ? h(
                'div',
                {
                  style: {
                    marginTop: 14,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: note.ok ? '#3f6f34' : '#8f4a2b',
                  },
                },
                note.text,
              )
            : null,
          h(
            'div',
            { style: { marginTop: 18 } },
            h(GoldButton, {
              label: busy ? 'Saving…' : 'Save Changes',
              onClick: save,
              disabled: busy,
            }),
          ),
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Password'),
          h(
            'div',
            {
              style: {
                fontSize: 12.5,
                color: '#8f8d87',
                fontWeight: 500,
                lineHeight: 1.55,
                marginTop: 6,
              },
            },
            'Set or change the password you use to sign in with email. If you joined with Google, adding a password lets you sign in either way.',
          ),
          h('div', { style: label }, 'New password'),
          h('input', {
            type: 'password',
            value: pw,
            onChange: (e) => setPw(e.target.value),
            autoComplete: 'new-password',
            placeholder: 'At least 8 characters',
            style: field,
          }),
          h('div', { style: label }, 'Confirm new password'),
          h('input', {
            type: 'password',
            value: pw2,
            onChange: (e) => setPw2(e.target.value),
            autoComplete: 'new-password',
            style: field,
          }),
          pwNote
            ? h(
                'div',
                {
                  style: {
                    marginTop: 12,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: pwNote.ok ? '#3f6f34' : '#8f4a2b',
                  },
                },
                pwNote.text,
              )
            : null,
          h(
            'div',
            { style: { marginTop: 16 } },
            h(GoldButton, {
              label: pwBusy ? 'Updating…' : 'Update password',
              onClick: savePassword,
              disabled: pwBusy,
            }),
          ),
        ),
        h(BecomeABrandCard, {}),
        me && me.role
          ? h(
              'div',
              { style: card },
              h(
                'div',
                { style: { fontSize: 14, fontWeight: 800, marginBottom: 6 } },
                'Admin & moderation',
              ),
              h(
                'div',
                { style: { fontSize: 12.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55 } },
                'You hold the ' + me.role + ' role. Review brand verifications and triage reports.',
              ),
              h(
                'button',
                {
                  onClick: openAdmin,
                  style: {
                    width: '100%',
                    marginTop: 14,
                    border: '1.5px solid ' + GOLD,
                    background: '#fff',
                    color: '#7a6212',
                    borderRadius: 13,
                    padding: 13,
                    fontSize: 13.5,
                    fontWeight: 700,
                  },
                },
                'Open the queues',
              ),
            )
          : null,
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800, marginBottom: 12 } }, 'Account'),
          h(
            'div',
            { style: { fontSize: 12.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.55 } },
            'One Kingdom identity: your Citizens account is shared across Citizens Connect, Vision, and Wear.',
          ),
          h(
            'button',
            {
              onClick: signOut,
              style: {
                width: '100%',
                marginTop: 16,
                border: '1.5px solid #e6e3dc',
                background: '#fff',
                color: '#8f4a2b',
                borderRadius: 13,
                padding: 13,
                fontSize: 13.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              },
            },
            Icon('logout', { size: 17, color: '#8f4a2b' }),
            'Sign out',
          ),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Settings = SettingsScreen;
})();
