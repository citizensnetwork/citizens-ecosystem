// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — browser Supabase auth client
//  ------------------------------------------------------------------
//  Port of Connect's auth-client.js for the Vision back-office. Runs in
//  the no-build app: it needs the @supabase/supabase-js UMD global
//  (window.supabase) and window.__CV_ENV (config.js) loaded first, then
//  exposes window.CV_AUTH for store.jsx.
//
//  Google is the only provider (one Kingdom identity across Connect,
//  Wear and Vision — one shared auth.users). Vision-specific roles come
//  from vision.user_org_roles via the /api surface, never the JWT.
//  If config/Supabase is missing, CV_AUTH is null and the app falls back
//  to demo mode — so the prototype still runs anywhere.
// ════════════════════════════════════════════════════════════════════
(function () {
  var env = window.__CV_ENV || {};
  if (!window.supabase || !window.supabase.createClient || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY.indexOf("REPLACE_WITH") === 0) {
    console.warn("[CV_AUTH] Supabase not configured — demo mode only. Copy config.example.js → config.js.");
    window.CV_AUTH = null;
    return;
  }

  var client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  window.CV_SUPABASE = client;

  // Sign in / sign up with Google (OAuth — same call for both).
  async function signInWithGoogle() {
    var origin = env.FRONTEND_ORIGIN || window.location.origin;
    // A bare hostname has no scheme; Supabase would treat it as a relative
    // path on its own domain and the OAuth redirect would 404 (the lesson
    // from Connect's deploy).
    if (origin && !/^https?:\/\//i.test(origin)) { origin = "https://" + origin; }
    var res = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: origin + window.location.pathname,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (res.error) throw res.error;
  }

  // Resolve the current session after (re)load. Returns null if signed out.
  // Org memberships/roles are fetched by the app through /api (RBAC lives in
  // vision.user_org_roles — spec §0.4), not here.
  async function loadSession() {
    var sres = await client.auth.getSession();
    var session = sres.data ? sres.data.session : null;
    if (!session) return null;
    var meta = session.user.user_metadata || {};
    return {
      user: session.user,
      name: meta.full_name || meta.name || session.user.email || "",
      avatarUrl: meta.avatar_url || meta.picture || "",
    };
  }

  // Current access token — the API is (potentially) cross-origin and can't
  // see our localStorage session, so authenticated calls send this as an
  // `Authorization: Bearer` header (server.ts resolves it in one place).
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

  window.CV_AUTH = {
    signInWithGoogle: signInWithGoogle,
    loadSession: loadSession,
    getAccessToken: getAccessToken,
    signOut: signOut,
    onAuthChange: onAuthChange,
    supabase: client,
  };
})();
