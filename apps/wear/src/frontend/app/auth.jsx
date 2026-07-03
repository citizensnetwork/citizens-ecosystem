// ── Auth screen ────────────────────────────────────────────────────
// Crown + wordmark + Google sign-in, on the design's warm paper tones.
(function () {
  const { createElement: h } = React;
  const { Crown } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton } = window.CWUI;

  function AuthScreen() {
    const { signIn, authStatus, authError } = useStore();
    const unconfigured = authStatus === 'unconfigured';

    return h(
      'div',
      {
        className: 'fade-in',
        style: {
          minHeight: '100%', background: '#fbfaf8', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '40px 28px', gap: 0,
        },
      },
      h(Crown, { size: 74 }),
      h('div', { style: { marginTop: 22, textAlign: 'center', lineHeight: 1.2 } },
        h('div', { style: { fontSize: 19, letterSpacing: '0.42em', fontWeight: 700, color: '#1a1a1a' } }, 'CITIZENS'),
        h('div', { style: { fontSize: 13, letterSpacing: '0.34em', color: '#a09e97', marginTop: 4, fontWeight: 600 } }, 'WEAR'),
      ),
      h('div', {
        style: { marginTop: 18, fontSize: 13.5, color: '#4a4a4a', fontWeight: 500, textAlign: 'center', maxWidth: 300, lineHeight: 1.55 },
      }, 'Faith-rooted fashion and the brands behind it — one Kingdom identity across every Citizens app.'),
      h('div', { style: { width: '100%', maxWidth: 320, marginTop: 34 } },
        unconfigured
          ? h('div', {
              style: { fontSize: 12.5, color: '#8f4a2b', fontWeight: 600, textAlign: 'center', lineHeight: 1.6, background: '#fdf6ec', border: '1px solid #f2e3c8', borderRadius: 14, padding: 16 },
            }, 'Supabase is not configured. Copy config.example.js → config.js (local dev) or set the NEXT_PUBLIC_SUPABASE_* env vars (deploy).')
          : h(GoldButton, {
              label: 'Continue with Google',
              onClick: signIn,
              icon: h('svg', { width: 17, height: 17, viewBox: '0 0 24 24' },
                h('path', { fill: '#fff', d: 'M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a5.8 5.8 0 1 1 0-11.6c1.5 0 2.8.55 3.85 1.45l2.15-2.15A8.9 8.9 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.75-3.6 8.75-8.65 0-.35-.05-.7-.1-1.05Z' }),
              ),
            }),
        authError
          ? h('div', { style: { marginTop: 14, fontSize: 12, color: '#8f4a2b', fontWeight: 600, textAlign: 'center' } }, authError)
          : null,
      ),
      h('div', { style: { marginTop: 40, fontSize: 10.5, color: '#c2c0b9', fontWeight: 600, letterSpacing: '0.24em' } }, 'CONNECTING THE KINGDOM'),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Auth = AuthScreen;
})();
