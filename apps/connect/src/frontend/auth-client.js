// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — browser Supabase auth client
//  ------------------------------------------------------------------
//  Browser adaptation of supabase-auth.js (which is written for a Vite
//  build with import.meta.env). This runs in the no-build app: it needs
//  the @supabase/supabase-js UMD global (window.supabase) and window.__CC_ENV
//  (config.js) loaded first, then exposes window.CC_AUTH for store.jsx.
//
//  Two ways in: Google OAuth, and a passwordless 6-digit code emailed to the
//  person's address (Supabase email OTP — the same provider Wear uses). Role
//  is read from public.profiles.role (never the JWT). If config/Supabase is
//  missing, CC_AUTH is null and the app falls back to the local demo sign-in —
//  so the prototype still runs.
// ════════════════════════════════════════════════════════════════════
(function () {
  // ── Pure helpers ───────────────────────────────────────────────────
  //  Need no Supabase, so they sit ABOVE the "not configured" early return and
  //  are unit-tested in src/__tests__/frontend/authClientHelpers.test.ts.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normaliseEmail(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }

  function isValidEmail(v) {
    return EMAIL_RE.test(normaliseEmail(v));
  }

  // Digits only, at most 6 — so "123 456", "123-456" and a pasted " 123456\n"
  // all become "123456".
  function cleanCode(v) {
    return String(v == null ? "" : v).replace(/\D/g, "").slice(0, 6);
  }

  // Plain-language message for a failed email-code request. `step` is "send"
  // or "verify". Never surfaces raw GoTrue text or JSON.
  function mapAuthError(err, step) {
    var msg = String((err && err.message) || "").toLowerCase();
    var code = String((err && (err.code || err.error_code)) || "").toLowerCase();
    var status = err && typeof err.status === "number" ? err.status : null;
    if (status === 429 || /rate.?limit|too many|only request this after/.test(code + " " + msg)) {
      return "Too many attempts — wait a minute and try again.";
    }
    if (err && (err.name === "AuthRetryableFetchError" || status === 0 ||
        /failed to fetch|networkerror|load failed|network request failed/.test(msg))) {
      return "We couldn't reach Citizens — check your connection and try again.";
    }
    if (step === "verify" && (code === "otp_expired" || status === 403 || status === 400 ||
        /expired|invalid/.test(msg))) {
      return "That code didn't work or has expired — request a new one.";
    }
    if (code === "email_address_invalid" || code === "validation_failed" ||
        /invalid.*email|email.*invalid|unable to validate email/.test(msg)) {
      return "That email address doesn't look right — check it and try again.";
    }
    if (code === "signup_disabled" || /signups? not allowed/.test(msg)) {
      return "New accounts can't be created with email right now. Please continue with Google.";
    }
    return "Something went wrong. Please try again.";
  }

  // Display-only stand-in for a person with no name yet (email-code sign-ups
  // arrive with none): "jane.doe+news@x.com" → "Jane Doe". It never contains the
  // domain and is never written to the database, so other people keep seeing
  // "Citizen" until the person sets a real name in Settings.
  function displayNameFor(email) {
    var local = String(email || "").split("@")[0].split("+")[0];
    var words = local.replace(/[._-]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim()
      .split(/\s+/).filter(Boolean).slice(0, 3);
    if (!words.length || !/\p{L}/u.test(words.join(""))) return "Citizen";
    return words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ").slice(0, 40);
  }

  window.CC_AUTH_HELPERS = {
    normaliseEmail: normaliseEmail,
    isValidEmail: isValidEmail,
    cleanCode: cleanCode,
    mapAuthError: mapAuthError,
    displayNameFor: displayNameFor,
  };

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

  // The web return URL for the OAuth redirect and for the magic-link fallback in
  // the sign-in email. A bare hostname (e.g. "www.citizenscentral.co.za") has no
  // scheme, so Supabase treats it as a relative path on its own domain and the
  // redirect lands on supabase.co/<hostname>?code=…  which 404s.
  //
  // ALWAYS the site root, never the current path. Every screen has its own URL
  // now (/e/<id>, /dashboard/events, ...), and Supabase only returns to a URL on
  // its Redirect URLs allow-list (anything else silently falls back to the Site
  // URL). One fixed, allow-listed target is predictable and cannot be steered by
  // a crafted link. The screen the person was on is kept by the app instead:
  // store.jsx stashes a validated same-origin path in sessionStorage before
  // leaving and restores it after sign-in (routes.jsx safeReturnPath).
  function webRedirectUrl() {
    var origin = env.FRONTEND_ORIGIN || window.location.origin;
    if (origin && !/^https?:\/\//i.test(origin)) { origin = "https://" + origin; }
    return origin + "/";
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
    var redirectTo = native ? NATIVE_REDIRECT : webRedirectUrl();
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

  // ── Email code (passwordless — no Google account needed) ───────────
  //  Emails a 6-digit code (mailer_otp_length=6) and signs the person in when
  //  they type it back. Needs no deep link, so it works the same in the native
  //  shell. DELIBERATELY unlike Wear's sendEmailCode (shouldCreateUser:false):
  //  Connect has no other non-Google way to make an account, so an address we
  //  haven't seen creates a citizen on verification — receiving the code IS the
  //  proof of owning the inbox. An address that already has an account (e.g. a
  //  listing the founder approved for an owner on Outlook) signs in to THAT
  //  account. GoTrue answers identically either way, so this does not reveal
  //  which addresses exist. The same email also carries a magic link
  //  (emailRedirectTo) as a fallback; it only completes in the browser that
  //  asked for it (PKCE), which is why the code is the primary path.
  async function sendEmailCode(email) {
    var res = await client.auth.signInWithOtp({
      email: normaliseEmail(email),
      options: { shouldCreateUser: true, emailRedirectTo: webRedirectUrl() },
    });
    if (res.error) throw res.error;
  }

  // Exchanges the emailed code for a session. On success supabase-js fires
  // SIGNED_IN through onAuthChange, so the store's normal post-sign-in path
  // (profile + role, landOwnListing, dashboard for contributors) runs unchanged.
  async function verifyEmailCode(email, token) {
    var res = await client.auth.verifyOtp({
      email: normaliseEmail(email),
      token: cleanCode(token),
      type: "email",
    });
    if (res.error) throw res.error;
    return res.data;
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

    // Email-code sign-ups have no name until they set one, so give the UI a
    // readable stand-in (display only — see displayNameFor) instead of a blank.
    var realName = profile.full_name || meta.full_name || meta.name || "";

    return {
      user: session.user,
      role: profile.role || "citizen",
      name: realName || displayNameFor(session.user.email),
      nameIsFallback: !realName,
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
    sendEmailCode: sendEmailCode,
    verifyEmailCode: verifyEmailCode,
    loadSession: loadSession,
    getAccessToken: getAccessToken,
    signOut: signOut,
    onAuthChange: onAuthChange,
    clearPendingIntent: clearPendingIntent,
    supabase: client,
  };
})();
