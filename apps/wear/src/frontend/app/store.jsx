// ── Citizens Wear app store ────────────────────────────────────────
// Auth lifecycle + navigation + the signed-in user's own data (/api/me).
// Exposes window.CWStore = { Provider, useStore }.
//
// Auth flow (the Step-3 mirror-hydration contract):
//   boot → CW_AUTH.loadSession()
//     signed in  → POST /api/me/hydrate (upserts wear.users from the
//                  server-validated session) → GET /api/me → 'signedIn'
//     signed out → 'signedOut' (auth screen)
//   CW_AUTH.onAuthChange(SIGNED_IN/SIGNED_OUT) re-runs the same path.
(function () {
  const { createContext, useContext, useState, useEffect, useCallback, useRef } = React;

  const StoreContext = createContext(null);

  /**
   * Boot deep link: shared links carry `?concept=<id>` (or `?post=<id>`) —
   * consumed once after sign-in, pushed onto the nav stack, then scrubbed
   * from the URL so refreshes land normally.
   */
  function consumeDeepLink(setNav) {
    try {
      const q = new URLSearchParams(window.location.search);
      const conceptId = q.get('concept');
      const postId = q.get('post');
      if (!conceptId && !postId) return;
      const entry = conceptId
        ? { screen: 'concept', params: { id: conceptId } }
        : { screen: 'post', params: { id: postId } };
      setNav((n) => ({ ...n, stack: [...n.stack, entry] }));
      q.delete('concept');
      q.delete('post');
      const rest = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''));
    } catch (e) {
      /* deep links are best-effort */
    }
  }

  function Provider({ children }) {
    // 'loading' | 'signedOut' | 'signedIn' | 'unconfigured'
    const [authStatus, setAuthStatus] = useState('loading');
    const [me, setMe] = useState(null); // {user, profile, settings, counts, brands}
    const [authError, setAuthError] = useState(null);
    // True while the user arrived via a password-recovery email link —
    // the app renders the set-new-password screen regardless of authStatus
    // (a recovery link DOES sign the user in; this flag takes precedence).
    const [recovery, setRecovery] = useState(false);

    // Navigation: a simple stack. Each entry {screen, params}. The last
    // entry is what shell.jsx renders; tab switches reset the stack.
    const [nav, setNav] = useState({ tab: 'home', stack: [] });

    const bootedRef = useRef(false);

    const refreshMe = useCallback(async () => {
      const data = await window.CW_API.get('/api/me');
      setMe(data);
      return data;
    }, []);

    const completeSignIn = useCallback(async () => {
      try {
        await window.CW_API.post('/api/me/hydrate');
        await refreshMe();
        setAuthStatus('signedIn');
        setAuthError(null);
        consumeDeepLink(setNav);
      } catch (e) {
        console.error('[CWStore] sign-in hydration failed', e);
        setAuthError(e.message || 'Could not load your Wear profile.');
        setAuthStatus('signedOut');
      }
    }, [refreshMe]);

    useEffect(() => {
      if (bootedRef.current) return;
      bootedRef.current = true;

      if (!window.CW_AUTH) {
        setAuthStatus('unconfigured');
        return;
      }

      (async () => {
        try {
          const session = await window.CW_AUTH.loadSession();
          if (session) await completeSignIn();
          else setAuthStatus('signedOut');
        } catch (e) {
          console.error('[CWStore] session boot failed', e);
          setAuthStatus('signedOut');
        }
      })();

      const sub = window.CW_AUTH.onAuthChange(async (event) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
        if (event === 'SIGNED_IN') await completeSignIn();
        if (event === 'SIGNED_OUT') {
          setMe(null);
          setRecovery(false);
          setAuthStatus('signedOut');
          setNav({ tab: 'home', stack: [] });
        }
      });
      return () => {
        try {
          sub.data.subscription.unsubscribe();
        } catch (e) {
          /* noop */
        }
      };
    }, [completeSignIn]);

    const signIn = useCallback(async () => {
      setAuthError(null);
      try {
        await window.CW_AUTH.signInWithGoogle();
      } catch (e) {
        setAuthError(e.message || 'Google sign-in failed.');
      }
    }, []);

    // Password credential actions. Errors are thrown to the auth screens,
    // which render them inline next to the form they belong to.
    const signInPassword = useCallback(async (email, password) => {
      await window.CW_AUTH.signInWithPassword(email, password);
      // SIGNED_IN fires through onAuthChange → completeSignIn.
    }, []);

    const signUpPassword = useCallback(async (email, password) => {
      return window.CW_AUTH.signUpWithPassword(email, password);
    }, []);

    const requestPasswordReset = useCallback(async (email) => {
      await window.CW_AUTH.requestPasswordReset(email);
    }, []);

    const completePasswordReset = useCallback(async (newPassword) => {
      await window.CW_AUTH.updatePassword(newPassword);
      setRecovery(false); // recovery session is a real session → straight in
    }, []);

    // Change/set the signed-in user's password (settings) — also lets a
    // Google-only account add a password to unlock email+password sign-in.
    const changePassword = useCallback(async (newPassword) => {
      await window.CW_AUTH.updatePassword(newPassword);
    }, []);

    // Email magic-code (passwordless secondary sign-in). sendEmailCode mails a
    // 6-digit code; verifyEmailCode exchanges it for a session (SIGNED_IN then
    // flows through onAuthChange → completeSignIn, same as every other path).
    const sendEmailCode = useCallback(async (email) => {
      await window.CW_AUTH.sendEmailCode(email);
    }, []);

    const verifyEmailCode = useCallback(async (email, token) => {
      await window.CW_AUTH.verifyEmailCode(email, token);
    }, []);

    const signOut = useCallback(async () => {
      await window.CW_AUTH.signOut();
    }, []);

    // ── navigation ──
    const setTab = useCallback((tab) => setNav({ tab, stack: [] }), []);
    const push = useCallback(
      (screen, params) =>
        setNav((n) => ({ ...n, stack: [...n.stack, { screen, params: params || {} }] })),
      [],
    );
    const pop = useCallback(() => setNav((n) => ({ ...n, stack: n.stack.slice(0, -1) })), []);

    const value = {
      authStatus,
      me,
      authError,
      recovery,
      signIn,
      signInPassword,
      signUpPassword,
      requestPasswordReset,
      completePasswordReset,
      changePassword,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      refreshMe,
      nav,
      setTab,
      push,
      pop,
      openPost: (id) => push('post', { id }),
      openBrand: (slug) => push('brand', { slug }),
      openUser: (handle) => push('user', { handle }),
      openSettings: () => push('settings', {}),
      openConcepts: () => push('concepts', {}),
      openConcept: (id) => push('concept', { id }),
      openAdmin: () => push('admin', {}),
      openBrandApply: () => push('brandApply', {}),
    };

    return React.createElement(StoreContext.Provider, { value }, children);
  }

  function useStore() {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error('useStore outside CWStore.Provider');
    return ctx;
  }

  window.CWStore = { Provider, useStore };
})();
