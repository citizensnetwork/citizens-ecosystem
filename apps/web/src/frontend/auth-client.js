// ════════════════════════════════════════════════════════════════════
//  Citizens Wear — browser Supabase auth client
//  ------------------------------------------------------------------
//  Port of Connect's proven CC_AUTH (Phase-0 machinery, RESUME §3G).
//  Runs in the no-build app: needs the @supabase/supabase-js UMD global
//  (window.supabase) and window.__CW_ENV (config.js) loaded first, then
//  exposes window.CW_AUTH for app/store.jsx.
//
//  Google is the only provider — the SHARED Citizens Supabase project
//  (one auth.users across Connect → Vision → Wear, ADR-0007). Wear-side
//  identity (handle/displayName) lives in the wear.users mirror and is
//  hydrated via POST /api/me/hydrate after sign-in — this file never
//  reads app tables. If config/Supabase is missing, CW_AUTH is null and
//  the app shows a "not configured" notice on the auth screen.
// ════════════════════════════════════════════════════════════════════
(function () {
  var env = window.__CW_ENV || {};
  if (!window.supabase || !window.supabase.createClient || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY.indexOf("REPLACE_WITH") === 0) {
    console.warn("[CW_AUTH] Supabase not configured — copy config.example.js → config.js.");
    window.CW_AUTH = null;
    return;
  }

  var client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  window.CW_SUPABASE = client;

  var NATIVE_REDIRECT = "citizenswear://auth-callback";

  function isNativeShell() {
    return !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
  }

  // Sign in / sign up with Google (OAuth — same call for both).
  // Web: in-page redirect to Google and back to the app origin (supabase-js
  // detectSessionInUrl completes the PKCE exchange on return).
  // Native (Capacitor): the webview origin isn't a redirectable https URL, so
  // open the OAuth URL in the SYSTEM browser and return via the custom-scheme
  // deep link (listenForNativeAuthCallback) — Connect runbook Step 3 / §B1.
  async function signInWithGoogle() {
    var native = isNativeShell();
    var redirectTo;
    if (native) {
      redirectTo = NATIVE_REDIRECT;
    } else {
      var origin = env.FRONTEND_ORIGIN || window.location.origin;
      // A bare hostname has no scheme; Supabase would treat it as a relative
      // path on its own domain and the redirect would 404 (Connect lesson).
      if (origin && !/^https?:\/\//i.test(origin)) { origin = "https://" + origin; }
      redirectTo = origin + window.location.pathname;
    }
    var res = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
        queryParams: { access_type: "offline", prompt: "consent" },
        skipBrowserRedirect: native,
      },
    });
    if (res.error) throw res.error;
    if (native && res.data && res.data.url && window.CapBrowser) {
      await window.CapBrowser.open({ url: res.data.url });
    }
  }

  // Catches the `citizenswear://auth-callback?code=…` deep link the system
  // browser hands back after Google sign-in, closes the browser tab, and
  // exchanges the PKCE code for a session. onAuthStateChange then fires
  // SIGNED_IN exactly as on web — no extra plumbing in store.jsx.
  function listenForNativeAuthCallback() {
    if (!isNativeShell() || !window.CapApp) return;
    window.CapApp.addListener("appUrlOpen", async function (data) {
      var url = data && data.url;
      if (!url || url.indexOf(NATIVE_REDIRECT) !== 0) return;
      try {
        if (window.CapBrowser && window.CapBrowser.close) {
          try { await window.CapBrowser.close(); } catch (e) {}
        }
        var match = url.match(/[?&]code=([^&]+)/);
        var code = match ? decodeURIComponent(match[1]) : null;
        if (!code) return;
        var res = await client.auth.exchangeCodeForSession(code);
        if (res.error) console.error("[CW_AUTH] native OAuth exchange failed", res.error);
      } catch (e) {
        console.error("[CW_AUTH] native OAuth callback failed", e);
      }
    });
  }
  listenForNativeAuthCallback();

  // Resolve the current auth session after (re)load. Returns null if signed
  // out. Wear identity (mirror row) is fetched separately via /api/me.
  async function loadSession() {
    var sres = await client.auth.getSession();
    var session = sres.data ? sres.data.session : null;
    if (!session) return null;
    var meta = session.user.user_metadata || {};
    return {
      user: session.user,
      name: meta.full_name || meta.name || "",
      avatarUrl: meta.avatar_url || meta.picture || "",
    };
  }

  // Current access token — every /api/* call sends it as `Authorization:
  // Bearer` (localStorage session is invisible to the API cross-origin —
  // Connect memory static-frontend-cross-origin-auth). autoRefreshToken
  // keeps it live.
  async function getAccessToken() {
    try {
      var sres = await client.auth.getSession();
      return sres.data && sres.data.session ? sres.data.session.access_token : null;
    } catch (e) {
      return null;
    }
  }

  async function signOut() {
    try { await client.auth.signOut(); } catch (e) {}
  }

  // Subscribe to auth changes (mounted once at the app root).
  function onAuthChange(cb) {
    return client.auth.onAuthStateChange(function (event, session) { cb(event, session); });
  }

  window.CW_AUTH = {
    signInWithGoogle: signInWithGoogle,
    loadSession: loadSession,
    getAccessToken: getAccessToken,
    signOut: signOut,
    onAuthChange: onAuthChange,
    supabase: client,
  };
})();
