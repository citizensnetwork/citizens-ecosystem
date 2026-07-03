// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — login screen (window.Screens.Login)
//  ------------------------------------------------------------------
//  One Kingdom identity: Google OAuth against the shared Citizens
//  Supabase project (same auth.users as Connect + Wear). When Supabase
//  isn't configured (local preview), a demo entry keeps the app usable.
// ════════════════════════════════════════════════════════════════════
(() => {
  const { Crown, Btn } = window.UI;

  const GoogleMark = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-7-5.1l-3.9 3C3.1 21.3 7.2 24 12 24z" />
      <path fill="#FBBC05" d="M5 14.3a7.3 7.3 0 0 1 0-4.6l-3.9-3a12 12 0 0 0 0 10.6z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.1 6.7l3.9 3c1-3 3.8-5 7-5z" />
    </svg>
  );

  function Login({ onDemo }) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const supabaseReady = !!window.CV_AUTH;

    const signIn = async () => {
      setBusy(true); setError(null);
      try {
        await window.CV_AUTH.signInWithGoogle();
        // Redirects away; on return, detectSessionInUrl + onAuthChange
        // land the session in store.jsx.
      } catch (e) {
        setError(e && e.message ? e.message : "Sign-in failed. Please try again.");
        setBusy(false);
      }
    };

    return (
      <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="fade-in" style={{
          width: "100%", maxWidth: 420, background: "var(--surface-card)",
          border: "1px solid var(--border)", borderRadius: 22, padding: "44px 36px",
          textAlign: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Crown size={56} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>Citizens Vision</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>
            Connecting the Kingdom
          </div>
          <div style={{ margin: "26px 0 30px", fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            The intelligence layer for your organisation — see your real
            community impact, reach and engagement.
          </div>

          {supabaseReady ? (
            <Btn kind="ink" onClick={signIn} disabled={busy}
              style={{ width: "100%", justifyContent: "center", padding: "12px 16px" }}>
              <GoogleMark />
              {busy ? "Opening Google…" : "Continue with Google"}
            </Btn>
          ) : (
            <div style={{
              fontSize: 13, color: "var(--text-secondary)", background: "var(--surface-sunk)",
              border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 4,
            }}>
              Supabase isn't configured in this preview.
            </div>
          )}

          <Btn kind="ghost" onClick={onDemo}
            style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
            Explore the demo (Hope Collective)
          </Btn>

          {error ? (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--danger)" }}>{error}</div>
          ) : null}

          <div style={{ marginTop: 30, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700, color: "var(--brand-ink)" }}>
            “NO LONGER STRANGERS” · EPH. 2:19
          </div>
        </div>
      </div>
    );
  }

  window.Screens = window.Screens || {};
  window.Screens.Login = Login;
})();
