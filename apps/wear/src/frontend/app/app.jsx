// ── App root: auth gate + mount ────────────────────────────────────
(function () {
  const { createElement: h } = React;
  const { Provider, useStore } = window.CWStore;
  const { Spinner } = window.CWUI;
  const { Crown } = window.CWIcons;

  function Gate() {
    const { authStatus, recovery } = useStore();
    // Password-recovery link landing: takes precedence over everything —
    // the recovery session signs the user in, but they came here to set a
    // new password, not to browse.
    if (recovery) return h(window.CWScreens.ResetPassword, {});
    if (authStatus === 'loading') {
      return h(
        'div',
        {
          style: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            background: '#fbfaf8',
          },
        },
        h(Crown, { size: 56 }),
        h(Spinner, { size: 22 }),
      );
    }
    if (authStatus === 'signedIn') return h(window.CWShell.Shell, {});
    return h(window.CWScreens.Auth, {}); // signedOut | unconfigured
  }

  function App() {
    return h(Provider, null, h(Gate, {}));
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(h(App, {}));
})();
