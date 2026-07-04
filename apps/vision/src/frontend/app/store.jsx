// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — session bootstrap + API helper (window.CV_STORE)
//  ------------------------------------------------------------------
//  Auth session lifecycle over window.CV_AUTH (auth-client.js) with a
//  demo-mode fallback when Supabase isn't configured, and authFetch():
//  every API call carries `Authorization: Bearer <token>` — the API is
//  (potentially) cross-origin, so cookies never travel (server.ts
//  resolves the token in one place).
// ════════════════════════════════════════════════════════════════════
(() => {
  const env = window.__CV_ENV || {};
  const API_BASE = (env.API_BASE_URL || "").replace(/\/$/, "");

  async function authFetch(path, opts) {
    const options = Object.assign({ headers: {} }, opts || {});
    options.headers = Object.assign({}, options.headers);
    if (window.CV_AUTH) {
      const token = await window.CV_AUTH.getAccessToken();
      if (token) options.headers["Authorization"] = "Bearer " + token;
    }
    if (options.body && !options.headers["Content-Type"]) {
      options.headers["Content-Type"] = "application/json";
    }
    return fetch(API_BASE + path, options);
  }

  // useSession() — the root's auth state machine:
  //   loading → signedOut → signedIn (real or demo)
  function useSession() {
    const [state, setState] = React.useState({ status: "loading", session: null, demo: false });

    React.useEffect(() => {
      let cancelled = false;
      if (!window.CV_AUTH) {
        // No Supabase config: land on the login screen with demo entry.
        setState({ status: "signedOut", session: null, demo: false });
        return;
      }
      window.CV_AUTH.loadSession().then((session) => {
        if (cancelled) return;
        setState(session
          ? { status: "signedIn", session, demo: false }
          : { status: "signedOut", session: null, demo: false });
      }).catch(() => {
        if (!cancelled) setState({ status: "signedOut", session: null, demo: false });
      });
      const sub = window.CV_AUTH.onAuthChange((event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          window.CV_AUTH.loadSession().then((session) => {
            if (!cancelled && session) setState({ status: "signedIn", session, demo: false });
          });
        } else if (event === "SIGNED_OUT") {
          if (!cancelled) setState({ status: "signedOut", session: null, demo: false });
        }
      });
      return () => {
        cancelled = true;
        try { sub.data.subscription.unsubscribe(); } catch (e) { /* noop */ }
      };
    }, []);

    const enterDemo = React.useCallback(() => {
      setState({
        status: "signedIn", demo: true,
        session: { user: { id: "demo" }, name: "Demo Steward", avatarUrl: "" },
      });
    }, []);

    const signOut = React.useCallback(async () => {
      if (window.CV_AUTH) await window.CV_AUTH.signOut();
      setState({ status: "signedOut", session: null, demo: false });
    }, []);

    return { ...state, enterDemo, signOut };
  }

  window.CV_STORE = { authFetch, useSession, API_BASE };
})();
