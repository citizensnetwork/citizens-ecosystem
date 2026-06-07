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

  // Sign in / sign up with Google (OAuth — same call for both). With OAuth
  // this navigates away to Google and returns to the app origin.
  async function signInWithGoogle(intent) {
    if (intent === "contributor") {
      try { localStorage.setItem(PENDING, "contributor"); } catch (e) {}
    }
    var redirectTo = (env.FRONTEND_ORIGIN || window.location.origin) + window.location.pathname;
    var res = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo, queryParams: { access_type: "offline", prompt: "consent" } },
    });
    if (res.error) throw res.error;
  }

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
    signOut: signOut,
    onAuthChange: onAuthChange,
    clearPendingIntent: clearPendingIntent,
    supabase: client,
  };
})();
