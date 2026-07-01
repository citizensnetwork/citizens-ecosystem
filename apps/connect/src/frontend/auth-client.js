// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — browser Supabase auth client
//  ------------------------------------------------------------------
//  Browser adaptation of supabase-auth.js (which is written for a Vite
//  build with import.meta.env). This runs in the no-build app: it needs
//  the @supabase/supabase-js UMD global (window.supabase) and window.__CC_ENV
//  (config.js) loaded first, then exposes window.CC_AUTH for store.jsx.
//
//  Google is the only provider. Role is read from public.profiles.role
//  (never the JWT). If config/Supabase is missing, CC_AUTH is null and the
//  app falls back to the local demo sign-in — so the prototype still runs.
// ════════════════════════════════════════════════════════════════════
(function () {
  var env = window.__CC_ENV || {};
  if (!window.supabase || !window.supabase.createClient || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY.indexOf("REPLACE_WITH") === 0) {
    console.warn("[CC_AUTH] Supabase not configured — demo/mock sign-in only. Copy config.example.js → config.js.");
    window.CC_AUTH = null;
    return;
  }

  var client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  window.CC_SUPABASE = client;

  var PENDING = "cc_pending_intent";
  var NATIVE_REDIRECT = "citizensconnect://auth-callback";

  function isNativeShell() {
    return !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
  }

  // Sign in / sign up with Google (OAuth — same call for both).
  // Web: normal in-page redirect to Google, back to the app origin.
  // Native (Capacitor): the webview's own origin (capacitor://localhost /
  // https://localhost) isn't a redirectable https URL from Google's side, so
  // we open the OAuth URL in the SYSTEM browser (@capacitor/browser) and
  // register a custom-scheme redirect; the app catches the return via
  // `appUrlOpen` (listenForNativeAuthCallback, below) and exchanges the code
  // for a session (runbook Step 3 / addendum §B1).
  async function signInWithGoogle(intent) {
    if (intent === "contributor") {
      try { localStorage.setItem(PENDING, "contributor"); } catch (e) {}
    }
    var native = isNativeShell();
    var redirectTo;
    if (native) {
      redirectTo = NATIVE_REDIRECT;
    } else {
      var origin = env.FRONTEND_ORIGIN || window.location.origin;
      // A bare hostname (e.g. "www.citizenscentral.co.za") has no scheme, so
      // Supabase treats it as a relative path on its own domain and the OAuth
      // redirect lands on supabase.co/<hostname>?code=…  which 404s.
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

  // Catches the `citizensconnect://auth-callback?code=…` deep link the
  // system browser hands back after Google sign-in, closes the browser tab,
  // and exchanges the PKCE code for a session. onAuthStateChange (already
  // wired via onAuthChange below) then fires SIGNED_IN exactly as it does
  // on web — no extra plumbing needed on the store.jsx side.
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
        if (res.error) console.error("[CC_AUTH] native OAuth exchange failed", res.error);
      } catch (e) {
        console.error("[CC_AUTH] native OAuth callback failed", e);
      }
    });
  }
  listenForNativeAuthCallback();

  // Resolve the current session + role after (re)load. Returns null if signed out.
  async function loadSession() {
    var sres = await client.auth.getSession();
    var session = sres.data ? sres.data.session : null;
    if (!session) return null;

    var pres = await client
      .from("profiles")
      .select("role, full_name, avatar_url, contributor_status")
      .eq("id", session.user.id)
      .single();
    var profile = pres.data || {};
    var meta = session.user.user_metadata || {};

    var pending = null;
    try { pending = localStorage.getItem(PENDING); } catch (e) {}

    return {
      user: session.user,
      role: profile.role || "citizen",
      name: profile.full_name || meta.full_name || meta.name || "",
      avatarUrl: profile.avatar_url || meta.avatar_url || meta.picture || "",
      contributorStatus: profile.contributor_status || "not_applied",
      // Route a fresh contributor sign-up into the application wizard.
      routeToApply: pending === "contributor" && (profile.contributor_status || "not_applied") === "not_applied",
    };
  }

  // Current access token (for cross-origin authenticated API calls — the API
  // can't read our localStorage session cookie, so mutations send this as a
  // `Authorization: Bearer` header). Null when signed out. autoRefreshToken
  // keeps the session fresh, so getSession returns a live (non-expired) token.
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
    try { localStorage.removeItem(PENDING); } catch (e) {}
  }

  function clearPendingIntent() {
    try { localStorage.removeItem(PENDING); } catch (e) {}
  }

  // Subscribe to auth changes (mounted once at the app root).
  function onAuthChange(cb) {
    return client.auth.onAuthStateChange(function (event, session) { cb(event, session); });
  }

  window.CC_AUTH = {
    signInWithGoogle: signInWithGoogle,
    loadSession: loadSession,
    getAccessToken: getAccessToken,
    signOut: signOut,
    onAuthChange: onAuthChange,
    clearPendingIntent: clearPendingIntent,
    supabase: client,
  };
})();
