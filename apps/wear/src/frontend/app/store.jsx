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

  function Provider({ children }) {
    // 'loading' | 'signedOut' | 'signedIn' | 'unconfigured'
    const [authStatus, setAuthStatus] = useState('loading');
    const [me, setMe] = useState(null); // {user, profile, settings, counts, brands}
    const [authError, setAuthError] = useState(null);

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
        if (event === 'SIGNED_IN') await completeSignIn();
        if (event === 'SIGNED_OUT') {
          setMe(null);
          setAuthStatus('signedOut');
          setNav({ tab: 'home', stack: [] });
        }
      });
      return () => {
        try { sub.data.subscription.unsubscribe(); } catch (e) { /* noop */ }
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

    const signOut = useCallback(async () => {
      await window.CW_AUTH.signOut();
    }, []);

    // ── navigation ──
    const setTab = useCallback((tab) => setNav({ tab, stack: [] }), []);
    const push = useCallback(
      (screen, params) => setNav((n) => ({ ...n, stack: [...n.stack, { screen, params: params || {} }] })),
      [],
    );
    const pop = useCallback(() => setNav((n) => ({ ...n, stack: n.stack.slice(0, -1) })), []);

    const value = {
      authStatus, me, authError,
      signIn, signOut, refreshMe,
      nav, setTab, push, pop,
      openPost: (id) => push('post', { id }),
      openBrand: (slug) => push('brand', { slug }),
      openUser: (handle) => push('user', { handle }),
      openSettings: () => push('settings', {}),
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
